import { DAY_MS, type Millis } from './types';

/**
 * A compact FSRS-inspired scheduler.
 *
 * `stability` is the number of days after which recall probability drops to ~90%,
 * so the next review is scheduled `stability` days out. `difficulty` (1–10) slows
 * stability growth for concepts the learner finds hard.
 */
export interface SrsState {
  stability: number; // days
  difficulty: number; // 1..10
  due: Millis;
  reps: number;
  lapses: number;
  lastReview: Millis | null;
}

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

/** Turn a graded score (0..1, partial credit allowed) into a rating. */
export function ratingFromScore(score: number, fast = false): ReviewRating {
  if (score < 0.5) return 'again';
  if (score < 0.8) return 'hard';
  return fast && score >= 0.999 ? 'easy' : 'good';
}

const INITIAL_STABILITY: Record<ReviewRating, number> = {
  again: 10 / (24 * 60), // 10 minutes
  hard: 0.5,
  good: 1.5,
  easy: 4,
};

const DIFFICULTY_DELTA: Record<ReviewRating, number> = { again: 1.5, hard: 0.5, good: -0.3, easy: -0.8 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function newSrsState(now: Millis): SrsState {
  return { stability: 0, difficulty: 5, due: now, reps: 0, lapses: 0, lastReview: null };
}

/** Probability the learner still remembers, given elapsed time. */
export function retrievability(state: SrsState, now: Millis): number {
  if (state.lastReview === null || state.stability <= 0) return 0;
  const elapsedDays = Math.max(0, now - state.lastReview) / DAY_MS;
  return Math.pow(0.9, elapsedDays / state.stability);
}

export function review(state: SrsState, rating: ReviewRating, now: Millis): SrsState {
  const difficulty = clamp(state.difficulty + DIFFICULTY_DELTA[rating], 1, 10);
  let stability: number;
  let lapses = state.lapses;

  if (state.reps === 0 || state.stability <= 0) {
    stability = INITIAL_STABILITY[rating];
    if (rating === 'again') lapses += 1;
  } else if (rating === 'again') {
    // Forgot: come back soon, but keep a little of what was built.
    stability = Math.max(INITIAL_STABILITY.again, state.stability * 0.25);
    lapses += 1;
  } else {
    const r = retrievability(state, now);
    const ease = (11 - difficulty) / 10; // 0.1 .. 1
    const surprise = 1 - r + 0.15; // reviewing later (lower R) = bigger gain
    const ratingBoost = rating === 'hard' ? 0.5 : rating === 'easy' ? 1.6 : 1;
    const growth = 1 + 3 * ease * surprise * ratingBoost * Math.pow(state.stability + 1, -0.15);
    stability = Math.max(state.stability * growth, INITIAL_STABILITY[rating]);
  }

  stability = clamp(stability, INITIAL_STABILITY.again, 365);
  return {
    stability,
    difficulty,
    due: now + Math.round(stability * DAY_MS),
    reps: state.reps + 1,
    lapses,
    lastReview: now,
  };
}

export const isDue = (state: SrsState, now: Millis) => state.due <= now;
