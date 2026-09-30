import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { productBySlug } from '../content/products';
import type { Product } from '../content/types';

/**
 * Client-side cart. Persists to localStorage. There is no real checkout:
 * `startCheckout` in ./checkout.ts is the single integration point.
 */

export interface CartLine {
  slug: string;
  qty: number;
}

type Action =
  | { type: 'add'; slug: string }
  | { type: 'remove'; slug: string }
  | { type: 'set'; slug: string; qty: number }
  | { type: 'clear' };

const KEY = 'minitaure:cart:v1';

function reducer(state: CartLine[], a: Action): CartLine[] {
  switch (a.type) {
    case 'add': {
      const hit = state.find((l) => l.slug === a.slug);
      if (hit) return state.map((l) => (l.slug === a.slug ? { ...l, qty: Math.min(9, l.qty + 1) } : l));
      return [...state, { slug: a.slug, qty: 1 }];
    }
    case 'remove':
      return state.filter((l) => l.slug !== a.slug);
    case 'set':
      return a.qty <= 0
        ? state.filter((l) => l.slug !== a.slug)
        : state.map((l) => (l.slug === a.slug ? { ...l, qty: Math.min(9, a.qty) } : l));
    case 'clear':
      return [];
  }
}

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return parsed.filter((l) => productBySlug(l.slug) && l.qty > 0);
  } catch {
    return [];
  }
}

interface CartApi {
  lines: (CartLine & { product: Product })[];
  count: number;
  totalCents: number;
  add: (slug: string) => void;
  remove: (slug: string) => void;
  setQty: (slug: string, qty: number) => void;
  clear: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Increments on every add — drives the counter "pop". */
  pulse: number;
  /** Name of the last product added (for the live announcement). */
  lastAdded: string;
}

const Ctx = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [lastAdded, setLastAdded] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable */
    }
  }, [state]);

  const add = useCallback((slug: string) => {
    dispatch({ type: 'add', slug });
    setPulse((p) => p + 1);
    setLastAdded(productBySlug(slug)?.name ?? '');
  }, []);
  const remove = useCallback((slug: string) => dispatch({ type: 'remove', slug }), []);
  const setQty = useCallback((slug: string, qty: number) => dispatch({ type: 'set', slug, qty }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const api = useMemo<CartApi>(() => {
    const lines = state
      .map((l) => ({ ...l, product: productBySlug(l.slug)! }))
      .filter((l) => l.product);
    return {
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      totalCents: lines.reduce((n, l) => n + l.qty * l.product.priceCents, 0),
      add,
      remove,
      setQty,
      clear,
      open,
      setOpen,
      pulse,
      lastAdded,
    };
  }, [state, add, remove, setQty, clear, open, pulse, lastAdded]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside <CartProvider>');
  return c;
}
