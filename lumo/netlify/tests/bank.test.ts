import type { Concept } from '@lumo/core';
import { describe, expect, it } from 'vitest';
import { toQuestions } from '../../apps/web/src/local/bank';

const concept: Concept = {
  id: 'k1', topic: 'Récit', kind: 'definition', term: 'Récit psychologique',
  summary: 'Le récit psychologique met l’accent sur les pensées et les émotions du personnage principal.',
  keyPoints: ['On a accès aux pensées et aux émotions du personnage'], misconceptions: [], examples: [], synonyms: [],
};

describe('turning Claude drafts into the question bank', () => {
  it('keeps real test questions and drops copies of the notes and broken drafts', () => {
    const qs = toQuestions(
      {
        questions: [
          // good: a new excerpt, misconception-based options
          { c: 1, format: 'multiple_choice', bloom: 'apply', source: 'notes', prompt: '« Julie fixait la porte. Et s’il ne revenait pas ? »\n\nQuel indice montre surtout qu’il s’agit d’un récit psychologique ?', options: ['Un lieu précis', 'L’accès aux pensées de Julie', 'Une action rapide', 'Un narrateur au passé'], correctIndex: 1, explanation: 'On entend ses pensées. Une action rapide, c’est plutôt le récit d’aventures.' },
          // good: constructed answer with a rubric
          { c: 1, format: 'explain', bloom: 'analyze', source: 'enrichment', prompt: 'Explique comment un auteur peut créer de la tension dans un récit psychologique.', keyPoints: ['un procédé nommé', 'une citation', 'l’effet expliqué'], modelAnswer: 'Par exemple…', explanation: 'Un bon texte nomme le procédé.' },
          // bad: lifts the notes' sentence
          { c: 1, format: 'type_answer', bloom: 'remember', prompt: 'Le récit psychologique met l’accent sur les pensées et les émotions du ___ ?', accepted: ['personnage'], explanation: 'x' },
          // broken: wrong concept number, unknown format, bad index
          { c: 9, format: 'multiple_choice', prompt: 'x?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'x' },
          { c: 1, format: 'fill_blank', prompt: 'x', text: 'a ___', blanks: [['b']], explanation: 'x' },
          { c: 1, format: 'multiple_choice', prompt: 'x?', options: ['a', 'b', 'c', 'd'], correctIndex: 7, explanation: 'x' },
        ],
      },
      [concept],
      'fr',
      'seed',
    );
    expect(qs.map((q) => q.format)).toEqual(['multiple_choice', 'explain']);
    expect(qs.every((q) => q.conceptId === 'k1')).toBe(true);
    expect(qs[0]!.prompt).toContain('Julie');
  });

  it('turns unknown depths into the nearest one', () => {
    const [q] = toQuestions({ questions: [{ c: 1, format: 'compare', bloom: 'evaluate', prompt: 'Compare le récit psychologique et le récit d’aventures.', keyPoints: ['a', 'b'], modelAnswer: 'm', explanation: 'e' }] }, [concept], 'fr', 's');
    expect(q!.bloom).toBe('analyze');
  });
});
