// Runs apps-script/Code.gs + BookingCore.gs against an in-memory fake of the Google Sheets APIs.
// This checks the sheet I/O, locking and web-app routing that cannot run outside Google.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { loadGas } = require('./fake-gas');

function setSetting(sheets, key, value) {
  const sh = sheets.Settings;
  const r = sh.cells.findIndex((row) => row && row[0] === key);
  sh.cells[r][1] = value;
}

function post(ctx, secret, action, payload, client) {
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ secret, action, payload, client: client || { ipHash: 'abc' } }) } });
  return JSON.parse(out.text);
}

function ready() {
  const g = loadGas();
  g.ctx.setupFloraSheet();
  const s = g.sheets;
  [['bookings_enabled', 'TRUE'], ['facebook_page_url', 'https://www.facebook.com/floratest'], ['pickup_location', 'Tagbilaran City'],
    ['operating_hours', '10–6'], ['pickup_time_slots', '10:00 AM\n2:00 PM'], ['return_deadline_time', '6:00 PM'],
    ['extension_basis', 'per_dress'], ['deposit_basis', 'per_booking'], ['privacy_notice', 'Privacy'], ['cancellation_policy', 'Cancel']]
    .forEach(([k, v]) => setSetting(s, k, v));
  // publish and price two dresses
  const cat = s.Catalog.cells;
  const H = cat[0];
  const col = (h) => H.indexOf(h);
  cat[1][col('Base rental price')] = 399; cat[1][col('Published')] = true; cat[1][col('Measurements')] = 'Bust 32 in';
  cat[2][col('Base rental price')] = 450; cat[2][col('Published')] = true;
  return g;
}

