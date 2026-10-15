import { ANSWER_KIND, correctAnswerText, type Answer, type Question } from './question';
import { gradeKeyPoints, matchesAccepted } from './text';

export interface GradeResult {
  score: number; // 0..1, partial credit allowed
  correct: boolean; // score >= PASS
  correctAnswer: string;
  explanation: string;
  /** Per-item feedback for structured formats (e.g. which pairs were right). */
  itemResults?: Record<string, boolean>;
  matchedPoints?: string[];
  missingPoints?: string[];
  feedback?: string; // personalised note (AI) — "why it was wrong"
  /** The misconception behind the wrong option the learner picked (multiple choice). */
  chosenNote?: string;
  followUp?: string; // teach-back: the curious student's next question
  gradedBy: 'local' | 'ai' | 'heuristic';
}

export const PASS = 0.8;

/** What open/justification parts a judge must look at. Null when the format is fully gradeable locally. */
export interface OpenGradeNeed {
  text: string;
  keyPoints: string[];
  minPoints: number;
  weight: number; // share of the total score
}

export function openPart(q: Question, a: Answer): OpenGradeNeed | null {
  if ((q.format === 'explain' || q.format === 'apply' || q.format === 'compare' || q.format === 'teach_back') && a.kind === 'text') {
    return { text: a.text, keyPoints: q.keyPoints, minPoints: q.minPoints, weight: 1 };
  }
  if (q.format === 'true_false_justify' && a.kind === 'tf') {
    return { text: a.justification, keyPoints: q.keyPoints, minPoints: 1, weight: 0.5 };
  }
  return null;
}

