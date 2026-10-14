import { grade, perfectAnswer } from '@lumo/core';
import { describe, expect, it } from 'vitest';
import { buildQuestion } from '@lumo/core';

const meta = (format: any) => ({ conceptId: 'c1', format, bloom: 'understand' as const, language: 'en' as const, seed: 42 });

describe('buildQuestion (AI drafts → questions)', () => {
  it('builds valid questions whose answer keys grade correctly', () => {
    const drafts: [string, unknown][] = [
      ['multiple_choice', { prompt: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 2, explanation: 'because' }],
      ['cause_effect', { prompt: 'What if?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'because' }],
      ['multiple_select', { prompt: 'Q?', options: ['a', 'b', 'c', 'd', 'e'], correctIndexes: [0, 3], explanation: 'because' }],
      ['type_answer', { prompt: 'Name it', accepted: ['osmosis'], explanation: 'because' }],
      ['fill_blank', { prompt: 'Fill', text: 'Water moves by ___ through a ___ membrane.', blanks: [['osmosis'], ['partially permeable', 'semi-permeable']], explanation: 'because' }],
      ['explain', { prompt: 'Explain', keyPoints: ['k1 water moves', 'k2 membrane'], modelAnswer: 'water moves across membrane', explanation: 'because' }],
      ['true_false_justify', { prompt: 'T/F', statement: 's', isTrue: false, keyPoints: ['reason here'], explanation: 'because' }],
      ['matching', { prompt: 'Match', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }], explanation: 'because' }],
      ['ordering', { prompt: 'Order', stepsInOrder: ['one', 'two', 'three', 'four'], explanation: 'because' }],
      ['categorize', { prompt: 'Sort', categories: [{ name: 'A', items: ['x', 'y'] }, { name: 'B', items: ['z'] }], explanation: 'because' }],
      ['spot_mistake', { prompt: 'Find', segments: ['p1', 'p2', 'p3'], wrongIndex: 1, corrections: ['fix'], explanation: 'because' }],
      ['calculation', { prompt: 'Calc', given: [{ symbol: 'm', name: 'mass', value: 2, unit: 'kg' }], answer: 19.6, unit: 'N', steps: ['W = m g', '= 2 × 9.8', '= 19.6 N'], explanation: 'because' }],
    ];
    for (const [format, d] of drafts) {
      const q = buildQuestion(d, meta(format));
      expect(q, format).not.toBeNull();
      expect(grade(q!, perfectAnswer(q!)).score, format).toBe(1);
    }
  });

  it('rejects inconsistent drafts', () => {
    expect(buildQuestion({ prompt: 'Q', options: ['a', 'b', 'c', 'd'], correctIndex: 7, explanation: 'x' }, meta('multiple_choice'))).toBeNull();
    expect(buildQuestion({ prompt: 'Q', options: ['a', 'a', 'c', 'd'], correctIndex: 0, explanation: 'x' }, meta('multiple_choice'))).toBeNull();
    expect(buildQuestion({ prompt: 'F', text: 'no blanks', blanks: [['x']], explanation: 'x' }, meta('fill_blank'))).toBeNull();
    expect(buildQuestion({ prompt: 'M', pairs: [{ left: 'a', right: '1' }], explanation: 'x' }, meta('matching'))).toBeNull();
    expect(buildQuestion({ nonsense: true }, meta('explain'))).toBeNull();
    expect(buildQuestion({ prompt: 'x' }, meta('label_diagram'))).toBeNull();
  });
});
