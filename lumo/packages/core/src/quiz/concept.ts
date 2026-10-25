import type { ConceptKind, Locale } from '../types';

/** A variable in a formula, with the range we draw fresh numbers from. */
export interface FormulaVariable {
  symbol: string;
  name: string;
  unit?: string;
  min: number;
  max: number;
  step?: number; // granularity of random values (default 1)
}

export interface Formula {
  /** Safe arithmetic over variable symbols, e.g. "m * a" or "I / A". */
  expression: string;
  result: { symbol: string; name: string; unit?: string };
  variables: FormulaVariable[];
}

/**
 * One piece of knowledge extracted from the learner's notes. Questions are never
 * stored; they are generated from concepts, each time in a new form.
 */
export interface Concept {
  id: string;
  topic: string;
  kind: ConceptKind;
  term: string;
  summary: string;
  /** Every fact of this sub-aspect, one testable statement each: each one gets its own question. */
  keyPoints: string[];
  misconceptions: string[];
  examples: string[];
  synonyms: string[];
  steps?: string[];
  causeEffects?: { cause: string; effect: string }[];
  formula?: Formula;
  comparison?: { with: string; similarities: string[]; differences: string[] };
  categories?: { name: string; items: string[] }[];
  date?: string;
  diagram?: { imageUrl: string; spots: { label: string; x: number; y: number }[] };
}

export type ConceptInput = Omit<Concept, 'id'>;

export interface DeckContext {
  language: Locale;
  concepts: Concept[];
}
