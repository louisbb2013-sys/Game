import { BLOOM_LEVELS, bloomIndex, type Bloom, type Format } from './types';

/**
 * Per-learner progress on one concept. Mastery is earned by succeeding in
 * several *different* formats at more than one depth, never by repeating one card.
 */
export interface ConceptProgress {
  formatsPassed: Format[];
  bloomPassed: Bloom[];
  bloom: Bloom; // current target depth
  recentFormats: Format[]; // most recent first, max 4
  lastCorrect: boolean | null;
  correctStreak: number;
}

export const MASTERY_RULES = {
  minDistinctFormats: 3,
  minDistinctBloom: 2,
  passScore: 0.8,
} as const;

export function newProgress(): ConceptProgress {
  return { formatsPassed: [], bloomPassed: [], bloom: 'remember', recentFormats: [], lastCorrect: null, correctStreak: 0 };
}

const addUnique = <T>(list: T[], v: T) => (list.includes(v) ? list : [...list, v]);

export function recordAttempt(p: ConceptProgress, format: Format, bloom: Bloom, score: number): ConceptProgress {
  const correct = score >= MASTERY_RULES.passScore;
  const recentFormats = [format, ...p.recentFormats.filter((f) => f !== format)].slice(0, 4);
  const correctStreak = correct ? p.correctStreak + 1 : 0;

  let next: Bloom = p.bloom;
  if (correct && bloomIndex(bloom) >= bloomIndex(p.bloom)) {
    // Two successes in a row at the current depth → go deeper.
    if (correctStreak >= 2) next = BLOOM_LEVELS[Math.min(bloomIndex(p.bloom) + 1, BLOOM_LEVELS.length - 1)]!;
  } else if (!correct) {
    next = BLOOM_LEVELS[Math.max(bloomIndex(p.bloom) - 1, 0)]!;
  }

  return {
    formatsPassed: correct ? addUnique(p.formatsPassed, format) : p.formatsPassed,
    bloomPassed: correct ? addUnique(p.bloomPassed, bloom) : p.bloomPassed,
    bloom: next,
    recentFormats,
    lastCorrect: correct,
    correctStreak: correct && next !== p.bloom ? 0 : correctStreak,
  };
}

export function isMastered(p: ConceptProgress): boolean {
  return (
    p.lastCorrect === true &&
    p.formatsPassed.length >= MASTERY_RULES.minDistinctFormats &&
    p.bloomPassed.length >= MASTERY_RULES.minDistinctBloom
  );
}

/** 0..1 score for progress bars and the mastery map. */
export function masteryScore(p: ConceptProgress): number {
  const f = Math.min(p.formatsPassed.length / MASTERY_RULES.minDistinctFormats, 1);
  const b = Math.min(p.bloomPassed.length / MASTERY_RULES.minDistinctBloom, 1);
  const raw = 0.6 * f + 0.4 * b;
  if (isMastered(p)) return 1;
  // Not fully mastered (e.g. last answer wrong) caps below 1.
  return Math.min(raw, 0.95) * (p.lastCorrect === false ? 0.85 : 1);
}

export type MasteryBand = 'new' | 'learning' | 'familiar' | 'mastered';

export function masteryBand(p: ConceptProgress): MasteryBand {
  if (p.lastCorrect === null) return 'new';
  if (isMastered(p)) return 'mastered';
  return masteryScore(p) >= 0.5 ? 'familiar' : 'learning';
}
