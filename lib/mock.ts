// PREVIEW MODE ONLY (BOOKING_SERVICE_MODE=mock).
// An in-memory stand-in for the Google Apps Script booking service so the site can be
// reviewed on a Vercel preview before the real Sheet is connected. It runs the same shared
// booking rules, but nothing is saved: data resets whenever the server restarts.
// Prices are Flora's real 3-day prices (from the owner, 2026-10-22); bookings and dates are samples.
import FloraCore from '@/shared/booking-core';

const PRICES: Record<string, number> = {
  SF001: 799, SF002: 599, SF003: 599, SF004: 499, SF005: 399, SF006: 499,
  SF007: 599, SF008: 599, SF009: 499, SF010: 599, SF011: 799
};

const catalogRows = [
  ['SF001', 'Poppy', 'Short red mini dress with a sequinned sweetheart corset bodice, thin straps and a sculpted petal-ruffle skirt.', 'Medium', 'Red', 'poppy'],
  ['SF002', 'Camellia', 'Red lace midi dress with thin lace straps, a boned square-neck bodice and a flowing A-line skirt over a nude lining.', 'Small', 'Red', 'camellia'],
  ['SF003', 'Hibiscus', 'Beige lace midi dress with thin straps, a boned straight neckline and a soft A-line skirt.', 'Small', 'Beige', 'hibiscus'],
  ['SF004', 'Magnolia', 'Ivory textured halter mini dress with a structured flared skirt, a side bow and a tulle underlayer.', 'Large', 'Ivory', 'magnolia'],
  ['SF005', 'Peony', 'Blush pink chiffon mini dress with a ruched sweetheart bodice, tiered ruffle skirt and tie-on draped sleeves.', 'Free size', 'Pink', 'peony'],
  ['SF006', 'Sweet Pea', 'Pink mini dress covered in embroidered and sequinned flowers in pink and lilac, with a sweetheart neckline and wide straps.', 'Medium', 'Pink', 'sweet-pea'],
  ['SF007', 'Hydrangea', 'Dusty blue-grey strapless corset mini dress with 3D flower appliqués, beading and a gathered bubble skirt.', 'Medium', 'Blue', 'hydrangea'],
  ['SF008', 'Bluebell', 'Powder blue floral lace midi dress with thin straps, a boned bodice and a full A-line skirt.', 'Small', 'Blue', 'bluebell'],
  ['SF009', 'Sampaguita', 'Ivory lace mini dress with a fold-over off-shoulder neckline, a small bow and a tulle hem.', 'Medium', 'Ivory', 'sampaguita'],
  ['SF010', 'Calla', 'Long strapless ivory lace gown with visible corset boning, a V-shaped waist and a full skirt.', 'Medium', 'Ivory', 'calla'],
  ['SF011', 'Dahlia', 'Pink strapless mini dress made of layered petal panels edged in sequins, with a jewelled centre.', 'Small', 'Pink', 'dahlia']
].map(([id, name, description, size, color, slug]) => ({
  item_id: id,
  dress_name: name,
  description,
  size,
  color,
  measurements: '',
  photo_urls: '',
  styled_preview_urls: `/dresses/${slug}-preview.jpg`,
  base_rental_price: PRICES[id],
  included_days: 3,
  extension_rate: '',
  accessories: '',
  care_notes: 'Avoid makeup, food and perfume on the fabric. Do not wash, iron, steam, pin or alter. Regular cleaning is included.',
  published: true
}));

