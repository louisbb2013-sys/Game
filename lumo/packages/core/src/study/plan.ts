import { daysBetween } from '../streak';
import type { MasteryBand } from '../mastery';

/**
 * Study plan up to an exam: learn what's new early, revisit it with growing gaps (1, 3, 7 days),
 * take a mock exam two days before, and keep the last day light.
 */

export interface PlanConcept {
  id: string;
  band: MasteryBand;
  due: boolean;
}

export type PlanTask = { kind: 'learn'; count: number } | { kind: 'fix'; count: number } | { kind: 'review'; count: number } | { kind: 'mock_exam' } | { kind: 'light_review' };

export interface PlanDay {
  day: string;
  tasks: PlanTask[];
  minutes: number;
  /** Concepts to focus on that day (new or weak ones first). */
  focus: string[];
}

export interface StudyPlan {
  examDay: string;
  daysLeft: number;
  days: PlanDay[];
  onTrack: boolean;
  /** Minutes per day the plan really needs at its busiest. */
  peakMinutes: number;
}

const MIN_PER_QUESTION = 0.75;
const MOCK_MINUTES = 15;
const SPACING = [1, 3, 7];

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function buildStudyPlan(input: { today: string; examDay: string; concepts: readonly PlanConcept[]; minutesPerDay: number }): StudyPlan {
  const { today, examDay, concepts, minutesPerDay } = input;
  const daysLeft = daysBetween(today, examDay);
  if (daysLeft <= 0) {
    // Exam today (or past): one calm review of what's shaky.
    const focus = concepts.filter((c) => c.band !== 'mastered').map((c) => c.id);
    const day: PlanDay = { day: today, tasks: [{ kind: 'light_review' }], minutes: 10, focus: focus.slice(0, 10) };
    return { examDay, daysLeft: Math.max(0, daysLeft), days: daysLeft === 0 ? [day] : [], onTrack: true, peakMinutes: 10 };
  }

  const study = Array.from({ length: daysLeft }, (_, i) => addDays(today, i)); // exam day itself is not a study day
  const lastDay = study.length >= 2 ? study[study.length - 1]! : null;
  const mockDay = study.length >= 4 ? study[study.length - 2]! : null;
  let learnDays = study.filter((d) => d !== lastDay && d !== mockDay);
  if (learnDays.length === 0) learnDays = [study[0]!];

  const fix = concepts.filter((c) => c.band === 'learning');
  const fresh = concepts.filter((c) => c.band === 'new');
  const toLearn = [...fix.map((c) => ({ c, kind: 'fix' as const })), ...fresh.map((c) => ({ c, kind: 'learn' as const }))];
  const perDay = Math.ceil(toLearn.length / learnDays.length);

  const days = new Map<string, { learn: number; fix: number; review: Set<string>; focus: string[] }>(study.map((d) => [d, { learn: 0, fix: 0, review: new Set(), focus: [] }]));
  // Already-known concepts that are due get reviewed today.
  for (const c of concepts) if (c.due && c.band !== 'new' && c.band !== 'learning') days.get(today)!.review.add(c.id);

  toLearn.forEach((x, i) => {
    const day = learnDays[Math.min(learnDays.length - 1, Math.floor(i / Math.max(1, perDay)))]!;
    const slot = days.get(day)!;
    slot[x.kind] += 1;
    slot.focus.push(x.c.id);
    for (const gap of SPACING) {
      const later = days.get(addDays(day, gap));
      if (later && addDays(day, gap) !== mockDay) later.review.add(x.c.id);
    }
  });

  const out: PlanDay[] = study.map((day) => {
    const s = days.get(day)!;
    const tasks: PlanTask[] = [];
    if (day === mockDay) tasks.push({ kind: 'mock_exam' });
    else if (day === lastDay) tasks.push({ kind: 'light_review' });
    if (s.fix) tasks.push({ kind: 'fix', count: s.fix });
    if (s.learn) tasks.push({ kind: 'learn', count: s.learn });
    const reviews = [...s.review].filter((id) => !s.focus.includes(id));
    if (reviews.length && day !== mockDay && day !== lastDay) tasks.push({ kind: 'review', count: reviews.length });
    const questions = s.learn + s.fix + (day === mockDay || day === lastDay ? 0 : reviews.length);
    const minutes = Math.ceil(questions * MIN_PER_QUESTION + (day === mockDay ? MOCK_MINUTES : 0) + (day === lastDay ? 10 : 0));
    if (tasks.length === 0) tasks.push({ kind: 'light_review' });
    return { day, tasks, minutes: Math.max(minutes, 5), focus: [...s.focus, ...reviews].slice(0, 20) };
  });

  const peakMinutes = Math.max(...out.map((d) => d.minutes));
  return { examDay, daysLeft, days: out, onTrack: peakMinutes <= Math.max(5, minutesPerDay) * 1.25, peakMinutes };
}

/** How many questions today's plan means, to start a matching session. */
export function questionsFor(day: PlanDay): number {
  let n = 0;
  for (const t of day.tasks) {
    if (t.kind === 'learn' || t.kind === 'fix' || t.kind === 'review') n += t.count;
    if (t.kind === 'light_review') n += 8;
  }
  return Math.min(40, Math.max(5, n));
}
