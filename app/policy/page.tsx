import type { Metadata } from 'next';
import { getCatalog } from '@/lib/service';

export const metadata: Metadata = { title: 'Rental policy · Flora Dress Rental' };
// Rendered per request; the catalog itself is cached for 60 s in lib/service.ts (successes only).
export const dynamic = 'force-dynamic';

export default async function PolicyPage() {
  const { settings, error } = await getCatalog();
  const pending = 'This section is being finalised. Please message Flora on Facebook for the current terms.';
  return (
    <div className="wrap prose">
      <h1>Rental policy</h1>
      {error && <p className="alert err">We couldn&apos;t load the latest policy. Please refresh in a moment.</p>}
      <h2 id="terms">Rental terms</h2>
      <p className="pre">{settings.rentalTerms || pending}</p>
      <h2 id="cancellation">Cancellation &amp; refunds</h2>
      <p className="pre">{settings.cancellationPolicy || pending}</p>
      <h2 id="privacy">Privacy notice</h2>
      <p className="pre">{settings.privacyNotice || pending}</p>
    </div>
  );
}
