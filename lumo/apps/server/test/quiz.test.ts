import { levelFromXp, levelUpRewards, perfectAnswer, type Answer, type Question } from '@lumo/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AiProvider } from '../src/ai/provider.ts';
import { MockProvider } from '../src/ai/provider.ts';
import { cookieFrom, setupTestApp } from './helpers.ts';

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
afterAll(async () => { await t.close(); });

async function login(name: string) {
  const res = await t.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name } });
  return cookieFrom(res);
}
async function sampleDeck(cookie: string, language = 'en') {
  const res = await t.app.inject({ method: 'POST', url: '/api/decks/sample', headers: { cookie }, payload: { language } });
  expect(res.statusCode).toBe(200);
  return res.json().id as string;
}
async function current(sessionId: string): Promise<Question> {
  const { rows } = await t.db.query<{ current: Question }>('SELECT current FROM quiz_sessions WHERE id = $1', [sessionId]);
  return rows[0]!.current;
}
function wrongAnswer(q: Question): Answer {
  switch (q.format) {
    case 'multiple_choice':
    case 'cause_effect':
      return { kind: 'choice', optionId: q.options.find((o) => o.id !== q.correctId)!.id };
    case 'multiple_select':
      return { kind: 'multi', optionIds: [] };
    case 'fill_blank':
      return { kind: 'blanks', values: [] };
    case 'true_false_justify':
      return { kind: 'tf', value: !q.isTrue, justification: '' };
    case 'matching':
    case 'categorize':
    case 'label_diagram':
      return { kind: 'pairs', pairs: {} };
    case 'ordering':
      return { kind: 'order', order: [] };
    case 'spot_mistake':
      return { kind: 'mistake', segmentId: 'nope', correction: '' };
    case 'calculation':
      return { kind: 'number', value: -999999 };
    default:
      return { kind: 'text', text: '' };
  }
}

describe('decks', () => {
  it('creates, lists, validates and isolates decks', async () => {
    const cookie = await login('deckowner');
    const id = await sampleDeck(cookie);
    const list = await t.app.inject({ method: 'GET', url: '/api/decks', headers: { cookie } });
    expect(list.json().decks[0]).toMatchObject({ id, conceptCount: 9, masteredCount: 0 });
    const bad = await t.app.inject({ method: 'POST', url: '/api/decks', headers: { cookie }, payload: { title: 'x', language: 'en', concepts: [] } });
    expect(bad.statusCode).toBe(400);
    const badFormula = await t.app.inject({
      method: 'POST', url: '/api/decks', headers: { cookie },
      payload: { title: 'x', language: 'en', concepts: [{ topic: 't', kind: 'formula', term: 'f', summary: 's', formula: { expression: 'process.exit()', result: { symbol: 'y', name: 'y' }, variables: [{ symbol: 'x', name: 'x', min: 1, max: 2 }] } }] },
    });
    expect(badFormula.statusCode).toBe(400);
    const intruder = await login('intruder');
    expect((await t.app.inject({ method: 'GET', url: `/api/decks/${id}`, headers: { cookie: intruder } })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'POST', url: `/api/decks/${id}/sessions`, headers: { cookie: intruder }, payload: {} })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'DELETE', url: `/api/decks/${id}`, headers: { cookie: intruder } })).statusCode).toBe(404);
  });
});

