import type { ShortCheck } from '@lumo/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '../src/ai/provider.ts';
import { cookieFrom, setupTestApp } from './helpers.ts';

/** Offline generator, plus a judge that accepts one specific wording. */
class JudgingAi extends MockProvider {
  override readonly name = 'claude' as unknown as 'mock';
  seen: ShortCheck[] = [];
  override async judgeShort(_q: string, checks: ShortCheck[]) {
    this.seen.push(...checks);
    return Object.fromEntries(checks.map((c) => [c.key, c.given === 'my own words']));
  }
}

const ai = new JudgingAi();
let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  t = await setupTestApp({ ai });
});
afterAll(async () => {
  await t.close();
});

describe('short answers in other words', () => {
  it('Claude may accept a different wording; wrong answers stay wrong', async () => {
    const login = await t.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name: 'wordy' } });
    const cookie = cookieFrom(login);
    const deck = (await t.app.inject({ method: 'POST', url: '/api/decks/sample', headers: { cookie }, payload: { language: 'en' } })).json().id;
    const s = (await t.app.inject({ method: 'POST', url: `/api/decks/${deck}/sessions`, headers: { cookie }, payload: { length: 5, formats: ['type_answer'] } })).json();
    const r1 = (await t.app.inject({ method: 'POST', url: `/api/sessions/${s.session.id}/answer`, headers: { cookie }, payload: { questionId: s.question.id, answer: { kind: 'text', text: 'my own words' } } })).json();
    expect(r1.result.correct).toBe(true);
    expect(ai.seen[0]!.given).toBe('my own words');
    const r2 = (await t.app.inject({ method: 'POST', url: `/api/sessions/${s.session.id}/answer`, headers: { cookie }, payload: { questionId: r1.next.id, answer: { kind: 'text', text: 'banana' } } })).json();
    expect(r2.result.correct).toBe(false);
  });
});
