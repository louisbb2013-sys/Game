import { grade, perfectAnswer, SAMPLE_DECKS, type Concept } from '@lumo/core';
import { describe, expect, it } from 'vitest';
import { ClaudeProvider } from '../src/ai/claude.ts';

const deck: Concept[] = SAMPLE_DECKS.en.concepts.map((c, i) => ({ ...c, id: `c${i}` }));

function fakeApi(text: string, stop_reason = 'end_turn') {
  const calls: any[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), headers: init.headers });
    const body = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('ClaudeProvider (mocked HTTP)', () => {
  it('sends a structured-output request and builds the question', async () => {
    const draft = { prompt: 'A cell is put in pure water. What happens?', options: ['It swells', 'It shrinks', 'Nothing', 'It divides'], correctIndex: 0, explanation: 'Water enters by osmosis.' };
    const api = fakeApi(JSON.stringify(draft));
    const p = new ClaudeProvider('sk-test', 'claude-opus-5-5', 'claude-opus-5-5', () => {}, api.f);
    const q = await p.generateQuestion({ concept: deck[6]!, format: 'cause_effect', bloom: 'apply', deck, language: 'en', avoidPrompts: ['old prompt'], seed: 5 });
    expect(q?.format).toBe('cause_effect');
    expect(grade(q!, perfectAnswer(q!)).score).toBe(1);
    const req = api.calls[0];
    expect(req.url).toContain('/v1/messages');
    expect(req.body.model).toBe('claude-opus-5-5');
    expect(req.body.output_config.format.type).toBe('json_schema');
    expect(req.body.output_config.effort).toBe('low');
    expect(req.body.fallbacks).toBe('default');
    expect(req.body.thinking).toBeUndefined();
    expect(JSON.stringify(req.body.messages)).toContain('old prompt');
  });

  it('falls back to the local generator on invalid output or refusal', async () => {
    for (const api of [fakeApi('{"prompt": 1}'), fakeApi('not json'), fakeApi('{}', 'refusal')]) {
      const p = new ClaudeProvider('sk-test', 'claude-opus-5-5', 'claude-opus-5-5', () => {}, api.f);
      const q = await p.generateQuestion({ concept: deck[0]!, format: 'multiple_choice', bloom: 'remember', deck, language: 'en', avoidPrompts: [], seed: 1 });
      expect(q?.format).toBe('multiple_choice');
    }
  });

  it('grades open answers and clamps the score', async () => {
    const api = fakeApi(JSON.stringify({ score: 1.4, matchedPoints: ['a'], missingPoints: [], feedback: 'Nice!', followUp: 'Why though?' }));
    const p = new ClaudeProvider('sk-test', 'claude-opus-5-5', 'claude-haiku-5-5', () => {}, api.f);
    const q = (await new ClaudeProvider('k', 'm', 'm', () => {}, fakeApi('bad').f).generateQuestion({ concept: deck[0]!, format: 'teach_back', bloom: 'understand', deck, language: 'en', avoidPrompts: [], seed: 2 }))!;
    const g = await p.gradeOpen({ question: q, need: { text: 'my answer', keyPoints: ['a', 'b'], minPoints: 2, weight: 1 }, language: 'en', wantFollowUp: true });
    expect(g).toMatchObject({ score: 1, feedback: 'Nice!', followUp: 'Why though?' });
    expect(api.calls[0].body.model).toBe('claude-haiku-5-5');
    expect(api.calls[0].body.fallbacks).toBeUndefined(); // not supported on Haiku
  });
});

describe('ClaudeProvider: notes, tutor and sandbox (mocked HTTP)', () => {
  const llmConcept = {
    topic: 'Cells', kind: 'definition', term: 'ribosome', summary: 'Where proteins are made.', keyPoints: ['Makes proteins'], misconceptions: ['Makes energy'],
    examples: [], synonyms: [], steps: [], causeEffects: [], comparison: null, categories: [], date: '', formula: null,
  };

  it('sends photos and PDFs to vision, validates concepts, drops bad ones', async () => {
    const bad = { ...llmConcept, term: '', summary: '' };
    const formula = { ...llmConcept, term: 'speed', kind: 'formula', formula: { expression: 'd / t', resultSymbol: 'v', resultName: 'speed', resultUnit: 'm/s', variables: [{ symbol: 'd', name: 'distance', unit: 'm', min: 10, max: 100, step: 10 }, { symbol: 't', name: 'time', unit: 's', min: 2, max: 10, step: 1 }] } };
    const api = fakeApi(JSON.stringify({ title: 'Cells', subject: 'Biology', language: 'en', summary: 'About cells.', ignored: ['page numbers'], concepts: [llmConcept, bad, formula] }));
    const p = new ClaudeProvider('sk-test', 'claude-opus-5-5', 'claude-opus-5-5', () => {}, api.f);
    const d = await p.extractConcepts({
      media: [
        { kind: 'image', mime: 'image/jpeg', name: 'a.jpg', data: Buffer.from('fake') },
        { kind: 'pdf', mime: 'application/pdf', name: 'b.pdf', data: Buffer.from('%PDF-1.4') },
      ],
      instruction: 'test on friday, skip chapter 2',
      language: 'en',
    });
    expect(d.concepts.map((c) => c.term)).toEqual(['ribosome', 'speed']);
    expect(d.concepts[1]!.formula?.result.unit).toBe('m/s');
    const content = api.calls[0].body.messages[0].content;
    expect(content[0].type).toBe('image');
    expect(content[1].type).toBe('document');
    expect(content.at(-1).text).toContain('skip chapter 2');
    expect(api.calls[0].body.output_config.effort).toBe('medium');
  });

  it('writes a video script and repairs invalid checks', async () => {
    const scenes = [
      { type: 'title', heading: 'Cells!', text: '', bullets: [], emoji: '🔬', narration: 'Hi', check: null },
      { type: 'idea', heading: 'Ribosome', text: 'Protein factory', bullets: [], emoji: '🏭', narration: 'Ribosomes build proteins', check: null },
      { type: 'check', heading: 'Pause!', text: '', bullets: [], emoji: '⏸️', narration: 'Your turn', check: { prompt: 'Q?', options: ['a', 'a'], correctIndex: 5, explanation: 'x' } },
      { type: 'recap', heading: 'Recap', text: '', bullets: ['one'], emoji: '✨', narration: 'Bye', check: null },
    ];
    const api = fakeApi(JSON.stringify({ scenes }));
    const p = new ClaudeProvider('sk-test', 'claude-opus-5-5', 'claude-opus-5-5', () => {}, api.f);
    const v = await p.sandboxScript('video', deck, 'Cells', 'en');
    expect(v?.kind).toBe('video');
    const check = v!.kind === 'video' ? v!.scenes[2]!.check! : null;
    expect(check!.options[check!.correctIndex]).toBeTruthy(); // invalid check replaced
    expect(await p.sandboxScript('crossword', deck, 'Cells', 'en')).toBeNull(); // built locally
  });

  it('tutor replies in plain text with the deck as context', async () => {
    const api = fakeApi('Think of a ribosome like a tiny 3D printer!');
    const p = new ClaudeProvider('sk-test', 'claude-opus-5-5', 'claude-opus-5-5', () => {}, api.f);
    const r = await p.tutorReply({ history: [{ role: 'user', content: 'what is a ribosome' }], language: 'en', deck: { title: 'Cells', concepts: deck } });
    expect(r).toContain('3D printer');
    expect(api.calls[0].body.system).toContain('nucleus');
    expect(api.calls[0].body.output_config.format).toBeUndefined();
  });
});
