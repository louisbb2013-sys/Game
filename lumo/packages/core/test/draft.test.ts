import { describe, expect, it } from 'vitest';
import { dedupeQuestions, grade, hashString, publicQuestion, questionFromDraft, readDraftLines, readDraftWhole, type ChoiceQ, type Concept } from '../src';

const concept = (id: string, term: string, summary: string, keyPoints: string[] = []): Concept => ({ id, topic: 'Space', kind: 'definition', term, summary, keyPoints, misconceptions: [], examples: [], synonyms: [] });

const concepts = [
  concept('mass', 'Mass', 'Mass is the quantity of matter that makes up an object and it does not change from place to place.', ['Measured in kilograms', 'Same on the Moon and on Earth']),
  concept('weight', 'Weight', 'Weight is the force of gravity pulling on an object, so it changes with the planet.', ['Measured in newtons']),
];
const ctx = { concepts, language: 'en' as const, seed: 42 };

describe('questions written by Claude', () => {
  it('builds a multiple-choice question with a note on each wrong option', () => {
    const q = questionFromDraft(
      {
        c: 1,
        type: 'mcq',
        level: 'apply',
        context: 'An astronaut has a 60 kg backpack on Earth and takes it to the Moon.',
        q: 'What is the mass of the backpack on the Moon?',
        options: ['60 kg', '10 kg', '0 kg', '360 kg'],
        answer: 0,
        why: 'Mass is the amount of matter; going to the Moon does not remove any matter.',
        wrong: ['', 'This mixes up mass and weight: weight drops to about 1/6 on the Moon, mass does not.', 'There is still gravity on the Moon, and mass never becomes zero.', 'The Moon pulls less, not more.'],
      },
      ctx,
    ) as ChoiceQ;
    expect(q).toBeTruthy();
    expect(q.format).toBe('multiple_choice');
    expect(q.bloom).toBe('apply');
    expect(q.context).toContain('astronaut');
    expect(publicQuestion(q).context).toContain('astronaut');
    const wrong = q.options.find((o) => o.text === '10 kg')!;
    expect(q.optionNotes?.[wrong.id]).toContain('mixes up mass and weight');
    expect(q.optionNotes?.[q.correctId]).toBeUndefined();
    const g = grade(q, { kind: 'choice', optionId: wrong.id });
    expect(g.correct).toBe(false);
    expect(g.chosenNote).toContain('mixes up');
    expect(grade(q, { kind: 'choice', optionId: q.correctId }).correct).toBe(true);
  });

  it('builds a one-tap true/false question in the deck language', () => {
    const q = questionFromDraft({ c: 2, type: 'tf', q: 'A bathroom scale on the Moon shows a smaller number than on Earth.', answer: true, why: 'The Moon pulls about six times less.' }, { ...ctx, language: 'fr' }) as ChoiceQ;
    expect(q.format).toBe('true_false');
    expect(q.options.map((o) => o.text)).toEqual(['Vrai', 'Faux']);
    expect(q.options[0]!.id).toBe(q.correctId);
    expect(grade(q, { kind: 'choice', optionId: q.options[1]!.id }).correct).toBe(false);
  });

  it('rejects the questions students hate', () => {
    // A sentence lifted from the notes with a word removed.
    expect(questionFromDraft({ c: 1, type: 'typed', q: 'Fill in: ___ is the quantity of matter that makes up an object.', accepted: ['Mass'], why: 'x' }, ctx)).toBeNull();
    // The answer is in the question.
    expect(questionFromDraft({ c: 2, type: 'typed', q: 'Weight is measured in which unit? (weight)', accepted: ['weight'], why: 'x' }, ctx)).toBeNull();
    // "All of the above".
    expect(questionFromDraft({ c: 1, type: 'mcq', q: 'Which is true about mass?', options: ['It is in kg', 'It is matter', 'It stays the same', 'All of the above'], answer: 3, why: 'x' }, ctx)).toBeNull();
    // Malformed: unknown concept, unknown type, answer out of range.
    expect(questionFromDraft({ c: 9, type: 'mcq', q: 'Which?', options: ['a', 'b', 'c', 'd'], answer: 0, why: 'x' }, ctx)).toBeNull();
    expect(questionFromDraft({ c: 1, type: 'essay', q: 'Write about mass.', why: 'x' }, ctx)).toBeNull();
    expect(questionFromDraft({ c: 1, type: 'mcq', q: 'Which one is right?', options: ['a1', 'b1', 'c1', 'd1'], answer: 7, why: 'x' }, ctx)).toBeNull();
  });

  it('builds ordering, matching, sorting, written and calculation questions', () => {
    const order = questionFromDraft({ c: 1, type: 'order', q: 'Put these in order from the Sun outward.', steps: ['Mercury', 'Venus', 'Earth', 'Mars'], why: 'Mercury is closest.' }, ctx);
    expect(order?.format).toBe('ordering');
    const match = questionFromDraft({ c: 2, type: 'match', q: 'Match each quantity with its unit.', pairs: [['mass', 'kilogram'], ['weight', 'newton'], ['distance', 'metre']], why: 'Units.' }, ctx);
    expect(match?.format).toBe('matching');
    const sort = questionFromDraft({ c: 2, type: 'sort', q: 'Which change with the planet you stand on?', groups: [{ name: 'Changes', items: ['weight', 'scale reading'] }, { name: 'Stays the same', items: ['mass', 'amount of matter'] }], why: 'Gravity.' }, ctx);
    expect(sort?.format).toBe('categorize');
    const written = questionFromDraft({ c: 2, type: 'written', level: 'apply', q: 'Explain why an astronaut can jump higher on the Moon.', points: ['Moon gravity is weaker', 'So the astronaut weighs less', 'Same legs, same push'], model: 'The Moon pulls less…', why: 'Weaker gravity.' }, ctx);
    expect(written?.format).toBe('apply');
    const calc = questionFromDraft({ c: 2, type: 'calc', q: 'A 50 kg student stands on Earth (g = 9.8 N/kg). What is their weight?', given: [{ symbol: 'm', name: 'mass', value: 50, unit: 'kg' }, { symbol: 'g', name: 'gravity', value: 9.8, unit: 'N/kg' }], answer: 490, unit: 'N', steps: ['W = m × g', 'W = 50 × 9.8 = 490 N'], why: 'Weight = mass × g.' }, ctx);
    expect(calc?.format).toBe('calculation');
  });

  it('reads a streamed reply line by line and keeps finished lines when cut short', () => {
    const l1 = JSON.stringify({ c: 1, type: 'tf', q: 'Your mass on the Moon is smaller than on Earth.', answer: false, why: 'Mass does not depend on gravity.' });
    const l2 = JSON.stringify({ c: 2, type: 'tf', q: 'Weight is a force.', answer: true, why: 'It is the pull of gravity.' });
    const partial = `${l1}\n${l2.slice(0, 20)}`;
    const a = readDraftLines(partial, 0, { concepts, language: 'en', seedBase: 's' }, hashString);
    expect(a.questions).toHaveLength(1);
    const b = readDraftLines(`${l1}\n${l2}\n`, a.next, { concepts, language: 'en', seedBase: 's' }, hashString);
    expect(b.questions).toHaveLength(1);
    expect(b.questions[0]!.prompt).toBe('Weight is a force.');
    // The last line without a newline is read at the end.
    const c = readDraftLines(`${l1}\n${l2}`, 0, { concepts, language: 'en', seedBase: 's', final: true }, hashString);
    expect(c.questions).toHaveLength(2);
    // A JSON array instead of lines still works.
    expect(readDraftWhole(`Here you go:\n[${l1},\n${l2}]`, { concepts, language: 'en', seedBase: 's' }, hashString)).toHaveLength(2);
  });

  it('drops near-duplicates', () => {
    const mk = (q: string, seed: number) => questionFromDraft({ c: 2, type: 'tf', q, answer: true, why: 'w' }, { ...ctx, seed })!;
    const a = mk('On Jupiter you would weigh more than on Earth.', 1);
    const b = mk('On Jupiter you would weigh more than on Earth!', 2);
    const c = mk('A scale measures weight, not mass.', 3);
    expect(dedupeQuestions([a], [b, c]).map((q) => q.prompt)).toEqual(['A scale measures weight, not mass.']);
  });
});