const tomorrowPlus = (n) => {
  const d = new Date(Date.now() + 8 * 3600e3);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
let k = 0;
const hold = (over) => Object.assign({
  customerName: 'Ana Reyes', mobile: '09171234567', facebookName: 'Ana Reyes', itemIds: ['SF001'], days: 3,
  pickupDate: tomorrowPlus(10), pickupTime: '2:00 PM', acceptTerms: true, acceptPrivacy: true,
  requestKey: 'req-' + String(++k).padStart(20, '0')
}, over || {});

test('setup creates all tabs, headers, settings and sample catalog', () => {
  const { ctx, sheets, props } = loadGas();
  ctx.setupFloraSheet();
  assert.deepEqual(Object.keys(sheets).sort(), ['Blocked Dates', 'Booking Items', 'Bookings', 'Catalog', 'Settings']);
  assert.equal(sheets.Catalog.cells.length, 12);
  assert.ok(props.FLORA_API_SECRET.length >= 32);
  assert.equal(sheets.Settings.cells[1][0], 'bookings_enabled');
});

test('web app rejects requests without the secret', () => {
  const { ctx } = ready();
  assert.equal(post(ctx, 'wrong', 'catalog', {}).code, 'UNAUTHORIZED');
});

test('catalog endpoint returns only published, public fields', () => {
  const { ctx, props } = ready();
  const r = post(ctx, props.FLORA_API_SECRET, 'catalog', {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map((i) => i.id), ['SF001', 'SF002']);
  assert.equal(r.settings.bookingsOpen, true);
  assert.equal(JSON.stringify(r).includes('staffNotes'), false);
});

test('hold is written to Bookings + Booking Items and blocks availability; customer data never public', () => {
  const { ctx, props, sheets } = ready();
  const S = props.FLORA_API_SECRET;
  const r = post(ctx, S, 'createHold', hold({ itemIds: ['SF001', 'SF002'] }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.summary.code, /^FL-/);
  assert.equal(sheets.Bookings.cells.length, 2);
  assert.equal(sheets['Booking Items'].cells.length, 3);
  const a = post(ctx, S, 'availability', { itemIds: ['SF001'], from: tomorrowPlus(1), to: tomorrowPlus(60) });
  assert.equal(a.days.SF001.length, 4); // 3 rental days + 1 cleaning day
  assert.equal(JSON.stringify(a).includes('Ana'), false);
  const dup = post(ctx, S, 'createHold', hold({ requestKey: 'another-key-000000000001' }));
  assert.equal(dup.code, 'UNAVAILABLE');
  assert.equal(sheets.Bookings.cells.length, 2);
});

test('retrying the same request key does not create a duplicate', () => {
  const { ctx, props, sheets } = ready();
  const req = hold();
  const a = post(ctx, props.FLORA_API_SECRET, 'createHold', req);
  const b = post(ctx, props.FLORA_API_SECRET, 'createHold', req);
  assert.equal(a.summary.code, b.summary.code);
  assert.equal(b.replay, true);
  assert.equal(sheets.Bookings.cells.length, 2);
});

test('formula injection is neutralized when writing', () => {
  const { ctx, props, sheets } = ready();
  const r = post(ctx, props.FLORA_API_SECRET, 'createHold', hold({ customerName: '=IMPORTXML("http://x")', facebookName: '+SUM(1)' }));
  assert.equal(r.ok, true);
  const H = sheets.Bookings.cells[0];
  // In the fake, the leading apostrophe is consumed exactly as Sheets does, so the cell holds literal text.
  assert.equal(sheets.Bookings.cells[1][H.indexOf('Customer name')], '=IMPORTXML("http://x")');
});

test('busy lock returns a retry message and writes nothing', () => {
  const g = ready();
  g.setLocked(true);
  const r = post(g.ctx, g.props.FLORA_API_SECRET, 'createHold', hold());
  assert.equal(r.code, 'BUSY');
  assert.equal(g.sheets.Bookings.cells.length, 1);
});

test('staff flow: review, deposit, confirm, pickup, partial return, refund — and walk-in blocks the calendar', () => {
  const { ctx, props, sheets } = ready();
  const S = props.FLORA_API_SECRET;
  const code = post(ctx, S, 'createHold', hold({ itemIds: ['SF001', 'SF002'] })).summary.code;
  assert.equal(ctx.staffAction('facebookReview', { code, result: 'Approved', facebookLink: 'https://facebook.com/ana' }).ok, true);
  assert.equal(ctx.staffAction('recordDeposit', { code, amount: 500 }).ok, true);
  const c = ctx.staffAction('confirm', { code });
  assert.equal(c.ok, true, c.message);
  const loaded = ctx.staffLoadBooking(code);
  assert.equal(loaded.booking.status, 'Confirmed');
  assert.equal(loaded.booking.depositVerified, 500);

  const walkin = ctx.staffAction('manualBooking', {
    source: 'Walk-in', customerName: 'Liza Cruz', mobile: '09981234567', itemIds: ['SF001'],
    pickupDate: tomorrowPlus(30), days: 3, pickupTime: '10:00 AM', acceptTerms: true, acceptPrivacy: true
  });
  assert.equal(walkin.ok, true, walkin.message);
  const clash = post(ctx, S, 'createHold', hold({ pickupDate: tomorrowPlus(31) }));
  assert.equal(clash.code, 'UNAVAILABLE');

  assert.equal(ctx.staffAction('pickup', { code, itemId: 'ALL' }).ok, true);
  const ret = ctx.staffAction('return', { code, itemId: 'SF001', condition: 'Good' });
  assert.equal(ret.ok, true);
  const H = sheets['Booking Items'].cells[0];
  const rows = sheets['Booking Items'].cells.slice(1).filter((r) => r[0] === code);
  assert.deepEqual(rows.map((r) => r[H.indexOf('Return status')]).sort(), ['Not returned', 'Returned']);
  assert.equal(ctx.staffAction('return', { code, itemId: 'SF002' }).ok, true);
  assert.equal(ctx.staffAction('refund', { code, deductions: 0, refund: 500 }).ok, true);
  assert.equal(ctx.staffLoadBooking(code).booking.status, 'Completed');

  const blk = ctx.staffAction('block', { itemId: 'SF002', start: tomorrowPlus(50), end: tomorrowPlus(52), reason: 'Repair' });
  assert.equal(blk.ok, true);
  const a = post(ctx, S, 'availability', { itemIds: ['SF002'], from: tomorrowPlus(45), to: tomorrowPlus(55) });
  assert.deepEqual(a.days.SF002, [tomorrowPlus(50), tomorrowPlus(51), tomorrowPlus(52)]);
  const up = ctx.staffData();
  assert.ok(Array.isArray(up.upcoming.pickups));
});

test('website bookings stay off until settings are complete', () => {
  const { ctx, props, sheets } = ready();
  setSetting(sheets, 'deposit_basis', '');
  const r = post(ctx, props.FLORA_API_SECRET, 'createHold', hold());
  assert.equal(r.code, 'BOOKINGS_CLOSED');
});
