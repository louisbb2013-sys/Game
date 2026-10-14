import { seededRng, shuffle } from '../rng';
import type { Bloom, Format, Locale } from '../types';
import { makeId } from './generate';
import { computeVariantKey, correctAnswerText, type Question } from './question';
import { z } from 'zod';

/**
 * LLM-facing shapes for each format: plain strings and indexes (easy for a model to
 * produce), which we turn into a Question with ids, shuffled options and an answer key.
 * Array sizes are checked here rather than in the JSON schema.
 */
const explanation = z.string().describe('1-2 kind sentences explaining WHY the answer is right, for a student who got it wrong');

export const DRAFT_SCHEMAS = {
  choice: z.object({ prompt: z.string(), options: z.array(z.string()).describe('4 options'), correctIndex: z.number().int(), explanation }),
  multi: z.object({ prompt: z.string(), options: z.array(z.string()).describe('5 options'), correctIndexes: z.array(z.number().int()), explanation }),
  typed: z.object({ prompt: z.string(), accepted: z.array(z.string()).describe('all acceptable short answers'), explanation }),
  fill: z.object({
    prompt: z.string(),
    text: z.string().describe('sentence with each blank written as ___'),
    blanks: z.array(z.array(z.string())).describe('for each ___ in order, the acceptable answers'),
    explanation,
  }),
  open: z.object({ prompt: z.string(), keyPoints: z.array(z.string()).describe('2-4 key ideas a good answer must contain'), modelAnswer: z.string(), explanation }),
  tf: z.object({ prompt: z.string(), statement: z.string(), isTrue: z.boolean(), keyPoints: z.array(z.string()).describe('what a correct justification mentions'), explanation }),
  matching: z.object({ prompt: z.string(), pairs: z.array(z.object({ left: z.string(), right: z.string() })).describe('3-5 pairs'), explanation }),
  ordering: z.object({ prompt: z.string(), stepsInOrder: z.array(z.string()).describe('3-6 steps in the CORRECT order'), explanation }),
  categorize: z.object({ prompt: z.string(), categories: z.array(z.object({ name: z.string(), items: z.array(z.string()) })).describe('2-3 categories, 2-3 items each'), explanation }),
  mistake: z.object({
    prompt: z.string(),
    segments: z.array(z.string()).describe('the statement or solution split into 3-6 parts, exactly one of which is wrong'),
    wrongIndex: z.number().int(),
    corrections: z.array(z.string()).describe('acceptable corrections for the wrong part'),
    explanation,
  }),
  calc: z.object({
    prompt: z.string(),
    given: z.array(z.object({ symbol: z.string(), name: z.string(), value: z.number(), unit: z.string() })),
    answer: z.number(),
    unit: z.string(),
    steps: z.array(z.string()).describe('worked solution, one step per line'),
    explanation,
  }),
} as const;

export type DraftKind = keyof typeof DRAFT_SCHEMAS;

export const DRAFT_KIND: Partial<Record<Format, DraftKind>> = {
  multiple_choice: 'choice',
  cause_effect: 'choice',
  multiple_select: 'multi',
  type_answer: 'typed',
  fill_blank: 'fill',
  explain: 'open',
  apply: 'open',
  compare: 'open',
  teach_back: 'open',
  true_false_justify: 'tf',
  matching: 'matching',
  ordering: 'ordering',
  categorize: 'categorize',
  spot_mistake: 'mistake',
  calculation: 'calc',
  // label_diagram needs a real image with known positions: always built locally.
};

const nonEmpty = (s: string) => s.trim().length > 0;
const uniq = (xs: string[]) => new Set(xs.map((x) => x.trim().toLowerCase())).size === xs.length;

