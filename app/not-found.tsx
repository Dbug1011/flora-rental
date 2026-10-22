import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="wrap prose">
      <h1>We couldn&apos;t find that page.</h1>
      <p>The dress may no longer be listed.</p>
      <p style={{ marginTop: 16 }}><Link href="/#dresses" className="btn">See all dresses</Link></p>
    </div>
  );
}
