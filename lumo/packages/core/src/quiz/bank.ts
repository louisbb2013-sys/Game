import { pickWeighted, type Rng } from '../rng';
import { bloomIndex, type Format } from '../types';
import type { ConceptProgress } from '../mastery';
import type { Question } from './question';

/**
 * Choose the next question for a concept from its deck's question bank (real test questions
 * written once by the AI), or null when the bank has nothing suitable.
 * Prefers: the concept's current depth (Bloom level), formats not just seen, and questions the
 * learner hasn't met recently. Never repeats a question within a session.
 */
export function pickFromBank(
  bank: readonly Question[],
  conceptId: string,
  progress: ConceptProgress,
  o: { allowed?: readonly Format[]; usedThisSession: ReadonlySet<string>; lastSeen: Readonly<Record<string, number>>; now: number },
  rng: Rng,
): Question | null {
  const candidates = bank.filter((q) => q.conceptId === conceptId && (!o.allowed || o.allowed.includes(q.format)) && !o.usedThisSession.has(q.variantKey));
  if (candidates.length === 0) return null;
  const target = bloomIndex(progress.bloom);
  const weighted = candidates.map((q) => {
    let w = 1;
    const gap = Math.abs(bloomIndex(q.bloom) - target);
    w *= gap === 0 ? 4 : gap === 1 ? 1.6 : 0.6;
    if (q.format === progress.recentFormats[0]) w *= 0.35;
    const seen = o.lastSeen[q.variantKey];
    if (seen === undefined) w *= 3;
    else w *= Math.min(3, 0.2 + (o.now - seen) / (3 * 86_400_000)); // grows back over ~3 days
    return { item: q, weight: w };
  });
  return pickWeighted(weighted, rng);
}
