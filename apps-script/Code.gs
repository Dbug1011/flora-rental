/**
 * Flora Dress Rental — booking service.
 *
 * Google Apps Script project BOUND to the private Flora Google Sheet
 * (Extensions → Apps Script). It is the ONLY code path that changes availability:
 *   - website holds (web app doPost, called server-side by Vercel)
 *   - staff actions from the "Flora" menu / staff panel
 *   - the hourly hold-expiry trigger
 * Every one of those runs inside withLock_(), which uses LockService.getScriptLock()
 * so competing requests are serialized and re-read the sheet before writing.
 *
 * Booking rules live in BookingCore.gs (a copy of shared/booking-core.js).
 */

var TZ = 'Asia/Manila';
var TABS = { CATALOG: 'Catalog', BOOKINGS: 'Bookings', ITEMS: 'Booking Items', BLOCKS: 'Blocked Dates', SETTINGS: 'Settings' };

var CATALOG_HEADERS = ['Item ID', 'Dress name', 'Description', 'Size', 'Color', 'Measurements', 'Photo URLs', 'Styled preview URLs',
  'Base rental price', 'Included days', 'Extension rate', 'Accessories', 'Care notes', 'Published'];

var BOOKING_COLS = [
  ['code', 'Booking code'], ['submittedAt', 'Submission time'], ['customerName', 'Customer name'], ['mobile', 'Mobile number'],
  ['facebookName', 'Facebook name'], ['facebookLink', 'Facebook link'], ['email', 'Email'],
  ['pickupDate', 'Pickup date'], ['pickupTime', 'Pickup time'], ['returnDate', 'Return date'], ['returnDeadline', 'Return deadline'],
  ['status', 'Booking status'], ['holdExpiry', 'Hold expiry'], ['facebookReview', 'Facebook review status'],
  ['rentalTotal', 'Rental total'], ['depositRequired', 'Deposit required'], ['depositVerified', 'Deposit verified'],
  ['rentalPaid', 'Rental paid'], ['deductions', 'Deductions'], ['refundAmount', 'Refund amount'], ['staffNotes', 'Staff notes'],
  ['source', 'Source'], ['requestKey', 'Request key'], ['termsSnapshot', 'Terms snapshot'], ['lastUpdated', 'Last updated']
];
var ITEM_COLS = [
  ['code', 'Booking code'], ['itemId', 'Item ID'], ['name', 'Dress name'], ['price', 'Price at booking'],
  ['extensionRate', 'Extension rate'], ['extensionCharge', 'Extension charge'], ['pickupStatus', 'Pickup status'],
  ['returnStatus', 'Return status'], ['conditionNotes', 'Condition notes']
];
var BLOCK_COLS = [['itemId', 'Item ID'], ['start', 'Start date'], ['end', 'End date'], ['reason', 'Reason'], ['active', 'Active']];
var SETTINGS_HEADERS = ['Key', 'Value', 'Notes'];

// Columns that must only change through the locked booking process.
var PROTECTED_BOOKING_HEADERS = ['Booking code', 'Pickup date', 'Return date', 'Booking status', 'Hold expiry', 'Request key'];

// ======================================================================= web app (called by Vercel)

function doGet() {
  return json_({ ok: true, service: 'flora-booking' }); // health check only; never returns data
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    return json_({ ok: false, code: 'BAD_REQUEST', message: 'Invalid request.' });
  }
  var secret = PropertiesService.getScriptProperties().getProperty('FLORA_API_SECRET');
  if (!secret || secret.length < 24 || !safeEqual_(String(body.secret || ''), secret)) {
    return json_({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' });
  }
  try {
    var payload = body.payload || {};
    switch (body.action) {
      case 'catalog': return json_(apiCatalog_(payload));
      case 'availability': return json_(apiAvailability_(payload));
      case 'createHold': return json_(apiCreateHold_(payload, body.client || {}));
      default: return json_({ ok: false, code: 'BAD_REQUEST', message: 'Unknown action.' });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, code: 'ERROR', message: 'The booking service had a problem. Please try again.' });
  }
}

