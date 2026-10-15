/** Question formats. Every concept is asked in many of these, never the same twice in a row. */
export const FORMATS = [
  'multiple_choice',
  'true_false',
  'multiple_select',
  'type_answer',
  'fill_blank',
  'explain',
  'true_false_justify',
  'matching',
  'ordering',
  'categorize',
  'label_diagram',
  'spot_mistake',
  'cause_effect',
  'apply',
  'calculation',
  'compare',
  'teach_back',
] as const;
export type Format = (typeof FORMATS)[number];

/** Bloom's taxonomy levels we test, in increasing depth. */
export const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze'] as const;
export type Bloom = (typeof BLOOM_LEVELS)[number];

export const bloomIndex = (b: Bloom): number => BLOOM_LEVELS.indexOf(b);

/** What kind of knowledge a concept holds; drives which formats make sense. */
export const CONCEPT_KINDS = [
  'definition',
  'process',
  'cause_effect',
  'formula',
  'comparison',
  'date',
  'vocabulary',
  'classification',
  'fact',
] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];

export type Locale = 'en' | 'fr';

/** A plain millisecond timestamp. Core never touches the clock itself. */
export type Millis = number;

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;
