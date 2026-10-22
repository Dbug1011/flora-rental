'use client';
// The customer's selection lives only in their own browser (no accounts). Storage can be
// unavailable (private mode, some in-app browsers), so every access is guarded.
import { useEffect, useState } from 'react';

export type Cart = { itemIds: string[]; pickupDate: string; days: number };
const KEY = 'flora-selection-v1';
const EVENT = 'flora-cart';
let memoryCart: Cart = { itemIds: [], pickupDate: '', days: 0 };
let memoryOnly = false;

function copyCart(c: Cart): Cart {
  return { ...c, itemIds: [...c.itemIds] };
}

export function readCart(): Cart {
  if (memoryOnly) return copyCart(memoryCart);
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw);
      memoryCart = {
        itemIds: Array.isArray(c.itemIds) ? Array.from(new Set<string>(c.itemIds.filter((x: unknown) => typeof x === 'string'))).slice(0, 10) : [],
        pickupDate: typeof c.pickupDate === 'string' ? c.pickupDate : '',
        days: Number.isInteger(c.days) ? c.days : 0
      };
    } else {
      memoryCart = { itemIds: [], pickupDate: '', days: 0 };
    }
  } catch {}
  return copyCart(memoryCart);
}

export function writeCart(c: Cart) {
  memoryCart = copyCart(c);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    memoryOnly = true;
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {}
}

/** Adds a dress unless the selection is already full. Returns whether it is now in the selection. */
export function addToCart(id: string, pickupDate?: string, max = 10) {
  const c = readCart();
  if (!c.itemIds.includes(id)) {
    if (c.itemIds.length >= max) return false;
    c.itemIds.push(id);
  }
  if (pickupDate) c.pickupDate = pickupDate;
  writeCart(c);
  return true;
}

export function removeFromCart(id: string) {
  const c = readCart();
  writeCart({ ...c, itemIds: c.itemIds.filter((x) => x !== id) });
}

/** Selected dress ids, kept in step across components and tabs. Empty until mounted. */
export function useCartIds(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setIds(readCart().itemIds);
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return ids;
}