function apiCatalog_(payload) {
  var st = readState_({ bookings: false });
  var allowDrafts = PropertiesService.getScriptProperties().getProperty('ALLOW_DRAFTS') === 'true';
  var items = st.catalog.filter(function (it) { return it.published || (allowDrafts && payload.includeDrafts === true); });
  return { ok: true, items: items.map(FloraCore.publicItem), settings: FloraCore.publicSettings(st.settings) };
}

function apiAvailability_(payload) {
  var ids = Array.isArray(payload.itemIds) ? payload.itemIds.map(String).filter(function (x) { return /^[A-Z0-9-]{2,20}$/.test(x); }).slice(0, 10) : [];
  var from = String(payload.from || '');
  var to = String(payload.to || '');
  if (!ids.length || !FloraCore.isDate(from) || !FloraCore.isDate(to) || to < from || FloraCore.daysBetween(from, to) > 400) {
    return { ok: false, code: 'BAD_REQUEST', message: 'Invalid availability request.' };
  }
  var st = readState_();
  return { ok: true, days: FloraCore.publicAvailability(st, ids, from, to, Date.now(), st.settings) };
}

function apiCreateHold_(payload, client) {
  var cache = CacheService.getScriptCache();
  if (!bump_(cache, 'rl:ip:' + String(client.ipHash || 'none').slice(0, 64), 8, 600)) {
    return { ok: false, code: 'RATE_LIMITED', message: 'Too many requests from this connection. Please wait a few minutes and try again.' };
  }
  var phone = FloraCore.normalizePHMobile(payload.mobile);
  if (phone && !bump_(cache, 'rl:ph:' + phone, 5, 600)) {
    return { ok: false, code: 'RATE_LIMITED', message: 'Too many requests for this mobile number. Please message Flora on Facebook instead.' };
  }
  var input = {
    customerName: payload.customerName, mobile: payload.mobile, facebookName: payload.facebookName,
    itemIds: payload.itemIds, days: payload.days, pickupDate: payload.pickupDate, pickupTime: payload.pickupTime,
    acceptTerms: payload.acceptTerms === true, acceptPrivacy: payload.acceptPrivacy === true, requestKey: payload.requestKey
  };
  return withLock_(function () {
    var st = readState_();
    var r = FloraCore.createBooking(st, input, ctx_(st, { source: 'Website', who: 'website' }));
    if (!r.ok) return r;
    applyPlan_(st, { writes: r.writes });
    return { ok: true, replay: !!r.replay, summary: r.summary };
  });
}

// ======================================================================= staff menu & panel

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Flora')
    .addItem('Open staff panel', 'showStaffPanel')
    .addItem('Mark expired holds now', 'menuExpireHolds')
    .addSeparator()
    .addItem('Check launch settings', 'menuCheckLaunch')
    .addItem('Set up / repair sheet', 'setupFloraSheet')
    .addItem('Install hourly hold-expiry trigger', 'installTriggers')
    .addItem('Show API secret for Vercel', 'menuShowSecret')
    .addToUi();
}

function showStaffPanel() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Flora staff panel');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Data for the staff panel (staff only — runs as the signed-in editor). */
function staffData() {
  var st = readState_();
  var s = st.settings;
  return {
    upcoming: FloraCore.upcoming(st, ctx_(st), 7),
    items: st.catalog.map(function (it) { return { id: it.id, name: it.name, size: it.size, price: it.price, published: it.published, bookable: it.bookable }; }),
    settings: { pickupTimeSlots: s.pickupTimeSlots, rentalDays: s.rentalDays, depositAmount: s.depositAmount, depositBasis: s.depositBasis, holdHours: s.holdHours },
    bookingsOpen: FloraCore.bookingsOpen(s),
    blockers: FloraCore.launchBlockers(s)
  };
}

