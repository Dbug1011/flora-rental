'use client';
import FloraCore from '@/shared/booking-core';

export type AvailabilityState =
  | { status: 'idle' | 'loading' }
  | { status: 'ok'; days: Record<string, string[]> }
  | { status: 'error'; message: string };

export function todayManila() {
  return FloraCore.manilaToday(Date.now()) as string;
}

/** Unavailable dates per dress, straight from the booking service (dates only, no booking details). */
export async function fetchAvailability(itemIds: string[], from: string, to: string): Promise<AvailabilityState> {
  if (!itemIds.length) return { status: 'ok', days: {} };
  try {
    const qs = new URLSearchParams({ ids: itemIds.join(','), from, to });
    const res = await fetch('/api/availability?' + qs.toString(), { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) return { status: 'error', message: data.message || "We couldn't check availability. Please try again." };
    return { status: 'ok', days: data.days || {} };
  } catch {
    return { status: 'error', message: "We couldn't check availability. Check your connection and try again." };
  }
}

/** Union of unavailable days across the selected dresses: a date is out if ANY dress is out. */
export function unionUnavailable(days: Record<string, string[]>, ids: string[]): Set<string> {
  const set = new Set<string>();
  ids.forEach((id) => (days[id] || []).forEach((d) => set.add(d)));
  return set;
}