describe('quiz sessions', () => {
  it('plays a full practice session: hidden keys, varied formats, XP, streak, coins, mastery', async () => {
    const cookie = await login('player');
    const deckId = await sampleDeck(cookie);
    const start = await t.app.inject({ method: 'POST', url: `/api/decks/${deckId}/sessions`, headers: { cookie }, payload: { mode: 'practice', length: 12 } });
    expect(start.statusCode).toBe(200);
    const { session } = start.json();
    let question = start.json().question;
    for (const key of ['correctId', 'accepted', 'keyPoints', 'correctOrder', 'mapping', 'answer', 'explanation']) expect(JSON.stringify(question)).not.toContain(`"${key}":`);

    const seen: { conceptId: string; format: string }[] = [];
    let summary = null;
    let totalXp = 0;
    for (let i = 0; i < 40 && question; i++) {
      const q = await current(session.id);
      expect(q.id).toBe(question.id);
      seen.push({ conceptId: q.conceptId, format: q.format });
      // Answer the first two wrong to exercise retries, the rest right.
      const answer = i < 2 ? wrongAnswer(q) : perfectAnswer(q);
      let res = await t.app.inject({ method: 'POST', url: `/api/sessions/${session.id}/answer`, headers: { cookie }, payload: { questionId: q.id, answer, timeMs: 4000 } });
      expect(res.statusCode, res.body).toBe(200);
      if (res.json().followUp) {
        // Teach-back: answer Lumoly's follow-up question.
        res = await t.app.inject({ method: 'POST', url: `/api/sessions/${session.id}/answer`, headers: { cookie }, payload: { questionId: q.id, answer: { kind: 'text', text: q.format === 'teach_back' && i >= 2 ? q.modelAnswer : '' } } });
      }
      const body = res.json();
      if (i < 2) {
        expect(body.result.correct, `${q.format} ${JSON.stringify(answer)}`).toBe(false);
        expect(body.result.retryScheduled).toBe(true);
        expect(body.result.explanation.length).toBeGreaterThan(0);
      } else {
        expect(body.result.score, `${q.format}`).toBe(1);
        expect(body.result.xp).toBeGreaterThan(0);
      }
      totalXp += body.result.xp;
      question = body.next;
      summary = body.summary;
    }
    expect(summary).not.toBeNull();
    expect(summary.answered).toBe(14); // 12 + 2 retries
    expect(summary.coins).toBeGreaterThan(0);
    expect(summary.streak).toEqual({ days: 1, extended: true });

    // Same concept is never asked twice in a row in the same format.
    const byConcept = new Map<string, string[]>();
    for (const s of seen) byConcept.set(s.conceptId, [...(byConcept.get(s.conceptId) ?? []), s.format]);
    for (const formats of byConcept.values()) for (let i = 1; i < formats.length; i++) expect(formats[i]).not.toBe(formats[i - 1]);
    expect(new Set(seen.map((s) => s.format)).size).toBeGreaterThanOrEqual(5); // formats are random: 5+ of 16 in 14 answers

    const me = (await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().user;
    expect(me.xp).toBe(totalXp);
    // Session coins + level-up coins (every level reached gives coins).
    let levelCoins = 0;
    for (let l = 2; l <= levelFromXp(totalXp); l++) levelCoins += levelUpRewards(l).coins;
    expect(me.coins).toBe(summary.coins + levelCoins);
    expect(summary.rewards.badges).toContain('first_steps');
    expect(me.streak.days).toBe(1);
    const map = (await t.app.inject({ method: 'GET', url: `/api/decks/${deckId}`, headers: { cookie } })).json();
    expect(map.concepts.some((c: { band: string }) => c.band !== 'new')).toBe(true);
    const ledger = await t.db.query('SELECT sum(amount)::int AS s FROM xp_events WHERE user_id = $1', [me.id]);
    expect(ledger.rows[0].s).toBe(totalXp);
  });

  it('teach-back keeps Lumoly’s follow-up across a reload', async () => {
    const cookie = await login('teacher');
    const deckId = await sampleDeck(cookie);
    const s = (await t.app.inject({ method: 'POST', url: `/api/decks/${deckId}/sessions`, headers: { cookie }, payload: { length: 3, formats: ['teach_back'] } })).json();
    const q = await current(s.session.id);
    const first = (await t.app.inject({ method: 'POST', url: `/api/sessions/${s.session.id}/answer`, headers: { cookie }, payload: { questionId: q.id, answer: { kind: 'text', text: 'It is the control centre.' } } })).json();
    expect(first.followUp).toBeTruthy();
    const resumed = (await t.app.inject({ method: 'GET', url: `/api/sessions/${s.session.id}`, headers: { cookie } })).json();
    expect(resumed.followUp).toBe(first.followUp);
    expect(resumed.question.id).toBe(q.id);
  });

  it('rejects stale and replayed answers', async () => {
    const cookie = await login('replayer');
    const deckId = await sampleDeck(cookie);
    const start = (await t.app.inject({ method: 'POST', url: `/api/decks/${deckId}/sessions`, headers: { cookie }, payload: { length: 3, formats: ['multiple_choice', 'type_answer'] } })).json();
    const q = await current(start.session.id);
    const payload = { questionId: q.id, answer: perfectAnswer(q) };
    const ok = await t.app.inject({ method: 'POST', url: `/api/sessions/${start.session.id}/answer`, headers: { cookie }, payload });
    expect(ok.statusCode).toBe(200);
    const again = await t.app.inject({ method: 'POST', url: `/api/sessions/${start.session.id}/answer`, headers: { cookie }, payload });
    expect(again.statusCode).toBe(409);
    const other = await login('notme');
    expect((await t.app.inject({ method: 'GET', url: `/api/sessions/${start.session.id}`, headers: { cookie: other } })).statusCode).toBe(404);
  });

  it('challenge mode costs hearts and ends at zero; practice still works', async () => {
    const cookie = await login('challenger');
    const deckId = await sampleDeck(cookie);
    const start = (await t.app.inject({ method: 'POST', url: `/api/decks/${deckId}/sessions`, headers: { cookie }, payload: { mode: 'challenge', length: 20, formats: ['multiple_choice'] } })).json();
    let body: any = null;
    for (let i = 0; i < 10; i++) {
      const q = await current(start.session.id);
      if (!q) break;
      body = (await t.app.inject({ method: 'POST', url: `/api/sessions/${start.session.id}/answer`, headers: { cookie }, payload: { questionId: q.id, answer: wrongAnswer(q) } })).json();
      if (body.summary) break;
    }
    expect(body.summary.endedReason).toBe('out_of_hearts');
    expect(body.session.hearts).toBe(0);
    const blocked = await t.app.inject({ method: 'POST', url: `/api/decks/${deckId}/sessions`, headers: { cookie }, payload: { mode: 'challenge' } });
    expect(blocked.json().error).toBe('no_hearts');
    const practice = await t.app.inject({ method: 'POST', url: `/api/decks/${deckId}/sessions`, headers: { cookie }, payload: { mode: 'practice' } });
    expect(practice.statusCode).toBe(200);
  });

  it('wrong-only mode focuses on missed concepts', async () => {
    const cookie = await login('fixer');
    const deckId = await sampleDeck(cookie);
    const s1 = (await t.app.inject({ method: 'POST', url: `/api/decks/${deckId}/sessions`, headers: { cookie }, payload: { length: 3, formats: ['multiple_choice'] } })).json();
    const q = await current(s1.session.id);
    await t.app.inject({ method: 'POST', url: `/api/sessions/${s1.session.id}/answer`, headers: { cookie }, payload: { questionId: q.id, answer: wrongAnswer(q) } });
    const s2 = (await t.app.inject({ method: 'POST', url: `/api/decks/${deckId}/sessions`, headers: { cookie }, payload: { mode: 'wrong_only', length: 3 } })).json();
    const ids = (await t.db.query('SELECT state FROM quiz_sessions WHERE id = $1', [s2.session.id])).rows[0].state.queue;
    expect(new Set(ids)).toEqual(new Set([q.conceptId]));
  });
});

describe('AI provider integration', () => {
  it('uses AI grading for open answers and falls back to the heuristic when AI fails', async () => {
    let calls = 0;
    class Flaky extends MockProvider {
      override async gradeOpen() {
        calls++;
        if (calls === 1) return { score: 0.9, matchedPoints: ['x'], missingPoints: [], feedback: 'Great explanation!' };
        throw new Error('api down');
      }
    }
    const flaky: AiProvider = new Flaky();
    const ai = await setupTestApp({ ai: flaky });
    try {
      const login2 = await ai.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name: 'aiuser' } });
      const cookie = cookieFrom(login2);
      const deckId = (await ai.app.inject({ method: 'POST', url: '/api/decks/sample', headers: { cookie }, payload: { language: 'en' } })).json().id;
      const s = (await ai.app.inject({ method: 'POST', url: `/api/decks/${deckId}/sessions`, headers: { cookie }, payload: { length: 3, formats: ['explain'] } })).json();
      const q1 = (await ai.db.query('SELECT current FROM quiz_sessions WHERE id = $1', [s.session.id])).rows[0].current;
      const r1 = (await ai.app.inject({ method: 'POST', url: `/api/sessions/${s.session.id}/answer`, headers: { cookie }, payload: { questionId: q1.id, answer: { kind: 'text', text: 'anything' } } })).json();
      expect(r1.result.score).toBe(0.9);
      expect(r1.result.feedback).toBe('Great explanation!');
      const q2 = (await ai.db.query('SELECT current FROM quiz_sessions WHERE id = $1', [s.session.id])).rows[0].current;
      const r2 = (await ai.app.inject({ method: 'POST', url: `/api/sessions/${s.session.id}/answer`, headers: { cookie }, payload: { questionId: q2.id, answer: { kind: 'text', text: q2.modelAnswer } } })).json();
      expect(r2.result.score).toBe(1); // heuristic fallback still grades fairly
    } finally {
      await ai.close();
    }
  });
});
