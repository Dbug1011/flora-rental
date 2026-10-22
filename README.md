# Flora Dress Rental — catalog & reservation website

Mobile-friendly catalog and reservation-request site for **Flora Dress Rental, Tagbilaran City, Bohol**.
Hosted on **Vercel**; all data lives in a **private Google Sheet**; a **Google Apps Script** bound to that
Sheet is the only thing that changes availability.

```
Customer phone ──▶ Vercel (Next.js)  ──server-to-server, secret──▶  Apps Script web app ──▶ private Google Sheet
                   public pages + 2 API routes                        LockService script lock       Catalog · Bookings · Booking Items
                                                                      + same rules as staff menu    Blocked Dates · Settings
Staff ──▶ Google Sheet → Flora menu → staff panel ─────────────────────┘
```

* The website never touches the Sheet directly and holds no Google credentials — only the web-app URL and a shared secret.
* Every availability-changing action (website holds, staff manual bookings, confirmations, extensions, cancellations,
  blocks, hourly hold expiry) runs through `withLock_()` in `apps-script/Code.gs`, which takes the **script lock**,
  re-reads the Sheet, checks conflicts with the shared rules, writes, flushes, and only then reports success.
* Booking rules (dates, pricing, conflicts, validation) live in **`shared/booking-core.js`**, used by both the website
  and Apps Script. `apps-script/BookingCore.gs` is a generated copy (`npm run sync:gas`; the build fails if it is stale).

## What's in this folder

| Path | What |
| --- | --- |
| `app/`, `components/`, `lib/` | Next.js 14 site (catalog, dress pages, date selection + cart, request form, confirmation, how to rent, policy) |
| `app/api/availability` | Public: unavailable **dates only** per dress |
| `app/api/reservations` | Creates a temporary hold through the booking service |
| `apps-script/` | Booking service + staff panel to paste into the Sheet's Apps Script project |
| `shared/booking-core.js` | Shared booking rules |
| `sheets-template/Flora_Booking_Sheet_Template.xlsx` | The five tabs with headers, default settings and the draft catalog (optional — the setup script creates the same tabs) |
| `public/dresses/` | Dress images. Current files are **AI-styled previews** — add actual garment photos before launch |
| `tests/` | 27 Node tests of the rules and of `Code.gs` against an in-memory fake Sheet |
| `docs/STAFF_GUIDE.md` | Short guide for staff |
| `docs/OWNER_SETTINGS.md` | Everything the owner must decide before real bookings open |

## 1. Set up the Google Sheet and booking service

1. Create a new Google Sheet (keep it **private** — share only with staff). Optional: File → Import → upload
   `sheets-template/Flora_Booking_Sheet_Template.xlsx` → "Replace spreadsheet".
2. **Extensions → Apps Script**. Create files with these exact names and paste the contents:
   `Code.gs`, `BookingCore.gs`, `Sidebar.html`. Open **Project Settings → Show "appsscript.json"** and replace it
   with `apps-script/appsscript.json`. Save.
3. In the editor, run **`setupFloraSheet`** once and approve the permissions. It creates/repairs the tabs, sets
   Asia/Manila time, text-formats date and mobile columns, adds warning-only protection to booking date/status
   columns, and generates the API secret.
4. Run **`installTriggers`** once (marks expired holds hourly. Expired holds stop blocking dates immediately anyway).
5. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*. Copy the `/exec` URL.
   (Access "Anyone" is required for Vercel to call it; every request without the secret is refused, and the only
   public responses are the published catalog and unavailable dates.)
6. Reload the Sheet → **Flora** menu → **Show API secret for Vercel**. Copy it.
7. Fill in **Settings** (see `docs/OWNER_SETTINGS.md`), publish catalog rows, then **Flora → Check launch settings**.

After editing any Apps Script file later: **Deploy → Manage deployments → Edit → Version: New version** (the URL stays the same).

## 2. Deploy the website to Vercel

1. Push this folder to a private GitHub repo and import it in Vercel (framework: Next.js; defaults are fine).
2. **Preview first**: in Vercel → Settings → Environment Variables, set for *Preview*:
   `BOOKING_SERVICE_MODE=mock`. Every page then shows a "Preview mode" banner and nothing is saved.
3. To test against the real Sheet, set for *Preview*: `BOOKING_SERVICE_MODE=apps_script`, `APPS_SCRIPT_URL`,
   `APPS_SCRIPT_SECRET`, keep `bookings_enabled` = `FALSE` in Settings, and test with staff manual bookings first.
