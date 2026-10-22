import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <p>Flora Dress Rental · Tagbilaran City, Bohol</p>
        <p>In collaboration with Kimona-Boholana</p>
        <nav aria-label="Footer">
          <Link href="/how-to-rent">How to rent</Link>
          <Link href="/policy#terms">Rental terms</Link>
          <Link href="/policy#cancellation">Cancellation &amp; refunds</Link>
          <Link href="/policy#privacy">Privacy notice</Link>
        </nav>
      </div>
    </footer>
  );
}
