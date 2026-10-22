# Owner settings required before launch

Real website bookings stay off until **all** of these are done. The booking service enforces the items marked
**(enforced)**: while any is blank, the site shows "reservations open soon" and accepts no requests.
Check with **Flora menu → Check launch settings**.

## Decisions only the owner can make

| Setting (Settings tab) | Decide | Status |
| --- | --- | --- |
| `deposit_basis` (enforced) | `per_booking` (₱500 once) or `per_dress` (₱500 × dresses) | **Done: per_dress (₱500 × dresses)** |
| `extension_basis` (enforced) | `per_dress` (₱100 × dresses × extra days; what the brief assumes) or `per_booking` | **Done: per_dress** |
| `cancellation_policy` (enforced) | When the deposit is refunded / forfeited if the customer cancels, if Flora cancels, and refund timeline | **Drafted (7+ days full, 3–6 days 50% or move, <3 days forfeited; typhoon signal 2+ free move/refund; refunds in 3 business days) — review** |
| `privacy_notice` (enforced) | Approve the draft below (or your own) | **Draft below** |
| `rental_terms` (enforced) | Review the prefilled terms (from the How-to-rent carousel). Must match the signed rental agreement | **Prefilled — review** |
| `facebook_page_url` (enforced) | Flora's Page link (the "Message us" and "Message Flora on Facebook" buttons) | **Done: https://www.facebook.com/profile.php?id=61595154223240** |
| `pickup_location` (enforced) | What customers see before booking | **Prefilled: 109-A E.K. Inting St., Mansasa, Tagbilaran City** |
| `operating_hours` (enforced) | Days and opening hours | **Confirmed: Monday–Sunday, 7:30 AM–8:30 PM** |
| `pickup_time_slots` (enforced) | One per line | **Not set** |
| `return_deadline_time` (enforced) | Time dresses are due back on the return date | **Confirmed: 8:30 PM (Asia/Manila)** |
| `hold_hours` | How long a website request holds dresses before expiring (default 24) | Default |
| `cleaning_buffer_days` | Days blocked after each return (default 1) | Default |
| `min_lead_days` / `max_advance_days` | Earliest/furthest online pickup (default 1 / 180 days) | Default |
| `max_items_per_booking` | Dresses per online request (default 4) | Default |
| `late_fee_per_day` | ₱120 — shown in the terms; charged manually | Set |
| `bookings_enabled` | Switch to `TRUE` last, after the launch test | `FALSE` |

## Catalog (per dress, Catalog tab)

Each physical garment needs its own row and Item ID. Before ticking **Published**, fill in:

* **Base rental price** — dresses without a price are never bookable. (Set 2026-10-22, per 3-day rental: Poppy ₱799, Camellia ₱599, Hibiscus ₱599, Magnolia ₱499, Peony ₱399, Sweet Pea ₱499, Hydrangea ₱599, Bluebell ₱599, Sampaguita ₱499, Calla ₱599, Dahlia ₱799.)
* **Measurements** — measured bust, waist, hips, length with units. The site never guesses.
* **Photo URLs** — *actual* garment photos (front, back, detail). Put image files in `public/dresses/` (then
  `/dresses/name.jpg`) or use any `https://` image link. Google Drive "share" links don't display as images.
* **Styled preview URLs** — the AI-styled images. The site always labels these "AI-styled preview".
* **Accessories**, **Care notes**, **Size**, **Color**.
* Confirm the dress names (the 8 new names are suggestions; "Kalia" was read as Calla) and SF003 Hibiscus's description.

Owner-confirmed sizes: Poppy M, Camellia S, Hibiscus S, Magnolia L, Peony Free size,
Sweet Pea M, Hydrangea M, Bluebell S, Sampaguita M, Calla M, Dahlia S.

Confirmed workflow (not yet implemented): cancelled requests retain Cancelled status; completed rentals
appear in a separate completed/archive tab only after all dresses are returned, inspected, and the deposit is settled.
Keep authoritative booking rows intact so cleaning buffers, availability and history remain reliable.
Archiving does not remove personal data; the retention period still needs an explicit owner decision.
Open all seven days. Pickup slot choices still need confirmation. Policies remain drafts pending joint review.
The XLSX template was regenerated on 2026-10-23 with the confirmed opening hours and return deadline.

## Accounts and integrations

1. Private Google Sheet + Apps Script set up (README §1), web app deployed, hourly trigger installed.
2. Vercel project with `BOOKING_SERVICE_MODE=apps_script`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_SECRET`.
3. Facebook Page instant reply pointing to the website.
4. Staff added to the Sheet as editors (only them).

## Launch test (on the Vercel preview, before `bookings_enabled = TRUE` in production)

1. Publish one priced test dress; confirm it appears on the site within ~1 minute.
2. Make a staff manual booking for it; confirm those dates (plus cleaning day) are greyed out on the site.
3. Set `bookings_enabled` TRUE temporarily on a test copy; submit a request from a phone **inside Messenger**; check the
   code copies and the Facebook button opens the Page.
4. Submit the same dates from two phones at once: only one may succeed.
5. Set `hold_hours` to 1, wait an hour, confirm the dates free up.
6. Walk the staff flow: approve account → record deposit → confirm → pickup → partial return → refund.
7. Delete the test rows, set the real values, then turn `bookings_enabled` TRUE.

## Draft privacy notice (owner must review)

> **Flora Dress Rental — Privacy Notice**
> We collect your name, mobile number, Facebook profile name and booking details when you request a reservation. We use
> them only to review and manage your rental: verifying your request through Facebook, contacting you about payment,
> pickup and return, and keeping a record of the rental and deposit. We check your government-issued ID in person at
> pickup and do not keep a copy. Your details are stored in a private Google Sheet that only Flora staff can access,
> and are not sold or shared except where required by law. We keep booking records for up to [X] years for accounting
> and dispute purposes, then delete them. To ask what we hold, correct it, or request deletion, message our Facebook Page.
> This notice follows the Philippine Data Privacy Act of 2012 (RA 10173).

Fill in the retention period. Have someone with legal knowledge review it if possible.
