import type { Bloom, Format, Locale } from '../types';
import { hashString } from '../rng';

export interface Opt {
  id: string;
  text: string;
}

interface Base<F extends Format> {
  id: string;
  conceptId: string;
  format: F;
  bloom: Bloom;
  language: Locale;
  prompt: string;
  /** Shown after answering: kind, short, explains *why*. */
  explanation: string;
  /** A scenario, excerpt, quote or small table the question works on (shown above it, like a test document). */
  context?: string;
  /** Fingerprint of this exact wording/options, used to avoid repeats. */
  variantKey: string;
}

export interface ChoiceQ extends Base<'multiple_choice' | 'cause_effect' | 'true_false'> {
  options: Opt[];
  correctId: string;
  /** Why each wrong option is wrong (option id -> the misconception behind it), shown when it's picked. */
  optionNotes?: Record<string, string>;
}
export interface MultiSelectQ extends Base<'multiple_select'> {
  options: Opt[];
  correctIds: string[];
}
export interface TypeAnswerQ extends Base<'type_answer'> {
  accepted: string[];
}
export interface FillBlankQ extends Base<'fill_blank'> {
  /** Text with "___" marking each blank, in order. */
  text: string;
  blanks: { accepted: string[] }[];
}
export interface OpenQ extends Base<'explain' | 'apply' | 'compare' | 'teach_back'> {
  keyPoints: string[];
  modelAnswer: string;
  minPoints: number;
}
export interface TrueFalseQ extends Base<'true_false_justify'> {
  statement: string;
  isTrue: boolean;
  keyPoints: string[]; // what a good justification mentions
}
export interface MatchingQ extends Base<'matching'> {
  left: Opt[];
  right: Opt[];
  pairs: Record<string, string>; // leftId -> rightId
}
export interface OrderingQ extends Base<'ordering'> {
  items: Opt[]; // shown shuffled
  correctOrder: string[];
}
export interface CategorizeQ extends Base<'categorize'> {
  categories: Opt[];
  items: Opt[];
  mapping: Record<string, string>; // itemId -> categoryId
}
export interface LabelDiagramQ extends Base<'label_diagram'> {
  imageUrl: string;
  spots: { id: string; x: number; y: number }[]; // x/y in % of the image
  labels: Opt[];
  mapping: Record<string, string>; // spotId -> labelId
}
export interface SpotMistakeQ extends Base<'spot_mistake'> {
  segments: Opt[];
  wrongId: string;
  correction: string[]; // accepted corrections
}
export interface CalculationQ extends Base<'calculation'> {
  given: { symbol: string; name: string; value: number; unit?: string }[];
  answer: number;
  unit?: string;
  tolerance: number; // relative, e.g. 0.02
  steps: string[];
}

export type Question =
  | ChoiceQ
  | MultiSelectQ
  | TypeAnswerQ
  | FillBlankQ
  | OpenQ
  | TrueFalseQ
  | MatchingQ
  | OrderingQ
  | CategorizeQ
  | LabelDiagramQ
  | SpotMistakeQ
  | CalculationQ;

export type Answer =
  | { kind: 'choice'; optionId: string }
  | { kind: 'multi'; optionIds: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'blanks'; values: string[] }
  | { kind: 'tf'; value: boolean; justification: string }
  | { kind: 'pairs'; pairs: Record<string, string> }
  | { kind: 'order'; order: string[] }
  | { kind: 'mistake'; segmentId: string; correction: string }
  | { kind: 'number'; value: number; work?: string };

export const ANSWER_KIND: Record<Format, Answer['kind']> = {
  multiple_choice: 'choice',
  true_false: 'choice',
  cause_effect: 'choice',
  multiple_select: 'multi',
  type_answer: 'text',
  explain: 'text',
  apply: 'text',
  compare: 'text',
  teach_back: 'text',
  fill_blank: 'blanks',
  true_false_justify: 'tf',
  matching: 'pairs',
  categorize: 'pairs',
  label_diagram: 'pairs',
  ordering: 'order',
  spot_mistake: 'mistake',
  calculation: 'number',
};

