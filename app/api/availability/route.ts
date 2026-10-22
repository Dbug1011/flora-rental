import { NextRequest, NextResponse } from 'next/server';
import { callService, clientIpHash } from '@/lib/service';

export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Public availability: unavailable dates per dress. Never returns booking or customer details. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get('ids') || '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9-]{2,20}$/.test(x));
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  if (!ids.length || ids.length > 20 || !DATE.test(from) || !DATE.test(to) || to < from) {
    return NextResponse.json({ ok: false, code: 'BAD_REQUEST', message: 'Invalid availability request.' }, { status: 400 });
  }
  const r = await callService('availability', { itemIds: ids, from, to }, { ipHash: clientIpHash(req.headers) });
  const res = NextResponse.json(r.ok ? { ok: true, days: r.days } : { ok: false, code: r.code, message: r.message }, { status: r.ok ? 200 : 503 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
