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
