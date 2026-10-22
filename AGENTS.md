# Flora Dress Rental — project handoff (for Codex)

Owner: Kiki (Karis Ruth Jumawan). Business: Flora Dress Rental, Tagbilaran City, Bohol. In collaboration with Kimona-Boholana.
Status (2026-10-22): site + booking service built and tested in **preview (mock) mode only**. Not yet deployed to Vercel,
not yet connected to a real Google Sheet. Real bookings stay OFF until the owner settings in `docs/OWNER_SETTINGS.md` are done.

## Architecture (do not change without reason)
- Next.js 14 App Router site (`app/`, `components/`, `lib/`) on Vercel. Never touches the Sheet directly.
- Google Apps Script bound to a **private** Google Sheet (`apps-script/Code.gs`, `Sidebar.html`, `appsscript.json`) is the
  ONLY writer of availability. Every availability-changing action runs inside `withLock_()` (LockService script lock →
  re-read → conflict check → write → flush → then success). Website holds, staff panel actions and hourly expiry all use it.
- Booking rules live in `shared/booking-core.js` (plain ES5-ish JS, runs in Node and Apps Script).
  `apps-script/BookingCore.gs` is a GENERATED copy: edit the shared file, then `npm run sync:gas`. `npm run build` fails if stale.
- Vercel → Apps Script: POST JSON `{secret, action, payload, client}` to the web-app URL. Actions: `catalog`, `availability`, `createHold`.
- `BOOKING_SERVICE_MODE`: `mock` (preview banner, in-memory, real prices + sample bookings — `lib/mock.ts`), `apps_script` (real), unset (closed).
- Sheet tabs: Catalog, Bookings, Booking Items, Blocked Dates, Settings (headers defined in `Code.gs`; template in `sheets-template/`).

## Business rules (from the owner's spec)
- Rental = N **calendar days** incl. pickup and return (3 standard: Nov 5 → Nov 7; 4 days → Nov 8). Never 72 hours.
- Extension ₱100/day (`extension_basis` per_dress|per_booking — owner must confirm). Late return ₱120/day (terms only, charged manually).
- Deposit ₱500 refundable, separate from rental, `deposit_basis` per_booking|per_dress (owner must choose). Never counted as rental revenue.
- Blocking: unexpired holds + confirmed/picked up/returned/completed bookings block pickup→return + `cleaning_buffer_days`;
  overdue garments keep blocking; active Blocked Dates rows block. Multi-dress: all-or-nothing.
- Idempotency via `requestKey`. Confirmation requires FB review approved + verified deposit, rechecks availability; expired holds need explicit late-payment tick.
- Prices/terms snapshot stored per booking. Asia/Manila everywhere. No payment gateway, no accounts, no Supabase, no Messenger automation.
- Privacy: public endpoints return only published catalog fields, public settings, unavailable dates. No lookup by booking code.
- Customers never upload ID (checked in person at pickup). Customer form: full name, mobile, Facebook profile name, dresses, dates, pickup time, terms + privacy acceptance.

## Brand
Flora design system (claude.ai artifact F3pkoJ8za7LJfP1vJqhPxZ): fuchsia #C21875, blush #F7D5E5, plum #4B203D, white bg;
Cormorant Garamond headings, DM Sans body (self-hosted via @fontsource). Tagline "Pick your bloom." Never retype the wordmark —
use `public/flora-logo-tight.svg` / `flora-logo.svg`. AI-styled images must always be labelled "AI-styled preview".

## Catalog state
11 dresses, all **unpublished, no measurements** in the real template. Prices (3-day, set 2026-10-22): Poppy ₱799, Camellia ₱599,
Hibiscus ₱599, Magnolia ₱499, Peony ₱399, Sweet Pea ₱499, Hydrangea ₱599, Bluebell ₱599, Sampaguita ₱499, Calla ₱599, Dahlia ₱799.
SF001 Poppy (M, Red), SF002 Camellia (S, Red), SF003 Hibiscus (S, Beige), SF004 Magnolia (L, Ivory), SF005 Peony (Free size, Pink),
SF006 Sweet Pea (M, Pink), SF007 Hydrangea (M, Blue), SF008 Bluebell (S, Blue), SF009 Sampaguita (M, Ivory), SF010 Calla (M, Ivory),
SF011 Dahlia (S, Pink). Names SF004–SF011 were suggested, not yet confirmed by the owner. Images in `public/dresses/*-preview.jpg`
are AI-styled previews; no actual garment photos yet. `public/collection-flatlay.jpg` is a real photo of the garments with size labels.

## Commands
```
npm install
cp .env.example .env.local   # BOOKING_SERVICE_MODE=mock
npm run dev                  # preview at :3000
npm test                     # 27 node:test tests (core rules + Code.gs on a fake Sheet in tests/fake-gas.js)
npm run build                # checks BookingCore.gs sync, then next build
node scripts/build-template.js > /tmp/t.json && python3 scripts/build-template.py /tmp/t.json   # rebuild xlsx template
```

## Verified so far
Phone-size walkthrough (390px, Facebook in-app UA): browse → check dates → dress page → add 2 dresses → submit → code copy. API checks:
simultaneous same-dress requests (one 200, one 409), reserved dates + cleaning day unavailable, crossing refused, duplicate key replays,
multi-dress conflict saves nothing, 4-day = +₱100, tampered price/status ignored, foreign Origin 403, unreachable service → 503
"Nothing was reserved" (never a success page).

## Next steps / open items
1. DONE 2026-10-22: deposit_basis = per_dress, extension_basis = per_dress, cancellation policy drafted (in Code.gs defaults), pickup address
   109-A E.K. Inting St., Mansasa, Tagbilaran City. Page: "Flora Dress Rental Bohol", +63 966 867 2155, florarentalbohol@gmail.com.
   Also done: FB Page URL https://www.facebook.com/profile.php?id=61595154223240, per-dress prices (above).
   Sizes confirmed by owner 2026-10-22 for Poppy (M — was S), Camellia, Hibiscus (S), Magnolia, Peony; rest of list was cut off.
   STILL NEEDED: sizes for Sweet Pea onward (confirm), hours, time slots, return deadline time,
   privacy notice retention period, measurements, actual photo URLs (owner says photos + sizes are on the FB Page).
2. Set up Sheet + Apps Script + web-app deployment (README §1); deploy to Vercel preview with mock, then apps_script (README §2).
3. Run the launch test in `docs/OWNER_SETTINGS.md` on a real phone inside Messenger before `bookings_enabled = TRUE`.
4. Not built (out of scope by spec): payment gateway, customer accounts, Messenger bot/reminders, admin dashboard.
5. Known trade-offs: protected booking columns are warning-only (full protection would block staff menu scripts running as staff);
   calendar cells show "N/A" with legend "N/A = Unavailable" (word too long for phone cells); `Color` column added to Catalog beyond the spec.
6. ESLint not configured (`next lint` would prompt); add `eslint-config-next` if wanted.
