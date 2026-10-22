// In-memory fake of the Google Apps Script APIs used by apps-script/Code.gs (tests + template builder).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function chainable() {
  const p = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : () => p), apply: () => p });
  return p;
}

function makeSheet(name) {
  const cells = []; // 2D array of values
  const sheet = {
    name,
    cells,
    getName: () => name,
    getLastRow: () => {
      for (let r = cells.length - 1; r >= 0; r--) if ((cells[r] || []).some((v) => v !== '' && v !== undefined)) return r + 1;
      return 0;
    },
    getLastColumn: () => Math.max(0, ...cells.map((r) => {
      for (let c = (r || []).length - 1; c >= 0; c--) if (r[c] !== '' && r[c] !== undefined) return c + 1;
      return 0;
    })),
    getMaxRows: () => 1000,
    getRange: (row, col, nr = 1, nc = 1) => makeRange(sheet, row, col, nr, nc),
    getDataRange: () => makeRange(sheet, 1, 1, Math.max(sheet.getLastRow(), 1), Math.max(sheet.getLastColumn(), 1)),
    setFrozenRows: () => sheet,
    setColumnWidth: () => sheet,
    getProtections: () => [],
    protect: () => chainable()
  };
  return sheet;
}
function makeRange(sheet, row, col, nr, nc) {
  const range = {
    getValues: () => {
      const out = [];
      for (let r = 0; r < nr; r++) {
        const line = [];
        for (let c = 0; c < nc; c++) {
          const v = (sheet.cells[row - 1 + r] || [])[col - 1 + c];
          line.push(v === undefined ? '' : v);
        }
        out.push(line);
      }
      return out;
    },
    setValues: (vals) => {
      vals.forEach((line, r) => line.forEach((v, c) => {
        const R = row - 1 + r;
        sheet.cells[R] = sheet.cells[R] || [];
        // Mimic Sheets: a leading apostrophe forces text and is not shown.
        sheet.cells[R][col - 1 + c] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
      }));
      return range;
    },
    setValue: (v) => range.setValues([[v]]),
    protect: () => chainable()
  };
  const proxied = new Proxy(range, { get: (t, k) => (k in t ? t[k] : () => proxied) });
  return proxied;
}

function loadGas() {
  const sheets = {};
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    setSpreadsheetTimeZone: () => {}
  };
  let locked = false;
  const props = {};
  const cache = {};
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush: () => {},
      getUi: () => { throw new Error('no ui in tests'); },
      newDataValidation: () => chainable(),
      ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' }
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { if (locked) return false; locked = true; return true; },
        releaseLock: () => { locked = false; }
      })
    },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    ContentService: { createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Utilities: {
      getUuid: () => require('crypto').randomUUID(),
      formatDate: (d) => d.toISOString().slice(0, 10)
    },
    Session: { getActiveUser: () => ({ getEmail: () => 'staff@example.com' }) },
    Date, JSON, Math, Object, Array, String, Number, RegExp, Error
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'apps-script');
  vm.runInContext(fs.readFileSync(path.join(dir, 'BookingCore.gs'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8'), ctx);
  return { ctx, sheets, props, setLocked: (v) => { locked = v; } };
}


module.exports = { loadGas };
