import { describe, expect, it } from 'vitest';
import { DAY_MS, newSrsState, ratingFromScore, retrievability, review } from '../src';

const T0 = Date.UTC(2026, 9, 1);

describe('srs', () => {
  it('maps scores to ratings', () => {
    expect(ratingFromScore(0.2)).toBe('again');
    expect(ratingFromScore(0.6)).toBe('hard');
    expect(ratingFromScore(0.9)).toBe('good');
    expect(ratingFromScore(1, true)).toBe('easy');
  });

  it('brings wrong answers back sooner than right ones', () => {
    const s = newSrsState(T0);
    const wrong = review(s, 'again', T0);
    const right = review(s, 'good', T0);
    expect(wrong.due).toBeLessThan(right.due);
    expect(wrong.due - T0).toBeLessThan(DAY_MS / 24);
  });

  it('grows intervals with successive successes', () => {
    let s = review(newSrsState(T0), 'good', T0);
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      const now = s.due;
      const next = review(s, 'good', now);
      intervals.push(next.due - now);
      s = next;
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]!).toBeGreaterThan(intervals[i - 1]!);
  });

  it('a lapse shrinks stability and counts', () => {
    let s = review(newSrsState(T0), 'good', T0);
    s = review(s, 'good', s.due);
    const lapsed = review(s, 'again', s.due);
    expect(lapsed.stability).toBeLessThan(s.stability);
    expect(lapsed.lapses).toBe(1);
  });

  it('retrievability decays to ~0.9 at stability days', () => {
    const s = review(newSrsState(T0), 'good', T0);
    expect(retrievability(s, T0 + s.stability * DAY_MS)).toBeCloseTo(0.9, 5);
    expect(retrievability(s, T0)).toBe(1);
  });
});
