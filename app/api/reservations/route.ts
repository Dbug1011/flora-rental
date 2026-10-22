import { NextRequest, NextResponse } from 'next/server';
import { callService, clientIpHash, serviceMode } from '@/lib/service';

export const dynamic = 'force-dynamic';

// Best-effort per-instance throttle. The booking service also rate-limits per connection
// and per mobile number, which is what actually holds across Vercel instances.
const hits = new Map<string, number[]>();
function throttled(key: string) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 10;
}

const STATUS: Record<string, number> = {
  INVALID: 422, UNAVAILABLE: 409, RATE_LIMITED: 429, BAD_REQUEST: 400,
  BOOKINGS_CLOSED: 503, NOT_CONFIGURED: 503, BUSY: 503, SERVICE_UNAVAILABLE: 503, ERROR: 503, UNAUTHORIZED: 503
};

function reply(body: any, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function POST(req: NextRequest) {
  // Only accept submissions from this site's own pages.
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return reply({ ok: false, code: 'BAD_REQUEST', message: 'Invalid request.' }, 403);
  if (Number(req.headers.get('content-length') || 0) > 10000) return reply({ ok: false, code: 'BAD_REQUEST', message: 'Request too large.' }, 413);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, code: 'BAD_REQUEST', message: 'Invalid request.' }, 400);
  }
  if (!body || typeof body !== 'object') return reply({ ok: false, code: 'BAD_REQUEST', message: 'Invalid request.' }, 400);
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return reply({ ok: false, code: 'BAD_REQUEST', message: 'Your request could not be sent. Please message us on Facebook.' }, 400); // honeypot
  }

  const ipHash = clientIpHash(req.headers);
  if (throttled(ipHash)) return reply({ ok: false, code: 'RATE_LIMITED', message: 'Too many requests. Please wait a few minutes and try again.' }, 429);

  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  // Only these fields are forwarded. Prices, totals and statuses are always computed by the booking service.
  const payload = {
    customerName: str(body.customerName, 120),
    mobile: str(body.mobile, 30),
    facebookName: str(body.facebookName, 120),
    itemIds: Array.isArray(body.itemIds) ? body.itemIds.slice(0, 10).map((x: unknown) => str(x, 20)) : [],
    days: Number.isInteger(body.days) ? body.days : Number.parseInt(String(body.days), 10),
    pickupDate: str(body.pickupDate, 10),
    pickupTime: str(body.pickupTime, 40),
    acceptTerms: body.acceptTerms === true,
    acceptPrivacy: body.acceptPrivacy === true,
    requestKey: str(body.requestKey, 64)
  };

  const r = await callService('createHold', payload, { ipHash });
  if (r.ok && r.summary && r.summary.code) {
    return reply({ ok: true, replay: !!r.replay, summary: r.summary, preview: serviceMode() === 'mock' });
  }
  const code = r.code || 'SERVICE_UNAVAILABLE';
  return reply({ ok: false, code, message: r.message || 'Your request was not saved. Please try again.', errors: r.errors, itemIds: r.itemIds }, STATUS[code] || 503);
}
