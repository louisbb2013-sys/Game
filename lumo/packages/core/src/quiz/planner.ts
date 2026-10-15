import { isMastered, type ConceptProgress } from '../mastery';
import { pickWeighted, shuffle, type Rng } from '../rng';
import { retrievability, type SrsState } from '../srs';
import { FORMATS, type Bloom, type Format, type Millis } from '../types';
import type { Concept } from './concept';
import { FORMAT_BLOOM, nearestBloom, supportsFormat } from './formats';

export type SessionMode = 'practice' | 'review' | 'challenge' | 'wrong_only' | 'exam' | 'speed' | 'boss';

export interface ConceptStateView {
  conceptId: string;
  progress: ConceptProgress;
  srs: SrsState | null; // null = never studied
}

/**
 * Choose which concepts to ask, in order. Due and shaky concepts first, then new
 * ones, interleaved across topics so the learner has to switch context (better recall).
 */
export function pickConcepts(
  deck: readonly Concept[],
  states: ReadonlyMap<string, ConceptStateView>,
  count: number,
  mode: SessionMode,
  now: Millis,
  rng: Rng,
): string[] {
  const scored = deck.map((c) => {
    const s = states.get(c.id);
    let priority: number;
    if (!s || !s.srs) priority = 2 + rng() * 0.5; // new
    else if (s.srs.due <= now) priority = 4 + (1 - retrievability(s.srs, now)); // due
    else if (s.progress.lastCorrect === false) priority = 3.5; // recently wrong
    else if (!isMastered(s.progress)) priority = 2.5 + rng() * 0.5; // learning
    else priority = 1 - retrievability(s.srs, now) + rng() * 0.2; // mastered: least-remembered first
    return { c, s, priority };
  });

  let pool = scored;
  if (mode === 'wrong_only') pool = scored.filter((x) => x.s?.progress.lastCorrect === false || (x.s?.srs?.lapses ?? 0) > 0);
  if (mode === 'review') pool = scored.filter((x) => x.s?.srs);
  if (pool.length === 0) pool = scored; // nothing matches: fall back to everything

  // A mock exam samples the whole deck evenly, like a real test; otherwise most-needed first.
  if (mode === 'exam') pool = pool.map((x) => ({ ...x, priority: rng() }));
  pool.sort((a, b) => b.priority - a.priority);

  // Fill the session; short decks repeat concepts (each repeat gets a different format).
  const picked: Concept[] = [];
  for (let round = 0; picked.length < count && round < 6; round++) {
    for (const x of pool) {
      if (picked.length >= count) break;
      picked.push(x.c);
    }
  }
  return interleave(picked).map((c) => c.id);
}

/** Reorder so the same concept/topic doesn't come up twice in a row when avoidable. */
function interleave(items: Concept[]): Concept[] {
  const out: Concept[] = [];
  const rest = items.slice();
  while (rest.length) {
    const prev = out[out.length - 1];
    let idx = rest.findIndex((c) => c.id !== prev?.id && c.topic !== prev?.topic);
    if (idx < 0) idx = rest.findIndex((c) => c.id !== prev?.id);
    if (idx < 0) idx = 0;
    const chosen = rest[idx]!;
    out.push(chosen);
    rest.splice(rest.indexOf(chosen), 1);
  }
  return out;
}

export interface FormatChoice {
  format: Format;
  bloom: Bloom;
}

export interface ChooseFormatOptions {
  exclude?: readonly Format[]; // e.g. teach_back in Live, or formats that failed to generate
  allowed?: readonly Format[];
}

/**
 * Pick the format for the next question on a concept:
 * - never the format used last time for this concept,
 * - prefer formats the learner hasn't passed yet (mastery needs several),
 * - match the concept's current depth (Bloom level).
 */
export function chooseFormat(c: Concept, deck: readonly Concept[], progress: ConceptProgress, rng: Rng, o: ChooseFormatOptions = {}): FormatChoice | null {
  const last = progress.recentFormats[0];
  const supported = FORMATS.filter((f) => supportsFormat(c, f, deck) && !o.exclude?.includes(f) && (!o.allowed || o.allowed.includes(f)));
  if (supported.length === 0) return null;
  let candidates = supported.filter((f) => f !== last);
  if (candidates.length === 0) candidates = supported; // only one possible format: still vary wording

  const target = progress.bloom;
  const weighted = candidates.map((f) => {
    let w = 1;
    if (FORMAT_BLOOM[f].includes(target)) w *= 4;
    if (!progress.formatsPassed.includes(f)) w *= 2.5;
    const recentIdx = progress.recentFormats.indexOf(f);
    if (recentIdx > 0) w *= 0.25 + 0.2 * recentIdx;
    return { item: f, weight: w };
  });
  const format = pickWeighted(shuffle(weighted, rng), rng);
  return { format, bloom: nearestBloom(format, target) };
}
