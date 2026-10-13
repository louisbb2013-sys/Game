import { describe, expect, it } from 'vitest';
import { formGroups, leagueReward, nextTier, rankGroup, weekEndsAt, weekId, zoneSizes } from '../src';

describe('leagues', () => {
  it('computes ISO weeks and week end', () => {
    expect(weekId(Date.UTC(2026, 9, 13))).toBe('2026-W42');
    expect(weekId(Date.UTC(2027, 0, 1))).toBe('2026-W53');
    expect(new Date(weekEndsAt(Date.UTC(2026, 9, 13, 15))).toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(new Date(weekEndsAt(Date.UTC(2026, 9, 18, 23))).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  it('zones: 7 up / 5 down for 30, none up at diamond, none down at bronze', () => {
    expect(zoneSizes(30, 'gold')).toEqual({ promote: 7, demote: 5 });
    expect(zoneSizes(30, 'diamond').promote).toBe(0);
    expect(zoneSizes(30, 'bronze').demote).toBe(0);
    expect(zoneSizes(3, 'gold')).toEqual({ promote: 1, demote: 0 });
  });

  it('ranks, breaks ties by who got there first, and assigns zones', () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({ userId: `u${i}`, weeklyXp: 1000 - i * 10, lastXpAt: i }));
    entries.push({ userId: 'tie', weeklyXp: 1000, lastXpAt: -1 });
    const ranked = rankGroup(entries.slice(1), 'silver');
    expect(ranked[0]!.userId).toBe('tie');
    expect(ranked.filter((r) => r.zone === 'promoted')).toHaveLength(7);
    expect(ranked.filter((r) => r.zone === 'demoted')).toHaveLength(5);
    expect(ranked.at(-1)!.zone).toBe('demoted');
  });

  it('inactive players are never promoted', () => {
    const ranked = rankGroup([{ userId: 'a', weeklyXp: 0, lastXpAt: 0 }, { userId: 'b', weeklyXp: 0, lastXpAt: 1 }], 'bronze');
    expect(ranked.every((r) => r.zone === 'stayed')).toBe(true);
    const silver = rankGroup([{ userId: 'a', weeklyXp: 5, lastXpAt: 0 }, { userId: 'b', weeklyXp: 0, lastXpAt: 1 }], 'silver');
    expect(silver.map((r) => r.zone)).toEqual(['promoted', 'demoted']);
  });

  it('moves tiers and forms balanced groups', () => {
    expect(nextTier('bronze', 'demoted')).toBe('bronze');
    expect(nextTier('bronze', 'promoted')).toBe('silver');
    expect(nextTier('diamond', 'promoted')).toBe('diamond');
    const groups = formGroups(Array.from({ length: 61 }, (_, i) => i));
    expect(groups.map((g) => g.length)).toEqual([21, 20, 20]);
    expect(leagueReward(1).chest).toBe('epic');
  });
});
