import { BLOOM_LEVELS, bloomIndex, type Bloom, type Format } from '../types';
import type { Concept } from './concept';

/** The depths each format can test. */
export const FORMAT_BLOOM: Record<Format, readonly Bloom[]> = {
  multiple_choice: ['remember', 'understand', 'apply'],
  true_false: ['remember', 'understand'],
  multiple_select: ['understand', 'analyze'],
  type_answer: ['remember'],
  fill_blank: ['remember'],
  explain: ['understand', 'analyze'],
  true_false_justify: ['understand', 'analyze'],
  matching: ['remember', 'understand'],
  ordering: ['understand'],
  categorize: ['understand', 'analyze'],
  label_diagram: ['remember'],
  spot_mistake: ['understand', 'analyze'],
  cause_effect: ['understand', 'apply'],
  apply: ['apply', 'analyze'],
  calculation: ['apply'],
  compare: ['analyze'],
  teach_back: ['understand', 'analyze'],
};

const topics = (deck: readonly Concept[]) => new Set(deck.map((c) => c.topic));

/** Can this format be built for the concept from what the notes contain? */
export function supportsFormat(c: Concept, f: Format, deck: readonly Concept[]): boolean {
  const others = deck.filter((o) => o.id !== c.id);
  switch (f) {
    case 'multiple_choice':
      return others.length >= 3 || c.misconceptions.length >= 2;
    case 'true_false':
      return false; // written by Claude only (a statement built from the notes would just copy them)
    case 'multiple_select':
      return c.keyPoints.length >= 2 && c.misconceptions.length + others.reduce((n, o) => n + o.keyPoints.length, 0) >= 2;
    case 'type_answer':
    case 'fill_blank':
      return c.term.trim().length > 0 && c.summary.length > 0;
    case 'explain':
    case 'teach_back':
      return c.keyPoints.length >= 1;
    case 'true_false_justify':
      return c.keyPoints.length >= 1 || c.misconceptions.length >= 1;
    case 'matching':
      return others.length >= 2;
    case 'ordering':
      return (c.steps?.length ?? 0) >= 3;
    case 'categorize':
      return (c.categories?.length ?? 0) >= 2 || (topics(deck).size >= 2 && deck.length >= 4);
    case 'label_diagram':
      return (c.diagram?.spots.length ?? 0) >= 2;
    case 'spot_mistake':
      return others.length >= 1 || (c.steps?.length ?? 0) >= 3;
    case 'cause_effect':
      return (c.causeEffects?.length ?? 0) >= 1 && (others.length >= 2 || c.misconceptions.length >= 2);
    case 'apply':
      return c.examples.length >= 1 && c.keyPoints.length >= 1;
    case 'calculation':
      return !!c.formula && c.formula.variables.length >= 1;
    case 'compare':
      return !!c.comparison && c.comparison.similarities.length + c.comparison.differences.length >= 2;
  }
}

/** Closest bloom level the format supports. */
export function nearestBloom(f: Format, target: Bloom): Bloom {
  const range = FORMAT_BLOOM[f];
  if (range.includes(target)) return target;
  return range.reduce((best, b) => (Math.abs(bloomIndex(b) - bloomIndex(target)) < Math.abs(bloomIndex(best) - bloomIndex(target)) ? b : best), range[0]!);
}

export const formatFitsBloom = (f: Format, b: Bloom) => FORMAT_BLOOM[f].includes(b);
export { BLOOM_LEVELS };
