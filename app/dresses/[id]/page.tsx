import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import FloraCore from '@/shared/booking-core';
import { getCatalog } from '@/lib/service';
import Gallery from '@/components/Gallery';
import DressBooking from '@/components/DressBooking';
import ServiceError from '@/components/ServiceError';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { items } = await getCatalog();
  const it = items.find((x) => x.id === decodeURIComponent(params.id).toUpperCase());
  return { title: it ? `${it.name} · Flora Dress Rental` : 'Dress · Flora Dress Rental' };
}

export default async function DressPage({ params, searchParams }: { params: { id: string }; searchParams: { pickup?: string } }) {
  const { items, settings, error } = await getCatalog();
  if (error) return <div className="wrap section"><ServiceError kind={error} /></div>;
  const it = items.find((x) => x.id === decodeURIComponent(params.id).toUpperCase());
  if (!it) notFound();
  const pickup = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.pickup || '') ? (searchParams.pickup as string) : '';
  const extra = settings.extensionBasis === 'per_booking' ? 'per booking' : 'per dress';
  return (
    <div className="wrap">
      <p className="small" style={{ paddingTop: 16 }}>
        <Link href="/#dresses">← All dresses</Link>
      </p>
      <div className="detail">
        <Gallery name={it.name} photos={it.photos} previews={it.previews} />
        <div>
          <p className="small muted">{it.id}</p>
          <h1>{it.name}</h1>
          <p style={{ fontSize: 20, marginTop: 6 }}>
            {it.price ? (
              <>
                {FloraCore.peso(it.price)} <span className="muted">/ {it.includedDays} days</span>
              </>
            ) : (
              'Price coming soon'
            )}
          </p>
          {it.description && <p style={{ marginTop: 14 }}>{it.description}</p>}
          <dl className="facts">
            <dt>Size</dt>
            <dd>{it.size || 'To be confirmed'}</dd>
            <dt>Measurements</dt>
            <dd>{it.measurements || 'Being measured — message us for exact measurements before booking.'}</dd>
            {it.color && (
              <>
                <dt>Color</dt>
                <dd>{it.color}</dd>
              </>
            )}
            <dt>Rental</dt>
            <dd>
              {it.includedDays} calendar days including pickup and return days.
              {it.extensionRate ? ` Extra day: ${FloraCore.peso(it.extensionRate)} ${extra}, subject to availability.` : ''}
            </dd>
            <dt>Deposit</dt>
            <dd>
              {FloraCore.peso(settings.depositAmount)} refundable security deposit{settings.depositBasis === 'per_dress' ? ' per dress' : settings.depositBasis === 'per_booking' ? ' per booking' : ''}, separate from the rental fee.
            </dd>
            <dt>Included</dt>
            <dd>{it.accessories || 'The dress only, unless listed here.'}</dd>
            {it.careNotes && (
              <>
                <dt>Care</dt>
                <dd>{it.careNotes}</dd>
              </>
            )}
          </dl>
          <DressBooking item={it} settings={settings} initialPickup={pickup} />
        </div>
      </div>
    </div>
  );
}