const settingsRaw = {
  bookings_enabled: true,
  facebook_page_url: 'https://www.facebook.com/profile.php?id=61595154223240',
  pickup_location: '109-A E.K. Inting St., Mansasa, Tagbilaran City, Bohol 6300\nFittings and pickup by appointment.',
  operating_hours: 'Monday–Friday, 7:30 AM–8:30 PM',
  pickup_time_slots: '10:00 AM\n12:00 PM\n2:00 PM\n4:00 PM',
  return_deadline_time: '6:00 PM',
  rental_days: 3,
  max_online_days: 4,
  extension_rate: 100,
  extension_basis: 'per_dress',
  cleaning_buffer_days: 1,
  hold_hours: 24,
  deposit_amount: 500,
  deposit_basis: 'per_dress',
  min_lead_days: 1,
  max_advance_days: 180,
  max_items_per_booking: 4,
  late_fee_per_day: 120,
  rental_terms: 'PREVIEW — the owner-approved rental terms from the Settings tab appear here.\n\n• The standard rental covers 3 calendar days, including pickup and return days.\n• Need 4 days? Add ₱100 per dress.\n• A ₱500 refundable security deposit per dress secures your booking. It is separate from the rental fee.\n• Late return without an approved extension: ₱120 per day.',
  privacy_notice: 'PREVIEW — the owner-approved privacy notice from the Settings tab appears here.',
  cancellation_policy: "CANCELLATION AND REFUND POLICY\n\nBefore your booking is confirmed\n• Sending a reservation request is free. If you change your mind before paying the deposit, just let us know or let the hold expire. Nothing is charged.\n\nIf you cancel after your booking is confirmed\nThe ₱500 refundable security deposit (per dress) is handled as follows, counted from your pickup date:\n• 7 or more days before pickup: full deposit refunded.\n• 3 to 6 days before pickup: 50% of the deposit refunded, or move the full deposit to a new date within 60 days (once, subject to availability).\n• Less than 3 days before pickup, or no-show on pickup day: deposit forfeited.\n• The rental fee is paid at pickup, so there is nothing else to refund before pickup.\n\nChanging your dates\n• You can move your booking once, free of charge, if you ask at least 3 days before pickup and the dress is available on the new dates.\n• Any price difference for extra days is settled at pickup.\n\nIf Flora cancels\n• If we cannot provide your dress (for example, it is damaged or unavailable), you can choose another available dress for the same dates or a full refund of everything you have paid.\n\nWeather and emergencies\n• If PAGASA raises a Tropical Cyclone Wind Signal No. 2 or higher over Bohol, or the local government suspends activities on your pickup or event date, you may move your booking for free or get a full deposit refund.\n\nAfter your rental\n• Returning the dress early does not reduce the rental fee.\n• Your deposit is refunded after the dress and accessories are returned and inspected, less any documented charges under your signed rental agreement (for example: late return at ₱120 per day, extra cleaning, repairs, or missing items).\n• We explain every deduction with photos before releasing the balance.\n\nHow refunds are paid\n• Refunds are sent within 3 business days after return and inspection (or after a cancellation is approved), to the same account or method you paid from.\n• To cancel or change a booking, message Flora Dress Rental Bohol on Facebook with your booking code."
};

type MockState = { bookings: any[]; bookingItems: any[]; blocks: any[]; ipHits: Record<string, number[]> };

function seedState(): MockState {
  const today = FloraCore.manilaToday(Date.now());
  const d = (n: number) => FloraCore.addDays(today, n);
  return {
    // Sample reservations so the preview shows greyed-out dates.
    bookings: [
      { code: 'FL-DEMO01', status: 'Confirmed', pickupDate: d(5), returnDate: d(7), holdExpiry: '' },
      { code: 'FL-DEMO02', status: 'Confirmed', pickupDate: d(9), returnDate: d(11), holdExpiry: '' }
    ],
    bookingItems: [
      { code: 'FL-DEMO01', itemId: 'SF001', pickupStatus: 'Not picked up', returnStatus: 'Not returned' },
      { code: 'FL-DEMO01', itemId: 'SF002', pickupStatus: 'Not picked up', returnStatus: 'Not returned' },
      { code: 'FL-DEMO02', itemId: 'SF006', pickupStatus: 'Not picked up', returnStatus: 'Not returned' }
    ],
    blocks: [{ itemId: 'SF004', start: d(3), end: d(4), reason: 'Cleaning (sample)', active: true }],
    ipHits: {}
  };
}

const g = globalThis as unknown as { __floraMock?: MockState };
function state(): MockState {
  if (!g.__floraMock) g.__floraMock = seedState();
  return g.__floraMock;
}

function settings() {
  return FloraCore.normalizeSettings(settingsRaw);
}
function catalog() {
  return FloraCore.normalizeCatalog(catalogRows, settings(), {});
}

export function mockHandle(action: string, payload: any, client: { ipHash?: string }): any {
  const s = settings();
  const st = state();
  if (action === 'catalog') {
    return { ok: true, items: catalog().map(FloraCore.publicItem), settings: FloraCore.publicSettings(s) };
  }
  if (action === 'availability') {
    const ids = (payload.itemIds || []).slice(0, 20);
    return { ok: true, days: FloraCore.publicAvailability(st, ids, payload.from, payload.to, Date.now(), s) };
  }
  if (action === 'createHold') {
    const key = client.ipHash || 'none';
    const now = Date.now();
    const hits = (st.ipHits[key] || []).filter((t) => now - t < 600000);
    hits.push(now);
    st.ipHits[key] = hits;
    if (hits.length > 8) return { ok: false, code: 'RATE_LIMITED', message: 'Too many requests. Please wait a few minutes.' };
    const r = FloraCore.createBooking(st, payload, {
      nowMs: now,
      settings: s,
      catalog: catalog(),
      randomInt: (n: number) => Math.floor(Math.random() * n),
      source: 'Website',
      who: 'website'
    });
    if (!r.ok) return r;
    st.bookings.push(...r.writes.bookings);
    st.bookingItems.push(...r.writes.bookingItems);
    return { ok: true, replay: !!r.replay, summary: r.summary };
  }
  return { ok: false, code: 'BAD_REQUEST', message: 'Unknown action.' };
}
