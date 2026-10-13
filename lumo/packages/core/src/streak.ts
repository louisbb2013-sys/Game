import { DAY_MS, type Millis } from './types';

/** Calendar day (YYYY-MM-DD) in the learner's own time zone. */
export function dayKey(at: Millis, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Whole days between two day keys (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export interface StreakState {
  days: number;
  lastDay: string | null; // last day with completed study
  freezes: number; // owned streak freezes
  lost: { days: number; on: string } | null; // a broken streak that can still be repaired
}

export const STREAK_REPAIR_WINDOW_DAYS = 2;
export const MAX_FREEZES = 3;

export function newStreak(): StreakState {
  return { days: 0, lastDay: null, freezes: 0, lost: null };
}

export interface StreakUpdate {
  state: StreakState;
  extended: boolean;
  freezesUsed: number;
  broke: boolean;
}

/** Call when the learner completes a study session today. */
export function recordStudyDay(s: StreakState, today: string): StreakUpdate {
  if (s.lastDay === today) return { state: s, extended: false, freezesUsed: 0, broke: false };
  if (s.lastDay === null) {
    return { state: { ...s, days: 1, lastDay: today }, extended: true, freezesUsed: 0, broke: false };
  }
  const missed = daysBetween(s.lastDay, today) - 1;
  if (missed < 0) return { state: s, extended: false, freezesUsed: 0, broke: false }; // clock went backwards
  if (missed === 0) {
    return { state: { ...s, days: s.days + 1, lastDay: today }, extended: true, freezesUsed: 0, broke: false };
  }
  if (missed <= s.freezes) {
    return {
      state: { ...s, days: s.days + 1, lastDay: today, freezes: s.freezes - missed },
      extended: true,
      freezesUsed: missed,
      broke: false,
    };
  }
  return {
    state: { ...s, days: 1, lastDay: today, lost: s.days > 1 ? { days: s.days, on: today } : s.lost },
    extended: true,
    freezesUsed: 0,
    broke: s.days > 1,
  };
}

export type StreakStatus = 'none' | 'safe' | 'at_risk' | 'broken';

/** What to show on the home screen today (before or after studying). */
export function streakStatus(s: StreakState, today: string): StreakStatus {
  if (s.lastDay === null || s.days === 0) return 'none';
  const gap = daysBetween(s.lastDay, today);
  if (gap <= 0) return 'safe';
  if (gap - 1 <= s.freezes) return 'at_risk';
  return 'broken';
}

/** Restore a broken streak (paid with coins) if still within the repair window. */
export function canRepair(s: StreakState, today: string): boolean {
  return s.lost !== null && daysBetween(s.lost.on, today) <= STREAK_REPAIR_WINDOW_DAYS;
}

export function repairStreak(s: StreakState, today: string): StreakState {
  if (!canRepair(s, today) || !s.lost) return s;
  return { ...s, days: s.lost.days + s.days, lost: null };
}

export function addFreeze(s: StreakState, n = 1): StreakState {
  return { ...s, freezes: Math.min(MAX_FREEZES, s.freezes + n) };
}
