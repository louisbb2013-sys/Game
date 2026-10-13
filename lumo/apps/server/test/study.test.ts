import { addDays, dayKey, perfectAnswer, type Question } from '@lumo/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, setupTestApp } from './helpers.ts';

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  t = await setupTestApp();
});
afterAll(async () => {
  await t.close();
});

async function login(name: string) {
  const res = await t.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name } });
  return { cookie: cookieFrom(res), id: res.json().user.id as string };
}
const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, cookie?: string, payload?: object) =>
  t.app.inject({ method, url, headers: cookie ? { cookie } : {}, payload });
const sampleDeck = async (cookie: string) => (await req('POST', '/api/decks/sample', cookie, { language: 'en' })).json().id as string;
const current = async (sessionId: string) => (await t.db.query('SELECT current FROM quiz_sessions WHERE id = $1', [sessionId])).rows[0].current as Question;

describe('mock exam', () => {
  it('no retries, no teach-back, a report at the end', async () => {
    const u = await login('examiner');
    const deck = await sampleDeck(u.cookie);
    const start = (await req('POST', `/api/decks/${deck}/sessions`, u.cookie, { mode: 'exam', length: 6 })).json();
    expect(start.session.endsAt).toBeGreaterThan(Date.now() + 5 * 60_000);
    expect((await req('GET', `/api/sessions/${start.session.id}/report`, u.cookie)).json().error).toBe('exam_not_finished');

    let q = start.question;
    let summary = null;
    for (let i = 0; i < 6; i++) {
      expect(q.format).not.toBe('teach_back');
      const full = await current(start.session.id);
      // Get the even ones wrong.
      const answer = i % 2 ? perfectAnswer(full) : { kind: 'text', text: 'zzz' };
      const r = (await req('POST', `/api/sessions/${start.session.id}/answer`, u.cookie, { questionId: q.id, answer })).json();
      expect(r.result.retryScheduled).toBe(false);
      q = r.next;
      summary = r.summary;
    }
    expect(summary).toBeTruthy();
    const { report, deckTitle } = (await req('GET', `/api/sessions/${start.session.id}/report`, u.cookie)).json();
    expect(deckTitle).toBe('Cells — the basics');
    expect(report.total).toBe(6);
    expect(report.correct).toBe(3);
    expect(report.weakest.length).toBeGreaterThan(0);
    expect(report.byTopic.length).toBeGreaterThan(0);
    expect(['needs_work', 'not_yet']).toContain(report.readiness);
  });

  it('handing in early counts the rest as unanswered; late answers are refused', async () => {
    const u = await login('early');
    const deck = await sampleDeck(u.cookie);
    const s = (await req('POST', `/api/decks/${deck}/sessions`, u.cookie, { mode: 'exam', length: 5 })).json();
    await req('POST', `/api/sessions/${s.session.id}/answer`, u.cookie, { questionId: s.question.id, answer: perfectAnswer(await current(s.session.id)) });
    expect((await req('POST', `/api/sessions/${s.session.id}/hand-in`, u.cookie)).statusCode).toBe(200);
    const { report } = (await req('GET', `/api/sessions/${s.session.id}/report`, u.cookie)).json();
    expect(report.unanswered).toBe(4);
    expect(report.total).toBe(5);
    expect(report.advice).toContain('watch_time');

    const late = (await req('POST', `/api/decks/${deck}/sessions`, u.cookie, { mode: 'exam', length: 5 })).json();
    await t.db.query("UPDATE quiz_sessions SET state = jsonb_set(state, '{startedAt}', to_jsonb((extract(epoch from now()) * 1000)::bigint - 600000)) WHERE id = $1", [late.session.id]);
    const r = await req('POST', `/api/sessions/${late.session.id}/answer`, u.cookie, { questionId: late.question.id, answer: perfectAnswer(await current(late.session.id)) });
    expect(r.json().error).toBe('time_up');
    expect((await req('GET', `/api/sessions/${late.session.id}/report`, u.cookie)).json().report.unanswered).toBe(5);
  });
});

describe('study plans', () => {
  it('sets an exam date, builds the plan, shows today on home', async () => {
    const u = await login('planner');
    const deck = await sampleDeck(u.cookie);
    const today = dayKey(Date.now(), 'UTC');
    expect((await req('PUT', `/api/decks/${deck}/plan`, u.cookie, { examDay: addDays(today, -1) })).json().error).toBe('date_in_past');
    const { plan } = (await req('PUT', `/api/decks/${deck}/plan`, u.cookie, { examDay: addDays(today, 6), minutesPerDay: 15 })).json();
    expect(plan.daysLeft).toBe(6);
    expect(plan.days).toHaveLength(6);
    expect(plan.days[4].tasks[0].kind).toBe('mock_exam');
    const home = (await req('GET', '/api/plans/today', u.cookie)).json();
    expect(home.plans[0].deckId).toBe(deck);
    expect(home.plans[0].questions).toBeGreaterThan(0);
    await req('DELETE', `/api/decks/${deck}/plan`, u.cookie);
    expect((await req('GET', `/api/decks/${deck}/plan`, u.cookie)).json().plan).toBeNull();
  });
});

