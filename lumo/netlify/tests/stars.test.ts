import { describe, expect, it } from 'vitest';

(globalThis as Record<string, unknown>).window = globalThis;
const { readDeckLines, readingPrompt } = await import('../../apps/web/src/local/reader');
const { writingPrompt } = await import('../../apps/web/src/local/writer');

// What the notes stress (highlighted, underlined, in colour) comes back marked ★: the mark is taken off
// the fact, kept as `stars`, follows it through merging, and the writer asks those facts more.
describe('stressed facts', () => {
  const reply = [
    '{"title": "Rome", "subject": "Histoire", "summary": "La Rome antique."}',
    '{"topic": "Rome", "kind": "event", "term": "Fondation", "summary": "Naissance de Rome.", "facts": ["★ Rome est fondée en 753 av. J.-C.", "Romulus en est le fondateur selon la légende."]}',
    '{"topic": "Rome", "kind": "event", "term": "Fondation", "summary": "Naissance de Rome.", "facts": ["Le Tibre traverse Rome.", "★ Romulus en est le fondateur selon la légende."]}',
  ].join('\n');

  it('are read, merged and kept by their words', () => {
    const { concepts } = readDeckLines(reply);
    expect(concepts).toHaveLength(1);
    const c = concepts[0]!;
    expect(c.keyPoints).toEqual(['Rome est fondée en 753 av. J.-C.', 'Romulus en est le fondateur selon la légende.', 'Le Tibre traverse Rome.']);
    expect(c.stars).toEqual([0, 1]);
  });

  it('get one more question, and the test the student describes shapes the deck and the questions', () => {
    const c = { ...readDeckLines(reply).concepts[0]!, id: 'c1' };
    const options = { test: 'Les dates et les personnages' };
    const w = writingPrompt({ title: 'Rome', subject: 'Histoire', language: 'fr', options }, [c]);
    expect(w).toContain('[1] ★ Rome est fondée en 753 av. J.-C.');
    expect(w).toContain('GENERAL questions');
    expect(w).toContain('Les dates et les personnages');
    expect(readingPrompt('files', 'fr', { options })).toContain('highlighted, underlined');
    expect(readingPrompt('files', 'fr', { options })).toContain('Les dates et les personnages');
  });
});
