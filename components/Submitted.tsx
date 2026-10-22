'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import FloraCore from '@/shared/booking-core';
import type { BookingSummary } from '@/lib/types';

// Shows the request that was just saved, from this browser's session only.
// There is deliberately no way to look a booking up by its code.
export default function Submitted() {
  const [data, setData] = useState<{ summary: BookingSummary; preview: boolean } | null | undefined>(undefined);
  const [copied, setCopied] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem('flora-last-request');
      setData(raw ? JSON.parse(raw) : null);
    } catch {
      setData(null);
    }
  }, []);

  if (data === undefined) return <div className="state"><span className="spinner" /> Loading…</div>;
  if (!data || !data.summary) {
    return (
      <div className="state">
        <p>There is no recent request in this browser.</p>
        <p style={{ marginTop: 10 }}>
          If you already sent one, message Flora on Facebook with your booking code. Otherwise <Link href="/reserve">start a request</Link>.
        </p>
      </div>
    );
  }
  const s = data.summary;

  async function copy() {
    try {
      await navigator.clipboard.writeText(s.code);
      setCopied('Copied!');
    } catch {
      // Some in-app browsers block the clipboard API: select the text so it can be copied manually.
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
        try {
          setCopied(document.execCommand('copy') ? 'Copied!' : 'Selected — tap and hold to copy.');
        } catch {
          setCopied('Selected — tap and hold to copy.');
        }
      }
    }
    setTimeout(() => setCopied(''), 4000);
  }

  return (
    <div className="confirm">
      {data.preview && <p className="alert warn">Preview mode: this was not saved to Flora&apos;s booking sheet.</p>}
      <div>
        <span className="status-pill">Request received · not yet confirmed</span>
        <h1 style={{ fontSize: 'clamp(38px, 6vw, 52px)', fontWeight: 500, marginTop: 14 }}>Thank you! Now message us your code.</h1>
      </div>

      <div className="code-box">
        <div style={{ flex: '1 1 auto' }}>
          <div className="small muted">Your booking code</div>
          <input ref={inputRef} className="code" readOnly value={s.code} aria-label="Booking code" style={{ border: 0, background: 'none', width: '100%', padding: 0 }} />
        </div>
        <button type="button" className="btn secondary small" onClick={copy}>Copy booking code</button>
        <span role="status" className="small" style={{ width: '100%' }}>{copied}</span>
      </div>

      <p className="alert info">
        Please message Flora&apos;s Facebook Page using the account you provided and send your booking code. We&apos;ll review your request and send payment
        instructions. Your reservation is confirmed only after payment verification and our confirmation.
      </p>

      {s.facebookPageUrl ? (
        <a className="btn block" href={s.facebookPageUrl} target="_blank" rel="noopener noreferrer">Message Flora on Facebook</a>
      ) : null}
      <p className="small muted" style={{ marginTop: -8 }}>Opening Facebook does not send anything automatically — please paste your code in the message.</p>

      <div className="panel">
        <h2>Request details</h2>
        <div className="lines" style={{ marginTop: 12 }}>
          {s.items.map((it) => (
            <div className="line" key={it.id}>
              <span>{it.name}</span>
              <span>{FloraCore.peso(it.price + it.extensionCharge)}</span>
            </div>
          ))}
          <div className="line total"><span>Rental total (paid at pickup)</span><span>{FloraCore.peso(s.rentalTotal)}</span></div>
          {s.depositRequired !== null && (
            <div className="line"><span className="muted">Refundable security deposit</span><span>{FloraCore.peso(s.depositRequired)}</span></div>
          )}
          <div className="line"><span className="muted">Pickup</span><span>{FloraCore.formatLongDate(s.pickupDate)}{s.pickupTime ? ', ' + s.pickupTime : ''}</span></div>
          <div className="line"><span className="muted">Return</span><span>{FloraCore.formatLongDate(s.returnDate)}{s.returnDeadline ? ' by ' + s.returnDeadline : ''}</span></div>
          <div className="line"><span className="muted">Rental length</span><span>{s.days} calendar days</span></div>
          {s.holdExpiry && (
            <div className="line"><span className="muted">Temporary hold until</span><span>{FloraCore.formatStamp(s.holdExpiry)}</span></div>
          )}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          If we don&apos;t receive your message and deposit before the hold ends, the dates are released for other customers.
        </p>
      </div>
      <p className="small"><Link href="/">Back to the collection</Link></p>
    </div>
  );
}
