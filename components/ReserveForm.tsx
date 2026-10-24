'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FloraCore from '@/shared/booking-core';
import type { PublicItem, PublicSettings } from '@/lib/types';
import Calendar from './Calendar';
import PolicySheet from './PolicySheet';
import { coverOf } from './CatalogBrowser';
import { fetchAvailability, todayManila, unionUnavailable, type AvailabilityState } from '@/lib/availability';
import { readCart, writeCart } from '@/lib/cart';

function newKey() {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {}
  return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

type Errors = Record<string, string>;

export default function ReserveForm({ items, settings }: { items: PublicItem[]; settings: PublicSettings }) {
  const router = useRouter();
  const bookable = useMemo(() => items.filter((i) => i.bookable), [items]);
  const byId = useMemo(() => Object.fromEntries(bookable.map((i) => [i.id, i])), [bookable]);
  const today = todayManila();
  const min = FloraCore.addDays(today, settings.minLeadDays);
  const max = FloraCore.addDays(today, settings.maxAdvanceDays);
  const dayOptions = Array.from({ length: settings.maxOnlineDays - settings.rentalDays + 1 }, (_, i) => settings.rentalDays + i);

  const [loaded, setLoaded] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [days, setDays] = useState(settings.rentalDays);
  const [pickup, setPickup] = useState('');
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ customerName: '', mobile: '', facebookName: '', website: '' });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [avail, setAvail] = useState<AvailabilityState>({ status: 'idle' });
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ kind: 'err' | 'warn'; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [policy, setPolicy] = useState<'' | 'terms' | 'cancellation' | 'privacy'>('');
  const closePolicy = useCallback(() => setPolicy(''), []);
  const keyRef = useRef<string>('');
  const topRef = useRef<HTMLDivElement>(null);

  // Load the selection saved in this browser.
  useEffect(() => {
    const c = readCart();
    setIds(c.itemIds.filter((id) => byId[id]).slice(0, settings.maxItemsPerBooking));
    if (c.days >= settings.rentalDays && c.days <= settings.maxOnlineDays) setDays(c.days);
    if (c.pickupDate && c.pickupDate >= min && c.pickupDate <= max) setPickup(c.pickupDate);
    keyRef.current = newKey();
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loaded) writeCart({ itemIds: ids, pickupDate: pickup, days });
  }, [ids, pickup, days, loaded]);

  // Fetch the selected dresses plus the others (up to the API's 20-id limit), so the picker below can
  // show which other dresses are free on the chosen dates. Sorted so adding a dress doesn't refetch.
  const fetchKey = useMemo(() => {
    const rest = bookable.map((i) => i.id).filter((id) => !ids.includes(id));
    return [...ids, ...rest].slice(0, 20).sort().join(',');
  }, [bookable, ids]);

  const loadAvailability = useCallback(async () => {
    if (!fetchKey) return setAvail({ status: 'ok', days: {} });
    setAvail({ status: 'loading' });
    setAvail(await fetchAvailability(fetchKey.split(','), today, FloraCore.addDays(max, settings.maxOnlineDays + settings.cleaningBufferDays)));
  }, [fetchKey, today, max, settings.maxOnlineDays, settings.cleaningBufferDays]);

  useEffect(() => {
    if (loaded) loadAvailability();
  }, [loaded, loadAvailability]);

  const unavailable = avail.status === 'ok' ? unionUnavailable(avail.days, ids) : new Set<string>();
  const datesOk = !!pickup && avail.status === 'ok' && FloraCore.canStartOn(pickup, days, settings.cleaningBufferDays, unavailable);
  const returnDate = pickup ? FloraCore.addDays(pickup, days - 1) : '';
  const selected = ids.map((id) => byId[id]).filter(Boolean);
  const q = selected.length ? FloraCore.quote(selected, days, settings) : null;
  const others = bookable.filter((i) => !ids.includes(i.id));

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
    setBanner(null);
  }
  function remove(id: string) {
    setIds(ids.filter((x) => x !== id));
  }
  function add(id: string) {
    if (id && !ids.includes(id) && ids.length < settings.maxItemsPerBooking) setIds([...ids, id]);
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!ids.length) e.itemIds = 'Select at least one dress.';
    if (!pickup) e.pickupDate = 'Choose a pickup date.';
    else if (avail.status === 'ok' && !datesOk) e.pickupDate = 'Those dates are not available for every selected dress. Choose another pickup date.';
    if (settings.pickupTimeSlots.length && !time) e.pickupTime = 'Choose a pickup time.';
    if (form.customerName.trim().length < 2) e.customerName = 'Please enter your full name.';
    if (!FloraCore.normalizePHMobile(form.mobile)) e.mobile = 'Enter a valid Philippine mobile number, e.g. 0917 123 4567.';
    if (form.facebookName.trim().length < 2) e.facebookName = 'Enter the Facebook profile name you will message us from.';
    if (!acceptTerms) e.acceptTerms = 'Please accept the rental terms.';
    if (!acceptPrivacy) e.acceptPrivacy = 'Please acknowledge the privacy notice.';
    return Object.fromEntries(Object.entries(e).filter(([, v]) => v));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (sending) return;
    setBanner(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setBanner({ kind: 'err', text: 'Please check the highlighted fields.' });
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (avail.status !== 'ok') {
      setBanner({ kind: 'err', text: "We couldn't confirm availability yet. Please wait a moment or tap Retry." });
      return;
    }
    setSending(true);
    let data: any = null;
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          itemIds: ids,
          days,
          pickupDate: pickup,
          pickupTime: time,
          acceptTerms,
          acceptPrivacy,
          requestKey: keyRef.current
        })
      });
      data = await res.json().catch(() => null);
    } catch {
      data = null;
    }
    setSending(false);

    if (data && data.ok && data.summary && data.summary.code) {
      try {
        window.sessionStorage.setItem('flora-last-request', JSON.stringify({ summary: data.summary, preview: !!data.preview }));
      } catch {}
      writeCart({ itemIds: [], pickupDate: '', days: settings.rentalDays });
      keyRef.current = newKey();
      router.push('/reserve/submitted' + (data.summary.code ? `#${encodeURIComponent(data.summary.code)}` : ''));
      return;
    }

    // Not saved (or we cannot tell). Never show success here.
    if (!data) {
      // Keep the same request key: if the first attempt did reach the Sheet, a retry returns that booking instead of a duplicate.
      setBanner({ kind: 'err', text: "We couldn't reach the booking service, so we can't confirm your request was saved. Check your connection and tap Send again — you won't get a duplicate booking." });
      return;
    }
    const definitive = ['INVALID', 'UNAVAILABLE', 'BOOKINGS_CLOSED', 'RATE_LIMITED', 'BAD_REQUEST', 'NOT_CONFIGURED'].includes(data.code);
    if (definitive) keyRef.current = newKey();
    if (data.code === 'INVALID' && data.errors) setErrors(data.errors);
    if (data.code === 'UNAVAILABLE') loadAvailability();
    setBanner({ kind: 'err', text: data.message || 'Your request was not saved. Please try again.' });
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  if (!loaded) return <div className="state"><span className="spinner" /> Loading your selection…</div>;

  const closed = !settings.bookingsOpen;
  const err = (k: string) => (errors[k] ? <p className="error" id={k + '-err'}>{errors[k]}</p> : null);

  return (
    <form className="reserve" onSubmit={submit} noValidate>
      <div ref={topRef} style={{ display: 'grid', gap: 28 }}>
        {closed && (
          <p className="alert warn">Online reservations are not open yet. You can still plan your dates here and message us on Facebook.</p>
        )}
        {banner && (
          <p className={'alert ' + banner.kind} role="alert">
            {banner.text}
          </p>
        )}

        {/* 1. Dresses */}
        <section aria-labelledby="s1">
          <div className="step-title"><span className="num">1</span><h2 id="s1">Your dresses</h2></div>
          {selected.length === 0 ? (
            <div className="state">
              No dresses selected yet. <Link href="/#dresses">Browse the collection</Link> or pick one below.
            </div>
          ) : (
            <div className="picked">
              {selected.map((it) => {
                const c = coverOf(it);
                const conflict = avail.status === 'ok' && pickup && !FloraCore.canStartOn(pickup, days, settings.cleaningBufferDays, new Set(avail.days[it.id] || []));
                return (
                  <div key={it.id} className="picked-item">
                    <div className="ph">{c && <img src={c.src} alt="" />}</div>
                    <div>
                      <strong>{it.name}</strong>
                      <div className="small muted">
                        {[it.size, `${FloraCore.peso(it.price)} / ${it.includedDays} days`].filter(Boolean).join(' · ')}
                      </div>
                      {conflict && <div className="small" style={{ color: 'var(--err)' }}>Unavailable for the chosen dates</div>}
                    </div>
                    <button type="button" className="remove" onClick={() => remove(it.id)} aria-label={`Remove ${it.name}`}>Remove</button>
                  </div>
                );
              })}
            </div>
          )}
          {others.length > 0 && ids.length < settings.maxItemsPerBooking && (
            <div style={{ marginTop: 16 }}>
              <p className="small" style={{ fontWeight: 600 }} id="addlbl">
                {ids.length ? 'Add another dress for the same dates' : 'Choose a dress'}
              </p>
              {others.length > 2 && <p className="tiny muted">Swipe to see more →</p>}
              <div className="add-strip" role="list" aria-labelledby="addlbl" style={{ marginTop: 8 }}>
                {others.map((o) => {
                  const c = coverOf(o);
                  const busy = !!pickup && avail.status === 'ok' && !FloraCore.canStartOn(pickup, days, settings.cleaningBufferDays, new Set(avail.days[o.id] || []));
                  return (
                    <div key={o.id} role="listitem" className={'add-card' + (busy ? ' dim' : '')}>
                      <div className="ph">
                        {c ? <img src={c.src} alt={o.name} loading="lazy" /> : <span className="tiny muted">Photo coming soon</span>}
                      </div>
                      <strong>{o.name}</strong>
                      <span className="tiny muted">{[o.size, FloraCore.peso(o.price)].filter(Boolean).join(' · ')}</span>
                      {busy && <span className="tiny" style={{ color: 'var(--err)' }}>Not free on your dates</span>}
                      <button type="button" className="btn small secondary" onClick={() => add(o.id)} aria-label={`Add ${o.name}`}>
                        + Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {err('itemIds')}
        </section>

        {/* 2. Dates */}
        <section aria-labelledby="s2">
          <div className="step-title"><span className="num">2</span><h2 id="s2">Dates</h2></div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <span className="small" id="len">Rental length</span>
            <div className="seg" role="group" aria-labelledby="len">
              {dayOptions.map((d) => (
                <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
                  {d} days{d > settings.rentalDays ? ` (+${FloraCore.peso((d - settings.rentalDays) * settings.extensionRate)}${settings.extensionBasis === 'per_booking' ? '' : '/dress'})` : ''}
                </button>
              ))}
            </div>
          </div>
          <p className="small muted" style={{ marginBottom: 12 }}>
            Rentals count calendar days, including pickup and return days. Example: pick up Nov 5 → return Nov {4 + days}.
          </p>
          {!ids.length ? (
            <div className="state">Select a dress to see available dates.</div>
          ) : avail.status === 'loading' || avail.status === 'idle' ? (
            <div className="state"><span className="spinner" /> Checking availability…</div>
          ) : avail.status === 'error' ? (
            <div className="alert err" role="alert">
              {avail.message} <button type="button" className="remove" onClick={loadAvailability}>Retry</button>
            </div>
          ) : (
            <Calendar
              min={min}
              max={max}
              days={days}
              buffer={settings.cleaningBufferDays}
              unavailable={unavailable}
              value={pickup}
              onChange={(d) => {
                setPickup(d);
                setErrors((e) => ({ ...e, pickupDate: '' }));
              }}
              label="Choose a pickup date"
            />
          )}
          {ids.length > 1 && <p className="small muted" style={{ marginTop: 8 }}>Dates shown are free for every selected dress.</p>}
          {err('pickupDate')}
          {err('days')}

          {settings.pickupTimeSlots.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p className="small" style={{ fontWeight: 600, marginBottom: 8 }} id="slotlbl">Preferred pickup time</p>
              <div className="slots" role="group" aria-labelledby="slotlbl">
                {settings.pickupTimeSlots.map((s) => (
                  <button key={s} type="button" className="slot" aria-pressed={time === s} onClick={() => { setTime(s); setErrors((e) => ({ ...e, pickupTime: '' })); }}>
                    {s}
                  </button>
                ))}
              </div>
              {err('pickupTime')}
            </div>
          )}
        </section>

        {/* 3. Details */}
        <section aria-labelledby="s3">
          <div className="step-title"><span className="num">3</span><h2 id="s3">Your details</h2></div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="customerName">Full name</label>
              <input id="customerName" autoComplete="name" value={form.customerName} onChange={(e) => set('customerName', e.target.value)} aria-invalid={!!errors.customerName} aria-describedby={errors.customerName ? 'customerName-err' : undefined} maxLength={80} />
              {err('customerName')}
            </div>
            <div className="field">
              <label htmlFor="mobile">Mobile number</label>
              <input id="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} aria-invalid={!!errors.mobile} aria-describedby={errors.mobile ? 'mobile-err' : undefined} maxLength={20} />
              {err('mobile')}
            </div>
            <div className="field">
              <label htmlFor="facebookName">Facebook profile name</label>
              <input id="facebookName" value={form.facebookName} onChange={(e) => set('facebookName', e.target.value)} aria-invalid={!!errors.facebookName} aria-describedby="fb-hint" maxLength={80} />
              <p className="hint" id="fb-hint">Use the active, real account you will message Flora from. We review it before sending payment instructions.</p>
              {err('facebookName')}
            </div>
            <div className="hp" aria-hidden="true">
              <label htmlFor="website">Leave this empty</label>
              <input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} />
            </div>
            <p className="alert info small">
              No ID upload needed. We check your original government-issued photo ID at pickup and return it after verification.
            </p>
            <label className="check">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => { setAcceptTerms(e.target.checked); setErrors((x) => ({ ...x, acceptTerms: '' })); }} aria-invalid={!!errors.acceptTerms} />
              <span>
                I have read and accept the <button type="button" className="inline-link" onClick={(e) => { e.preventDefault(); setPolicy('terms'); }}>rental terms</button> and the{' '}
                <button type="button" className="inline-link" onClick={(e) => { e.preventDefault(); setPolicy('cancellation'); }}>cancellation &amp; refund policy</button>.
              </span>
            </label>
            {err('acceptTerms')}
            <label className="check">
              <input type="checkbox" checked={acceptPrivacy} onChange={(e) => { setAcceptPrivacy(e.target.checked); setErrors((x) => ({ ...x, acceptPrivacy: '' })); }} aria-invalid={!!errors.acceptPrivacy} />
              <span>
                I acknowledge the <button type="button" className="inline-link" onClick={(e) => { e.preventDefault(); setPolicy('privacy'); }}>privacy notice</button>.
              </span>
            </label>
            {err('acceptPrivacy')}
          </div>
        </section>
      </div>

      {/* Summary */}
      <aside className="summary-col">
        <div className="panel">
          <h2>Request summary</h2>
          <div className="lines" style={{ marginTop: 12 }}>
            <div className="line"><span className="muted">Pickup</span><span>{pickup ? `${FloraCore.formatLongDate(pickup)}${time ? ', ' + time : ''}` : '—'}</span></div>
            <div className="line"><span className="muted">Return</span><span>{returnDate ? `${FloraCore.formatLongDate(returnDate)}${settings.returnDeadlineTime ? ' by ' + settings.returnDeadlineTime : ''}` : '—'}</span></div>
            <div className="line"><span className="muted">Length</span><span>{days} calendar days</span></div>
            {q &&
              q.lines.map((l: any) => (
                <div key={l.id} className="line">
                  <span>{l.name}{l.extensionCharge ? ` (+${l.extraDays || days - settings.rentalDays} day${(l.extraDays || 1) > 1 ? 's' : ''})` : ''}</span>
                  <span>{FloraCore.peso(l.price + l.extensionCharge)}</span>
                </div>
              ))}
            <div className="line total"><span>Rental total</span><span>{q ? FloraCore.peso(q.rentalTotal) : '—'}</span></div>
            <div className="line"><span className="muted">Refundable deposit</span><span>{q && q.depositRequired !== null ? FloraCore.peso(q.depositRequired) : FloraCore.peso(settings.depositAmount)}</span></div>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Pay nothing now. After you send this request, we hold the dress{selected.length > 1 ? 'es' : ''} for {settings.holdHours} hours while we review it.
            The deposit is separate from the rental fee and is paid only after we send payment instructions. The rental fee is paid at pickup.
          </p>
          <button type="submit" className="btn block" style={{ marginTop: 16 }} disabled={sending || closed || !selected.length}>
            {sending ? <><span className="spinner" /> Sending…</> : 'Send reservation request'}
          </button>
          <p className="tiny muted" style={{ marginTop: 10 }}>Your reservation is confirmed only after payment verification and our confirmation.</p>
        </div>
      </aside>

      {policy && (
        <PolicySheet
          title={policy === 'terms' ? 'Rental terms' : policy === 'cancellation' ? 'Cancellation & refunds' : 'Privacy notice'}
          text={policy === 'terms' ? settings.rentalTerms : policy === 'cancellation' ? settings.cancellationPolicy : settings.privacyNotice}
          onClose={closePolicy}
        />
      )}
    </form>
  );
}
