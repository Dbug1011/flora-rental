// GENERATED from shared/booking-core.js by `npm run sync:gas`. Do not edit here.
/*
 * Flora Dress Rental — shared booking core.
 *
 * Pure functions used by BOTH the Vercel website (Node) and the Google Apps Script
 * booking service. No platform APIs here (no SpreadsheetApp, no fetch, no require).
 *
 * apps-script/BookingCore.gs is an exact copy of this file. After editing, run:
 *   npm run sync:gas
 *
 * Conventions
 *  - Calendar dates are 'YYYY-MM-DD' strings in Asia/Manila.
 *  - Timestamps are 'YYYY-MM-DD HH:mm' strings in Asia/Manila (UTC+8, no DST).
 *  - A rental of N days covers N calendar days including pickup and return days:
 *    pickup Nov 5 + 3 days -> return Nov 7. It never means N x 24 hours.
 *  - Every operation that changes availability returns a "plan" (rows to write);
 *    the caller must apply it while holding the shared lock.
 */
var FloraCore = (function () {
  'use strict';

  var MANILA_OFFSET_MS = 8 * 3600 * 1000;
  var DAY_MS = 86400000;

  var STATUS = {
    HOLD: 'Hold',
    CONFIRMED: 'Confirmed',
    PICKED_UP: 'Picked up',
    RETURNED: 'Returned',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired'
  };
  var BLOCKING_STATUSES = [STATUS.CONFIRMED, STATUS.PICKED_UP, STATUS.RETURNED, STATUS.COMPLETED];
  var FB_REVIEW = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', NOT_REQUIRED: 'Not required' };
  var ITEM_PICKUP = { NOT: 'Not picked up', DONE: 'Picked up' };
  var ITEM_RETURN = { NOT: 'Not returned', DONE: 'Returned' };
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ------------------------------------------------------------------ dates

  function parseDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var p = s.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    if (d.getUTCFullYear() !== p[0] || d.getUTCMonth() !== p[1] - 1 || d.getUTCDate() !== p[2]) return null;
    return d;
  }
  function isDate(s) { return parseDate(s) !== null; }
  function fmtDate(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) {
    var d = parseDate(s);
    if (!d) return '';
    return fmtDate(new Date(d.getTime() + n * DAY_MS));
  }
  function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / DAY_MS); }
  function eachDay(a, b) {
    var out = [];
    if (!isDate(a) || !isDate(b)) return out;
    for (var d = a; d <= b; d = addDays(d, 1)) out.push(d);
    return out;
  }
  function manilaParts(ms) {
    var iso = new Date(ms + MANILA_OFFSET_MS).toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  }
  function manilaToday(ms) { return manilaParts(ms).date; }
  function manilaStamp(ms) { var p = manilaParts(ms); return p.date + ' ' + p.time; }
  function parseManilaStamp(s) {
    var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(String(s == null ? '' : s));
    if (!m || !isDate(m[1])) return null;
    return parseDate(m[1]).getTime() + Number(m[2]) * 3600000 + Number(m[3]) * 60000 - MANILA_OFFSET_MS;
  }
  function formatLongDate(s) {
    var d = parseDate(s);
    if (!d) return '';
    return WEEKDAYS[d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }
  function formatStamp(s) {
    var ms = parseManilaStamp(s);
    if (ms === null) return String(s || '');
    var p = manilaParts(ms);
    var h = Number(p.time.slice(0, 2));
    var min = p.time.slice(3, 5);
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return formatLongDate(p.date) + ', ' + h12 + ':' + min + ' ' + ampm;
  }

  /** A rental of `days` calendar days, counting pickup and return days. */
  function rentalWindow(pickupDate, days) {
    return { pickupDate: pickupDate, returnDate: addDays(pickupDate, days - 1) };
  }

  // ------------------------------------------------------------------ text helpers

  function str(v) { return v == null ? '' : String(v).trim(); }
  function cleanText(v, max) {
    return String(v == null ? '' : v)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max || 200);
  }
  function cleanMultiline(v, max) {
    return String(v == null ? '' : v)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
      .trim()
      .slice(0, max || 2000);
  }
  /** Prevents spreadsheet formula injection: text starting with = + - @ is stored as plain text. */
  function sanitizeForSheet(v) {
    if (typeof v !== 'string') return v;
    return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  }
  function toBool(v) { return v === true || /^(true|yes|y|1)$/i.test(str(v)); }
  function toNum(v, dflt) {
    if (v === '' || v == null) return dflt;
    if (typeof v === 'number') return isFinite(v) ? v : dflt;
    var n = Number(String(v).replace(/[₱,\s]/g, ''));
    return isFinite(n) && String(v).trim() !== '' ? n : dflt;
  }
  function toInt(v, dflt) {
    var n = toNum(v, null);
    return n === null ? dflt : Math.floor(n);
  }
  function oneOf(v, allowed) {
    var s = str(v).toLowerCase().replace(/[\s-]+/g, '_');
    return allowed.indexOf(s) >= 0 ? s : '';
  }
  function splitList(v) {
    return String(v == null ? '' : v).split(/[\n|;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function splitUrls(v) {
    return String(v == null ? '' : v)
      .split(/[\s,]+/)
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return /^https:\/\/[^\s"'<>]+$/i.test(x) || /^\/[A-Za-z0-9._~\/-]+$/.test(x); });
  }
  function headerKey(h) { return str(h).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
  function normalizePHMobile(v) {
    var s = String(v == null ? '' : v).replace(/[^\d+]/g, '');
    if (/^\+639\d{9}$/.test(s)) return '0' + s.slice(3);
    if (/^639\d{9}$/.test(s)) return '0' + s.slice(2);
    if (/^09\d{9}$/.test(s)) return s;
    return '';
  }
  function peso(n) {
    if (n === null || n === undefined || n === '' || !isFinite(Number(n))) return '';
    var v = Number(n);
    var whole = Math.round(v * 100) / 100;
    var parts = whole.toFixed(whole % 1 === 0 ? 0 : 2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '₱' + parts.join('.');
  }
  function unique(arr) {
    var seen = {};
    return arr.filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; });
  }
  function appendNote(existing, text, nowMs, who) {
    var line = '[' + manilaStamp(nowMs) + (who ? ' ' + who : '') + '] ' + cleanText(text, 500);
    return existing ? String(existing) + '\n' + line : line;
  }

  // ------------------------------------------------------------------ settings

  function normalizeSettings(raw) {
    raw = raw || {};
    var s = {
      bookingsEnabled: toBool(raw.bookings_enabled),
      facebookPageUrl: str(raw.facebook_page_url),
      pickupLocation: cleanMultiline(raw.pickup_location, 500),
      operatingHours: cleanMultiline(raw.operating_hours, 300),
      pickupTimeSlots: splitList(raw.pickup_time_slots),
      returnDeadlineTime: str(raw.return_deadline_time),
      rentalDays: Math.max(1, toInt(raw.rental_days, 3)),
      maxOnlineDays: toInt(raw.max_online_days, 4),
      extensionRate: toNum(raw.extension_rate, 100),
      extensionBasis: oneOf(raw.extension_basis, ['per_dress', 'per_booking']),
      cleaningBufferDays: Math.max(0, toInt(raw.cleaning_buffer_days, 1)),
      holdHours: Math.max(1, toNum(raw.hold_hours, 24)),
      depositAmount: toNum(raw.deposit_amount, 500),
      depositBasis: oneOf(raw.deposit_basis, ['per_booking', 'per_dress']),
      minLeadDays: Math.max(0, toInt(raw.min_lead_days, 1)),
      maxAdvanceDays: Math.max(1, toInt(raw.max_advance_days, 180)),
      maxItemsPerBooking: Math.max(1, toInt(raw.max_items_per_booking, 4)),
      lateFeePerDay: toNum(raw.late_fee_per_day, 120),
      rentalTerms: cleanMultiline(raw.rental_terms, 20000),
      privacyNotice: cleanMultiline(raw.privacy_notice, 20000),
      cancellationPolicy: cleanMultiline(raw.cancellation_policy, 20000)
    };
    if (s.maxOnlineDays < s.rentalDays) s.maxOnlineDays = s.rentalDays;
    return s;
  }

  /** Settings that must be filled in before real bookings can open. */
  function launchBlockers(s) {
    var missing = [];
    if (!/^https:\/\/(www\.|m\.|web\.)?(facebook\.com|fb\.com|m\.me)\/\S+/i.test(s.facebookPageUrl)) missing.push('facebook_page_url');
    if (!s.pickupLocation) missing.push('pickup_location');
    if (!s.operatingHours) missing.push('operating_hours');
    if (!s.pickupTimeSlots.length) missing.push('pickup_time_slots');
    if (!s.returnDeadlineTime) missing.push('return_deadline_time');
    if (!s.depositBasis) missing.push('deposit_basis');
    if (!s.extensionBasis) missing.push('extension_basis');
    if (!s.rentalTerms) missing.push('rental_terms');
    if (!s.privacyNotice) missing.push('privacy_notice');
    if (!s.cancellationPolicy) missing.push('cancellation_policy');
    return missing;
  }
  function bookingsOpen(s) { return s.bookingsEnabled && launchBlockers(s).length === 0; }

  function publicSettings(s) {
    return {
      bookingsOpen: bookingsOpen(s),
      facebookPageUrl: s.facebookPageUrl,
      pickupLocation: s.pickupLocation,
      operatingHours: s.operatingHours,
      pickupTimeSlots: s.pickupTimeSlots,
      returnDeadlineTime: s.returnDeadlineTime,
      rentalDays: s.rentalDays,
      maxOnlineDays: s.maxOnlineDays,
      extensionRate: s.extensionRate,
      extensionBasis: s.extensionBasis,
      cleaningBufferDays: s.cleaningBufferDays,
      holdHours: s.holdHours,
      depositAmount: s.depositAmount,
      depositBasis: s.depositBasis,
      minLeadDays: s.minLeadDays,
      maxAdvanceDays: s.maxAdvanceDays,
      maxItemsPerBooking: s.maxItemsPerBooking,
      lateFeePerDay: s.lateFeePerDay,
      rentalTerms: s.rentalTerms,
      privacyNotice: s.privacyNotice,
      cancellationPolicy: s.cancellationPolicy
    };
  }

  // ------------------------------------------------------------------ catalog

  /** Row object keyed by headerKey() of the Catalog headers. */
  function normalizeItem(r, s) {
    var it = {
      id: str(r.item_id).toUpperCase(),
      name: cleanText(r.dress_name, 60),
      description: cleanMultiline(r.description, 1500),
      size: cleanText(r.size, 40),
      color: cleanText(r.color, 40),
      measurements: cleanMultiline(r.measurements, 600),
      photos: splitUrls(r.photo_urls),
      previews: splitUrls(r.styled_preview_urls),
      price: toNum(r.base_rental_price, null),
      includedDays: toInt(r.included_days, s.rentalDays),
      extensionRate: toNum(r.extension_rate, s.extensionRate),
      accessories: cleanMultiline(r.accessories, 600),
      careNotes: cleanMultiline(r.care_notes, 1500),
      published: toBool(r.published)
    };
    if (!(it.includedDays >= 1)) it.includedDays = s.rentalDays;
    it.bookable = !!(it.published && /^[A-Z0-9-]{2,20}$/.test(it.id) && it.name && it.price > 0);
    return it;
  }
  function normalizeCatalog(rows, s, opts) {
    opts = opts || {};
    var seen = {};
    return rows.map(function (r) { return normalizeItem(r, s); }).filter(function (it) {
      if (!it.id || !it.name || seen[it.id]) return false;
      seen[it.id] = true;
      return it.published || opts.includeDrafts;
    });
  }
  function publicItem(it) {
    return {
      id: it.id, name: it.name, description: it.description, size: it.size, color: it.color, measurements: it.measurements,
      photos: it.photos, previews: it.previews, price: it.price, includedDays: it.includedDays,
      extensionRate: it.extensionRate, accessories: it.accessories, careNotes: it.careNotes,
      bookable: it.bookable, draft: !it.published
    };
  }

  // ------------------------------------------------------------------ pricing

  function quote(items, days, s) {
    var lines = [];
    var rentalTotal = 0;
    items.forEach(function (it, i) {
      var extraDays = Math.max(0, days - it.includedDays);
      var charge;
      if (s.extensionBasis === 'per_booking') {
        charge = i === 0 ? Math.max(0, days - s.rentalDays) * s.extensionRate : 0;
      } else {
        charge = extraDays * it.extensionRate;
      }
      lines.push({
        id: it.id, name: it.name, price: it.price, extraDays: extraDays,
        extensionRate: s.extensionBasis === 'per_booking' ? s.extensionRate : it.extensionRate,
        extensionCharge: charge
      });
      rentalTotal += it.price + charge;
    });
    var deposit = s.depositBasis === 'per_dress' ? s.depositAmount * items.length
      : s.depositBasis === 'per_booking' ? s.depositAmount : null;
    return { lines: lines, rentalTotal: rentalTotal, depositRequired: deposit };
  }

  // ------------------------------------------------------------------ availability

  function isBlockingBooking(b, nowMs) {
    if (b.status === STATUS.HOLD) {
      var exp = parseManilaStamp(b.holdExpiry);
      return exp !== null && nowMs < exp;
    }
    return BLOCKING_STATUSES.indexOf(b.status) >= 0;
  }

  /**
   * itemId -> [{start, end, kind, code}] of occupied days (inclusive).
   * Bookings occupy pickup..return plus the cleaning buffer. A garment that is
   * picked up but overdue stays occupied until today (+ buffer).
   */
  function buildOccupancy(state, nowMs, s, excludeCode) {
    var occ = {};
    var today = manilaToday(nowMs);
    var buffer = s.cleaningBufferDays;
    var active = {};
    (state.bookings || []).forEach(function (b) {
      if (excludeCode && b.code === excludeCode) return;
      if (!isDate(b.pickupDate) || !isDate(b.returnDate)) return;
      if (isBlockingBooking(b, nowMs)) active[b.code] = b;
    });
    function add(id, r) { (occ[id] = occ[id] || []).push(r); }
    (state.bookingItems || []).forEach(function (bi) {
      var b = active[bi.code];
      if (!b) return;
      var end = b.returnDate;
      if (bi.pickupStatus === ITEM_PICKUP.DONE && bi.returnStatus !== ITEM_RETURN.DONE && today > end) end = today;
      add(bi.itemId, { start: b.pickupDate, end: addDays(end, buffer), kind: 'booking', code: b.code });
    });
    (state.blocks || []).forEach(function (bl) {
      if (!bl.active || !isDate(bl.start)) return;
      var end = isDate(bl.end) ? bl.end : bl.start;
      if (end < bl.start) return;
      add(bl.itemId, { start: bl.start, end: end, kind: 'block', reason: bl.reason });
    });
    return occ;
  }

  /** Conflicts for renting itemIds from pickup to return (plus cleaning buffer). */
  function findConflicts(occ, itemIds, pickupDate, returnDate, s, opts) {
    opts = opts || {};
    var needEnd = addDays(returnDate, s.cleaningBufferDays);
    var out = [];
    itemIds.forEach(function (id) {
      (occ[id] || []).forEach(function (r) {
        if (opts.bookingsOnly && r.kind !== 'booking') return;
        if (r.start <= needEnd && pickupDate <= r.end) out.push({ itemId: id, start: r.start, end: r.end, kind: r.kind, code: r.code || '' });
      });
    });
    return out;
  }

  function unavailableDays(occ, itemId, from, to) {
    var days = {};
    (occ[itemId] || []).forEach(function (r) {
      var a = r.start > from ? r.start : from;
      var b = r.end < to ? r.end : to;
      eachDay(a, b).forEach(function (d) { days[d] = true; });
    });
    return Object.keys(days).sort();
  }

  /** Public availability: dates only, never booking details. */
  function publicAvailability(state, itemIds, from, to, nowMs, s) {
    var occ = buildOccupancy(state, nowMs, s);
    var out = {};
    itemIds.forEach(function (id) { out[id] = unavailableDays(occ, id, from, to); });
    return out;
  }

  /** Can `days`-day rental start on `pickup`, given a Set/object of unavailable days? (used by the calendar) */
  function canStartOn(pickup, days, bufferDays, unavailable) {
    var end = addDays(pickup, days - 1 + bufferDays);
    var has = typeof unavailable.has === 'function' ? function (d) { return unavailable.has(d); } : function (d) { return !!unavailable[d]; };
    for (var d = pickup; d <= end; d = addDays(d, 1)) if (has(d)) return false;
    return true;
  }

  // ------------------------------------------------------------------ requests

  function makeCode(randomInt) {
    var c = 'FL-';
    for (var i = 0; i < 6; i++) c += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
    return c;
  }

  function validateRequest(input, catalogById, s, nowMs, opts) {
    opts = opts || {};
    input = input || {};
    var e = {};
    var v = {};
    var today = manilaToday(nowMs);

    v.customerName = cleanText(input.customerName, 80);
    if (v.customerName.length < 2) e.customerName = 'Please enter your full name.';

    v.mobile = normalizePHMobile(input.mobile);
    if (!v.mobile) e.mobile = 'Enter a valid Philippine mobile number, e.g. 0917 123 4567.';

    v.facebookName = cleanText(input.facebookName, 80);
    if (v.facebookName.length < 2 && !opts.staff) e.facebookName = 'Enter the Facebook profile name you will message us from.';

    v.email = cleanText(input.email, 120);
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'Enter a valid email or leave it blank.';

    var ids = Array.isArray(input.itemIds) ? unique(input.itemIds.map(function (x) { return str(x).toUpperCase(); }).filter(Boolean)) : [];
    var maxItems = opts.staff ? 10 : s.maxItemsPerBooking;
    v.itemIds = ids;
    if (!ids.length) e.itemIds = 'Select at least one dress.';
    else if (ids.length > maxItems) e.itemIds = 'You can reserve up to ' + maxItems + ' dresses per request.';
    else {
      for (var i = 0; i < ids.length; i++) {
        var it = catalogById[ids[i]];
        if (!it || (!it.bookable && !opts.staff) || (opts.staff && !(it.price > 0))) {
          e.itemIds = 'One of the selected dresses (' + ids[i] + ') is not available for booking.';
          break;
        }
      }
    }

    v.days = toInt(input.days, NaN);
    var maxDays = opts.staff ? 30 : s.maxOnlineDays;
    if (!(v.days >= s.rentalDays && v.days <= maxDays)) {
      e.days = s.maxOnlineDays > s.rentalDays && !opts.staff
        ? 'Choose a ' + s.rentalDays + '- to ' + s.maxOnlineDays + '-day rental.'
        : 'Choose a rental of at least ' + s.rentalDays + ' days.';
    }

    v.pickupDate = str(input.pickupDate);
    var lead = opts.staff ? 0 : s.minLeadDays;
    if (!isDate(v.pickupDate)) e.pickupDate = 'Choose a pickup date.';
    else if (v.pickupDate < addDays(today, lead)) e.pickupDate = lead ? 'Pickup must be at least ' + lead + ' day(s) from today.' : 'Pickup date is in the past.';
    else if (!opts.staff && v.pickupDate > addDays(today, s.maxAdvanceDays)) e.pickupDate = 'We take reservations up to ' + s.maxAdvanceDays + ' days ahead.';

    v.pickupTime = cleanText(input.pickupTime, 40);
    if (!opts.staff && s.pickupTimeSlots.length && s.pickupTimeSlots.indexOf(v.pickupTime) < 0) e.pickupTime = 'Choose a pickup time.';

    if (input.acceptTerms !== true) e.acceptTerms = opts.staff ? 'Confirm the customer accepted the rental terms.' : 'Please accept the rental terms.';
    if (input.acceptPrivacy !== true) e.acceptPrivacy = opts.staff ? 'Confirm the customer was given the privacy notice.' : 'Please acknowledge the privacy notice.';

    v.requestKey = str(input.requestKey);
    if (!/^[A-Za-z0-9-]{16,64}$/.test(v.requestKey)) e.requestKey = 'Please refresh the page and try again.';

    return { ok: Object.keys(e).length === 0, errors: e, value: v };
  }

  function termsSnapshot(s, q, days, nowMs) {
    return {
      capturedAt: manilaStamp(nowMs),
      days: days,
      standardDays: s.rentalDays,
      extensionRate: s.extensionRate,
      extensionBasis: s.extensionBasis,
      depositAmount: s.depositAmount,
      depositBasis: s.depositBasis,
      depositRequired: q.depositRequired,
      lateFeePerDay: s.lateFeePerDay,
      holdHours: s.holdHours,
      cleaningBufferDays: s.cleaningBufferDays,
      returnDeadlineTime: s.returnDeadlineTime,
      rentalTerms: s.rentalTerms,
      cancellationPolicy: s.cancellationPolicy
    };
  }

  function itemsFor(state, code) {
    return (state.bookingItems || []).filter(function (bi) { return bi.code === code; });
  }
  function findBooking(state, code) {
    code = str(code).toUpperCase();
    for (var i = 0; i < (state.bookings || []).length; i++) if (state.bookings[i].code === code) return state.bookings[i];
    return null;
  }

  /** Customer-safe summary. Only ever returned to the person who just made the request. */
  function summarize(b, items, s) {
    return {
      code: b.code,
      status: b.status,
      confirmed: b.status === STATUS.CONFIRMED,
      items: items.map(function (bi) {
        return { id: bi.itemId, name: bi.name, price: Number(bi.price) || 0, extensionCharge: Number(bi.extensionCharge) || 0 };
      }),
      pickupDate: b.pickupDate,
      pickupTime: b.pickupTime,
      returnDate: b.returnDate,
      returnDeadline: b.returnDeadline,
      days: daysBetween(b.pickupDate, b.returnDate) + 1,
      rentalTotal: Number(b.rentalTotal) || 0,
      depositRequired: b.depositRequired === '' || b.depositRequired == null ? null : Number(b.depositRequired),
      holdExpiry: b.holdExpiry,
      facebookPageUrl: s.facebookPageUrl
    };
  }

  function fail(code, message, extra) {
    var r = { ok: false, code: code, message: message };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
    return r;
  }

  /**
   * Create a temporary hold (website) or a manual booking (staff).
   * ctx: { nowMs, settings, catalog: normalized items, randomInt(n), source, staff, who }
   * Returns { ok, writes: { bookings: [...], bookingItems: [...] }, summary } or a failure.
   */
  function createBooking(state, input, ctx) {
    var s = ctx.settings;
    var staff = !!ctx.staff;
    if (!staff && !bookingsOpen(s)) return fail('BOOKINGS_CLOSED', 'Online reservations are not open yet. Please check back soon.');
    var byId = {};
    ctx.catalog.forEach(function (it) { byId[it.id] = it; });
    var val = validateRequest(input, byId, s, ctx.nowMs, { staff: staff });
    if (!val.ok) return fail('INVALID', 'Please check the highlighted fields.', { errors: val.errors });
    var v = val.value;

    // Idempotency: a retried submission returns the original booking instead of creating another.
    for (var i = 0; i < (state.bookings || []).length; i++) {
      var prev = state.bookings[i];
      if (prev.requestKey && prev.requestKey === v.requestKey) {
        return { ok: true, replay: true, writes: { bookings: [], bookingItems: [] }, summary: summarize(prev, itemsFor(state, prev.code), s) };
      }
    }

    var win = rentalWindow(v.pickupDate, v.days);
    var occ = buildOccupancy(state, ctx.nowMs, s);
    var conflicts = findConflicts(occ, v.itemIds, win.pickupDate, win.returnDate, s);
    if (conflicts.length) {
      var ids = unique(conflicts.map(function (c) { return c.itemId; }));
      var names = ids.map(function (id) { return byId[id] ? byId[id].name : id; });
      return fail('UNAVAILABLE', 'Sorry, ' + names.join(' and ') + (ids.length > 1 ? ' are' : ' is') +
        ' no longer available for those dates. Nothing was reserved. Please choose other dates or dresses.',
        { itemIds: ids, conflicts: staff ? conflicts : undefined });
    }

    var items = v.itemIds.map(function (id) { return byId[id]; });
    var q = quote(items, v.days, s);
    var existing = {};
    (state.bookings || []).forEach(function (b) { existing[b.code] = true; });
    var code;
    var tries = 0;
    do { code = makeCode(ctx.randomInt); tries++; } while (existing[code] && tries < 50);
    if (existing[code]) return fail('ERROR', 'Could not generate a booking code. Please try again.');

    var confirmNow = staff && input.confirmNow === true;
    var depositVerified = confirmNow ? toNum(input.depositVerified, null) : null;
    if (confirmNow && q.depositRequired !== null && !(depositVerified >= q.depositRequired)) {
      return fail('INVALID', 'To confirm now, record the verified deposit of at least ' + peso(q.depositRequired) + '.', { errors: { depositVerified: 'Deposit not fully verified.' } });
    }

    var booking = {
      code: code,
      submittedAt: manilaStamp(ctx.nowMs),
      customerName: v.customerName,
      mobile: v.mobile,
      facebookName: v.facebookName,
      facebookLink: staff ? cleanText(input.facebookLink, 300) : '',
      email: v.email,
      pickupDate: win.pickupDate,
      pickupTime: v.pickupTime,
      returnDate: win.returnDate,
      returnDeadline: s.returnDeadlineTime,
      status: confirmNow ? STATUS.CONFIRMED : STATUS.HOLD,
      holdExpiry: confirmNow ? '' : manilaStamp(ctx.nowMs + s.holdHours * 3600000),
      facebookReview: staff && input.source === 'Walk-in' ? FB_REVIEW.NOT_REQUIRED : FB_REVIEW.PENDING,
      rentalTotal: q.rentalTotal,
      depositRequired: q.depositRequired === null ? '' : q.depositRequired,
      depositVerified: depositVerified === null ? '' : depositVerified,
      rentalPaid: '',
      deductions: '',
      refundAmount: '',
      staffNotes: staff ? appendNote('', 'Created by staff (' + (input.source || 'Manual') + ')' + (confirmNow ? ', confirmed with verified deposit' : ''), ctx.nowMs, ctx.who) : '',
      source: staff ? (cleanText(input.source, 20) || 'Manual') : 'Website',
      requestKey: v.requestKey,
      termsSnapshot: JSON.stringify(termsSnapshot(s, q, v.days, ctx.nowMs)),
      lastUpdated: manilaStamp(ctx.nowMs)
    };
    if (confirmNow && staff && input.source !== 'Walk-in') booking.facebookReview = FB_REVIEW.APPROVED;
    var bookingItems = q.lines.map(function (l) {
      return {
        code: code, itemId: l.id, name: l.name, price: l.price, extensionRate: l.extensionRate,
        extensionCharge: l.extensionCharge, pickupStatus: ITEM_PICKUP.NOT, returnStatus: ITEM_RETURN.NOT, conditionNotes: ''
      };
    });
    return { ok: true, writes: { bookings: [booking], bookingItems: bookingItems }, summary: summarize(booking, bookingItems, s) };
  }

  // ------------------------------------------------------------------ staff operations
  // Each returns { ok, message, updates: [{code, fields}], itemUpdates: [{code, itemId, fields}], newBlocks: [...] }

  function result(message, updates, itemUpdates, newBlocks) {
    return { ok: true, message: message, updates: updates || [], itemUpdates: itemUpdates || [], newBlocks: newBlocks || [] };
  }
  function requireBooking(state, code) {
    var b = findBooking(state, code);
    return b ? { b: b } : { err: fail('NOT_FOUND', 'No booking found with code ' + str(code).toUpperCase() + '.') };
  }
  function stamp(fields, ctx) { fields.lastUpdated = manilaStamp(ctx.nowMs); return fields; }

  function setFacebookReview(state, p, ctx) {
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var res = p.result === 'Approved' ? FB_REVIEW.APPROVED : p.result === 'Rejected' ? FB_REVIEW.REJECTED : null;
    if (!res) return fail('INVALID', 'Choose Approved or Rejected.');
    var f = { facebookReview: res, staffNotes: appendNote(r.b.staffNotes, 'Facebook review: ' + res + (p.note ? ' — ' + p.note : ''), ctx.nowMs, ctx.who) };
    if (p.facebookLink) f.facebookLink = cleanText(p.facebookLink, 300);
    return result('Facebook review set to ' + res + '.' + (res === FB_REVIEW.REJECTED ? ' Cancel the booking to release the dates.' : ''), [{ code: r.b.code, fields: stamp(f, ctx) }]);
  }

  function recordDeposit(state, p, ctx) {
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var amt = toNum(p.amount, null);
    if (!(amt >= 0)) return fail('INVALID', 'Enter the deposit amount actually received.');
    var f = { depositVerified: amt, staffNotes: appendNote(r.b.staffNotes, 'Deposit verified: ' + peso(amt) + (p.note ? ' — ' + p.note : ''), ctx.nowMs, ctx.who) };
    return result('Deposit of ' + peso(amt) + ' recorded. Confirm the booking next.', [{ code: r.b.code, fields: stamp(f, ctx) }]);
  }

  function confirmBooking(state, p, ctx) {
    var s = ctx.settings;
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var b = r.b;
    if (b.status !== STATUS.HOLD && b.status !== STATUS.EXPIRED) return fail('INVALID', 'Only bookings on hold can be confirmed (current status: ' + b.status + ').');
    if (b.facebookReview !== FB_REVIEW.APPROVED && b.facebookReview !== FB_REVIEW.NOT_REQUIRED) return fail('INVALID', 'Review and approve the Facebook account first.');
    var required = toNum(b.depositRequired, null);
    var verified = toNum(b.depositVerified, null);
    if (required === null) return fail('INVALID', 'Deposit required is blank. Set the deposit basis in Settings and record the deposit.');
    if (!(verified >= required)) return fail('INVALID', 'Verified deposit (' + peso(verified || 0) + ') is less than required (' + peso(required) + ').');
    var expired = b.status === STATUS.EXPIRED || !isBlockingBooking(b, ctx.nowMs);
    if (expired && p.allowExpired !== true) {
      return fail('HOLD_EXPIRED', 'This hold expired at ' + formatStamp(b.holdExpiry) + '. Tick "I reviewed this late payment" to recheck availability and confirm.');
    }
    var occ = buildOccupancy(state, ctx.nowMs, s, b.code);
    var ids = itemsFor(state, b.code).map(function (bi) { return bi.itemId; });
    var c = findConflicts(occ, ids, b.pickupDate, b.returnDate, s);
    if (c.length) return fail('UNAVAILABLE', 'Cannot confirm: ' + unique(c.map(function (x) { return x.itemId; })).join(', ') + ' is now booked or blocked for these dates. Contact the customer about other dates or a refund.', { conflicts: c });
    var f = {
      status: STATUS.CONFIRMED, holdExpiry: '',
      staffNotes: appendNote(b.staffNotes, 'Confirmed' + (expired ? ' after hold expiry (late payment reviewed, availability rechecked)' : ''), ctx.nowMs, ctx.who)
    };
    return result('Booking ' + b.code + ' confirmed. Send the customer their confirmation.', [{ code: b.code, fields: stamp(f, ctx) }]);
  }

  function extendHold(state, p, ctx) {
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var b = r.b;
    var hours = toNum(p.hours, null);
    if (!(hours > 0 && hours <= 168)) return fail('INVALID', 'Enter 1–168 hours.');
    if (b.status !== STATUS.HOLD && b.status !== STATUS.EXPIRED) return fail('INVALID', 'Only holds can be extended.');
    if (!isBlockingBooking(b, ctx.nowMs)) {
      var occ = buildOccupancy(state, ctx.nowMs, ctx.settings, b.code);
      var c = findConflicts(occ, itemsFor(state, b.code).map(function (x) { return x.itemId; }), b.pickupDate, b.returnDate, ctx.settings);
      if (c.length) return fail('UNAVAILABLE', 'The hold expired and the dates are now taken. It cannot be extended.', { conflicts: c });
    }
    var exp = manilaStamp(ctx.nowMs + hours * 3600000);
    var f = { status: STATUS.HOLD, holdExpiry: exp, staffNotes: appendNote(b.staffNotes, 'Hold extended to ' + exp, ctx.nowMs, ctx.who) };
    return result('Hold extended until ' + formatStamp(exp) + '.', [{ code: b.code, fields: stamp(f, ctx) }]);
  }

  function cancelBooking(state, p, ctx) {
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var b = r.b;
    if ([STATUS.CANCELLED, STATUS.COMPLETED].indexOf(b.status) >= 0) return fail('INVALID', 'Booking is already ' + b.status + '.');
    if (b.status === STATUS.PICKED_UP || b.status === STATUS.RETURNED) return fail('INVALID', 'Dresses were already picked up. Record returns and refunds instead.');
    var f = { status: STATUS.CANCELLED, holdExpiry: '', staffNotes: appendNote(b.staffNotes, 'Cancelled' + (p.reason ? ': ' + p.reason : ''), ctx.nowMs, ctx.who) };
    return result('Booking ' + b.code + ' cancelled. Its dates are released. Record any deposit refund separately.', [{ code: b.code, fields: stamp(f, ctx) }]);
  }

  function approveExtension(state, p, ctx) {
    var s = ctx.settings;
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var b = r.b;
    var extra = toInt(p.extraDays, 0);
    if (!(extra >= 1 && extra <= 14)) return fail('INVALID', 'Enter 1–14 extra days.');
    if ([STATUS.CONFIRMED, STATUS.PICKED_UP, STATUS.HOLD].indexOf(b.status) < 0) return fail('INVALID', 'Extensions apply to active bookings only.');
    var newReturn = addDays(b.returnDate, extra);
    var items = itemsFor(state, b.code);
    var occ = buildOccupancy(state, ctx.nowMs, s, b.code);
    var c = findConflicts(occ, items.map(function (x) { return x.itemId; }), b.pickupDate, newReturn, s);
    if (c.length) return fail('UNAVAILABLE', 'Cannot extend: ' + unique(c.map(function (x) { return x.itemId; })).join(', ') + ' is booked or blocked within the new dates.', { conflicts: c });
    var itemUpdates = [];
    var added = 0;
    items.forEach(function (bi, i) {
      var rate = toNum(bi.extensionRate, s.extensionRate);
      var charge = s.extensionBasis === 'per_booking' ? (i === 0 ? extra * s.extensionRate : 0) : extra * rate;
      added += charge;
      itemUpdates.push({ code: b.code, itemId: bi.itemId, fields: { extensionCharge: (toNum(bi.extensionCharge, 0) || 0) + charge } });
    });
    var f = {
      returnDate: newReturn,
      rentalTotal: (toNum(b.rentalTotal, 0) || 0) + added,
      staffNotes: appendNote(b.staffNotes, 'Extension approved: +' + extra + ' day(s), new return ' + newReturn + ', +' + peso(added), ctx.nowMs, ctx.who)
    };
    return result('Extended to ' + formatLongDate(newReturn) + ' (+' + peso(added) + ').', [{ code: b.code, fields: stamp(f, ctx) }], itemUpdates);
  }

  function recordRentalPayment(state, p, ctx) {
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var amt = toNum(p.amount, null);
    if (!(amt >= 0)) return fail('INVALID', 'Enter the rental amount received.');
    var total = (toNum(r.b.rentalPaid, 0) || 0) + amt;
    var f = { rentalPaid: total, staffNotes: appendNote(r.b.staffNotes, 'Rental payment received: ' + peso(amt), ctx.nowMs, ctx.who) };
    return result('Rental paid now ' + peso(total) + ' of ' + peso(r.b.rentalTotal) + '.', [{ code: r.b.code, fields: stamp(f, ctx) }]);
  }

  function recordPickup(state, p, ctx) {
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var b = r.b;
    if (b.status !== STATUS.CONFIRMED && b.status !== STATUS.PICKED_UP) return fail('INVALID', 'Only confirmed bookings can be picked up (status: ' + b.status + ').');
    var items = itemsFor(state, b.code);
    var target = str(p.itemId).toUpperCase();
    var picked = items.filter(function (bi) { return target === 'ALL' || bi.itemId === target; });
    if (!picked.length) return fail('INVALID', 'That dress is not part of this booking.');
    var itemUpdates = picked.map(function (bi) {
      return { code: b.code, itemId: bi.itemId, fields: { pickupStatus: ITEM_PICKUP.DONE, conditionNotes: appendNote(bi.conditionNotes, 'Picked up' + (p.condition ? ' — ' + p.condition : ''), ctx.nowMs, ctx.who) } };
    });
    var f = { status: STATUS.PICKED_UP, staffNotes: appendNote(b.staffNotes, 'Pickup: ' + picked.map(function (x) { return x.itemId; }).join(', '), ctx.nowMs, ctx.who) };
    return result('Pickup recorded for ' + picked.map(function (x) { return x.name || x.itemId; }).join(', ') + '.', [{ code: b.code, fields: stamp(f, ctx) }], itemUpdates);
  }

  function recordReturn(state, p, ctx) {
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var b = r.b;
    var items = itemsFor(state, b.code);
    var target = str(p.itemId).toUpperCase();
    var ret = items.filter(function (bi) { return target === 'ALL' || bi.itemId === target; });
    if (!ret.length) return fail('INVALID', 'That dress is not part of this booking.');
    if (ret.some(function (bi) { return bi.pickupStatus !== ITEM_PICKUP.DONE; })) return fail('INVALID', 'Record the pickup before the return.');
    var returnedIds = {};
    items.forEach(function (bi) { if (bi.returnStatus === ITEM_RETURN.DONE) returnedIds[bi.itemId] = true; });
    var itemUpdates = ret.map(function (bi) {
      returnedIds[bi.itemId] = true;
      return { code: b.code, itemId: bi.itemId, fields: { returnStatus: ITEM_RETURN.DONE, conditionNotes: appendNote(bi.conditionNotes, 'Returned' + (p.condition ? ' — ' + p.condition : ''), ctx.nowMs, ctx.who) } };
    });
    var allBack = items.every(function (bi) { return returnedIds[bi.itemId]; });
    var today = manilaToday(ctx.nowMs);
    var late = today > b.returnDate;
    var f = { staffNotes: appendNote(b.staffNotes, 'Return: ' + ret.map(function (x) { return x.itemId; }).join(', ') + (late ? ' (late — returned ' + today + ')' : ''), ctx.nowMs, ctx.who) };
    if (allBack) f.status = STATUS.RETURNED;
    var msg = 'Return recorded.' + (allBack ? ' All dresses are back.' : ' Some dresses are still out.') + (late ? ' Note: returned after ' + formatLongDate(b.returnDate) + '.' : '');
    return result(msg, [{ code: b.code, fields: stamp(f, ctx) }], itemUpdates);
  }

  function recordInspection(state, p, ctx) {
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var target = str(p.itemId).toUpperCase();
    var bi = itemsFor(state, r.b.code).filter(function (x) { return x.itemId === target; })[0];
    if (!bi) return fail('INVALID', 'That dress is not part of this booking.');
    if (!cleanText(p.notes, 500)) return fail('INVALID', 'Describe the inspection result.');
    return result('Inspection notes saved for ' + target + '.', [], [{ code: r.b.code, itemId: target, fields: { conditionNotes: appendNote(bi.conditionNotes, 'Inspection: ' + p.notes, ctx.nowMs, ctx.who) } }]);
  }

  function recordRefund(state, p, ctx) {
    var r = requireBooking(state, p.code); if (r.err) return r.err;
    var b = r.b;
    var ded = toNum(p.deductions, 0) || 0;
    var refund = toNum(p.refund, null);
    var verified = toNum(b.depositVerified, 0) || 0;
    if (!(refund >= 0)) return fail('INVALID', 'Enter the refund amount (0 if none).');
    if (ded < 0) return fail('INVALID', 'Deductions cannot be negative.');
    if (ded + refund > verified) return fail('INVALID', 'Deductions plus refund (' + peso(ded + refund) + ') exceed the verified deposit (' + peso(verified) + ').');
    if (ded > 0 && !cleanText(p.note, 500)) return fail('INVALID', 'Document the reason for any deduction.');
    var f = {
      deductions: ded, refundAmount: refund,
      staffNotes: appendNote(b.staffNotes, 'Deposit settled: refund ' + peso(refund) + (ded ? ', deductions ' + peso(ded) + ' — ' + p.note : ''), ctx.nowMs, ctx.who)
    };
    if (b.status === STATUS.RETURNED) f.status = STATUS.COMPLETED;
    return result('Refund recorded.' + (f.status === STATUS.COMPLETED ? ' Booking completed.' : ''), [{ code: b.code, fields: stamp(f, ctx) }]);
  }

  function addBlock(state, p, ctx) {
    var s = ctx.settings;
    var id = str(p.itemId).toUpperCase();
    if (!ctx.catalog.some(function (it) { return it.id === id; })) return fail('INVALID', 'Unknown item ID ' + id + '.');
    if (!isDate(p.start)) return fail('INVALID', 'Enter a start date.');
    var end = isDate(p.end) ? p.end : p.start;
    if (end < p.start) return fail('INVALID', 'End date is before the start date.');
    var reason = cleanText(p.reason, 120) || 'Blocked';
    var occ = buildOccupancy(state, ctx.nowMs, s);
    var hit = (occ[id] || []).filter(function (r) { return r.kind === 'booking' && r.start <= end && p.start <= r.end; });
    if (hit.length && p.force !== true) {
      return fail('UNAVAILABLE', 'This block overlaps booking(s) ' + unique(hit.map(function (h) { return h.code; })).join(', ') + '. Tick "Block anyway" only if you will rebook or cancel them.', { conflicts: hit });
    }
    return result('Blocked ' + id + ' from ' + p.start + ' to ' + end + ' (' + reason + ').', [], [], [{ itemId: id, start: p.start, end: end, reason: reason, active: true }]);
  }

  function expireHolds(state, ctx) {
    var updates = [];
    (state.bookings || []).forEach(function (b) {
      if (b.status !== STATUS.HOLD) return;
      var exp = parseManilaStamp(b.holdExpiry);
      if (exp !== null && ctx.nowMs >= exp) {
        updates.push({ code: b.code, fields: stamp({ status: STATUS.EXPIRED, staffNotes: appendNote(b.staffNotes, 'Hold expired', ctx.nowMs, 'system') }, ctx) });
      }
    });
    return result(updates.length + ' expired hold(s) marked.', updates);
  }

  /** Staff dashboard lists. */
  function upcoming(state, ctx, horizonDays) {
    var today = manilaToday(ctx.nowMs);
    var until = addDays(today, horizonDays || 7);
    var pickups = [], returns = [], overdue = [], pendingHolds = [];
    (state.bookings || []).forEach(function (b) {
      var items = itemsFor(state, b.code);
      var names = items.map(function (x) { return x.name || x.itemId; }).join(', ');
      var row = { code: b.code, customer: b.customerName, mobile: b.mobile, items: names, pickupDate: b.pickupDate, pickupTime: b.pickupTime, returnDate: b.returnDate, status: b.status, holdExpiry: b.holdExpiry, facebookReview: b.facebookReview };
      if (b.status === STATUS.HOLD && isBlockingBooking(b, ctx.nowMs)) pendingHolds.push(row);
      if (b.status === STATUS.CONFIRMED && b.pickupDate >= today && b.pickupDate <= until) pickups.push(row);
      if (b.status === STATUS.PICKED_UP) {
        var out = items.filter(function (x) { return x.pickupStatus === ITEM_PICKUP.DONE && x.returnStatus !== ITEM_RETURN.DONE; });
        if (!out.length) return;
        var r2 = Object.assign({}, row, { items: out.map(function (x) { return x.name || x.itemId; }).join(', ') });
        if (b.returnDate < today) overdue.push(Object.assign(r2, { daysLate: daysBetween(b.returnDate, today) }));
        else if (b.returnDate <= until) returns.push(r2);
      }
    });
    function by(k) { return function (a, b) { return a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0; }; }
    return { today: today, pickups: pickups.sort(by('pickupDate')), returns: returns.sort(by('returnDate')), overdue: overdue.sort(by('returnDate')), pendingHolds: pendingHolds.sort(by('holdExpiry')) };
  }

  var STAFF_ACTIONS = {
    facebookReview: setFacebookReview,
    recordDeposit: recordDeposit,
    confirm: confirmBooking,
    extendHold: extendHold,
    cancel: cancelBooking,
    approveExtension: approveExtension,
    rentalPayment: recordRentalPayment,
    pickup: recordPickup,
    'return': recordReturn,
    inspection: recordInspection,
    refund: recordRefund,
    block: addBlock
  };

  return {
    STATUS: STATUS, FB_REVIEW: FB_REVIEW, ITEM_PICKUP: ITEM_PICKUP, ITEM_RETURN: ITEM_RETURN, STAFF_ACTIONS: STAFF_ACTIONS,
    parseDate: parseDate, isDate: isDate, addDays: addDays, daysBetween: daysBetween, eachDay: eachDay,
    manilaToday: manilaToday, manilaStamp: manilaStamp, parseManilaStamp: parseManilaStamp,
    formatLongDate: formatLongDate, formatStamp: formatStamp, rentalWindow: rentalWindow,
    cleanText: cleanText, sanitizeForSheet: sanitizeForSheet, normalizePHMobile: normalizePHMobile, peso: peso,
    headerKey: headerKey, toNum: toNum, toBool: toBool, unique: unique,
    normalizeSettings: normalizeSettings, launchBlockers: launchBlockers, bookingsOpen: bookingsOpen, publicSettings: publicSettings,
    normalizeItem: normalizeItem, normalizeCatalog: normalizeCatalog, publicItem: publicItem,
    quote: quote, isBlockingBooking: isBlockingBooking, buildOccupancy: buildOccupancy, findConflicts: findConflicts,
    unavailableDays: unavailableDays, publicAvailability: publicAvailability, canStartOn: canStartOn,
    makeCode: makeCode, validateRequest: validateRequest, createBooking: createBooking, summarize: summarize,
    expireHolds: expireHolds, upcoming: upcoming, findBooking: findBooking, itemsFor: itemsFor
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FloraCore;
