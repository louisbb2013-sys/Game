import { shuffle, type Rng } from '../rng';
import type { ChoiceQ, Opt, Question } from '../quiz/question';

/**
 * Live is played like Gizmo: every question is answered with one tap (A, B, C, D, or true/false).
 * Multiple choice keeps its own options (cut to four): their wrong answers were written for that
 * question, so they are tempting and never accidentally right. True/false stays true/false. Short
 * answers use the tempting wrong answers written with them; only when those are missing are wrong
 * answers borrowed from the deck's other short answers (the closest in length first).
 */

export const LIVE_CHOICES = 4;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The right answer when the question can be asked as a choice, with its own wrong options. */
function asChoice(q: Question): { prompt: string; right: Opt; wrong: Opt[]; notes?: Record<string, string>; tf?: Opt[]; borrow?: boolean } | null {
  switch (q.format) {
    case 'multiple_choice':
    case 'cause_effect': {
      const right = q.options.find((o) => o.id === q.correctId);
      return right ? { prompt: q.prompt, right, wrong: q.options.filter((o) => o.id !== q.correctId), notes: q.optionNotes } : null;
    }
    case 'true_false': {
      const right = q.options.find((o) => o.id === q.correctId);
      return right && q.options.length === 2 ? { prompt: q.prompt, right, wrong: q.options.filter((o) => o.id !== q.correctId), notes: q.optionNotes, tf: q.options } : null;
    }
    case 'type_answer':
      return q.accepted[0] ? { prompt: q.prompt, right: { id: 'c', text: q.accepted[0] }, wrong: (q.distractors ?? []).map((text, i) => ({ id: `d${i}`, text })), borrow: true } : null;
    case 'fill_blank': {
      const answer = q.blanks.length === 1 ? q.blanks[0]!.accepted[0] : undefined;
      return answer ? { prompt: `${q.prompt}\n${q.text}`, right: { id: 'c', text: answer }, wrong: [], borrow: true } : null;
    }
    default:
      return null;
  }
}

/**
 * The questions that can be played with one tap, in the same order. A question that can't reach
 * `min` options (true/false aside) is left out.
 */
export function toLiveChoices(questions: Question[], rng: Rng, min = 3): ChoiceQ[] {
  const parsed = questions.map((q) => ({ q, c: asChoice(q) }));
  // Short answers of the set, to borrow wrong answers from when a short answer has none of its own.
  const pool = new Map<string, string>();
  for (const { c } of parsed) for (const o of c?.borrow ? [c.right, ...c.wrong] : []) if (o.text.trim()) pool.set(norm(o.text), o.text.trim());
  const out: ChoiceQ[] = [];
  for (const { q, c } of parsed) {
    if (!c) continue;
    const base = { id: q.id, conceptId: q.conceptId, bloom: q.bloom, language: q.language, prompt: c.prompt, explanation: q.explanation, ...(q.context ? { context: q.context } : {}), variantKey: q.variantKey, ...(q.facts ? { facts: q.facts } : {}) };
    if (c.tf) {
      out.push({ ...base, format: 'true_false', options: c.tf, correctId: c.right.id, ...(c.notes ? { optionNotes: c.notes } : {}) });
      continue;
    }
    const taken = new Set([norm(c.right.text)]);
    const wrong = shuffle(c.wrong, rng)
      .filter((o) => !taken.has(norm(o.text)) && taken.add(norm(o.text)))
      .slice(0, LIVE_CHOICES - 1);
    if (c.borrow && wrong.length < LIVE_CHOICES - 1) {
      const len = c.right.text.length;
      const near = [...pool]
        .filter(([k]) => !taken.has(k))
        .sort((a, b) => Math.abs(a[1].length - len) - Math.abs(b[1].length - len))
        .slice(0, 8);
      for (const [k, text] of shuffle(near, rng)) {
        if (wrong.length >= LIVE_CHOICES - 1) break;
        taken.add(k);
        wrong.push({ id: `x${wrong.length}`, text });
      }
    }
    if (wrong.length + 1 < min) continue;
    const options = shuffle([c.right, ...wrong], rng);
    const notes = c.notes ? Object.fromEntries(Object.entries(c.notes).filter(([id]) => options.some((o) => o.id === id))) : undefined;
    out.push({ ...base, format: 'multiple_choice', options, correctId: c.right.id, ...(notes && Object.keys(notes).length ? { optionNotes: notes } : {}) });
  }
  return out;
}
