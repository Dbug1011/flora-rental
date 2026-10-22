const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../shared/booking-core.js');

// Fixed clock: 2026-10-22 10:00 Asia/Manila
const NOW = C.parseManilaStamp('2026-10-22 10:00');

const settings = C.normalizeSettings({
  bookings_enabled: 'TRUE',
  facebook_page_url: 'https://www.facebook.com/floradressrentalbohol',
  pickup_location: 'Tagbilaran City (exact address sent after confirmation)',
  operating_hours: 'Daily 10:00 AM – 6:00 PM',
  pickup_time_slots: '10:00 AM\n12:00 PM\n2:00 PM\n4:00 PM',
  return_deadline_time: '6:00 PM',
  rental_days: 3, max_online_days: 4, extension_rate: 100, extension_basis: 'per_dress',
  cleaning_buffer_days: 1, hold_hours: 24, deposit_amount: 500, deposit_basis: 'per_booking',
  min_lead_days: 1, max_advance_days: 180, max_items_per_booking: 4, late_fee_per_day: 120,
  rental_terms: 'Terms', privacy_notice: 'Privacy', cancellation_policy: 'Cancellation'
});

const catalog = C.normalizeCatalog([
  { item_id: 'SF001', dress_name: 'Poppy', base_rental_price: 399, included_days: 3, published: 'TRUE', size: 'Small' },
  { item_id: 'SF002', dress_name: 'Camellia', base_rental_price: '₱499', included_days: 3, published: 'TRUE' },
  { item_id: 'SF003', dress_name: 'Hibiscus', base_rental_price: '', published: 'TRUE' },
  { item_id: 'SF004', dress_name: 'Magnolia', base_rental_price: 450, published: 'FALSE' }
], settings, { includeDrafts: true });

let seq = 0;
const ctx = (over) => Object.assign({ nowMs: NOW, settings, catalog, randomInt: (n) => (seq++ * 7) % n }, over || {});
const emptyState = () => ({ bookings: [], bookingItems: [], blocks: [] });
const apply = (state, res) => {
  state.bookings.push(...res.writes.bookings);
  state.bookingItems.push(...res.writes.bookingItems);
};
const applyOps = (state, res) => {
  res.updates.forEach((u) => Object.assign(state.bookings.find((b) => b.code === u.code), u.fields));
  res.itemUpdates.forEach((u) => Object.assign(state.bookingItems.find((b) => b.code === u.code && b.itemId === u.itemId), u.fields));
  state.blocks.push(...res.newBlocks);
};
let keyN = 0;
const req = (over) => Object.assign({
  customerName: 'Maria Santos', mobile: '0917 123 4567', facebookName: 'Maria Santos',
  itemIds: ['SF001'], days: 3, pickupDate: '2026-11-05', pickupTime: '2:00 PM',
  acceptTerms: true, acceptPrivacy: true, requestKey: 'key-' + String(++keyN).padStart(16, '0')
}, over || {});

test('3-day and 4-day rentals count calendar days including pickup and return', () => {
  assert.equal(C.rentalWindow('2026-11-05', 3).returnDate, '2026-11-07');
  assert.equal(C.rentalWindow('2026-11-05', 4).returnDate, '2026-11-08');
  assert.equal(C.rentalWindow('2026-12-30', 3).returnDate, '2027-01-01');
  assert.equal(C.rentalWindow('2028-02-28', 3).returnDate, '2028-03-01'); // leap year
});

test('Manila timestamps round-trip and today uses Asia/Manila', () => {
  assert.equal(C.manilaStamp(NOW), '2026-10-22 10:00');
  // 2026-10-22 17:30 UTC is already Oct 23 in Manila
  assert.equal(C.manilaToday(Date.UTC(2026, 9, 22, 17, 30)), '2026-10-23');
  assert.equal(C.formatLongDate('2026-11-05'), 'Thu, Nov 5, 2026');
});

