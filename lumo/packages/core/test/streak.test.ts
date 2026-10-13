import { describe, expect, it } from 'vitest';
import { addFreeze, canRepair, dayKey, newStreak, recordStudyDay, repairStreak, streakStatus } from '../src';

describe('streak', () => {
  it('uses the learner time zone', () => {
    const at = Date.UTC(2026, 9, 13, 2, 0); // 02:00 UTC = 22:00 previous day in Montreal
    expect(dayKey(at, 'UTC')).toBe('2026-10-13');
    expect(dayKey(at, 'America/Toronto')).toBe('2026-10-12');
  });

  it('extends on consecutive days, not twice per day', () => {
    let s = recordStudyDay(newStreak(), '2026-10-10').state;
    s = recordStudyDay(s, '2026-10-11').state;
    const again = recordStudyDay(s, '2026-10-11');
    expect(again.extended).toBe(false);
    expect(again.state.days).toBe(2);
  });

  it('freezes cover missed days', () => {
    let s = addFreeze(recordStudyDay(newStreak(), '2026-10-10').state, 2);
    expect(streakStatus(s, '2026-10-12')).toBe('at_risk');
    const u = recordStudyDay(s, '2026-10-13');
    expect(u.freezesUsed).toBe(2);
    expect(u.state.days).toBe(2);
    expect(u.state.freezes).toBe(0);
    s = u.state;
    expect(streakStatus(s, '2026-10-13')).toBe('safe');
  });

  it('breaks without freezes and can be repaired within the window', () => {
    let s = newStreak();
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) s = recordStudyDay(s, d).state;
    expect(streakStatus(s, '2026-10-06')).toBe('broken');
    const u = recordStudyDay(s, '2026-10-06');
    expect(u.broke).toBe(true);
    expect(u.state.days).toBe(1);
    expect(canRepair(u.state, '2026-10-07')).toBe(true);
    expect(repairStreak(u.state, '2026-10-07').days).toBe(4);
    expect(canRepair(u.state, '2026-10-09')).toBe(false);
  });

  it('caps freezes', () => {
    expect(addFreeze(newStreak(), 10).freezes).toBe(3);
  });
});
