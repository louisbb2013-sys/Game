import { describe, expect, it } from 'vitest';
import { comboMultiplier, levelFromXp, levelProgress, levelUpRewards, xpForAnswer, xpForLevel } from '../src';

describe('xp', () => {
  it('rewards harder formats and deeper bloom more', () => {
    const base = { score: 1, firstTry: false, combo: 1 } as const;
    expect(xpForAnswer({ ...base, format: 'explain', bloom: 'remember' })).toBeGreaterThan(xpForAnswer({ ...base, format: 'multiple_choice', bloom: 'remember' }));
    expect(xpForAnswer({ ...base, format: 'multiple_choice', bloom: 'analyze' })).toBeGreaterThan(xpForAnswer({ ...base, format: 'multiple_choice', bloom: 'remember' }));
  });

  it('applies first-try bonus, combo and capped boost', () => {
    // XP comes at 75% pace (XP_PACE), so levels take a little longer.
    expect(xpForAnswer({ format: 'multiple_choice', bloom: 'remember', score: 1, firstTry: true, combo: 1 })).toBe(11);
    expect(xpForAnswer({ format: 'multiple_choice', bloom: 'remember', score: 1, firstTry: false, combo: 10 })).toBe(15);
    expect(xpForAnswer({ format: 'multiple_choice', bloom: 'remember', score: 1, firstTry: false, combo: 1, boost: 50 })).toBe(15);
    expect(xpForAnswer({ format: 'explain', bloom: 'remember', score: 0, firstTry: true, combo: 3 })).toBe(0);
    expect(xpForAnswer({ format: 'explain', bloom: 'remember', score: 0.5, firstTry: true, combo: 1 })).toBe(8);
  });

  it('combo tiers', () => {
    expect([1, 3, 5, 10].map(comboMultiplier)).toEqual([1, 1.2, 1.5, 2]);
  });

  it('levels are monotonic and consistent', () => {
    expect(xpForLevel(1)).toBe(0);
    for (let l = 2; l < 60; l++) expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
    for (const xp of [0, 49, 50, 51, 1000, 123456]) {
      const lvl = levelFromXp(xp);
      expect(xpForLevel(lvl)).toBeLessThanOrEqual(xp);
      expect(xpForLevel(lvl + 1)).toBeGreaterThan(xp);
    }
    const p = levelProgress(75);
    expect(p.level).toBe(2);
    expect(p.ratio).toBeGreaterThan(0);
    expect(p.ratio).toBeLessThan(1);
  });

  it('level rewards give chests on milestones', () => {
    expect(levelUpRewards(10).chest).toBe('epic');
    expect(levelUpRewards(5).chest).toBe('rare');
    expect(levelUpRewards(3).chest).toBeUndefined();
  });
});
