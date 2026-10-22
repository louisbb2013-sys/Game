import type { Concept, Question } from '@lumo/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The deck "server" the writer talks to: an in-memory bank.
let bank: Question[] = [];
const patches: { add?: Question[]; remove?: string[] }[] = [];
vi.mock('../../apps/web/src/lib/api', () => ({
  api: vi.fn(async (path: string, init?: { method?: string; body?: { add?: Question[]; remove?: string[] } }) => {
    if (path.endsWith('/offline')) return { deck: { id: 'd1', title: 'Gravité', subject: 'Science', language: 'fr' }, concepts, bank };
    if (path.endsWith('/bank') && init?.method === 'PATCH') {
      patches.push(init.body ?? {});
      const before = bank.length;
      const remove = new Set(init.body?.remove ?? []);
      bank = bank.filter((q) => !remove.has(q.variantKey)).concat(init.body?.add ?? []);
      return { count: bank.length, removed: before - (bank.length - (init.body?.add?.length ?? 0)) };
    }
    if (path === '/api/local/memory') return { notes: [{ id: 'n1', text: 'We use the book Zénith 2', at: 0 }], prefs: { explain: 'normal', level: 'auto', adapt: true }, noticed: { answered: 0, accuracy: null, weakFormats: [], strongFormats: [], timeOfDay: null, subjects: [], weakIdeas: [] }, suggestions: [] };
    throw new Error(`unexpected ${path}`);
  }),
  NETLIFY: false,
}));

const concepts: Concept[] = [
  { id: 'c1', topic: 'Gravité', kind: 'definition', term: 'Masse', summary: 'Quantité de matière qui compose un objet, la même partout.', keyPoints: ['en kilogrammes'], misconceptions: ['la masse change sur la Lune'], examples: [], synonyms: [] },
  { id: 'c2', topic: 'Gravité', kind: 'definition', term: 'Poids', summary: 'Force exercée par la gravité sur un objet, qui dépend de la planète.', keyPoints: ['en newtons'], misconceptions: [], examples: [], synonyms: [] },
];

const lines = [
  { c: 1, type: 'mcq', level: 'apply', q: 'Une astronaute a une masse de 60 kg sur Terre. Quelle est sa masse sur la Lune?', options: ['60 kg', '10 kg', '0 kg'], answer: 0, why: 'La masse ne dépend pas du lieu.', wrong: ['', 'Ça, c’est le poids qui diminue.', 'Moins de gravité n’enlève pas de matière.'] },
  { c: 2, type: 'tf', level: 'understand', q: 'Sur Mars, un pèse-personne affiche un plus petit nombre que sur Terre.', answer: true, why: 'Mars attire moins fort.' },
  { c: 2, type: 'mcq', level: 'understand', q: 'Dans quelle unité mesure-t-on une force comme celle-ci?', options: ['newton', 'kilogramme', 'litre', 'mètre'], answer: 0, why: 'Une force se mesure en newtons.', wrong: ['', 'Unité de masse.', 'Unité de volume.', 'Unité de longueur.'] },
].map((l) => JSON.stringify(l));

let mode: 'ok' | 'denied' = 'ok';
const calls: { input: string; opts: Record<string, unknown> }[] = [];
const sample = Object.assign(
  async (input: string, opts: { onText?: (u: { text: string; delta: string }) => void }) => {
    calls.push({ input, opts: opts as Record<string, unknown> });
    if (mode === 'denied') throw { code: 'not_granted', message: 'no' };
    // Stream the reply in chunks: the first line alone, then half of the next, then the rest.
    const text = `${lines.join('\n')}\n`;
    const a = lines[0]!.length + 1;
    const b = a + 30;
    opts.onText?.({ text: text.slice(0, a), delta: text.slice(0, a) });
    opts.onText?.({ text: text.slice(0, b), delta: text.slice(a, b) });
    opts.onText?.({ text, delta: text.slice(b) });
    return { text, truncated: false };
  },
  {
    // The checker: agrees with the key except on the unit question (index 2 of the one-tap ones).
    json: async (input: string) => {
      const qs = [...input.matchAll(/^Q(\d+):/gm)].length;
      const out: number[] = [];
      const blocks = input.split(/\nQ\d+: /).slice(1);
      for (let i = 0; i < qs; i++) {
        const b = blocks[i] ?? '';
        const opts = [...b.matchAll(/^\s+(\d)\) (.*)$/gm)].map((m) => m[2]);
        if (b.includes('unité')) out.push(-1);
        else if (b.includes('astronaute')) out.push(opts.indexOf('60 kg'));
        else out.push(opts.indexOf('Vrai'));
      }
      return out;
    },
    limits: async () => ({}),
  },
);
(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { claude: unknown }).claude = { use: async (n: string) => (n === 'sample' ? sample : null) };

const { writeQuestions, writingPrompt } = await import('../../apps/web/src/local/writer');

describe('Claude writes the deck’s questions', () => {
  beforeEach(() => {
    bank = [];
    patches.length = 0;
    calls.length = 0;
    mode = 'ok';
  });

  it('asks for real test questions in the deck’s language, with the rules and examples', () => {
    const p = writingPrompt({ title: 'Gravité', subject: 'Science', language: 'fr' }, concepts);
    expect(p).toContain('1. Masse — Quantité de matière');
    expect(p).toContain('Mistakes students make: la masse change sur la Lune');
    expect(p).toContain('Never copy the notes');
    expect(p).toContain('the right one must NOT be the longest');
    expect(p).toContain('élément déclencheur'); // French examples for a French deck
    expect(p).toContain('one JSON object per line');
  });

  it('saves questions while they stream, then drops any the checker disputes', async () => {
    const s = await writeQuestions('d1');
    expect(s.status).toBe('done');
    // Saved in more than one step (the first lines arrived before the reply finished).
    expect(patches.filter((p) => p.add?.length).length).toBeGreaterThanOrEqual(2);
    expect(bank.map((q) => q.format).sort()).toEqual(['multiple_choice', 'true_false']);
    expect(bank.some((q) => q.prompt.includes('unité'))).toBe(false);
    const mcq = bank.find((q) => q.format === 'multiple_choice') as Question & { optionNotes?: Record<string, string> };
    expect(Object.values(mcq.optionNotes ?? {})).toContain('Ça, c’est le poids qui diminue.');
    // Fresh answers every time (a regenerate must not replay a cached reply).
    expect(calls[0]!.opts.cache).toBe(false);
    // What the student told Revio goes into the writing prompt; the first small batch is quick.
    expect(calls[0]!.input).toContain('We use the book Zénith 2');
    expect(calls[0]!.opts.modelTier).toBe('quick');
  });

  it('stops and says why when the viewer said no to Claude', async () => {
    mode = 'denied';
    const s = await writeQuestions('d1');
    expect(s.status).toBe('error');
    expect(s.error).toBe('not_granted');
    expect(bank).toHaveLength(0);
  });
});