describe('rounds', () => {
  it('asks each idea twice with others in between', async () => {
    const { twiceSpaced } = await import('../src');
    expect(twiceSpaced(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c', 'a', 'd', 'b', 'e', 'c', 'd', 'e']);
    expect(twiceSpaced(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
    expect(twiceSpaced(['a', 'a', 'b'])).toEqual(['a', 'b', 'a', 'b']);
  });
});

describe('sample decks', () => {
  it('come with hand-written questions that all pass the quality checks', async () => {
    const { SAMPLE_DECKS, SAMPLE_BANK_DRAFTS, sampleBank } = await import('../src');
    for (const lang of ['en', 'fr'] as const) {
      const concepts = SAMPLE_DECKS[lang].concepts.map((c, i) => ({ ...c, id: `c${i}` }));
      const bank = sampleBank(lang, concepts);
      const lost = SAMPLE_BANK_DRAFTS[lang].filter((d) => !bank.some((q) => q.prompt === (d as { q: string }).q)).map((d) => (d as { q: string }).q);
      expect(lost, `${lang}: rejected`).toEqual([]);
      // Every idea in the deck gets at least two questions, and the formats are mixed.
      for (const c of concepts) expect(bank.filter((q) => q.conceptId === c.id).length, c.term).toBeGreaterThanOrEqual(2);
      expect(new Set(bank.map((q) => q.format)).size).toBeGreaterThanOrEqual(5);
      // Every multiple choice explains its tempting wrong answers.
      for (const q of bank) if (q.format === 'multiple_choice') expect(Object.keys(q.optionNotes ?? {}).length, q.prompt).toBe(q.options.length - 1);
    }
  });
});
