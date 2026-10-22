// Server-side client for the booking service. Never import this from a client component:
// it reads the Apps Script URL and secret, which must stay on the server.
import { createHash } from 'crypto';
import { unstable_cache } from 'next/cache';
import { mockHandle } from './mock';
import type { Catalog } from './types';

type Mode = 'apps_script' | 'mock' | 'not_configured';

export function serviceMode(): Mode {
  const m = (process.env.BOOKING_SERVICE_MODE || '').trim().toLowerCase();
  if (m === 'mock') return 'mock';
  if (m === 'apps_script' && process.env.APPS_SCRIPT_URL && (process.env.APPS_SCRIPT_SECRET || '').length >= 24) return 'apps_script';
  return 'not_configured';
}

export const UNAVAILABLE = {
  ok: false as const,
  code: 'SERVICE_UNAVAILABLE',
  message: "We couldn't check availability right now. Nothing was reserved. Please try again in a moment."
};

export async function callService(action: string, payload: unknown, client: { ipHash?: string } = {}): Promise<any> {
  const mode = serviceMode();
  if (mode === 'mock') return mockHandle(action, payload, client);
  if (mode === 'not_configured') {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'Online reservations are not open yet. Please message Flora on Facebook.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(process.env.APPS_SCRIPT_URL as string, {
      method: 'POST',
      // text/plain keeps Apps Script happy; the body is JSON.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: process.env.APPS_SCRIPT_SECRET, action, payload, client }),
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal
    });
    const text = await res.text();
    const data = JSON.parse(text);
    if (!data || typeof data.ok !== 'boolean') return UNAVAILABLE;
    return data;
  } catch {
    return UNAVAILABLE;
  } finally {
    clearTimeout(timer);
  }
}

const EMPTY_SETTINGS = {
  bookingsOpen: false, facebookPageUrl: '', pickupLocation: '', operatingHours: '', pickupTimeSlots: [], returnDeadlineTime: '',
  rentalDays: 3, maxOnlineDays: 4, extensionRate: 100, extensionBasis: '', cleaningBufferDays: 1, holdHours: 24,
  depositAmount: 500, depositBasis: '', minLeadDays: 1, maxAdvanceDays: 180, maxItemsPerBooking: 4, lateFeePerDay: 120,
  rentalTerms: '', privacyNotice: '', cancellationPolicy: ''
} as const;

const cachedCatalog = unstable_cache(
  async () => {
    const r = await callService('catalog', {});
    if (!r.ok) throw new Error(r.code || 'catalog failed'); // do not cache failures
    return r;
  },
  ['flora-catalog'],
  { revalidate: 60 }
);

/** Published catalog + public settings. `error` is set when the Sheet could not be read. */
export async function getCatalog(): Promise<Catalog & { error?: string }> {
  const preview = serviceMode() === 'mock';
  try {
    const r = serviceMode() === 'mock' ? await callService('catalog', {}) : await cachedCatalog();
    return { items: r.items || [], settings: { ...EMPTY_SETTINGS, ...r.settings }, preview };
  } catch (e: any) {
    return {
      items: [],
      settings: { ...EMPTY_SETTINGS, pickupTimeSlots: [] } as any,
      preview,
      error: serviceMode() === 'not_configured' ? 'NOT_CONFIGURED' : 'UNAVAILABLE'
    };
  }
}

export function clientIpHash(headers: Headers): string {
  const ip = (headers.get('x-forwarded-for') || '').split(',')[0].trim() || headers.get('x-real-ip') || 'unknown';
  const salt = process.env.APPS_SCRIPT_SECRET || 'flora-preview';
  return createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0, 32);
}
