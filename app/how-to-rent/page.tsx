import Link from 'next/link';
import type { Metadata } from 'next';
import FloraCore from '@/shared/booking-core';
import { getCatalog } from '@/lib/service';

export const metadata: Metadata = { title: 'How to rent · Flora Dress Rental' };
export const revalidate = 60;

export default async function HowToRent() {
  const { settings: s } = await getCatalog();
  const extra = s.extensionBasis === 'per_booking' ? 'per booking' : 'per dress';
  const deposit = FloraCore.peso(s.depositAmount);
  return (
    <div className="wrap prose">
      <h1>How to rent</h1>
      <p className="muted">Pick your bloom.</p>
      <ol style={{ marginTop: 24 }}>
        <li><strong>Choose your dress.</strong> Browse the collection, check your dates, and send a reservation request with your Facebook profile name.</li>
        <li><strong>Message us your booking code.</strong> Send it to Flora&apos;s Facebook Page from the account you entered. We review the account and send payment instructions.</li>
        <li><strong>Secure your reservation.</strong> A {deposit} refundable reservation/security deposit secures your dress and dates. It is separate from the rental fee. Your booking is confirmed only after we verify your payment and send confirmation.</li>
        <li><strong>Schedule a fitting.</strong> Fittings are by appointment. We recommend trying on your dress before confirming.</li>
        <li><strong>Pick up your dress.</strong> Present a valid government-issued photo ID, sign the rental agreement and settle the rental fee. Your original ID is returned after verification. We check the dress and accessories with you before release.</li>
        <li><strong>Return it on time.</strong> Return the dress and all accessories by the agreed date and time. We inspect it against its pickup condition; normal wear is not treated as damage.</li>
        <li><strong>Get your deposit back.</strong> The deposit is refunded after return and inspection, less any documented charges under your rental agreement.</li>
      </ol>

      <h2>Your rental schedule</h2>
      <p>A standard rental covers <strong>{s.rentalDays} calendar days</strong>, including pickup and return days — not {s.rentalDays * 24} hours.</p>
      <ul>
        <li>Day 1: pick up your dress.</li>
        <li>Day 2: wear it for your event or photoshoot.</li>
        <li>Day {s.rentalDays}: return it{s.returnDeadlineTime ? ` by ${s.returnDeadlineTime}` : ' by the agreed time'}.</li>
      </ul>
      <p style={{ marginTop: 10 }}>
        Need {s.rentalDays + 1} days? Add {FloraCore.peso(s.extensionRate)} {extra}. Further extensions cost {FloraCore.peso(s.extensionRate)} per extra day, subject to availability and prior approval.
        Late return without an approved extension: {FloraCore.peso(s.lateFeePerDay)} per day.
      </p>

      <h2 id="contact">Pickup &amp; contact</h2>
      <p className="pre">{s.pickupLocation || 'Tagbilaran City, Bohol'}</p>
      {s.operatingHours && <p className="pre muted" style={{ marginTop: 6 }}>{s.operatingHours}</p>}
      {s.facebookPageUrl && (
        <p style={{ marginTop: 14 }}>
          <a className="btn" href={s.facebookPageUrl} target="_blank" rel="noopener noreferrer">Message Flora on Facebook</a>
        </p>
      )}
      <p style={{ marginTop: 18 }}>
        Read the full <Link href="/policy">rental policy</Link>.
      </p>
    </div>
  );
}
