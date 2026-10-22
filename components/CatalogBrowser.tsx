'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import FloraCore from '@/shared/booking-core';
import type { PublicItem, PublicSettings } from '@/lib/types';
import Calendar from './Calendar';
import { ArrowRight, CalendarIcon, CheckIcon } from './Icons';
import { fetchAvailability, todayManila, type AvailabilityState } from '@/lib/availability';
import { addToCart, readCart, removeFromCart, useCartIds, writeCart } from '@/lib/cart';

export function coverOf(it: PublicItem): { src: string; ai: boolean } | null {
  if (it.photos[0]) return { src: it.photos[0], ai: false };
  if (it.previews[0]) return { src: it.previews[0], ai: true };
  return null;
}

export function priceLine(it: PublicItem) {
  return it.price && it.price > 0 ? `${FloraCore.peso(it.price)} / ${it.includedDays} days` : 'Price coming soon';
}

type Tab = 'all' | 'size' | 'color';

export default function CatalogBrowser({ items, settings }: { items: PublicItem[]; settings: PublicSettings }) {
  const today = todayManila();
  const min = FloraCore.addDays(today, settings.minLeadDays);
  const max = FloraCore.addDays(today, settings.maxAdvanceDays);
  const days = settings.rentalDays;

  const [pickup, setPickup] = useState('');
  const [open, setOpen] = useState(false);
  const [avail, setAvail] = useState<AvailabilityState>({ status: 'idle' });
  const [checkedFor, setCheckedFor] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [filter, setFilter] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const cartIds = useCartIds();
  const cartFull = cartIds.length >= settings.maxItemsPerBooking;

  useEffect(() => {
    const c = readCart();
    if (c.pickupDate && c.pickupDate >= min && c.pickupDate <= max) setPickup(c.pickupDate);
  }, [min, max]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const returnDate = pickup ? FloraCore.addDays(pickup, days - 1) : '';
  const bookableIds = items.filter((i) => i.bookable).map((i) => i.id);

  async function check() {
    if (!pickup) {
      setOpen(true);
      return;
    }
    const c = readCart();
    writeCart({ ...c, pickupDate: pickup, days: c.days || days });
    setAvail({ status: 'loading' });
    const r = await fetchAvailability(bookableIds, pickup, FloraCore.addDays(returnDate, settings.cleaningBufferDays));
    setAvail(r);
    setCheckedFor(pickup);
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function availabilityOf(id: string): 'yes' | 'no' | null {
    if (avail.status !== 'ok' || checkedFor !== pickup || !pickup) return null;
    const set = new Set(avail.days[id] || []);
    return FloraCore.canStartOn(pickup, days, settings.cleaningBufferDays, set) ? 'yes' : 'no';
  }

  const values = useMemo(() => {
    const key = tab === 'size' ? 'size' : 'color';
    return Array.from(new Set(items.map((i) => (i as any)[key] as string).filter(Boolean))).sort();
  }, [items, tab]);

  const shown = items.filter((i) => {
    if (tab === 'size' && filter) return i.size === filter;
    if (tab === 'color' && filter) return i.color === filter;
    return true;
  });
  const availableCount = shown.filter((i) => availabilityOf(i.id) === 'yes').length;

  return (
    <>
      <section className="wrap" aria-labelledby="when">
        <div className="date-card">
          <div>
            <h2 id="when">When do you need your dress?</h2>
            <p className="muted small">
              {days}-day rentals · Pickup on day 1, return on day {days}.
            </p>
          </div>
          <div className="fields">
            <div className="popover" ref={popRef}>
              <button type="button" className="field-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
                <CalendarIcon />
                {pickup ? <span>Pickup {FloraCore.formatLongDate(pickup).replace(/, \d{4}$/, '')}</span> : <span className="ph">Pickup date</span>}
              </button>
              {open && (
                <div className="popover-panel" role="dialog" aria-label="Choose a pickup date">
                  <Calendar
                    min={min}
                    max={max}
                    days={days}
                    buffer={0}
                    unavailable={new Set()}
                    value={pickup}
                    onChange={(d) => {
                      setPickup(d);
                      setOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
            <div className="field-btn" aria-disabled="true" aria-label="Return date (calculated)">
              <CalendarIcon />
              {returnDate ? <span>Return {FloraCore.formatLongDate(returnDate).replace(/, \d{4}$/, '')}</span> : <span className="ph">Return date</span>}
            </div>
            <button type="button" className="btn" onClick={check} disabled={avail.status === 'loading'}>
              {avail.status === 'loading' ? <span className="spinner" aria-label="Checking" /> : 'Check availability'}
            </button>
          </div>
        </div>
        {avail.status === 'error' && (
          <p className="alert err" role="alert" style={{ marginTop: 12 }}>
            {avail.message}
          </p>
        )}
        {!settings.bookingsOpen && (
          <p className="alert info small" style={{ marginTop: 12 }}>
            Online reservations open soon. You can browse the collection and message us on Facebook in the meantime.
          </p>
        )}
      </section>

      <section className="wrap section" id="dresses" aria-labelledby="find" ref={gridRef}>
        <div className="section-head">
          <h2 id="find">Find your dress</h2>
          <p className="muted">
            {avail.status === 'ok' && checkedFor === pickup && pickup
              ? `${availableCount} of ${shown.length} available`
              : `${shown.length} ${shown.length === 1 ? 'dress' : 'dresses'}`}
          </p>
        </div>
        <div className="tabs" role="tablist" aria-label="Filter dresses">
          {(['all', 'size', 'color'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              className="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setFilter('');
              }}
            >
              {t === 'all' ? 'All dresses' : t === 'size' ? 'Size' : 'Color'}
            </button>
          ))}
        </div>
        {tab !== 'all' && values.length > 0 && (
          <div className="chips" role="group" aria-label={tab === 'size' ? 'Sizes' : 'Colors'}>
            {values.map((v) => (
              <button key={v} className="chip" aria-pressed={filter === v} onClick={() => setFilter(filter === v ? '' : v)}>
                {v}
              </button>
            ))}
          </div>
        )}
        {avail.status === 'ok' && checkedFor === pickup && pickup && (
          <p className="small muted" style={{ marginBottom: 16 }}>
            Showing availability for {FloraCore.formatLongDate(pickup)} – {FloraCore.formatLongDate(returnDate)}.
          </p>
        )}
        {shown.length === 0 ? (
          <div className="state">No dresses match this filter yet.</div>
        ) : (
          <div className="grid">
            {shown.map((it) => {
              const cover = coverOf(it);
              const a = availabilityOf(it.id);
              const href = `/dresses/${encodeURIComponent(it.id)}${pickup ? `?pickup=${pickup}` : ''}`;
              return (
                <article key={it.id} className={'card' + (a === 'no' ? ' dim' : '')}>
                  <Link href={href} className="photo" aria-label={`View ${it.name}`}>
                    {cover ? (
                      <img src={cover.src} alt={`${it.name}${cover.ai ? ' (AI-styled preview)' : ''}`} loading="lazy" />
                    ) : (
                      <span className="state" style={{ border: 0 }}>Photo coming soon</span>
                    )}
                    {cover?.ai && <span className="badge ai">AI-styled preview</span>}
                  </Link>
                  <h3>
                    <Link href={href}>{it.name}</Link>
                  </h3>
                  <p className="price">{priceLine(it)}</p>
                  <p className="meta">{[it.size, it.color].filter(Boolean).join(' · ')}</p>
                  {a === 'yes' && <span className="badge avail" style={{ alignSelf: 'flex-start' }}>Available for your dates</span>}
                  {a === 'no' && <span className="badge unavail" style={{ alignSelf: 'flex-start' }}>Unavailable for your dates</span>}
                  {it.bookable && (() => {
                    const inCart = cartIds.includes(it.id);
                    return (
                      <button
                        type="button"
                        className="btn small secondary add-btn"
                        aria-pressed={inCart}
                        disabled={!inCart && (cartFull || a === 'no')}
                        onClick={() => (inCart ? removeFromCart(it.id) : addToCart(it.id, pickup || undefined, settings.maxItemsPerBooking))}
                        aria-label={inCart ? `Remove ${it.name} from your selection` : `Add ${it.name} to your selection`}
                      >
                        {inCart ? <><CheckIcon /> Added</> : cartFull ? 'Selection full' : '+ Add to selection'}
                      </button>
                    );
                  })()}
                  <Link href={href} className="link-arrow">
                    View dress <ArrowRight />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {cartIds.length > 0 && (
        <>
          <div className="cart-bar-space" aria-hidden="true" />
          <div className="cart-bar" role="region" aria-label="Your selection">
            <div className="wrap cart-bar-in">
              <span>
                <strong>{cartIds.length}</strong> {cartIds.length === 1 ? 'dress' : 'dresses'} selected
              </span>
              <Link href="/reserve" className="btn small">
                Review &amp; reserve <ArrowRight />
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
