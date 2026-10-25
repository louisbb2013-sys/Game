import { pickWeighted, type Rng } from '../rng';
import { bloomIndex, type Format } from '../types';
import type { ConceptProgress } from '../mastery';
import type { Question } from './question';

/** Does this question test that fact of its concept? (-1 or unset: any question of the concept will do.) */
export function testsFact(q: Question, fact: number | undefined): boolean {
  if (fact === undefined || fact < 0) return true;
  return !q.facts?.length || q.facts.includes(fact);
}

/**
 * Choose the next question for a concept from its deck's question bank (real test questions
 * written once by the AI), or null when the bank has nothing suitable.
 * With a `fact`, only questions on that fact are taken (questions written before facts were tagged
 * count for every fact, but a tagged one on the fact comes first).
 * Prefers: questions the learner has never met (strongly: the same question comes back only once the
 * new ones run out, and fades back in over about a week), another angle than last time on this fact,
 * the concept's current depth (Bloom level), formats not just seen, and formats this learner finds
 * hard (`formatBoost`). Never repeats a question within a session.
 */
export function pickFromBank(
  bank: readonly Question[],
  conceptId: string,
  progress: ConceptProgress,
  o: { allowed?: readonly Format[]; usedThisSession: ReadonlySet<string>; lastSeen: Readonly<Record<string, number>>; now: number; formatBoost?: Partial<Record<Format, number>>; fact?: number },
  rng: Rng,
): Question | null {
  const mine = bank.filter((q) => q.conceptId === conceptId && (!o.allowed || o.allowed.includes(q.format)) && !o.usedThisSession.has(q.variantKey));
  let candidates = mine.filter((q) => testsFact(q, o.fact));
  if (o.fact !== undefined && o.fact >= 0) {
    const tagged = candidates.filter((q) => q.facts?.includes(o.fact!));
    if (tagged.length) candidates = tagged;
  }
  if (candidates.length === 0) return null;
  // The angle met last time on this fact (its format): another one this time.
  let lastFormat: Format | undefined;
  let lastAt = -1;
  for (const q of bank) {
    if (q.conceptId !== conceptId || !testsFact(q, o.fact)) continue;
    const t = o.lastSeen[q.variantKey];
    if (t !== undefined && t > lastAt) {
      lastAt = t;
      lastFormat = q.format;
    }
  }
  const target = bloomIndex(progress.bloom);
  const weighted = candidates.map((q) => {
    let w = 1;
    const gap = Math.abs(bloomIndex(q.bloom) - target);
    w *= gap === 0 ? 4 : gap === 1 ? 1.6 : 0.6;
    if (q.format === progress.recentFormats[0]) w *= 0.35;
    if (q.format === lastFormat) w *= 0.4;
    w *= o.formatBoost?.[q.format] ?? 1;
    const seen = o.lastSeen[q.variantKey];
    if (seen === undefined) w *= 12;
    else w *= Math.min(3, 0.02 + (o.now - seen) / (7 * 86_400_000)); // grows back over ~a week
    return { item: q, weight: w };
  });
  return pickWeighted(weighted, rng);
}