/** Validate a draft and turn it into a Question. Returns null if the draft is unusable. */
export function buildQuestion(
  draft: unknown,
  meta: { conceptId: string; format: Format; bloom: Bloom; language: Locale; seed: number },
): Question | null {
  const kind = DRAFT_KIND[meta.format];
  if (!kind) return null;
  const parsed = DRAFT_SCHEMAS[kind].safeParse(draft);
  if (!parsed.success) return null;
  const d = parsed.data;
  const rng = seededRng(meta.seed);
  const opt = (text: string) => ({ id: makeId(rng, 'o'), text: text.trim() });
  if (!nonEmpty(d.prompt) || !nonEmpty(d.explanation)) return null;
  const base = { id: makeId(rng, 'q'), conceptId: meta.conceptId, format: meta.format, bloom: meta.bloom, language: meta.language, prompt: d.prompt.trim(), explanation: d.explanation.trim(), variantKey: '' };
  let q: Question;

  switch (kind) {
    case 'choice': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.choice>;
      if (c.options.length < 3 || c.options.length > 5 || !uniq(c.options) || !c.options.every(nonEmpty) || !c.options[c.correctIndex]) return null;
      const options = c.options.map(opt);
      const correctId = options[c.correctIndex]!.id;
      q = { ...base, format: meta.format as 'multiple_choice', options: shuffle(options, rng), correctId };
      break;
    }
    case 'multi': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.multi>;
      const idx = [...new Set(c.correctIndexes)];
      if (c.options.length < 4 || !uniq(c.options) || idx.length < 2 || idx.length >= c.options.length || idx.some((i) => !c.options[i])) return null;
      const options = c.options.map(opt);
      q = { ...base, format: 'multiple_select', options: shuffle(options, rng), correctIds: idx.map((i) => options[i]!.id) };
      break;
    }
    case 'typed': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.typed>;
      const accepted = c.accepted.filter(nonEmpty);
      if (accepted.length === 0 || accepted.some((a) => a.split(/\s+/).length > 5)) return null;
      q = { ...base, format: 'type_answer', accepted };
      break;
    }
    case 'fill': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.fill>;
      const count = c.text.split('___').length - 1;
      if (count < 1 || count !== c.blanks.length || c.blanks.some((b) => b.filter(nonEmpty).length === 0)) return null;
      q = { ...base, format: 'fill_blank', text: c.text, blanks: c.blanks.map((b) => ({ accepted: b.filter(nonEmpty) })) };
      break;
    }
    case 'open': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.open>;
      const keyPoints = c.keyPoints.filter(nonEmpty);
      if (keyPoints.length < 1 || !nonEmpty(c.modelAnswer)) return null;
      q = { ...base, format: meta.format as 'explain', keyPoints, modelAnswer: c.modelAnswer, minPoints: Math.min(keyPoints.length, meta.format === 'compare' ? 2 : meta.bloom === 'analyze' ? 3 : 2) };
      break;
    }
    case 'tf': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.tf>;
      const keyPoints = c.keyPoints.filter(nonEmpty);
      if (!nonEmpty(c.statement) || keyPoints.length === 0) return null;
      q = { ...base, format: 'true_false_justify', statement: c.statement, isTrue: c.isTrue, keyPoints };
      break;
    }
    case 'matching': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.matching>;
      if (c.pairs.length < 3 || c.pairs.length > 6 || !uniq(c.pairs.map((p) => p.left)) || !uniq(c.pairs.map((p) => p.right))) return null;
      const left = c.pairs.map((p) => opt(p.left));
      const right = c.pairs.map((p) => opt(p.right));
      q = { ...base, format: 'matching', left: shuffle(left, rng), right: shuffle(right, rng), pairs: Object.fromEntries(left.map((l, i) => [l.id, right[i]!.id])) };
      break;
    }
    case 'ordering': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.ordering>;
      if (c.stepsInOrder.length < 3 || c.stepsInOrder.length > 8 || !uniq(c.stepsInOrder)) return null;
      const items = c.stepsInOrder.map(opt);
      let shown = shuffle(items, rng);
      for (let k = 0; k < 5 && shown.every((s, j) => s.id === items[j]!.id); k++) shown = shuffle(items, rng);
      q = { ...base, format: 'ordering', items: shown, correctOrder: items.map((i) => i.id) };
      break;
    }
    case 'categorize': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.categorize>;
      const all = c.categories.flatMap((g) => g.items);
      if (c.categories.length < 2 || all.length < 3 || !uniq(all) || c.categories.some((g) => g.items.length === 0)) return null;
      const categories = c.categories.map((g) => opt(g.name));
      const items: { id: string; text: string }[] = [];
      const mapping: Record<string, string> = {};
      c.categories.forEach((g, gi) => g.items.forEach((t) => { const o = opt(t); items.push(o); mapping[o.id] = categories[gi]!.id; }));
      q = { ...base, format: 'categorize', categories, items: shuffle(items, rng), mapping };
      break;
    }
    case 'mistake': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.mistake>;
      if (c.segments.length < 2 || !c.segments[c.wrongIndex] || c.corrections.filter(nonEmpty).length === 0) return null;
      const segments = c.segments.map(opt);
      q = { ...base, format: 'spot_mistake', segments, wrongId: segments[c.wrongIndex]!.id, correction: c.corrections.filter(nonEmpty) };
      break;
    }
    case 'calc': {
      const c = d as z.infer<typeof DRAFT_SCHEMAS.calc>;
      if (!Number.isFinite(c.answer) || c.given.length === 0 || c.steps.length === 0) return null;
      q = { ...base, format: 'calculation', given: c.given.map((g) => ({ ...g, unit: g.unit || undefined })), answer: c.answer, unit: c.unit || undefined, tolerance: 0.02, steps: c.steps, explanation: [...c.steps, d.explanation.trim()].join('\n') };
      break;
    }
  }
  q.variantKey = computeVariantKey(q);
  // Sanity: the answer key must render (catches internal inconsistencies).
  if (!correctAnswerText(q)) return null;
  return q;
}
