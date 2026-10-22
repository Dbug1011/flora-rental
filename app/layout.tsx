import type { Metadata, Viewport } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getCatalog } from '@/lib/service';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Flora Dress Rental · Tagbilaran City, Bohol',
  description: 'Flower-named dress rentals for birthdays, events and photoshoots in Tagbilaran City, Bohol. Pick your bloom.',
  icons: { icon: '/favicon.svg' }
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { settings, preview } = await getCatalog();
  return (
    <html lang="en">
      <body>
        {preview && (
          <div className="preview-banner" role="status">
            Preview mode · sample prices and dates · requests here are not real bookings and are not saved to the Sheet
          </div>
        )}
        <Header facebookPageUrl={settings.facebookPageUrl} />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
