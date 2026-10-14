import { describe, expect, it } from 'vitest';
import { grade, matchesAccepted, shortAnswersToCheck, type Question } from '../src';

describe('answers that mean the same thing', () => {
  it('accepts everyday synonyms, in English and French', () => {
    expect(matchesAccepted('round', ['circular'])).toBe(true);
    expect(matchesAccepted('spherical', ['round'])).toBe(true);
    expect(matchesAccepted('large', ['big'])).toBe(true);
    expect(matchesAccepted('rond', ['circulaire'])).toBe(true);
    expect(matchesAccepted('CO2', ['carbon dioxide'])).toBe(true);
  });

  it('accepts the right word inside a short sentence, but not a negation', () => {
    expect(matchesAccepted('it is round', ['circular'])).toBe(true);
    expect(matchesAccepted('they are circular', ['circular'])).toBe(true);
    expect(matchesAccepted('it is not round', ['circular'])).toBe(false);
  });

  it('still rejects wrong answers', () => {
    expect(matchesAccepted('square', ['circular'])).toBe(false);
    expect(matchesAccepted('cold', ['hot'])).toBe(false);
  });

  it('a judge can accept what the word list does not know', () => {
    const q = { id: 'q', conceptId: 'c', format: 'type_answer', bloom: 'remember', language: 'en', prompt: 'Shape of planets?', accepted: ['spheroid'], explanation: '', variantKey: 'v' } as unknown as Question;
    const a = { kind: 'text' as const, text: 'like a ball' };
    expect(shortAnswersToCheck(q, a)).toEqual([{ key: '0', given: 'like a ball', expected: ['spheroid'] }]);
    expect(grade(q, a).correct).toBe(false);
    expect(grade(q, a, undefined, { '0': true }).correct).toBe(true);
  });
});