function staffLoadBooking(code) {
  var st = readState_();
  var b = FloraCore.findBooking(st, code);
  if (!b) return { ok: false, message: 'No booking found with code ' + String(code || '').toUpperCase() + '.' };
  var copy = {};
  BOOKING_COLS.forEach(function (c) { if (c[0] !== 'termsSnapshot') copy[c[0]] = b[c[0]]; });
  copy.holdActive = FloraCore.isBlockingBooking(b, Date.now()) && b.status === FloraCore.STATUS.HOLD;
  return { ok: true, booking: copy, items: FloraCore.itemsFor(st, b.code).map(function (bi) { var o = {}; ITEM_COLS.forEach(function (c) { o[c[0]] = bi[c[0]]; }); return o; }) };
}

/** Every staff change goes through here: one lock, fresh read, core rules, then write. */
function staffAction(action, payload) {
  payload = payload || {};
  return withLock_(function () {
    var st = readState_();
    var ctx = ctx_(st, { who: staffWho_() });
    if (action === 'manualBooking') {
      var input = {};
      for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) input[k] = payload[k];
      input.requestKey = 'staff-' + Utilities.getUuid();
      ctx.staff = true;
      var r = FloraCore.createBooking(st, input, ctx);
      if (!r.ok) return r;
      applyPlan_(st, { writes: r.writes });
      return { ok: true, code: r.summary.code, message: 'Booking ' + r.summary.code + ' created (' + r.writes.bookings[0].status + '). Return ' + FloraCore.formatLongDate(r.summary.returnDate) + '.' };
    }
    var fn = FloraCore.STAFF_ACTIONS[action];
    if (!fn) return { ok: false, message: 'Unknown action.' };
    var res = fn(st, payload, ctx);
    if (res.ok) applyPlan_(st, res);
    return res;
  });
}

function menuExpireHolds() {
  var r = markExpiredHolds();
  SpreadsheetApp.getUi().alert(r.message || 'Done.');
}

/** Hourly trigger target. Expired holds already stop blocking dates; this just updates their status. */
function markExpiredHolds() {
  return withLock_(function () {
    var st = readState_();
    var r = FloraCore.expireHolds(st, ctx_(st, { who: 'system' }));
    if (r.ok) applyPlan_(st, r);
    return r;
  });
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'markExpiredHolds') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('markExpiredHolds').timeBased().everyHours(1).create();
  try { SpreadsheetApp.getUi().alert('Hourly hold-expiry trigger installed.'); } catch (e) { /* no UI when run from editor */ }
}

