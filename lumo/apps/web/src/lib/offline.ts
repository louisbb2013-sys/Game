import type { Bloom, Concept, Format, Locale } from '@lumo/core';
import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * Offline review: decks saved on this device, plus answers waiting to be sent.
 * Everything is wrapped in try/catch: storage can be full or blocked (private mode).
 */

export interface OfflineDeck {
  deck: { id: string; title: string; subject: string; language: Locale };
  concepts: Concept[];
  savedAt: number;
}
export interface OfflineReview {
  conceptId: string;
  format: Format;
  bloom: Bloom;
  score: number;
  at: number;
  selfRated?: boolean;
}
interface Batch {
  clientId: string;
  deckId: string;
  reviews: OfflineReview[];
}

const DECK = (id: string) => `lumo_offline_deck_${id}`;
const INDEX = 'lumo_offline_index';
const QUEUE = 'lumo_offline_queue';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const newClientId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export async function saveDeckOffline(deckId: string): Promise<boolean> {
  const data = await api<OfflineDeck>(`/api/decks/${deckId}/offline`);
  if (!write(DECK(deckId), data)) return false;
  const index = read<string[]>(INDEX, []).filter((x) => x !== deckId);
  write(INDEX, [deckId, ...index]);
  return true;
}

export const offlineDeck = (deckId: string) => read<OfflineDeck | null>(DECK(deckId), null);
export const offlineDecks = () => read<string[]>(INDEX, []).map(offlineDeck).filter((d): d is OfflineDeck => !!d);

export function removeOfflineDeck(deckId: string) {
  try {
    localStorage.removeItem(DECK(deckId));
  } catch {
    /* ignore */
  }
  write(INDEX, read<string[]>(INDEX, []).filter((x) => x !== deckId));
}

/** Queue one finished round of reviews (one batch = one client id, so a retried send counts once). */
export function queueReviews(deckId: string, reviews: OfflineReview[]) {
  if (reviews.length === 0) return;
  write(QUEUE, [...read<Batch[]>(QUEUE, []), { clientId: newClientId(), deckId, reviews }]);
}

export const pendingReviews = () => read<Batch[]>(QUEUE, []).reduce((n, b) => n + b.reviews.length, 0);

let syncing: Promise<{ sent: number; xp: number }> | null = null;

/** Send queued reviews; keeps whatever fails for next time. */
export function syncOffline(): Promise<{ sent: number; xp: number }> {
  syncing ??= (async () => {
    let sent = 0;
    let xp = 0;
    for (const batch of read<Batch[]>(QUEUE, [])) {
      try {
        const r = await api<{ applied: number; xp: number }>('/api/offline/sync', { method: 'POST', body: batch });
        sent += r.applied ?? 0;
        xp += r.xp ?? 0;
        write(QUEUE, read<Batch[]>(QUEUE, []).filter((b) => b.clientId !== batch.clientId));
      } catch (e) {
        // A deck that was deleted or a bad batch would block the queue forever: drop it.
        if ((e as { status?: number }).status === 400 || (e as { status?: number }).status === 404) {
          write(QUEUE, read<Batch[]>(QUEUE, []).filter((b) => b.clientId !== batch.clientId));
        } else break;
      }
    }
    return { sent, xp };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Forget everything offline (on sign-out, so the next person on this device sees nothing). */
export function clearOffline() {
  for (const id of read<string[]>(INDEX, [])) removeOfflineDeck(id);
  try {
    localStorage.removeItem(QUEUE);
    localStorage.removeItem(INDEX);
  } catch {
    /* ignore */
  }
}
