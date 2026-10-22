import Link from 'next/link';
import { MenuIcon } from './Icons';
import CartLink from './CartLink';

export default function Header({ facebookPageUrl }: { facebookPageUrl: string }) {
  const msg = facebookPageUrl || '/how-to-rent#contact';
  const ext = !!facebookPageUrl;
  return (
    <header className="site-header">
      <div className="wrap bar">
        <Link href="/" className="logo" aria-label="Flora Dress Rental home">
          <img src="/flora-logo-tight.svg" alt="Flora Dress Rental Bohol" width={130} height={52} />
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/#dresses">Dresses</Link>
          <Link href="/how-to-rent">How to rent</Link>
          <Link href="/policy">Rental policy</Link>
        </nav>
        <div className="header-actions">
          <CartLink />
          <a className="btn small header-cta" href={msg} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            Message us
          </a>
          <details className="menu">
            <summary aria-label="Open menu"><MenuIcon /></summary>
            <div className="menu-panel">
              <Link href="/#dresses">Dresses</Link>
              <Link href="/reserve">My selection</Link>
              <Link href="/how-to-rent">How to rent</Link>
              <Link href="/policy">Rental policy</Link>
              <a href={msg} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>Message us on Facebook</a>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
