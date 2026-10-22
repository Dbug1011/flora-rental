'use client';
import { useMemo, useState } from 'react';
import FloraCore from '@/shared/booking-core';
import { Chevron } from './Icons';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type Props = {
  min: string; // earliest pickup date
  max: string; // latest pickup date
  days: number; // rental length in calendar days (pickup and return included)
  buffer: number; // cleaning days after return
  unavailable: Set<string>;
  value: string;
  onChange: (date: string) => void;
  label?: string;
};

function monthOf(d: string) {
  return d.slice(0, 7);
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

/**
 * Month calendar for choosing a pickup date. Dates already reserved or blocked are greyed out
 * and labelled "Unavailable". A free date that cannot start a full rental (because a reserved
 * date falls inside the rental or its cleaning day) is dimmed and explained when tapped.
 */
export default function Calendar({ min, max, days, buffer, unavailable, value, onChange, label }: Props) {
  const [month, setMonth] = useState(monthOf(value || min));
  const [note, setNote] = useState('');
  const returnDate = value ? FloraCore.addDays(value, days - 1) : '';

  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = first.getUTCDay();
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= count; d++) out.push(`${month}-${String(d).padStart(2, '0')}`);
    return out;
  }, [month]);

  const canPrev = month > monthOf(min);
  const canNext = month < monthOf(max);

  function pick(d: string, kind: string) {
    if (kind === 'na') return setNote(`${FloraCore.formatLongDate(d)} is unavailable for your selection.`);
    if (kind === 'nostart')
      return setNote(
        `A ${days}-day rental from ${FloraCore.formatLongDate(d)} would run into a reserved date or its cleaning day. Please choose another pickup date.`
      );
    if (kind === 'past') return;
    setNote('');
    onChange(d);
  }

  return (
    <div className="cal" aria-label={label || 'Choose a pickup date'}>
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => setMonth(shiftMonth(month, -1))} disabled={!canPrev} aria-label="Previous month">
          <Chevron dir="left" />
        </button>
        <strong aria-live="polite">
          {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
        </strong>
        <button type="button" className="cal-nav" onClick={() => setMonth(shiftMonth(month, 1))} disabled={!canNext} aria-label="Next month">
          <Chevron dir="right" />
        </button>
      </div>
      <div className="cal-grid" role="grid">
        {DOW.map((d) => (
          <div key={d} className="cal-dow" aria-hidden="true">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={'x' + i} className="cal-day out" aria-hidden="true" />;
          let kind = 'ok';
          if (d < min || d > max) kind = 'past';
          else if (unavailable.has(d)) kind = 'na';
          else if (!FloraCore.canStartOn(d, days, buffer, unavailable)) kind = 'nostart';
          const inRange = value && d >= value && d <= returnDate;
          const cls = ['cal-day', kind !== 'ok' ? kind : '', inRange ? 'in-range' : '', d === value ? 'start' : '', d === returnDate ? 'end' : '']
            .filter(Boolean)
            .join(' ');
          const desc =
            kind === 'na' ? 'Unavailable' : kind === 'nostart' ? 'Not enough free days' : kind === 'past' ? 'Not bookable' : d === value ? 'Pickup' : d === returnDate ? 'Return' : '';
          return (
            <button
              key={d}
              type="button"
              className={cls}
              aria-disabled={kind !== 'ok'}
              aria-pressed={d === value}
              aria-label={`${FloraCore.formatLongDate(d)}${desc ? ', ' + desc : ''}`}
              onClick={() => pick(d, kind)}
            >
              <span>{Number(d.slice(8))}</span>
              {kind === 'na' && <span className="na-label" aria-hidden="true">N/A</span>}
            </button>
          );
        })}
      </div>
      <div className="cal-legend" aria-hidden="true">
        <span><i className="sw" style={{ background: 'var(--fuchsia)' }} /> Pickup / return</span>
        <span><i className="sw" style={{ background: 'var(--blush)' }} /> Your rental</span>
        <span><i className="sw" style={{ background: '#f3eff1', border: '1px solid #ddd' }} /> N/A = Unavailable</span>
      </div>
      {note && (
        <p className="alert info small" role="status" style={{ marginTop: 10 }}>
          {note}
        </p>
      )}
    </div>
  );
}
