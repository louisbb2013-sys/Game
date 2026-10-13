import { MINUTE_MS, type Millis } from './types';

/**
 * Hearts are generous: they only drop in "challenge" sessions, refill every
 * 30 minutes, and review practice gives them back. Learning is never blocked.
 */
export const MAX_HEARTS = 5;
export const REFILL_MS = 30 * MINUTE_MS;

export interface HeartsState {
  hearts: number;
  updatedAt: Millis; // reference point for refill timing
}

export interface HeartsView {
  hearts: number;
  nextRefillAt: Millis | null;
  state: HeartsState; // normalized state to persist
}

export function currentHearts(s: HeartsState, now: Millis): HeartsView {
  if (s.hearts >= MAX_HEARTS) return { hearts: MAX_HEARTS, nextRefillAt: null, state: { hearts: MAX_HEARTS, updatedAt: now } };
  const refills = Math.floor(Math.max(0, now - s.updatedAt) / REFILL_MS);
  const hearts = Math.min(MAX_HEARTS, s.hearts + refills);
  if (hearts >= MAX_HEARTS) return { hearts, nextRefillAt: null, state: { hearts, updatedAt: now } };
  const updatedAt = s.updatedAt + refills * REFILL_MS;
  return { hearts, nextRefillAt: updatedAt + REFILL_MS, state: { hearts, updatedAt } };
}

export function loseHeart(s: HeartsState, now: Millis): HeartsState {
  const v = currentHearts(s, now);
  if (v.hearts <= 0) return v.state;
  // Losing from full starts the refill clock now.
  return { hearts: v.hearts - 1, updatedAt: v.hearts >= MAX_HEARTS ? now : v.state.updatedAt };
}

export function gainHearts(s: HeartsState, now: Millis, n = 1): HeartsState {
  const v = currentHearts(s, now);
  const hearts = Math.min(MAX_HEARTS, v.hearts + n);
  return { hearts, updatedAt: hearts >= MAX_HEARTS ? now : v.state.updatedAt };
}

/** Challenge sessions need at least one heart; practice never does. */
export const canStartChallenge = (s: HeartsState, now: Millis) => currentHearts(s, now).hearts > 0;
