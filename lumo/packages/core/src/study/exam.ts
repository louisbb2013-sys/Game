import { BLOOM_LEVELS, type Bloom, type Format } from '../types';
import { PASS } from '../quiz/grade';

/** A mock exam uses every timed-friendly format; teach-back needs a conversation, so it stays in practice. */
export const EXAM_FORMATS: Format[] = [
  'multiple_choice',
  'true_false',
  'multiple_select',
  'type_answer',
  'fill_blank',
  'true_false_justify',
  'matching',
  'ordering',
  'categorize',
  'spot_mistake',
  'cause_effect',
  'calculation',
  'apply',
  'explain',
  'compare',
  'label_diagram',
];

/** About one minute per question, like many school tests. */
export const examTimeLimitMs = (questions: number) => questions * 60_000;

export interface ExamItem {
  conceptId: string;
  term: string;
  topic: string;
  format: Format;
  bloom: Bloom;
  score: number; // 0..1
}

export type Readiness = 'ready' | 'almost' | 'needs_work' | 'not_yet';
export type ExamAdvice = 'review_weak' | 'practice_thinking' | 'practice_basics' | 'watch_time' | 'mock_again' | 'keep_it_up';

export interface ExamReport {
  percent: number;
  correct: number;
  total: number;
  unanswered: number;
  readiness: Readiness;
  byTopic: { topic: string; percent: number; count: number }[];
  byBloom: { bloom: Bloom; percent: number; count: number }[];
  weakest: { conceptId: string; term: string; percent: number }[];
  strongest: string[]; // topics at 85%+
  timeMs: number;
  timeLimitMs: number;
  advice: ExamAdvice[];
}

const pct = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) : 0);

export function readinessFor(percent: number): Readiness {
  return percent >= 85 ? 'ready' : percent >= 70 ? 'almost' : percent >= 50 ? 'needs_work' : 'not_yet';
}

/** Turn exam answers into a report: overall score, where marks were lost, and what to do next. */
export function examReport(
  answered: readonly ExamItem[],
  timeMs: number,
  timeLimitMs: number,
  /** Questions left when time ran out: they count as zero, like on a real test. */
  unanswered: readonly Pick<ExamItem, 'conceptId' | 'term' | 'topic'>[] = [],
): ExamReport {
  const items: (ExamItem | (Pick<ExamItem, 'conceptId' | 'term' | 'topic' | 'score'> & { bloom?: undefined }))[] = [...answered, ...unanswered.map((u) => ({ ...u, score: 0 }))];
  const percent = pct(items.map((i) => i.score));
  const group = <K extends string>(key: (i: (typeof items)[number]) => K | undefined) => {
    const m = new Map<K, number[]>();
    for (const i of items) {
      const k = key(i);
      if (k !== undefined) m.set(k, [...(m.get(k) ?? []), i.score]);
    }
    return m;
  };
  const byTopic = [...group((i) => i.topic)].map(([topic, s]) => ({ topic, percent: pct(s), count: s.length })).sort((a, b) => a.percent - b.percent);
  const bloomMap = group((i) => i.bloom);
  const byBloom = BLOOM_LEVELS.filter((b) => bloomMap.has(b)).map((bloom) => ({ bloom, percent: pct(bloomMap.get(bloom)!), count: bloomMap.get(bloom)!.length }));
  const concepts = [...group((i) => i.conceptId)].map(([conceptId, s]) => ({ conceptId, term: items.find((i) => i.conceptId === conceptId)!.term, percent: pct(s) }));
  const weakest = concepts.filter((c) => c.percent < PASS * 100).sort((a, b) => a.percent - b.percent).slice(0, 5);

  const advice: ExamAdvice[] = [];
  if (weakest.length) advice.push('review_weak');
  const basics = byBloom.filter((b) => b.bloom === 'remember' || b.bloom === 'understand');
  const thinking = byBloom.filter((b) => b.bloom === 'apply' || b.bloom === 'analyze');
  const avg = (xs: { percent: number }[]) => (xs.length ? xs.reduce((a, b) => a + b.percent, 0) / xs.length : 100);
  if (avg(basics) < 70) advice.push('practice_basics');
  else if (avg(thinking) < 70) advice.push('practice_thinking');
  if (timeLimitMs > 0 && timeMs > timeLimitMs) advice.push('watch_time');
  if (unanswered.length && !advice.includes('watch_time')) advice.push('watch_time');
  advice.push(percent >= 85 ? 'keep_it_up' : 'mock_again');

  return {
    percent,
    correct: items.filter((i) => i.score >= PASS).length,
    total: items.length,
    unanswered: unanswered.length,
    readiness: readinessFor(percent),
    byTopic,
    byBloom,
    weakest,
    strongest: byTopic.filter((t) => t.percent >= 85).map((t) => t.topic),
    timeMs,
    timeLimitMs,
    advice,
  };
}