export interface OpenGrade {
  score: number;
  matchedPoints: string[];
  missingPoints: string[];
  feedback?: string;
  followUp?: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Grade an answer. Closed parts are graded deterministically here; for open parts
 * pass `open` (from the AI judge). Without it, a keyword heuristic is used.
 */
/** A short typed answer that didn't match word for word: a judge (Claude) may decide it means the same. */
export interface ShortCheck {
  key: string;
  given: string;
  expected: string[];
}

/**
 * Short answers worth a meaning check: typed, not empty, and not already accepted.
 * Keys: "0" for type_answer, the blank index for fill_blank, "fix" for a spot-the-mistake correction.
 */
export function shortAnswersToCheck(q: Question, a: Answer): ShortCheck[] {
  const out: ShortCheck[] = [];
  const add = (key: string, given: string, expected: string[]) => {
    if (given.trim() && given.length <= 200 && !matchesAccepted(given, expected)) out.push({ key, given: given.trim(), expected });
  };
  if (q.format === 'type_answer' && a.kind === 'text') add('0', a.text, q.accepted);
  if (q.format === 'fill_blank' && a.kind === 'blanks') q.blanks.forEach((b, i) => add(String(i), a.values[i] ?? '', b.accepted));
  if (q.format === 'spot_mistake' && a.kind === 'mistake' && a.segmentId === q.wrongId) add('fix', a.correction, q.correction);
  return out;
}

/** `meaning`: keys a judge accepted as meaning the same (from shortAnswersToCheck). */
export function grade(q: Question, a: Answer, open?: OpenGrade, meaning: Record<string, boolean> = {}): GradeResult {
  if (a.kind !== ANSWER_KIND[q.format]) {
    return finish(q, 0, 'local');
  }
  const need = openPart(q, a);
  const openGrade = need ? (open ?? heuristic(need)) : null;
  const by: GradeResult['gradedBy'] = need ? (open ? 'ai' : 'heuristic') : 'local';

  switch (q.format) {
    case 'multiple_choice':
    case 'true_false':
    case 'cause_effect': {
      const ok = a.kind === 'choice' && a.optionId === q.correctId;
      const note = !ok && a.kind === 'choice' ? q.optionNotes?.[a.optionId] : undefined;
      return { ...finish(q, ok ? 1 : 0, by), ...(note ? { chosenNote: note } : {}) };
    }
    case 'multiple_select': {
      if (a.kind !== 'multi') break;
      const chosen = new Set(a.optionIds);
      const right = q.correctIds.filter((id) => chosen.has(id)).length;
      const wrong = [...chosen].filter((id) => !q.correctIds.includes(id)).length;
      const items = Object.fromEntries(q.options.map((o) => [o.id, chosen.has(o.id) === q.correctIds.includes(o.id)]));
      return { ...finish(q, clamp01((right - wrong) / q.correctIds.length), by), itemResults: items };
    }
    case 'type_answer': {
      if (a.kind !== 'text') break;
      return finish(q, matchesAccepted(a.text, q.accepted) || meaning['0'] ? 1 : 0, by);
    }
    case 'fill_blank': {
      if (a.kind !== 'blanks') break;
      const items: Record<string, boolean> = {};
      q.blanks.forEach((b, i) => (items[String(i)] = matchesAccepted(a.values[i] ?? '', b.accepted) || !!meaning[String(i)]));
      const n = Object.values(items).filter(Boolean).length;
      return { ...finish(q, n / q.blanks.length, by), itemResults: items };
    }
    case 'true_false_justify': {
      if (a.kind !== 'tf' || !openGrade) break;
      // The verdict must be right for the justification to count.
      const verdict = a.value === q.isTrue;
      const score = verdict ? 0.5 + 0.5 * openGrade.score : 0;
      return withOpen(finish(q, score, by), openGrade);
    }
    case 'matching':
    case 'categorize':
    case 'label_diagram': {
      if (a.kind !== 'pairs') break;
      const key = q.format === 'matching' ? q.pairs : q.mapping;
      const items = Object.fromEntries(Object.entries(key).map(([k, v]) => [k, a.pairs[k] === v]));
      const n = Object.values(items).filter(Boolean).length;
      return { ...finish(q, n / Object.keys(key).length, by), itemResults: items };
    }
    case 'ordering': {
      if (a.kind !== 'order') break;
      return finish(q, orderingScore(q.correctOrder, a.order), by);
    }
    case 'spot_mistake': {
      if (a.kind !== 'mistake') break;
      const found = a.segmentId === q.wrongId;
      const fixed = found && (matchesAccepted(a.correction, q.correction) || !!meaning.fix);
      return finish(q, (found ? 0.7 : 0) + (fixed ? 0.3 : 0), by);
    }
    case 'calculation': {
      if (a.kind !== 'number' || !Number.isFinite(a.value)) break;
      const err = q.answer === 0 ? Math.abs(a.value) : Math.abs(a.value - q.answer) / Math.abs(q.answer);
      return finish(q, err <= q.tolerance ? 1 : 0, by);
    }
    case 'explain':
    case 'apply':
    case 'compare':
    case 'teach_back': {
      if (!openGrade) break;
      return withOpen(finish(q, openGrade.score, by), openGrade);
    }
  }
  return finish(q, 0, by);
}

function heuristic(need: OpenGradeNeed): OpenGrade {
  const m = gradeKeyPoints(need.text, need.keyPoints, need.minPoints);
  return { score: m.score, matchedPoints: m.matched, missingPoints: m.missing };
}

function withOpen(r: GradeResult, o: OpenGrade): GradeResult {
  return { ...r, matchedPoints: o.matchedPoints, missingPoints: o.missingPoints, feedback: o.feedback, followUp: o.followUp };
}

function finish(q: Question, score: number, gradedBy: GradeResult['gradedBy']): GradeResult {
  const s = Math.round(clamp01(score) * 100) / 100;
  return { score: s, correct: s >= PASS, correctAnswer: correctAnswerText(q), explanation: q.explanation, gradedBy };
}

/** Full credit only for the exact order; otherwise partial credit for pairs kept in the right relative order. */
export function orderingScore(correct: readonly string[], given: readonly string[]): number {
  if (correct.length !== given.length || new Set(given).size !== given.length) return 0;
  if (correct.every((id, i) => given[i] === id)) return 1;
  const pos = new Map(given.map((id, i) => [id, i]));
  let concordant = 0;
  let total = 0;
  for (let i = 0; i < correct.length; i++) {
    for (let j = i + 1; j < correct.length; j++) {
      total++;
      if ((pos.get(correct[i]!) ?? -1) < (pos.get(correct[j]!) ?? -1)) concordant++;
    }
  }
  return Math.max(0, (2 * concordant - total) / total) * 0.75;
}
