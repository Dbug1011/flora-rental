import type { Metadata } from 'next';
import { getCatalog } from '@/lib/service';
import ReserveForm from '@/components/ReserveForm';
import ServiceError from '@/components/ServiceError';

export const metadata: Metadata = { title: 'Request a reservation · Flora Dress Rental' };
export const dynamic = 'force-dynamic';

export default async function ReservePage() {
  const { items, settings, error } = await getCatalog();
  return (
    <div className="wrap">
      <div style={{ paddingTop: 28 }}>
        <h1 style={{ fontSize: 'clamp(40px, 6vw, 56px)', fontWeight: 500 }}>Request a reservation</h1>
        <p className="muted" style={{ marginTop: 6 }}>Choose your dates, then send your request. Nothing is charged here.</p>
      </div>
      {error ? <div className="section"><ServiceError kind={error} /></div> : <ReserveForm items={items} settings={settings} />}
    </div>
  );
}