test('catalog: unpublished and unpriced items are not bookable', () => {
  const byId = Object.fromEntries(catalog.map((i) => [i.id, i]));
  assert.equal(byId.SF001.bookable, true);
  assert.equal(byId.SF002.price, 499);
  assert.equal(byId.SF003.bookable, false);
  assert.equal(byId.SF004.bookable, false);
  assert.equal(C.normalizeCatalog([{ item_id: 'X1', dress_name: 'X', published: 'FALSE' }], settings).length, 0);
});

test('bookings stay closed until launch settings are complete', () => {
  const s2 = C.normalizeSettings({ bookings_enabled: 'TRUE' });
  assert.ok(C.launchBlockers(s2).includes('deposit_basis'));
  assert.ok(C.launchBlockers(s2).includes('cancellation_policy'));
  const r = C.createBooking(emptyState(), req(), ctx({ settings: s2 }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BOOKINGS_CLOSED');
});

test('hold creation: code format, totals from catalog, not confirmed', () => {
  const st = emptyState();
  const r = C.createBooking(st, req({ itemIds: ['SF001', 'SF002'], days: 4, rentalTotal: 1 }), ctx());
  assert.equal(r.ok, true);
  assert.match(r.summary.code, /^FL-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(r.summary.status, 'Hold');
  assert.equal(r.summary.confirmed, false);
  assert.equal(r.summary.returnDate, '2026-11-08');
  assert.equal(r.summary.rentalTotal, 399 + 100 + 499 + 100); // browser-supplied total ignored
  assert.equal(r.summary.depositRequired, 500);
  assert.equal(r.writes.bookings[0].holdExpiry, '2026-10-23 10:00');
  assert.equal(r.writes.bookings[0].mobile, '09171234567');
  assert.equal(r.writes.bookingItems.length, 2);
  const snap = JSON.parse(r.writes.bookings[0].termsSnapshot);
  assert.equal(snap.depositRequired, 500);
  assert.equal(snap.cancellationPolicy, 'Cancellation');
});

test('deposit per dress and per booking', () => {
  const s2 = Object.assign({}, settings, { depositBasis: 'per_dress' });
  const q = C.quote([catalog[0], catalog[1]], 3, s2);
  assert.equal(q.depositRequired, 1000);
  assert.equal(C.quote([catalog[0], catalog[1]], 3, settings).depositRequired, 500);
});

test('reserved dates (with cleaning buffer) block overlapping requests', () => {
  const st = emptyState();
  apply(st, C.createBooking(st, req({ pickupDate: '2026-11-05' }), ctx())); // occupies Nov 5–7 + buffer Nov 8
  const days = C.publicAvailability(st, ['SF001'], '2026-11-01', '2026-11-30', NOW, settings).SF001;
  assert.deepEqual(days, ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  assert.equal(C.createBooking(st, req({ pickupDate: '2026-11-08' }), ctx()).code, 'UNAVAILABLE');
  assert.equal(C.createBooking(st, req({ pickupDate: '2026-11-03' }), ctx()).code, 'UNAVAILABLE'); // its own buffer hits Nov 5
  assert.equal(C.createBooking(st, req({ pickupDate: '2026-11-09' }), ctx()).ok, true);
  assert.equal(C.createBooking(st, req({ pickupDate: '2026-11-01' }), ctx()).ok, true); // Nov 1–3 + buffer Nov 4
});

test('a rental cannot cross a blocked date', () => {
  const st = emptyState();
  st.blocks.push({ itemId: 'SF001', start: '2026-11-10', end: '2026-11-10', reason: 'Repair', active: true });
  assert.equal(C.createBooking(st, req({ pickupDate: '2026-11-09' }), ctx()).code, 'UNAVAILABLE');
  assert.equal(C.canStartOn('2026-11-09', 3, 1, new Set(['2026-11-10'])), false);
  st.blocks[0].active = false;
  assert.equal(C.createBooking(st, req({ pickupDate: '2026-11-09' }), ctx()).ok, true);
});

test('expired holds release availability', () => {
  const st = emptyState();
  apply(st, C.createBooking(st, req(), ctx()));
  const later = NOW + 25 * 3600000;
  assert.equal(C.createBooking(st, req(), ctx()).code, 'UNAVAILABLE');
  assert.equal(C.createBooking(st, req(), ctx({ nowMs: later })).ok, true);
  const ex = C.expireHolds(st, ctx({ nowMs: later }));
  assert.equal(ex.updates.length, 1);
  assert.equal(ex.updates[0].fields.status, 'Expired');
});

test('duplicate submission with the same request key returns the original booking', () => {
  const st = emptyState();
  const r1 = C.createBooking(st, req({ requestKey: 'same-key-0000000001' }), ctx());
  apply(st, r1);
  const r2 = C.createBooking(st, req({ requestKey: 'same-key-0000000001' }), ctx());
  assert.equal(r2.ok, true);
  assert.equal(r2.replay, true);
  assert.equal(r2.summary.code, r1.summary.code);
  assert.equal(r2.writes.bookings.length, 0);
});

test('multi-dress request fails entirely if any dress conflicts', () => {
  const st = emptyState();
  apply(st, C.createBooking(st, req({ itemIds: ['SF002'] }), ctx()));
  const r = C.createBooking(st, req({ itemIds: ['SF001', 'SF002'] }), ctx());
  assert.equal(r.ok, false);
  assert.deepEqual(r.itemIds, ['SF002']);
  assert.equal(r.writes, undefined);
});

test('manual (walk-in) bookings block the same calendar', () => {
  const st = emptyState();
  const m = C.createBooking(st, req({ source: 'Walk-in', confirmNow: true, depositVerified: 500, facebookName: '' }), ctx({ staff: true }));
  assert.equal(m.ok, true);
  assert.equal(m.writes.bookings[0].status, 'Confirmed');
  assert.equal(m.writes.bookings[0].facebookReview, 'Not required');
  apply(st, m);
  assert.equal(C.createBooking(st, req(), ctx()).code, 'UNAVAILABLE');
});

test('validation and input hardening', () => {
  const r = C.createBooking(emptyState(), req({ mobile: '123', acceptTerms: false, pickupDate: '2026-10-22', days: 7, pickupTime: '3:00 AM' }), ctx());
  assert.equal(r.code, 'INVALID');
  assert.ok(r.errors.mobile && r.errors.acceptTerms && r.errors.pickupDate && r.errors.days && r.errors.pickupTime);
  assert.equal(C.createBooking(emptyState(), req({ itemIds: ['SF003'] }), ctx()).code, 'INVALID'); // no price
  assert.equal(C.normalizePHMobile('+63 917 123 4567'), '09171234567');
  assert.equal(C.sanitizeForSheet('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(C.sanitizeForSheet('+639171234567'), "'+639171234567");
  assert.equal(C.sanitizeForSheet('Maria'), 'Maria');
});

test('staff confirmation requires review + verified deposit and rechecks availability', () => {
  const st = emptyState();
  const r = C.createBooking(st, req(), ctx());
  apply(st, r);
  const code = r.summary.code;
  assert.equal(C.STAFF_ACTIONS.confirm(st, { code }, ctx()).ok, false);
  applyOps(st, C.STAFF_ACTIONS.facebookReview(st, { code, result: 'Approved' }, ctx()));
  assert.match(C.STAFF_ACTIONS.confirm(st, { code }, ctx()).message, /less than required/);
  applyOps(st, C.STAFF_ACTIONS.recordDeposit(st, { code, amount: 500 }, ctx()));
  const ok = C.STAFF_ACTIONS.confirm(st, { code }, ctx());
  assert.equal(ok.ok, true);
  applyOps(st, ok);
  assert.equal(C.findBooking(st, code).status, 'Confirmed');
});

test('late payment after hold expiry needs staff review and a fresh availability check', () => {
  const st = emptyState();
  const r = C.createBooking(st, req(), ctx());
  apply(st, r);
  const code = r.summary.code;
  applyOps(st, C.STAFF_ACTIONS.facebookReview(st, { code, result: 'Approved' }, ctx()));
  applyOps(st, C.STAFF_ACTIONS.recordDeposit(st, { code, amount: 500 }, ctx()));
  const later = NOW + 30 * 3600000;
  // someone else grabbed the dates after expiry
  apply(st, C.createBooking(st, req(), ctx({ nowMs: later })));
  assert.equal(C.STAFF_ACTIONS.confirm(st, { code }, ctx({ nowMs: later })).code, 'HOLD_EXPIRED');
  assert.equal(C.STAFF_ACTIONS.confirm(st, { code, allowExpired: true }, ctx({ nowMs: later })).code, 'UNAVAILABLE');
});

test('extensions recheck availability and add per-dress charges', () => {
  const st = emptyState();
  const r = C.createBooking(st, req({ itemIds: ['SF001', 'SF002'] }), ctx());
  apply(st, r);
  apply(st, C.createBooking(st, req({ itemIds: ['SF002'], pickupDate: '2026-11-10' }), ctx()));
  const code = r.summary.code;
  assert.equal(C.STAFF_ACTIONS.approveExtension(st, { code, extraDays: 2 }, ctx()).code, 'UNAVAILABLE'); // Nov 9 + buffer Nov 10
  const ok = C.STAFF_ACTIONS.approveExtension(st, { code, extraDays: 1 }, ctx());
  assert.equal(ok.ok, true);
  applyOps(st, ok);
  const b = C.findBooking(st, code);
  assert.equal(b.returnDate, '2026-11-08');
  assert.equal(b.rentalTotal, 399 + 499 + 200);
});

test('partial returns are tracked per garment; overdue garments keep blocking', () => {
  const st = emptyState();
  const r = C.createBooking(st, req({ itemIds: ['SF001', 'SF002'], source: 'Facebook', confirmNow: true, depositVerified: 500 }), ctx({ staff: true }));
  apply(st, r);
  const code = r.summary.code;
  const atPickup = C.parseManilaStamp('2026-11-05 14:00');
  applyOps(st, C.STAFF_ACTIONS.pickup(st, { code, itemId: 'ALL' }, ctx({ nowMs: atPickup })));
  const atReturn = C.parseManilaStamp('2026-11-07 17:00');
  const pr = C.STAFF_ACTIONS['return'](st, { code, itemId: 'SF001', condition: 'Good' }, ctx({ nowMs: atReturn }));
  applyOps(st, pr);
  assert.equal(C.findBooking(st, code).status, 'Picked up');
  assert.match(pr.message, /still out/);
  // Camellia is 3 days late: still occupied through today + buffer
  const lateNow = C.parseManilaStamp('2026-11-10 09:00');
  const days = C.publicAvailability(st, ['SF002'], '2026-11-01', '2026-11-20', lateNow, settings).SF002;
  assert.ok(days.includes('2026-11-11'));
  const up = C.upcoming(st, ctx({ nowMs: lateNow }));
  assert.equal(up.overdue.length, 1);
  assert.equal(up.overdue[0].daysLate, 3);
  applyOps(st, C.STAFF_ACTIONS['return'](st, { code, itemId: 'SF002', condition: 'Hem stain' }, ctx({ nowMs: lateNow })));
  assert.equal(C.findBooking(st, code).status, 'Returned');
  const ref = C.STAFF_ACTIONS.refund(st, { code, deductions: 100, refund: 400, note: 'Extra cleaning (stain)' }, ctx({ nowMs: lateNow }));
  applyOps(st, ref);
  assert.equal(C.findBooking(st, code).status, 'Completed');
  assert.equal(C.STAFF_ACTIONS.refund(st, { code, deductions: 0, refund: 900 }, ctx()).ok, false);
});

test('cleaning/repair blocks warn when they overlap bookings', () => {
  const st = emptyState();
  apply(st, C.createBooking(st, req(), ctx()));
  assert.equal(C.STAFF_ACTIONS.block(st, { itemId: 'SF001', start: '2026-11-06', end: '2026-11-06', reason: 'Repair' }, ctx()).code, 'UNAVAILABLE');
  const ok = C.STAFF_ACTIONS.block(st, { itemId: 'SF001', start: '2026-11-20', end: '2026-11-22', reason: 'Cleaning' }, ctx());
  assert.equal(ok.newBlocks.length, 1);
});
