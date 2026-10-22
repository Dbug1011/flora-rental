import { getCatalog } from '@/lib/service';
import CatalogBrowser from '@/components/CatalogBrowser';
import Steps from '@/components/Steps';
import ServiceError from '@/components/ServiceError';

export const revalidate = 60;

export default async function Home() {
  const { items, settings, error } = await getCatalog();
  return (
    <>
      <section className="wrap hero">
        <h1>Pick your bloom.</h1>
        <p className="lead">Dress rentals for birthdays, photoshoots, and your next occasion.</p>
        <p className="place">Tagbilaran City, Bohol</p>
      </section>
      {error ? (
        <section className="wrap section">
          <ServiceError kind={error} />
        </section>
      ) : items.length === 0 ? (
        <section className="wrap section">
          <div className="state">New dresses are coming soon. Follow Flora on Facebook for the collection reveal.</div>
        </section>
      ) : (
        <CatalogBrowser items={items} settings={settings} />
      )}
      <Steps />
    </>
  );
}
