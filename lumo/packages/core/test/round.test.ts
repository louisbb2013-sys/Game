import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  deferHead,
  dropHead,
  factKey,
  factSlots,
  newProgress,
  newSession,
  nextFact,
  pickFromBank,
  planFullRound,
  planQuickRound,
  questionFromDraft,
  seededRng,
  type ChoiceQ,
  type Concept,
  type Question,
} from '../src';

const concept = (id: string, topic: string, keyPoints: string[]): Concept => ({ id, topic, kind: 'definition', term: id, summary: `About ${id}.`, keyPoints, misconceptions: [], examples: [], synonyms: [] });

const deck = [
  concept('rome', 'Romans', ['The Romans lived in Italy', 'Rome was founded in 753 BC', 'Latin was their language']),
  concept('legion', 'Romans', ['A legion had about 5000 soldiers']),
  concept('greece', 'Greeks', ['Athens was a democracy', 'Sparta trained soldiers from age 7']),
  concept('olympics', 'Greeks', []),
];

const tf = (id: string, conceptId: string, facts?: number[], format: Question['format'] = 'true_false'): Question =>
  ({ id, conceptId, format, bloom: 'understand', language: 'en', prompt: `Q ${id}`, explanation: 'x', variantKey: `v-${id}`, options: [{ id: 't', text: 'True' }, { id: 'f', text: 'False' }], correctId: 't', ...(facts ? { facts } : {}) }) as ChoiceQ;

describe('rounds built from the facts of the notes', () => {
  it('lists every fact of every idea (an idea with no listed facts counts once)', () => {
    const slots = factSlots(deck);
    expect(slots).toHaveLength(7);
    expect(slots.filter((s) => s.conceptId === 'rome').map((s) => s.fact)).toEqual([0, 1, 2]);
    expect(slots.find((s) => s.conceptId === 'olympics')!.fact).toBe(-1);
  });

  it('a full round covers each fact once, topic by topic in the notes order, never the same idea twice in a row when avoidable', () => {
    for (let seed = 1; seed < 20; seed++) {
      const r = planFullRound(deck, new Map(), {}, 0, seededRng(seed));
      expect(r).toHaveLength(7);
      expect(new Set(r.map((s) => factKey(s.conceptId, s.fact))).size).toBe(7);
      // Romans first (as in the notes), then Greeks.
      expect(r.slice(0, 4).every((s) => s.conceptId === 'rome' || s.conceptId === 'legion')).toBe(true);
      // Inside Romans, legion splits rome's facts at least once (rome, legion, rome, rome or similar): never 3 rome in a row first.
      const romans = r.slice(0, 4).map((s) => s.conceptId);
      expect(romans[0] === 'rome' && romans[1] === 'rome' && romans[2] === 'rome').toBe(false);
    }
  });

  it('a huge deck keeps its most-needed facts (missed first), still in the notes order', () => {
    const log = { [factKey('greece', 1)]: { at: 0, ok: false } };
    const r = planFullRound(deck, new Map(), log, 1000, seededRng(3), 3);
    expect(r).toHaveLength(3);
    expect(r.some((s) => s.conceptId === 'greece' && s.fact === 1)).toBe(true);
  });

  it('a quick round spreads over different ideas before coming back to one', () => {
    const r = planQuickRound(deck, new Map(), {}, 4, 0, seededRng(5));
    expect(new Set(r.map((s) => s.conceptId)).size).toBe(4);
    const more = planQuickRound(deck, new Map(), {}, 6, 0, seededRng(5));
    expect(more).toHaveLength(6);
    expect(new Set(more.map((s) => factKey(s.conceptId, s.fact))).size).toBe(6);
  });

  it('keeps the fact of each queued question through answers, retries, deferrals and drops', () => {
    let s = newSession('practice', ['rome', 'legion', 'rome', 'greece'], [0, 0, 2, 1]);
    expect(nextFact(s)).toBe(0);
    // Missed: the same fact comes back a little later (another question on it).
    s = applyAnswer(s, { conceptId: 'rome', format: 'true_false', bloom: 'understand', score: 0, variantKey: 'a', fact: 0 }, 0).state;
    expect(s.queue).toEqual(['legion', 'rome', 'greece', 'rome']);
    expect(s.facts).toEqual([0, 2, 1, 0]);
    expect(s.total).toBe(5);
    // No other question left on it: no retry.
    s = applyAnswer(s, { conceptId: 'legion', format: 'true_false', bloom: 'understand', score: 0, variantKey: 'b', fact: 0 }, 0, { canRetry: false }).state;
    expect(s.queue).toEqual(['rome', 'greece', 'rome']);
    expect(s.facts).toEqual([2, 1, 0]);
    s = deferHead(s);
    expect(s.queue).toEqual(['greece', 'rome', 'rome']);
    expect(s.facts).toEqual([1, 0, 2]);
    s = dropHead(s);
    expect(s.queue).toEqual(['rome', 'rome']);
    expect(s.facts).toEqual([0, 2]);
    expect(s.total).toBe(4);
  });

  it('long rounds can allow more retries', () => {
    let s = newSession('practice', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], [0, 0, 0, 0, 0, 0, 0, 0]);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) s = applyAnswer(s, { conceptId: id, format: 'true_false', bloom: 'remember', score: 0, variantKey: id, fact: 0 }, 0, { maxRetries: 10 }).state;
    expect(Object.values(s.retries).reduce((a, b) => a + b, 0)).toBe(6);
  });
});