4. For *Production*, set the same three variables. Real website requests start only when Settings
   `bookings_enabled` is `TRUE` **and** every required setting is filled in (the service enforces this).
5. Point Flora's Facebook instant reply at the production URL.

Catalog edits appear on the site within about 60 seconds (cached); availability and requests are always live.

## 3. Run locally

```bash
npm install
cp .env.example .env.local        # BOOKING_SERVICE_MODE=mock for local preview
npm run dev                       # http://localhost:3000
npm test                          # booking rules + Apps Script tests
npm run build                     # also checks BookingCore.gs is in sync
```

Rebuild the xlsx template after changing headers or defaults:
`node scripts/build-template.js > /tmp/t.json && python3 scripts/build-template.py /tmp/t.json`

## Rules implemented

* **Rental length** — 3 **calendar days** including pickup and return (pickup Nov 5 → return Nov 7; 4 days → Nov 8).
  Never 72 hours. Customers can choose up to `max_online_days` (default 4); longer is staff-only.
* **Extension** — ₱100 per extra day, `per_dress` or `per_booking` (`extension_basis`, must be chosen).
* **Deposit** — ₱500 refundable, separate from rental, `per_booking` or `per_dress` (`deposit_basis`, must be chosen).
  Tracked in its own columns (`Deposit required`, `Deposit verified`, `Deductions`, `Refund amount`) and never added
  to `Rental total` / `Rental paid`.
* **Blocking** — unexpired holds, confirmed, picked-up and returned bookings block pickup → return **plus the cleaning
  buffer**; overdue garments keep blocking until returned; active rows in *Blocked Dates* block their dates.
  Expired holds, cancelled and expired bookings do not block.
* **Multi-dress requests** — every dress must be free for the whole period; if one conflicts, nothing is saved.
* **Duplicates** — each form submission carries a request key; a retry returns the original booking.
* **Confirmation** — staff must approve the Facebook account and record the verified deposit; confirmation
  rechecks availability. Holds that already expired need an explicit "I reviewed this late payment" tick.
* **Snapshots** — each booking stores its prices (Booking Items) and a JSON snapshot of the terms, rates and deposit
  basis in force (`Terms snapshot`), so later catalog or settings edits do not change it.
* **Privacy** — public endpoints return only published catalog fields, public settings and unavailable dates.
  The confirmation page shows only what that browser just submitted; there is no lookup by booking code.
* **Hardening** — server-side validation, formula-injection neutralising on every write, honeypot field,
  origin check, per-connection and per-mobile rate limits, request-size limit, prices/status from the browser ignored.
  If availability cannot be checked, customers see a retry message, never a guessed answer.
* **Time zone** — all dates/times are Asia/Manila.

## Acceptance checks

| # | Check | How it is covered |
| --- | --- | --- |
| 1 | Catalog changes appear | Catalog read from Sheet, 60 s cache; test "catalog endpoint returns only published…" |
| 2 | Reserved/blocked dates disabled | Calendar greys them out ("N/A = Unavailable"); tests "reserved dates…", API check |
| 3 | Rental cannot cross an unavailable date | Calendar + server conflict check; test "a rental cannot cross a blocked date" |
| 4 | Two simultaneous requests can't hold the same garment | Script lock + re-read; test "busy lock…"; API check (one 200, one 409) |
| 5 | Expired holds release availability | Test "expired holds release availability" |
| 6 | Manual bookings block the same calendar | Test "manual (walk-in) bookings block the same calendar" |
| 7 | Duplicate submissions | Request key; tests + API check (`replay: true`) |
| 8 | Multi-item bookings & partial returns | Tests "multi-dress request fails entirely…", "partial returns are tracked per garment…" |
| 9 | 3-day / 4-day calculations | Test "3-day and 4-day rentals count calendar days…" |
| 10 | Customer records private | Test "…customer data never public"; no lookup endpoint |
| 11 | Works on mobile & Facebook browser | Checked at 390 px with a Facebook in-app user agent; clipboard fallback for in-app browsers. **Re-test on a real phone in Messenger before launch.** |
| 12 | Failed saves never show success | Success page only after the service returns a saved booking; network errors keep the same request key and say so |

Still to verify on the live setup (needs the real Sheet + Vercel): steps 1–7 of `docs/OWNER_SETTINGS.md` → "Launch test".
