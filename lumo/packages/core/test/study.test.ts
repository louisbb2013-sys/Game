import { describe, expect, it } from 'vitest';
import { addDays, buildStudyPlan, examReport, localParts, offlineXp, questionsFor, shouldRemind, type ExamItem, type PlanConcept } from '../src';

const item = (conceptId: string, topic: string, bloom: ExamItem['bloom'], score: number): ExamItem => ({ conceptId, term: conceptId.toUpperCase(), topic, format: 'multiple_choice', bloom, score });

describe('exam report', () => {
  it('scores, groups by topic and thinking level, finds weak spots', () => {
    const r = examReport(
      [item('a', 'Cells', 'remember', 1), item('b', 'Cells', 'understand', 1), item('c', 'Energy', 'apply', 0), item('d', 'Energy', 'analyze', 0.4), item('e', 'Cells', 'remember', 1)],
      6 * 60_000,
      5 * 60_000,
    );
    expect(r.percent).toBe(68);
    expect(r.correct).toBe(3);
    expect(r.readiness).toBe('needs_work');
    expect(r.byTopic[0]).toEqual({ topic: 'Energy', percent: 20, count: 2 });
    expect(r.strongest).toEqual(['Cells']);
    expect(r.weakest.map((w) => w.conceptId)).toEqual(['c', 'd']);
    expect(r.advice).toEqual(['review_weak', 'practice_thinking', 'watch_time', 'mock_again']);
  });

  it('unanswered questions count as zero', () => {
    const r = examReport([item('a', 'X', 'remember', 1)], 1000, 120_000, [{ conceptId: 'b', term: 'B', topic: 'Y' }]);
    expect(r.percent).toBe(50);
    expect(r.total).toBe(2);
    expect(r.unanswered).toBe(1);
    expect(r.byBloom).toEqual([{ bloom: 'remember', percent: 100, count: 1 }]);
    expect(r.weakest[0]!.conceptId).toBe('b');
    expect(r.advice).toContain('watch_time');
  });

  it('a strong exam says keep it up', () => {
    const r = examReport([item('a', 'X', 'apply', 1), item('b', 'X', 'remember', 0.9)], 1000, 120_000);
    expect(r.readiness).toBe('ready');
    expect(r.advice).toEqual(['keep_it_up']);
  });
});

describe('study plan', () => {
  const concepts: PlanConcept[] = [
    ...Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, band: 'new' as const, due: false })),
    { id: 'w1', band: 'learning', due: true },
    { id: 'm1', band: 'mastered', due: true },
  ];

  it('spreads new ideas, spaces reviews, mock exam 2 days before, light last day', () => {
    const p = buildStudyPlan({ today: '2026-10-13', examDay: '2026-10-20', concepts, minutesPerDay: 20 });
    expect(p.daysLeft).toBe(7);
    expect(p.days.map((d) => d.day)).toEqual(Array.from({ length: 7 }, (_, i) => addDays('2026-10-13', i)));
    expect(p.days[5]!.tasks[0]).toEqual({ kind: 'mock_exam' });
    expect(p.days[6]!.tasks[0]).toEqual({ kind: 'light_review' });
    // weak concept first, all new + weak concepts scheduled before the mock exam
    expect(p.days[0]!.tasks).toContainEqual({ kind: 'fix', count: 1 });
    const learned = p.days.flatMap((d) => d.tasks).reduce((n, t) => n + (t.kind === 'learn' || t.kind === 'fix' ? t.count : 0), 0);
    expect(learned).toBe(13);
    // day-1 concepts come back the next day
    expect(p.days[1]!.tasks.some((t) => t.kind === 'review')).toBe(true);
    expect(p.onTrack).toBe(true);
    expect(questionsFor(p.days[0]!)).toBeGreaterThanOrEqual(5);
  });

  it('flags a plan that does not fit the time available', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, band: 'new' as const, due: false }));
    expect(buildStudyPlan({ today: '2026-10-13', examDay: '2026-10-15', concepts: many, minutesPerDay: 10 }).onTrack).toBe(false);
  });

  it('exam today or past', () => {
    expect(buildStudyPlan({ today: '2026-10-13', examDay: '2026-10-13', concepts, minutesPerDay: 20 }).days).toHaveLength(1);
    expect(buildStudyPlan({ today: '2026-10-13', examDay: '2026-10-01', concepts, minutesPerDay: 20 }).days).toHaveLength(0);
  });
});

describe('reminders', () => {
  const r = { enabled: true, time: '17:00', days: [0, 1, 2, 3, 4, 5, 6] };
  const at = (iso: string) => Date.parse(iso);
  it('reads local time in the learner time zone', () => {
    expect(localParts(at('2026-10-13T15:30:00Z'), 'Europe/Paris')).toEqual({ day: '2026-10-13', weekday: 2, minutes: 17 * 60 + 30 });
  });
  it('once a day, in the hour after the chosen time, only if not studied', () => {
    const t = at('2026-10-13T15:10:00Z'); // 17:10 Paris
    expect(shouldRemind(r, t, 'Europe/Paris', false, null)).toBe(true);
    expect(shouldRemind(r, t, 'Europe/Paris', true, null)).toBe(false);
    expect(shouldRemind(r, t, 'Europe/Paris', false, '2026-10-13')).toBe(false);
    expect(shouldRemind(r, at('2026-10-13T14:50:00Z'), 'Europe/Paris', false, null)).toBe(false);
    expect(shouldRemind({ ...r, days: [1] }, t, 'Europe/Paris', false, null)).toBe(false);
    expect(shouldRemind({ ...r, enabled: false }, t, 'Europe/Paris', false, null)).toBe(false);
  });
  it('never at night', () => {
    expect(shouldRemind({ ...r, time: '22:00' }, at('2026-10-13T20:10:00Z'), 'Europe/Paris', false, null)).toBe(false);
  });
  it('offline XP is capped', () => {
    expect(offlineXp(5)).toBe(10);
    expect(offlineXp(500)).toBe(60);
  });
});
