'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FloraCore from '@/shared/booking-core';
import type { PublicItem, PublicSettings } from '@/lib/types';
import Calendar from './Calendar';
import { fetchAvailability, todayManila, type AvailabilityState } from '@/lib/availability';
import Link from 'next/link';
import { addToCart, readCart, removeFromCart, useCartIds } from '@/lib/cart';
import { CheckIcon } from './Icons';

export default function DressBooking({ item, settings, initialPickup }: { item: PublicItem; settings: PublicSettings; initialPickup: string }) {
  const router = useRouter();
  const today = todayManila();
  const min = FloraCore.addDays(today, settings.minLeadDays);
  const max = FloraCore.addDays(today, settings.maxAdvanceDays);
  const days = settings.rentalDays;
  const [show, setShow] = useState(false);
  const [pickup, setPickup] = useState('');
  const [avail, setAvail] = useState<AvailabilityState>({ status: 'idle' });

  useEffect(() => {
    const p = initialPickup || readCart().pickupDate;
    if (p && p >= min && p <= max) setPickup(p);
  }, [initialPickup, min, max]);

  async function load() {
    setAvail({ status: 'loading' });
    setAvail(await fetchAvailability([item.id], today, FloraCore.addDays(max, days + settings.cleaningBufferDays)));
  }
  function checkDates() {
    setShow(true);
    if (avail.status !== 'ok') load();
  }
  useEffect(() => {
    if (initialPickup) checkDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unavailable = avail.status === 'ok' ? new Set(avail.days[item.id] || []) : new Set<string>();
  const pickupOk = pickup && avail.status === 'ok' ? FloraCore.canStartOn(pickup, days, settings.cleaningBufferDays, unavailable) : null;

  const cartIds = useCartIds();
  const inCart = cartIds.includes(item.id);
  const cartFull = !inCart && cartIds.length >= settings.maxItemsPerBooking;
  const others = cartIds.filter((id) => id !== item.id).length;

  function add() {
    return addToCart(item.id, pickup && pickupOk !== false ? pickup : undefined, settings.maxItemsPerBooking);
  }
  function reserve() {
    add();
    router.push('/reserve');
  }

  if (!item.bookable) {
    return <p className="alert info">This dress isn&apos;t open for online reservations yet. Message us on Facebook to ask about it.</p>;
  }

  return (
    <div className="panel" id="dates">
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
        <button type="button" className="btn secondary" onClick={checkDates}>Check dates</button>
        <button
          type="button"
          className="btn secondary add-btn"
          aria-pressed={inCart}
          disabled={cartFull}
          onClick={() => (inCart ? removeFromCart(item.id) : add())}
          aria-label={inCart ? `Remove ${item.name} from your selection` : `Add ${item.name} to your selection`}
        >
          {inCart ? <><CheckIcon /> Added</> : cartFull ? 'Selection full' : '+ Add to selection'}
        </button>
        <button type="button" className="btn" style={{ gridColumn: '1 / -1' }} onClick={reserve} disabled={cartFull}>
          {others > 0 ? `Review & reserve (${others + 1} dresses)` : 'Request reservation'}
        </button>
      </div>
      {inCart && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Added to your selection. Want more than one dress for the same dates? <Link href="/#dresses">Browse more dresses</Link>.
        </p>
      )}
      {show && (
        <div style={{ marginTop: 18 }}>
          <h2>Availability</h2>
          <p className="small muted" style={{ marginBottom: 12 }}>
            Choose a pickup date. A standard rental is {days} calendar days: pickup on day 1, return on day {days}
            {settings.returnDeadlineTime ? ` by ${settings.returnDeadlineTime}` : ''}.
          </p>
          {avail.status === 'loading' && <p className="muted"><span className="spinner" /> Checking dates…</p>}
          {avail.status === 'error' && (
            <div className="alert err" role="alert">
              {avail.message} <button type="button" className="remove" onClick={load}>Retry</button>
            </div>
          )}
          {avail.status === 'ok' && (
            <>
              <Calendar min={min} max={max} days={days} buffer={settings.cleaningBufferDays} unavailable={unavailable} value={pickup} onChange={setPickup} label={`Availability for ${item.name}`} />
              {pickup && pickupOk && (
                <p className="alert ok small" style={{ marginTop: 12 }}>
                  Available: pick up {FloraCore.formatLongDate(pickup)}, return {FloraCore.formatLongDate(FloraCore.addDays(pickup, days - 1))}
                  {settings.returnDeadlineTime ? ` by ${settings.returnDeadlineTime}` : ''}.
                </p>
              )}
              <p className="small muted" style={{ marginTop: 10 }}>Need {settings.maxOnlineDays} days? You can choose that on the next step.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