function menuCheckLaunch() {
  var st = readState_({ bookings: false });
  var blockers = FloraCore.launchBlockers(st.settings);
  var issues = [];
  st.catalog.forEach(function (it) {
    if (!it.published) return;
    if (!(it.price > 0)) issues.push(it.id + ' ' + it.name + ': published without a price (hidden from booking)');
    if (!it.measurements) issues.push(it.id + ' ' + it.name + ': no measurements');
    if (!it.photos.length) issues.push(it.id + ' ' + it.name + ': no actual garment photo (only styled previews)');
  });
  var msg = (blockers.length ? 'Settings still required before bookings can open:\n• ' + blockers.join('\n• ') : 'All required settings are filled in.') +
    '\n\nbookings_enabled = ' + (st.settings.bookingsEnabled ? 'TRUE' : 'FALSE') +
    (issues.length ? '\n\nCatalog warnings:\n• ' + issues.join('\n• ') : '\n\nNo catalog warnings for published dresses.') +
    (PropertiesService.getScriptProperties().getProperty('FLORA_API_SECRET') ? '' : '\n\nAPI secret not set: run "Set up / repair sheet".');
  SpreadsheetApp.getUi().alert('Flora launch check', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function menuShowSecret() {
  var secret = ensureSecret_();
  SpreadsheetApp.getUi().alert('API secret for Vercel', 'Paste this into the Vercel environment variable APPS_SCRIPT_SECRET.\nKeep it private.\n\n' + secret, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ======================================================================= sheet setup

function setupFloraSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);

  var catalog = ensureSheet_(ss, TABS.CATALOG, CATALOG_HEADERS);
  var bookings = ensureSheet_(ss, TABS.BOOKINGS, BOOKING_COLS.map(function (c) { return c[1]; }));
  var items = ensureSheet_(ss, TABS.ITEMS, ITEM_COLS.map(function (c) { return c[1]; }));
  var blocks = ensureSheet_(ss, TABS.BLOCKS, BLOCK_COLS.map(function (c) { return c[1]; }));
  var settings = ensureSheet_(ss, TABS.SETTINGS, SETTINGS_HEADERS);

  // Plain-text columns so Sheets never converts dates, times or leading-zero mobile numbers.
  textColumns_(bookings, ['Booking code', 'Submission time', 'Mobile number', 'Pickup date', 'Pickup time', 'Return date', 'Return deadline', 'Hold expiry', 'Request key', 'Last updated']);
  textColumns_(items, ['Booking code', 'Item ID']);
  textColumns_(blocks, ['Item ID', 'Start date', 'End date']);
  textColumns_(catalog, ['Item ID']);
  textColumns_(settings, ['Key', 'Value']);

  checkboxColumn_(catalog, 'Published');
  checkboxColumn_(blocks, 'Active');
  listColumn_(bookings, 'Booking status', ['Hold', 'Confirmed', 'Picked up', 'Returned', 'Completed', 'Cancelled', 'Expired']);
  listColumn_(bookings, 'Facebook review status', ['Pending', 'Approved', 'Rejected', 'Not required']);
  listColumn_(items, 'Pickup status', ['Not picked up', 'Picked up']);
  listColumn_(items, 'Return status', ['Not returned', 'Returned']);

  if (settings.getLastRow() < 2) {
    var rows = DEFAULT_SETTINGS_.map(function (r) { return [r[0], r[1], r[2]]; });
    settings.getRange(2, 1, rows.length, 3).setValues(rows);
    settings.setColumnWidth(2, 420);
    settings.setColumnWidth(3, 420);
  }
  if (catalog.getLastRow() < 2) {
    var cat = SAMPLE_CATALOG_.map(function (r) {
      return CATALOG_HEADERS.map(function (h) { return r[h] === undefined ? '' : r[h]; });
    });
    catalog.getRange(2, 1, cat.length, CATALOG_HEADERS.length).setValues(cat);
  }

  // Warning-only protection: staff see a warning before typing over booking dates/statuses
  // directly. Changes must go through Flora → Open staff panel so conflicts are checked.
  protectColumns_(bookings, PROTECTED_BOOKING_HEADERS, 'Use Flora → Open staff panel to change bookings (keeps availability checks).');
  protectSheet_(items, 'Use Flora → Open staff panel to record pickups and returns.');
  protectSheet_(blocks, 'Use Flora → Open staff panel → Block dates (checks overlapping bookings).');

  ensureSecret_();
  try {
    SpreadsheetApp.getUi().alert('Flora sheet is set up.\n\nNext: fill in Settings, then use "Check launch settings". Deploy the web app and copy the API secret into Vercel (Flora → Show API secret).');
  } catch (e) { /* run from editor */ }
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var missing = headers.filter(function (h) { return existing.indexOf(h) < 0; });
  if (existing.join('') === '') {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else if (missing.length) {
    sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#F7D5E5').setFontColor('#4B203D');
  return sh;
}

function colIndex_(sh, header) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String).indexOf(header) + 1;
}
function textColumns_(sh, headers) {
  headers.forEach(function (h) { var c = colIndex_(sh, h); if (c) sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
}
function checkboxColumn_(sh, header) {
  var c = colIndex_(sh, header);
  if (c) sh.getRange(2, c, sh.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}
function listColumn_(sh, header, values) {
  var c = colIndex_(sh, header);
  if (c) sh.getRange(2, c, sh.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build());
}
function protectColumns_(sh, headers, description) {
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { if (p.getDescription() === description) p.remove(); });
  headers.forEach(function (h) {
    var c = colIndex_(sh, h);
    if (c) sh.getRange(1, c, sh.getMaxRows(), 1).protect().setDescription(description).setWarningOnly(true);
  });
}
function protectSheet_(sh, description) {
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  sh.protect().setDescription(description).setWarningOnly(true);
}

// ======================================================================= state read / write

function readState_(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settingsRaw = {};
  readRows_(sheet_(ss, TABS.SETTINGS)).rows.forEach(function (r) {
    var key = FloraCore.headerKey(r.key);
    if (key) settingsRaw[key] = r.value;
  });
  var settings = FloraCore.normalizeSettings(settingsRaw);
  var catalogRows = readRows_(sheet_(ss, TABS.CATALOG)).rows;
  var state = {
    settings: settings,
    catalog: FloraCore.normalizeCatalog(catalogRows, settings, { includeDrafts: true }),
    bookings: [], bookingItems: [], blocks: []
  };
  if (opts.bookings === false) return state;
  state.bookings = readTable_(sheet_(ss, TABS.BOOKINGS), BOOKING_COLS);
  state.bookingItems = readTable_(sheet_(ss, TABS.ITEMS), ITEM_COLS);
  state.blocks = readTable_(sheet_(ss, TABS.BLOCKS), BLOCK_COLS).map(function (b) {
    b.itemId = String(b.itemId).toUpperCase();
    b.active = FloraCore.toBool(b.active);
    return b;
  });
  state.bookings.forEach(function (b) { b.code = String(b.code).toUpperCase(); });
  state.bookingItems.forEach(function (b) { b.code = String(b.code).toUpperCase(); b.itemId = String(b.itemId).toUpperCase(); });
  return state;
}

function sheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet "' + name + '". Run Flora → Set up / repair sheet.');
  return sh;
}

/** Generic read: objects keyed by headerKey(header). */
function readRows_(sh) {
  var values = sh.getDataRange().getValues();
  var header = (values[0] || []).map(function (h) { return FloraCore.headerKey(h); });
  var rows = values.slice(1).map(function (row, i) {
    var o = { _row: i + 2 };
    header.forEach(function (h, c) { if (h) o[h] = cellValue_(row[c]); });
    return o;
  });
  return { header: header, rows: rows };
}

function readTable_(sh, cols) {
  var values = sh.getDataRange().getValues();
  var header = (values[0] || []).map(String);
  var idx = cols.map(function (c) {
    var i = header.indexOf(c[1]);
    if (i < 0) throw new Error('Sheet "' + sh.getName() + '" is missing column "' + c[1] + '". Run Flora → Set up / repair sheet.');
    return [c[0], i];
  });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var o = { _row: r + 1 };
    idx.forEach(function (p) { o[p[0]] = cellValue_(values[r][p[1]]); });
    if (String(o[cols[0][0]]).trim() !== '') out.push(o);
  }
  return out;
}

function cellValue_(v) {
  if (v instanceof Date) {
    var hasTime = v.getHours() || v.getMinutes();
    return Utilities.formatDate(v, TZ, hasTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  }
  if (typeof v === 'string') return v.trim();
  return v;
}

function toCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return FloraCore.sanitizeForSheet(v);
  return v;
}

function headerMap_(sh) {
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var map = {};
  header.forEach(function (h, i) { map[h] = i + 1; });
  return { header: header, col: map };
}

function appendObjects_(sh, cols, objs) {
  if (!objs || !objs.length) return;
  var hm = headerMap_(sh);
  var fieldByHeader = {};
  cols.forEach(function (c) { fieldByHeader[c[1]] = c[0]; });
  var rows = objs.map(function (o) {
    return hm.header.map(function (h) { var f = fieldByHeader[h]; return f ? toCell_(o[f]) : ''; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, hm.header.length).setValues(rows);
}

function updateRow_(sh, cols, row, fields) {
  var hm = headerMap_(sh);
  cols.forEach(function (c) {
    if (!Object.prototype.hasOwnProperty.call(fields, c[0])) return;
    var col = hm.col[c[1]];
    if (col) sh.getRange(row, col).setValue(toCell_(fields[c[0]]));
  });
}

/** Apply a plan returned by FloraCore. Caller must hold the lock. */
function applyPlan_(st, plan) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var w = plan.writes || {};
  appendObjects_(sheet_(ss, TABS.BOOKINGS), BOOKING_COLS, w.bookings);
  appendObjects_(sheet_(ss, TABS.ITEMS), ITEM_COLS, w.bookingItems);
  (plan.updates || []).forEach(function (u) {
    var b = FloraCore.findBooking(st, u.code);
    if (!b) throw new Error('Booking ' + u.code + ' disappeared during update.');
    updateRow_(sheet_(ss, TABS.BOOKINGS), BOOKING_COLS, b._row, u.fields);
  });
  (plan.itemUpdates || []).forEach(function (u) {
    var bi = st.bookingItems.filter(function (x) { return x.code === u.code && x.itemId === u.itemId; })[0];
    if (!bi) throw new Error('Booking item ' + u.code + '/' + u.itemId + ' not found.');
    updateRow_(sheet_(ss, TABS.ITEMS), ITEM_COLS, bi._row, u.fields);
  });
  appendObjects_(sheet_(ss, TABS.BLOCKS), BLOCK_COLS, plan.newBlocks);
}

// ======================================================================= helpers

/** Serialize every availability-changing action across web app, staff panel and triggers. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    return { ok: false, code: 'BUSY', message: 'We are processing other requests. Please try again in a moment.' };
  }
  try {
    var r = fn();
    SpreadsheetApp.flush(); // make sure writes are committed before reporting success
    return r;
  } finally {
    lock.releaseLock();
  }
}

function ctx_(st, extra) {
  var c = { nowMs: Date.now(), settings: st.settings, catalog: st.catalog, randomInt: secureRandomInt_, who: 'staff' };
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) c[k] = extra[k];
  return c;
}

function staffWho_() {
  try { return Session.getActiveUser().getEmail() || 'staff'; } catch (e) { return 'staff'; }
}

function secureRandomInt_(n) {
  var hex = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  return parseInt(hex, 16) % n;
}

function bump_(cache, key, limit, ttlSeconds) {
  var n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), ttlSeconds);
  return n <= limit;
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ensureSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('FLORA_API_SECRET');
  if (!s) {
    s = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('FLORA_API_SECRET', s);
  }
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ======================================================================= defaults

var DEFAULT_SETTINGS_ = [
  ['bookings_enabled', 'FALSE', 'Turn TRUE only after every required setting below is filled in and the preview has been tested.'],
  ['facebook_page_url', 'https://www.facebook.com/profile.php?id=61595154223240', 'REQUIRED. Full link to Flora\'s Facebook Page, e.g. https://www.facebook.com/yourpage'],
  ['pickup_location', '109-A E.K. Inting St., Mansasa, Tagbilaran City, Bohol 6300\nFittings and pickup by appointment.', 'REQUIRED. Shown to customers (from the Facebook Page).'],
  ['operating_hours', 'Monday–Friday, 7:30 AM–8:30 PM', 'Owner-confirmed hours. Pickup slots and return deadline are separate settings.'],
  ['pickup_time_slots', '', 'REQUIRED. One time per line, e.g. 10:00 AM / 12:00 PM / 2:00 PM / 4:00 PM.'],
  ['return_deadline_time', '', 'REQUIRED. Time the dress is due back on the return date, e.g. 6:00 PM.'],
  ['rental_days', '3', 'Standard rental = 3 calendar days including pickup and return days (not 72 hours).'],
  ['max_online_days', '4', 'Longest rental customers can request online (4 = standard + 1 extra day). Longer: staff only.'],
  ['extension_rate', '100', 'Default ₱ per extra day (Catalog "Extension rate" overrides per dress).'],
  ['extension_basis', 'per_dress', 'per_dress: each dress pays ₱100 per extra day (owner confirmed 2026-10-22).'],
  ['cleaning_buffer_days', '1', 'Days blocked after each return for cleaning before the next pickup.'],
  ['hold_hours', '24', 'How long a website request holds the dress while you review it and the customer pays the deposit.'],
  ['deposit_amount', '500', 'Refundable reservation/security deposit (₱). Separate from rental fees; never rental revenue.'],
  ['deposit_basis', 'per_dress', 'per_dress: ₱500 refundable deposit for each dress (owner confirmed 2026-10-22).'],
  ['min_lead_days', '1', 'Earliest online pickup = today + this many days.'],
  ['max_advance_days', '180', 'Furthest pickup date customers can request online.'],
  ['max_items_per_booking', '4', 'Most dresses per online request.'],
  ['late_fee_per_day', '120', 'Late return without an approved extension (₱ per day). Shown in the terms.'],
  ['rental_terms', [
    'STANDARD RENTAL',
    '• The standard rental covers 3 calendar days, including pickup and return days: Day 1 pick up, Day 2 wear, Day 3 return.',
    '• Need 4 days? Add ₱100 per dress. Further extensions cost ₱100 per dress per extra day, subject to availability and prior approval.',
    '• Your exact pickup and return schedule is written in your rental agreement.',
    '',
    'RESERVATION AND DEPOSIT',
    '• A ₱500 refundable reservation/security deposit per dress secures your dress and dates. It is separate from the rental fee.',
    '• Please message us from an active, real Facebook account. We use it to verify your booking.',
    '• Your booking is confirmed only after we verify your payment and send confirmation.',
    '• The deposit is refunded after the dress is returned and inspected, less any documented charges under your rental agreement.',
    '',
    'PICKUP',
    '• Present a valid government-issued photo ID, sign the rental agreement, and settle your rental fee. Your original ID is returned after verification.',
    '• We check the dress and included accessories with you before release.',
    '',
    'CARE',
    '• Avoid makeup stains, food spills, and spraying perfume directly on the fabric.',
    '• Keep the dress away from sharp objects and rough surfaces.',
    '• Do not wash, dry-clean, iron, steam, pin, or alter the dress.',
    '• Ask for approval before using it in seawater, pools, or wet locations.',
    '• Report any damage or concerns immediately. Regular cleaning is included.',
    '',
    'RETURN AND INSPECTION',
    '• Return the dress and all included accessories by the agreed date and time. Message us early if you expect a delay; an extension is only confirmed once approved.',
    '• Late return without an approved extension: ₱120 per day.',
    '• We inspect the dress against its recorded pickup condition. Normal wear is not treated as damage. Extra cleaning, repairs, missing accessories, or loss may result in documented charges under your signed agreement.'
  ].join('\n'), 'REQUIRED. Owner-approved rental terms shown on the website. Keep in sync with the signed rental agreement.'],
  ['privacy_notice', '', 'REQUIRED. Paste the owner-approved privacy notice (a draft is in docs/OWNER_SETTINGS.md).'],
  ['cancellation_policy', [
    'CANCELLATION AND REFUND POLICY',
    '',
    'Before your booking is confirmed',
    '• Sending a reservation request is free. If you change your mind before paying the deposit, just let us know or let the hold expire. Nothing is charged.',
    '',
    'If you cancel after your booking is confirmed',
    'The ₱500 refundable security deposit (per dress) is handled as follows, counted from your pickup date:',
    '• 7 or more days before pickup: full deposit refunded.',
    '• 3 to 6 days before pickup: 50% of the deposit refunded, or move the full deposit to a new date within 60 days (once, subject to availability).',
    '• Less than 3 days before pickup, or no-show on pickup day: deposit forfeited.',
    '• The rental fee is paid at pickup, so there is nothing else to refund before pickup.',
    '',
    'Changing your dates',
    '• You can move your booking once, free of charge, if you ask at least 3 days before pickup and the dress is available on the new dates.',
    '• Any price difference for extra days is settled at pickup.',
    '',
    'If Flora cancels',
    '• If we cannot provide your dress (for example, it is damaged or unavailable), you can choose another available dress for the same dates or a full refund of everything you have paid.',
    '',
    'Weather and emergencies',
    '• If PAGASA raises a Tropical Cyclone Wind Signal No. 2 or higher over Bohol, or the local government suspends activities on your pickup or event date, you may move your booking for free or get a full deposit refund.',
    '',
    'After your rental',
    '• Returning the dress early does not reduce the rental fee.',
    '• Your deposit is refunded after the dress and accessories are returned and inspected, less any documented charges under your signed rental agreement (for example: late return at ₱120 per day, extra cleaning, repairs, or missing items).',
    '• We explain every deduction with photos before releasing the balance.',
    '',
    'How refunds are paid',
    '• Refunds are sent within 3 business days after return and inspection (or after a cancellation is approved), to the same account or method you paid from.',
    '• To cancel or change a booking, message Flora Dress Rental Bohol on Facebook with your booking code.'
  ].join('\n'), 'REQUIRED. Owner-approved cancellation and deposit refund terms, shown before payment. Keep in sync with the rental agreement.']
];

var SAMPLE_CATALOG_ = [
  { 'Item ID': 'SF001', 'Dress name': 'Poppy', 'Description': 'Short red mini dress with a sequinned sweetheart corset bodice, thin straps and a sculpted petal-ruffle skirt.', 'Size': 'Medium', 'Color': 'Red', 'Styled preview URLs': '/dresses/poppy-preview.jpg', 'Base rental price': 799, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF002', 'Dress name': 'Camellia', 'Description': 'Red lace midi dress with thin lace straps, a boned square-neck bodice and a flowing A-line skirt over a nude lining.', 'Size': 'Small', 'Color': 'Red', 'Styled preview URLs': '/dresses/camellia-preview.jpg', 'Base rental price': 599, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF003', 'Dress name': 'Hibiscus', 'Description': 'Beige lace midi dress with thin straps, a boned straight neckline and a soft A-line skirt.', 'Size': 'Small', 'Color': 'Beige', 'Styled preview URLs': '/dresses/hibiscus-preview.jpg', 'Base rental price': 599, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF004', 'Dress name': 'Magnolia', 'Description': 'Ivory textured halter mini dress with a structured flared skirt, a side bow and a tulle underlayer.', 'Size': 'Large', 'Color': 'Ivory', 'Styled preview URLs': '/dresses/magnolia-preview.jpg', 'Base rental price': 499, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF005', 'Dress name': 'Peony', 'Description': 'Blush pink chiffon mini dress with a ruched sweetheart bodice, tiered ruffle skirt and tie-on draped sleeves.', 'Size': 'Free size', 'Color': 'Pink', 'Styled preview URLs': '/dresses/peony-preview.jpg', 'Base rental price': 399, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF006', 'Dress name': 'Sweet Pea', 'Description': 'Pink mini dress covered in embroidered and sequinned flowers in pink and lilac, with a sweetheart neckline and wide straps.', 'Size': 'Medium', 'Color': 'Pink', 'Styled preview URLs': '/dresses/sweet-pea-preview.jpg', 'Base rental price': 499, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF007', 'Dress name': 'Hydrangea', 'Description': 'Dusty blue-grey strapless corset mini dress with grey 3D flower appliqués, beading and a gathered bubble skirt.', 'Size': 'Medium', 'Color': 'Blue', 'Styled preview URLs': '/dresses/hydrangea-preview.jpg', 'Base rental price': 599, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF008', 'Dress name': 'Bluebell', 'Description': 'Powder blue floral lace midi dress with thin straps, a boned bodice and a full A-line skirt.', 'Size': 'Small', 'Color': 'Blue', 'Styled preview URLs': '/dresses/bluebell-preview.jpg', 'Base rental price': 599, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF009', 'Dress name': 'Sampaguita', 'Description': 'Ivory lace mini dress with a fold-over off-shoulder neckline, a small bow and a tulle hem.', 'Size': 'Medium', 'Color': 'Ivory', 'Styled preview URLs': '/dresses/sampaguita-preview.jpg', 'Base rental price': 499, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF010', 'Dress name': 'Calla', 'Description': 'Long strapless ivory lace gown with visible corset boning, a V-shaped waist and a full skirt.', 'Size': 'Medium', 'Color': 'Ivory', 'Styled preview URLs': '/dresses/calla-preview.jpg', 'Base rental price': 599, 'Included days': 3, 'Published': false },
  { 'Item ID': 'SF011', 'Dress name': 'Dahlia', 'Description': 'Pink strapless mini dress made of layered petal panels edged in sequins, with a jewelled centre.', 'Size': 'Small', 'Color': 'Pink', 'Styled preview URLs': '/dresses/dahlia-preview.jpg', 'Base rental price': 799, 'Included days': 3, 'Published': false }
];
