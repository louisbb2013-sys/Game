import { shuffle, type Rng } from '../rng';
import type { Millis } from '../types';
import type { Concept } from './concept';
import type { ConceptStateView } from './planner';

/**
 * Rounds built from the deck's facts: every fact of the notes (each sub-aspect's key points) gets its
 * own question, so a full round covers everything the notes say, and a short round takes the facts
 * that need it most.
 */

/** One fact of one concept (`fact` indexes its keyPoints; -1 = the idea as a whole, for an idea with no listed facts). */
export interface FactSlot {
  conceptId: string;
  fact: number;
}

/** What happened the last time each fact was asked, by `factKey`. */
export type FactLog = Record<string, { at: number; ok: boolean }>;

export const factKey = (conceptId: string, fact: number) => `${conceptId}:${fact}`;

/** A full round never runs longer than this (a huge deck covers its most-needed facts first). */
export const FULL_ROUND_MAX = 150;

/** Every fact of the deck, in the notes' order. */
export function factSlots(concepts: readonly Concept[]): FactSlot[] {
  return concepts.flatMap((c) => (c.keyPoints.length ? c.keyPoints.map((_, fact) => ({ conceptId: c.id, fact })) : [{ conceptId: c.id, fact: -1 }]));
}

/** How much a fact needs asking: missed last time > never asked > asked long ago > just got right. */
function need(slot: FactSlot, log: FactLog, states: ReadonlyMap<string, ConceptStateView>, now: Millis, rng: Rng): number {
  const l = log[factKey(slot.conceptId, slot.fact)];
  const srs = states.get(slot.conceptId)?.srs;
  let n = !l ? 3 : !l.ok ? 4 : Math.min(2.5, (now - l.at) / (7 * 86_400_000));
  if (srs && srs.due <= now) n += 1.5;
  return n + rng() * 0.4;
}

/** Reorder so the same idea never comes twice in a row when avoidable (and, with `topics`, nor the same topic). */
function spread(slots: FactSlot[], topicOf: (id: string) => string, topics: boolean): FactSlot[] {
  const out: FactSlot[] = [];
  const rest = slots.slice();
  while (rest.length) {
    const prev = out[out.length - 1];
    let i = topics ? rest.findIndex((x) => x.conceptId !== prev?.conceptId && topicOf(x.conceptId) !== (prev ? topicOf(prev.conceptId) : undefined)) : -1;
    if (i < 0) i = rest.findIndex((x) => x.conceptId !== prev?.conceptId);
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]!);
  }
  return out;
}

/**
 * The whole deck in one round: one question per fact, topic by topic in the notes' order (each topic is
 * a chapter), the facts of a topic mixed so one idea's facts don't come in a row. When the deck has more
 * than `max` facts, the ones most in need are kept (still in the notes' order).
 */
export function planFullRound(concepts: readonly Concept[], states: ReadonlyMap<string, ConceptStateView>, log: FactLog, now: Millis, rng: Rng, max = FULL_ROUND_MAX): FactSlot[] {
  let slots = factSlots(concepts);
  if (slots.length > max) {
    const keep = new Set(
      slots
        .map((s) => ({ s, n: need(s, log, states, now, rng) }))
        .sort((a, b) => b.n - a.n)
        .slice(0, max)
        .map((x) => x.s),
    );
    slots = slots.filter((s) => keep.has(s));
  }
  const topicOf = new Map(concepts.map((c) => [c.id, c.topic || '']));
  const order = [...new Set(concepts.map((c) => c.topic || ''))];
  return order.flatMap((topic) => spread(shuffle(slots.filter((s) => topicOf.get(s.conceptId) === topic), rng), (id) => topicOf.get(id) ?? '', false));
}

/**
 * A short round: the `count` facts that need it most, from as many different ideas as possible (an
 * idea comes back with another fact only once every idea has had one), mixed across topics.
 */
export function planQuickRound(concepts: readonly Concept[], states: ReadonlyMap<string, ConceptStateView>, log: FactLog, count: number, now: Millis, rng: Rng): FactSlot[] {
  const ranked = factSlots(concepts)
    .map((s) => ({ s, n: need(s, log, states, now, rng) }))
    .sort((a, b) => b.n - a.n)
    .map((x) => x.s);
  const picked: FactSlot[] = [];
  const taken = new Set<FactSlot>();
  while (picked.length < count && taken.size < ranked.length) {
    const used = new Set<string>();
    for (const s of ranked) {
      if (picked.length >= count) break;
      if (taken.has(s) || used.has(s.conceptId)) continue;
      used.add(s.conceptId);
      taken.add(s);
      picked.push(s);
    }
  }
  const topicOf = new Map(concepts.map((c) => [c.id, c.topic || '']));
  return spread(shuffle(picked, rng), (id) => topicOf.get(id) ?? '', true);
}