describe('picking a question for one fact', () => {
  const bank = [tf('r0', 'rome', [0]), tf('r1', 'rome', [1]), tf('r1b', 'rome', [1], 'multiple_choice'), tf('old', 'rome')];
  const base = { usedThisSession: new Set<string>(), lastSeen: {}, now: 0 };

  it('takes a question tagged with that fact, never one about another fact', () => {
    for (let i = 0; i < 30; i++) {
      const q = pickFromBank(bank, 'rome', newProgress(), { ...base, fact: 1 }, seededRng(i))!;
      expect(q.facts).toEqual([1]);
    }
  });

  it('falls back to an untagged question (written before facts were tagged), then to nothing', () => {
    const q = pickFromBank(bank, 'rome', newProgress(), { ...base, fact: 2 }, seededRng(1))!;
    expect(q.id).toBe('old');
    expect(pickFromBank(bank, 'rome', newProgress(), { ...base, fact: 2, usedThisSession: new Set(['v-old']) }, seededRng(1))).toBeNull();
  });

  it('never repeats a question in a round, and prefers another angle than last time', () => {
    expect(pickFromBank(bank, 'rome', newProgress(), { ...base, fact: 1, usedThisSession: new Set(['v-r1', 'v-r1b', 'v-old']) }, seededRng(1))).toBeNull();
    // Both seen before; the true/false one was the last met on this fact: the other angle comes more often.
    const lastSeen = { 'v-r1': 5000, 'v-r1b': 1000 };
    let other = 0;
    for (let i = 0; i < 200; i++) if (pickFromBank(bank, 'rome', newProgress(), { ...base, fact: 1, lastSeen, now: 10_000 }, seededRng(i))!.id === 'r1b') other++;
    expect(other).toBeGreaterThan(110);
  });
});

describe('questions written by Claude carry their facts', () => {
  const concepts = [concept('rome', 'Romans', ['The Romans lived in Italy', 'Rome was founded in 753 BC'])];
  const ctx = { concepts, language: 'en' as const, seed: 9 };
  it('reads "f" (numbered from 1) and drops numbers that are not facts', () => {
    const q = questionFromDraft({ c: 1, f: [2, 7], type: 'tf', q: 'The city of Rome is older than 500 BC.', answer: true, why: 'It was founded in 753 BC.' }, ctx)!;
    expect(q.facts).toEqual([1]);
    expect(questionFromDraft({ c: 1, f: 1, type: 'tf', q: 'The Roman heartland was the Italian peninsula.', answer: true, why: 'x' }, ctx)!.facts).toEqual([0]);
    expect(questionFromDraft({ c: 1, type: 'tf', q: 'The Roman heartland was the Italian peninsula.', answer: true, why: 'x' }, ctx)!.facts).toBeUndefined();
  });

  it('keeps the tempting wrong answers of a short answer (never the right one)', () => {
    const q = questionFromDraft({ c: 1, f: 1, type: 'typed', q: 'In which country did the Romans build their first city?', accepted: ['Italy', 'italie'], wrong: ['Greece', 'Egypt', 'italy'], why: 'x' }, ctx)!;
    expect(q.format).toBe('type_answer');
    expect((q as { distractors?: string[] }).distractors).toEqual(['Greece', 'Egypt']);
  });

  it('still rejects a sentence lifted from the notes, but not a question that only names a fact', () => {
    expect(questionFromDraft({ c: 1, f: 1, type: 'tf', q: 'The Romans lived in Italy.', answer: true, why: 'x' }, ctx)).toBeNull();
    expect(questionFromDraft({ c: 1, f: 2, type: 'mcq', q: 'In what year was Rome founded, according to legend?', options: ['753 BC', '509 BC', '44 BC'], answer: 0, why: 'x' }, ctx)).not.toBeNull();
  });
});
