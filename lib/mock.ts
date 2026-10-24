// PREVIEW MODE ONLY (BOOKING_SERVICE_MODE=mock).
// An in-memory stand-in for the Google Apps Script booking service so the site can be
// reviewed on a Vercel preview before the real Sheet is connected. It runs the same shared
// booking rules, but nothing is saved: data resets whenever the server restarts.
// Prices, settings and policies are Flora's real ones (from the owner, 2026-10-22); bookings and dates are samples.
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
  operating_hours: 'Monday–Sunday, 7:30 AM–8:30 PM',
  pickup_time_slots: "8:00 AM\n9:00 AM\n10:00 AM\n11:00 AM\n12:00 PM\n1:00 PM\n2:00 PM\n3:00 PM\n4:00 PM\n5:00 PM\n6:00 PM\n7:00 PM\n8:00 PM",
  return_deadline_time: '8:30 PM',
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
  rental_terms: "STANDARD RENTAL\n• The standard rental covers 3 calendar days, including pickup and return days: Day 1 pick up, Day 2 wear, Day 3 return.\n• Need 4 days? Add ₱100 per dress. Further extensions cost ₱100 per dress per extra day, subject to availability and prior approval.\n• Your exact pickup and return schedule is written in your rental agreement.\n\nRESERVATION AND DEPOSIT\n• A ₱500 refundable reservation/security deposit per dress secures your dress and dates. It is separate from the rental fee.\n• Please message us from an active, real Facebook account. We use it to verify your booking.\n• Your booking is confirmed only after we verify your payment and send confirmation.\n• The deposit is refunded after the dress is returned and inspected, less any documented charges under your rental agreement.\n\nPICKUP\n• Present a valid government-issued photo ID, sign the rental agreement, and settle your rental fee. Your original ID is returned after verification.\n• We check the dress and included accessories with you before release.\n\nCARE\n• Avoid makeup stains, food spills, and spraying perfume directly on the fabric.\n• Keep the dress away from sharp objects and rough surfaces.\n• Do not wash, dry-clean, iron, steam, pin, or alter the dress.\n• Ask for approval before using it in seawater, pools, or wet locations.\n• Report any damage or concerns immediately. Regular cleaning is included.\n\nRETURN AND INSPECTION\n• Return the dress and all included accessories by the agreed date and time. Message us early if you expect a delay; an extension is only confirmed once approved.\n• Late return without an approved extension: ₱120 per day.\n• We inspect the dress against its recorded pickup condition. Normal wear is not treated as damage. Extra cleaning, repairs, missing accessories, or loss may result in documented charges under your signed agreement.",
  privacy_notice: "FLORA DRESS RENTAL — PRIVACY NOTICE\n\nWe collect your name, mobile number, Facebook profile name and booking details when you request a reservation. We use them only to review and manage your rental: verifying your request through Facebook, contacting you about payment, pickup and return, and keeping a record of the rental and deposit.\n\nWe check your government-issued photo ID in person at pickup and do not keep a copy.\n\nYour details are stored in a private Google Sheet that only Flora staff can access. They are not sold or shared except where required by law.\n\nWe keep booking records for 1 year after your rental is completed, for accounting and dispute purposes, then delete them.\n\nTo ask what we hold, correct it, or request deletion, message our Facebook Page.\n\nThis notice follows the Philippine Data Privacy Act of 2012 (RA 10173).",
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