describe('progress links', () => {
  it('a parent sees progress without personal data; links can be revoked', async () => {
    const u = await login('kiddo');
    await t.db.query("UPDATE users SET email = 'kid@example.com' WHERE id = $1", [u.id]);
    await sampleDeck(u.cookie);
    const { token, url } = (await req('POST', '/api/me/shares', u.cookie, { label: 'Mum' })).json();
    expect(url).toContain(`/progress/${token}`);
    const view = await req('GET', `/api/progress/${token}`);
    expect(view.statusCode).toBe(200);
    const body = view.json();
    expect(body.decks[0].title).toBe('Cells — the basics');
    expect(JSON.stringify(body)).not.toContain('kid@example.com');
    expect(body).not.toHaveProperty('email');
    expect((await req('GET', '/api/me/shares', u.cookie)).json().links[0].lastViewedAt).toBeTruthy();
    await req('DELETE', `/api/me/shares/${token}`, u.cookie);
    expect((await req('GET', `/api/progress/${token}`)).statusCode).toBe(404);
    expect((await req('GET', '/api/progress/not-a-real-token-123')).statusCode).toBe(404);
  });
});

describe('reminders', () => {
  it('one email a day, only when turned on and not studied yet', async () => {
    const u = await login('sleepy');
    await t.db.query("UPDATE users SET email = 'sleepy@example.com', timezone = 'UTC' WHERE id = $1", [u.id]);
    const bad = await req('PATCH', '/api/me', u.cookie, { settings: { reminder: { enabled: true, time: '25:00', days: [1] } } });
    expect(bad.statusCode).toBe(400);
    await req('PATCH', '/api/me', u.cookie, { settings: { reminder: { enabled: true, time: '17:00', days: [0, 1, 2, 3, 4, 5, 6] } } });
    const at = Date.parse('2026-10-13T17:20:00Z');
    const sent: string[] = [];
    const mail = (t.ctx.study as unknown as { mail: { send: (to: string) => Promise<void> } }).mail;
    const orig = mail.send.bind(mail);
    mail.send = async (to: string) => void sent.push(to);
    try {
      await t.ctx.study.sendReminders(at);
      await t.ctx.study.sendReminders(at + 60_000);
      expect(sent.filter((x) => x === 'sleepy@example.com')).toHaveLength(1);
    } finally {
      mail.send = orig;
    }
  });
});

describe('offline review', () => {
  it('downloads a deck, syncs reviews once, small capped XP', async () => {
    const u = await login('offliner');
    const deck = await sampleDeck(u.cookie);
    const off = (await req('GET', `/api/decks/${deck}/offline`, u.cookie)).json();
    expect(off.concepts.length).toBeGreaterThan(3);
    const now = Date.now();
    const reviews = off.concepts.slice(0, 4).map((c: { id: string }, i: number) => ({ conceptId: c.id, format: 'multiple_choice', bloom: 'remember', score: i < 3 ? 1 : 0, at: now - 1000 * i }));
    reviews.push({ conceptId: '00000000-0000-0000-0000-000000000000', format: 'multiple_choice', bloom: 'remember', score: 1, at: now });
    reviews.push({ conceptId: off.concepts[0].id, format: 'multiple_choice', bloom: 'remember', score: 1, at: now - 30 * 86_400_000 });
    const r = (await req('POST', '/api/offline/sync', u.cookie, { clientId: 'batch-0001', deckId: deck, reviews })).json();
    expect(r.applied).toBe(4);
    expect(r.xp).toBe(6);
    expect(r.streakExtended).toBe(true);
    const again = (await req('POST', '/api/offline/sync', u.cookie, { clientId: 'batch-0001', deckId: deck, reviews })).json();
    expect(again.duplicate).toBe(true);
    const states = (await t.db.query('SELECT count(*)::int AS n FROM concept_states WHERE user_id = $1', [u.id])).rows[0].n;
    expect(states).toBe(4);
  });
});

describe('my data', () => {
  it('exports everything as a download; delete removes the account', async () => {
    const u = await login('leaver');
    await sampleDeck(u.cookie);
    const res = await req('GET', '/api/me/export', u.cookie);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="lumo-data-/);
    const data = res.json();
    expect(data.user.id).toBe(u.id);
    expect(data.decks[0].concepts.length).toBeGreaterThan(3);
    expect(Array.isArray(data.answers)).toBe(true);
    expect((await req('DELETE', '/api/me', u.cookie)).json().ok).toBe(true);
    expect((await t.db.query('SELECT 1 FROM users WHERE id = $1', [u.id])).rowCount).toBe(0);
  });
});
