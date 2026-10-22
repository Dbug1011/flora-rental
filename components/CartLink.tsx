'use client';
import Link from 'next/link';
import { useCartIds } from '@/lib/cart';
import { BagIcon } from './Icons';

export default function CartLink() {
  const n = useCartIds().length;
  return (
    <Link href="/reserve" className="cart-link" aria-label={`My selection, ${n} ${n === 1 ? 'dress' : 'dresses'}`}>
      <BagIcon />
      {n > 0 && <span className="cart-count" aria-hidden="true">{n}</span>}
    </Link>
  );
}