/** Formats whose grading needs judgment (AI when available, keyword heuristic offline). */
export const OPEN_FORMATS: readonly Format[] = ['explain', 'apply', 'compare', 'teach_back'];

/**
 * The question as sent to the learner before answering: every answer key is stripped,
 * so the client cannot read the solution (grading is server-side).
 */
export type PublicQuestion = {
  id: string;
  conceptId: string;
  format: Format;
  bloom: Bloom;
  language: Locale;
  prompt: string;
  context?: string;
  options?: Opt[];
  multi?: boolean;
  text?: string;
  blankCount?: number;
  statement?: string;
  left?: Opt[];
  right?: Opt[];
  items?: Opt[];
  categories?: Opt[];
  imageUrl?: string;
  spots?: { id: string; x: number; y: number }[];
  labels?: Opt[];
  segments?: Opt[];
  given?: { symbol: string; name: string; value: number; unit?: string }[];
  unit?: string;
};

export function publicQuestion(q: Question): PublicQuestion {
  const base: PublicQuestion = { id: q.id, conceptId: q.conceptId, format: q.format, bloom: q.bloom, language: q.language, prompt: q.prompt, ...(q.context ? { context: q.context } : {}) };
  switch (q.format) {
    case 'multiple_choice':
    case 'true_false':
    case 'cause_effect':
      return { ...base, options: q.options };
    case 'multiple_select':
      return { ...base, options: q.options, multi: true };
    case 'fill_blank':
      return { ...base, text: q.text, blankCount: q.blanks.length };
    case 'true_false_justify':
      return { ...base, statement: q.statement };
    case 'matching':
      return { ...base, left: q.left, right: q.right };
    case 'ordering':
      return { ...base, items: q.items };
    case 'categorize':
      return { ...base, categories: q.categories, items: q.items };
    case 'label_diagram':
      return { ...base, imageUrl: q.imageUrl, spots: q.spots, labels: q.labels };
    case 'spot_mistake':
      return { ...base, segments: q.segments };
    case 'calculation':
      return { ...base, given: q.given, unit: q.unit };
    default:
      return base;
  }
}

/** Fingerprint of the learner-visible content (wording + options + numbers). */
export function computeVariantKey(q: Omit<Question, 'variantKey' | 'id'> | Question): string {
  const p = publicQuestion({ ...(q as Question), id: '' });
  const visible = JSON.stringify({ ...p, id: undefined, options: p.options?.map((o) => o.text).sort(), items: p.items?.map((o) => o.text).sort() });
  return `${q.format}:${hashString(visible).toString(36)}`;
}

/** Human-readable correct answer, shown in feedback. */
export function correctAnswerText(q: Question): string {
  const byId = (opts: Opt[], id: string) => opts.find((o) => o.id === id)?.text ?? '';
  switch (q.format) {
    case 'multiple_choice':
    case 'true_false':
    case 'cause_effect':
      return byId(q.options, q.correctId);
    case 'multiple_select':
      return q.correctIds.map((id) => byId(q.options, id)).join(' • ');
    case 'type_answer':
      return q.accepted[0] ?? '';
    case 'fill_blank':
      return q.blanks.map((b) => b.accepted[0]).join(' • ');
    case 'true_false_justify':
      return q.keyPoints[0] ?? '';
    case 'matching':
      return Object.entries(q.pairs).map(([l, r]) => `${byId(q.left, l)} → ${byId(q.right, r)}`).join('\n');
    case 'ordering':
      return q.correctOrder.map((id, i) => `${i + 1}. ${byId(q.items, id)}`).join('\n');
    case 'categorize':
      return q.categories.map((c) => `${c.text}: ${q.items.filter((i) => q.mapping[i.id] === c.id).map((i) => i.text).join(', ')}`).join('\n');
    case 'label_diagram':
      return q.spots.map((s, i) => `${i + 1}. ${byId(q.labels, q.mapping[s.id] ?? '')}`).join('\n');
    case 'spot_mistake':
      return `${byId(q.segments, q.wrongId)} → ${q.correction[0] ?? ''}`;
    case 'calculation':
      return `${formatNumber(q.answer)}${q.unit ? ' ' + q.unit : ''}`;
    default:
      return q.modelAnswer;
  }
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}
