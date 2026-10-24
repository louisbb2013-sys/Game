import { useEffect, useSyncExternalStore } from 'react';
import type { PetView } from '../pages/Pets';
import { api, LOCAL } from './api';

/**
 * Gifts from the game's creator (website only): Lumo-rarity pets. They're claimed when fetched, so one
 * store holds them until the gift popup has shown them. It also knows whether I am the creator.
 */

interface GiftState {
  creator: boolean;
  gifts: PetView[];
}

let state: GiftState = { creator: false, gifts: [] };
let lastCheck = 0;
let checking: Promise<void> | null = null;
const listeners = new Set<() => void>();
const set = (next: GiftState) => {
  state = next;
  for (const l of listeners) l();
};

/** Look for new gifts (at most every few minutes, it costs a call to the site). */
export function checkGifts(force = false): Promise<void> {
  if (!LOCAL) return Promise.resolve();
  if (checking) return checking;
  if (!force && Date.now() - lastCheck < 5 * 60_000) return Promise.resolve();
  lastCheck = Date.now();
  checking = api<GiftState>('/api/game/gifts')
    .then(
      (r) => set({ creator: !!r.creator, gifts: [...state.gifts, ...(r.gifts ?? [])] }),
      () => {},
    )
    .finally(() => {
      checking = null;
    });
  return checking;
}

/** The gift popup is done with the first gift. */
export const takeGift = () => set({ ...state, gifts: state.gifts.slice(1) });

/** Gifts waiting to be shown and whether I'm the creator; checks when the app opens and comes back to the front. */
export function useGifts(): GiftState {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  useEffect(() => {
    void checkGifts();
    const back = () => document.visibilityState === 'visible' && void checkGifts();
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);
  return snap;
}
