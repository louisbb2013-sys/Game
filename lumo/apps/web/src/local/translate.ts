import type { Concept, Locale, Question } from '@lumo/core';
import { api } from '../lib/api';
import { getSample, ReaderError, withTimeout } from './reader';

/**
 * Turn one of my decks into the app's language (English ↔ French): its title, ideas and every
 * question, in place, so its progress stays. Only the words are sent to Claude, as a flat list of
 * strings that must come back in the same order, so the deck's structure can't be broken.
 */

/** Keys whose values are ids, codes or maths, never words a learner reads. */
const SKIP = new Set(['id', 'conceptId', 'format', 'bloom', 'language', 'variantKey', 'correctId', 'correctIds', 'correctOrder', 'pairs', 'kind', 'imageUrl', 'symbol', 'unit', 'formula', 'expr', 'date']);
const WORDS = /\p{L}/u;

type Slot = { get: () => string; set: (v: string) => void };

function collect(node: unknown, out: Slot[]) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (typeof v === 'string') {
        if (WORDS.test(v)) out.push({ get: () => node[i] as string, set: (x) => (node[i] = x) });
      } else collect(v, out);
    });
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (SKIP.has(k)) continue;
      const v = o[k];
      if (typeof v === 'string') {
        if (WORDS.test(v)) out.push({ get: () => o[k] as string, set: (x) => (o[k] = x) });
      } else collect(v, out);
    }
  }
}

const PROMPT = (to: Locale, items: string[]) => `Translate every string in this JSON array into ${to === 'fr' ? 'French, with the vocabulary Québec schools use' : 'English'}. They come from a school study deck (ideas, quiz questions, answers, explanations).
Rules: keep the same order and exactly ${items.length} items; keep numbers, formulas, symbols and "___" blanks as they are; keep names of people and places; translate short answers as short answers. If a string is already in ${to === 'fr' ? 'French' : 'English'}, keep it.
Answer with only the JSON array of ${items.length} strings.

${JSON.stringify(items)}`;

async function translateList(items: string[], to: Locale, signal?: AbortSignal): Promise<string[]> {
  const s = await getSample();
  if (!s) throw new ReaderError('unavailable');
  const out: string[] = [];
  // Small batches keep each answer short and easy to check.
  let size = 60;
  for (let i = 0; i < items.length; ) {
    const chunk = items.slice(i, i + size);
    const got = await withTimeout(s.json<unknown>(PROMPT(to, chunk), { signal, modelTier: 'quick', cache: false }), 90_000).catch(() => null);
    if (Array.isArray(got) && got.length === chunk.length && got.every((x) => typeof x === 'string')) {
      out.push(...(got as string[]));
      i += chunk.length;
    } else if (size > 8) size = Math.ceil(size / 2);
    else throw new ReaderError('translate_failed');
  }
  return out;
}

export async function translateDeck(deckId: string, to: Locale, signal?: AbortSignal) {
  const d = await api<{ deck: { title: string; subject: string; language: Locale; summary?: string }; concepts: Concept[]; bank?: Question[] }>(`/api/decks/${deckId}/offline`);
  const doc = { title: d.deck.title, subject: d.deck.subject, summary: d.deck.summary ?? '', concepts: structuredClone(d.concepts), bank: structuredClone(d.bank ?? []) };
  const slots: Slot[] = [];
  collect(doc, slots);
  const done = await translateList(
    slots.map((x) => x.get()),
    to,
    signal,
  );
  slots.forEach((x, i) => x.set(done[i]!.trim() || x.get()));
  await api(`/api/local/decks/${deckId}/translated`, { method: 'PUT', body: { ...doc, language: to } });
}
