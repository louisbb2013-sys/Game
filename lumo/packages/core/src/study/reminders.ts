import type { Millis } from '../types';

export interface ReminderSettings {
  enabled: boolean;
  time: string; // "HH:MM" in the learner's time zone
  days: number[]; // 0 = Sunday … 6 = Saturday
}

export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, time: '17:00', days: [0, 1, 2, 3, 4, 5, 6] };

export function localParts(at: Millis, timeZone: string): { day: string; weekday: number; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday!);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * Send at most one nudge a day, within an hour after the chosen time, and only if the learner
 * hasn't studied yet today. Never at night (21:00–08:00 local), which matters for younger learners.
 */
export function shouldRemind(r: ReminderSettings, at: Millis, timeZone: string, studiedToday: boolean, lastSentDay: string | null): boolean {
  if (!r.enabled || studiedToday) return false;
  const { day, weekday, minutes } = localParts(at, timeZone);
  if (lastSentDay === day || !r.days.includes(weekday)) return false;
  const [h, m] = r.time.split(':').map(Number);
  const target = h! * 60 + m!;
  if (minutes < 8 * 60 || minutes >= 21 * 60) return false;
  return minutes >= target && minutes < target + 60;
}
