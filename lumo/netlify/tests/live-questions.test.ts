import { hashString, questionFromDraft, type Concept, type Question } from '@lumo/core';
import { describe, expect, it } from 'vitest';

(globalThis as Record<string, unknown>).window = globalThis;
const { makeQuestions } = await import('../../apps/web/src/local/liveLocal');

/*
 * Live used to loop over ~5 questions: a game started as soon as 6 existed, and repeated them to fill
 * its length. A game now never asks a question twice, spreads over the deck's facts, and plays the
 * questions this host met longest ago first.
 */

const concepts: Concept[] = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, topic: i < 3 ? 'A' : 'B', kind: 'fact', term: `Idée ${i}`, summary: `Résumé ${i}.`, keyPoints: [`Fait ${i}.1`, `Fait ${i}.2`], misconceptions: [], examples: [], synonyms: [] }));

/** For each fact: a true/false, a multiple choice, and a written one (which Live can't play). */
const bank: Question[] = concepts.flatMap((c, ci) =>
  c.keyPoints.flatMap((_, f) => {
    const ctx = { concepts: [c], language: 'fr' as const, seed: hashString(`${c.id}${f}`) };
    return [
      questionFromDraft({ c: 1, f: f + 1, type: 'tf', q: `Énoncé vrai numéro ${ci}-${f} à juger maintenant.`, answer: true, why: 'x' }, ctx),
      questionFromDraft({ c: 1, f: f + 1, type: 'mcq', q: `Question à choix ${ci}-${f} : laquelle est juste?`, options: [`Bonne ${ci}${f}`, `Piège ${ci}${f}`, `Autre ${ci}${f}`, `Encore ${ci}${f}`], answer: 0, why: 'x' }, ctx),
      questionFromDraft({ c: 1, f: f + 1, type: 'written', q: `Explique l'idée ${ci}-${f} dans tes mots.`, points: ['un point', 'un autre point'], model: 'Modèle.', why: 'x' }, ctx),
    ].filter((q): q is Question => !!q);
  }),
);

describe('Live questions', () => {
  it('never asks a question twice, even when the game asks for more than the deck has', () => {
    const qs = makeQuestions(concepts, 'fr', 100, bank);
    expect(qs).toHaveLength(24); // 12 facts x 2 one-tap questions; the written ones can't be one tap
    expect(new Set(qs.map((q) => q.variantKey)).size).toBe(24);
    expect(new Set(qs.map((q) => q.id)).size).toBe(24);
    expect(qs.every((q) => q.format === 'multiple_choice' || q.format === 'true_false')).toBe(true);
  });

  it('a short game covers different facts first (one per fact before a second one)', () => {
    for (let i = 0; i < 10; i++) {
      const qs = makeQuestions(concepts, 'fr', 12, bank);
      expect(new Set(qs.map((q) => `${q.conceptId}:${q.facts?.[0]}`)).size).toBe(12);
      // The same idea is never asked twice in a row.
      for (let k = 1; k < qs.length; k++) expect(qs[k]!.conceptId).not.toBe(qs[k - 1]!.conceptId);
    }
  });

  it('plays what this host met longest ago (or never) first', () => {
    const seen = Object.fromEntries(bank.filter((q) => q.format === 'true_false').map((q) => [q.variantKey, 1000]));
    const qs = makeQuestions(concepts, 'fr', 12, bank, seen);
    expect(qs.every((q) => q.format === 'multiple_choice')).toBe(true);
  });

  it('adds only questions not already in the game', () => {
    const first = makeQuestions(concepts, 'fr', 10, bank);
    const more = makeQuestions(concepts, 'fr', 50, bank, {}, new Set(first.map((q) => q.variantKey)));
    expect(more).toHaveLength(14);
    expect(more.some((q) => first.some((x) => x.variantKey === q.variantKey))).toBe(false);
  });

  it('a deck with no questions yet still gets a game from its notes', () => {
    const qs = makeQuestions(concepts, 'fr', 8, []);
    expect(qs.length).toBeGreaterThanOrEqual(3);
  });
});
