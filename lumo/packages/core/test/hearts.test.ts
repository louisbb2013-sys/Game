import { describe, expect, it } from 'vitest';
import { canStartChallenge, currentHearts, gainHearts, loseHeart, MAX_HEARTS, REFILL_MS } from '../src';

const T0 = 1_000_000;

describe('hearts', () => {
  it('refills one heart every 30 minutes up to max', () => {
    let s = { hearts: MAX_HEARTS, updatedAt: T0 };
    s = loseHeart(s, T0);
    s = loseHeart(s, T0 + 1000);
    expect(currentHearts(s, T0 + 1000).hearts).toBe(3);
    expect(currentHearts(s, T0 + REFILL_MS).hearts).toBe(4);
    expect(currentHearts(s, T0 + REFILL_MS).nextRefillAt).toBe(T0 + 2 * REFILL_MS);
    expect(currentHearts(s, T0 + 10 * REFILL_MS).hearts).toBe(MAX_HEARTS);
  });

  it('never goes below zero and review practice restores', () => {
    let s = { hearts: 1, updatedAt: T0 };
    s = loseHeart(s, T0);
    s = loseHeart(s, T0);
    expect(s.hearts).toBe(0);
    expect(canStartChallenge(s, T0)).toBe(false);
    s = gainHearts(s, T0, 2);
    expect(currentHearts(s, T0).hearts).toBe(2);
    expect(canStartChallenge(s, T0)).toBe(true);
  });

  it('partial refill progress survives a loss', () => {
    let s = { hearts: 3, updatedAt: T0 };
    s = loseHeart(s, T0 + REFILL_MS / 2);
    expect(currentHearts(s, T0 + REFILL_MS).hearts).toBe(3);
  });
});
