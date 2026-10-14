import { describe, expect, it } from 'vitest';
import { buildQuestion, newProgress, pickFromBank, seededRng, type Question } from '../src';

const mcq = (conceptId: string, bloom: 'remember' | 'understand' | 'apply' | 'analyze', n: number): Question =>
  buildQuestion(
    { prompt: `Question ${n}?`, options: ['A answer', 'B answer', 'C answer', 'D answer'], correctIndex: 1, explanation: 'Because B.' },
    { conceptId, format: 'multiple_choice', bloom, language: 'en', seed: n },
  )!;

describe('question bank', () => {
  const bank = [mcq('c1', 'remember', 1), mcq('c1', 'apply', 2), mcq('c1', 'analyze', 3), mcq('c2', 'apply', 4)];

  it('only picks questions about the concept, never twice in one session', () => {
    const used = new Set<string>();
    const rng = seededRng(7);
    const got: string[] = [];
    for (let i = 0; i < 3; i++) {
      const q = pickFromBank(bank, 'c1', newProgress(), { usedThisSession: used, lastSeen: {}, now: 0 }, rng)!;
      expect(q.conceptId).toBe('c1');
      used.add(q.variantKey);
      got.push(q.variantKey);
    }
    expect(new Set(got).size).toBe(3);
    expect(pickFromBank(bank, 'c1', newProgress(), { usedThisSession: used, lastSeen: {}, now: 0 }, rng)).toBeNull();
  });

  it('prefers the depth the learner is at and questions not seen lately', () => {
    const counts: Record<string, number> = {};
    const p = { ...newProgress(), bloom: 'apply' as const };
    const seen = { [bank[2]!.variantKey]: 1000 }; // the analyze one was just seen
    for (let i = 0; i < 400; i++) {
      const q = pickFromBank(bank, 'c1', p, { usedThisSession: new Set(), lastSeen: seen, now: 2000 }, seededRng(i))!;
      counts[q.bloom] = (counts[q.bloom] ?? 0) + 1;
    }
    expect(counts.apply!).toBeGreaterThan(counts.remember ?? 0);
    expect(counts.apply!).toBeGreaterThan(counts.analyze ?? 0);
  });

  it('respects the formats a mode allows', () => {
    expect(pickFromBank(bank, 'c1', newProgress(), { allowed: ['type_answer'], usedThisSession: new Set(), lastSeen: {}, now: 0 }, seededRng(1))).toBeNull();
  });
});
