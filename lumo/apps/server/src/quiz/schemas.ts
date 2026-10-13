import { BLOOM_LEVELS, CONCEPT_KINDS, FORMATS, isValidExpression } from '@lumo/core';
import { z } from 'zod';

const str = (max: number) => z.string().trim().min(1).max(max);
const list = (max: number, len = 400) => z.array(str(len)).max(max).default([]);

export const conceptInputSchema = z
  .object({
    topic: str(120),
    kind: z.enum(CONCEPT_KINDS),
    term: str(160),
    summary: str(600),
    keyPoints: list(8),
    misconceptions: list(8),
    examples: list(6),
    synonyms: list(8, 160),
    steps: z.array(str(300)).min(2).max(10).optional(),
    causeEffects: z.array(z.object({ cause: str(300), effect: str(300) })).max(6).optional(),
    formula: z
      .object({
        expression: str(200),
        result: z.object({ symbol: str(12), name: str(120), unit: z.string().max(30).optional() }),
        variables: z
          .array(z.object({ symbol: str(12), name: str(120), unit: z.string().max(30).optional(), min: z.number(), max: z.number(), step: z.number().positive().optional() }))
          .min(1)
          .max(6),
      })
      .refine((f) => isValidExpression(f.expression, f.variables.map((v) => v.symbol)), 'invalid formula')
      .optional(),
    comparison: z.object({ with: str(160), similarities: list(6), differences: list(6) }).optional(),
    categories: z.array(z.object({ name: str(120), items: list(8, 160) })).max(4).optional(),
    date: z.string().max(60).optional(),
    diagram: z.object({ imageUrl: z.string().url().max(2000), spots: z.array(z.object({ label: str(80), x: z.number().min(0).max(100), y: z.number().min(0).max(100) })).max(12) }).optional(),
  })
  .strip();

export const deckInputSchema = z.object({
  title: str(120),
  subject: z.string().trim().max(80).default(''),
  language: z.enum(['en', 'fr']),
  summary: z.string().max(1000).default(''),
  concepts: z.array(conceptInputSchema).min(1).max(200),
});

export const answerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), optionId: z.string().max(40) }),
  z.object({ kind: z.literal('multi'), optionIds: z.array(z.string().max(40)).max(10) }),
  z.object({ kind: z.literal('text'), text: z.string().max(4000) }),
  z.object({ kind: z.literal('blanks'), values: z.array(z.string().max(200)).max(10) }),
  z.object({ kind: z.literal('tf'), value: z.boolean(), justification: z.string().max(2000) }),
  z.object({ kind: z.literal('pairs'), pairs: z.record(z.string().max(40), z.string().max(40)) }),
  z.object({ kind: z.literal('order'), order: z.array(z.string().max(40)).max(12) }),
  z.object({ kind: z.literal('mistake'), segmentId: z.string().max(40), correction: z.string().max(300) }),
  z.object({ kind: z.literal('number'), value: z.number(), work: z.string().max(2000).optional() }),
]);

export const startSessionSchema = z.object({
  mode: z.enum(['practice', 'review', 'challenge', 'wrong_only', 'exam']).default('practice'),
  length: z.number().int().min(3).max(40).default(10),
  formats: z.array(z.enum(FORMATS)).optional(),
});

export { BLOOM_LEVELS };
