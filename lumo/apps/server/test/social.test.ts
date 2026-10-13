import { perfectAnswer, type LivePublic, type Question } from '@lumo/core';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, setupTestApp } from './helpers.ts';

let t: Awaited<ReturnType<typeof setupTestApp>>;
let base = '';
const sockets: Socket[] = [];
beforeAll(async () => {
  t = await setupTestApp();
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await t.close();
});

async function login(name: string) {
  const res = await t.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name } });
  const user = res.json().user;
  return { cookie: cookieFrom(res), id: user.id as string, username: user.username as string };
}
const get = (url: string, cookie: string) => t.app.inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, cookie: string, payload?: object) => t.app.inject({ method: 'POST', url, headers: { cookie }, payload });
const sampleDeck = async (cookie: string) => (await post('/api/decks/sample', cookie, { language: 'en' })).json().id as string;

describe('friends', () => {
  it('adds by username or code, accepts, and never shows email', async () => {
    const a = await login('ana');
    const b = await login('ben');
    const c = await login('cleo');
    expect((await post('/api/friends/request', a.cookie, { username: a.username })).json().error).toBe('cannot_add_self');
    expect((await post('/api/friends/request', a.cookie, { username: 'nobody_here_xyz' })).json().error).toBe('user_not_found');

    expect((await post('/api/friends/request', a.cookie, { username: b.username })).json().status).toBe('requested');
    const bView = (await get('/api/friends', b.cookie)).json();
    expect(bView.incoming.map((u: { id: string }) => u.id)).toEqual([a.id]);
    expect(JSON.stringify(bView)).not.toContain('@');
    expect((await post(`/api/friends/${a.id}/respond`, a.cookie, { accept: true })).statusCode).toBe(404); // can't accept your own request
    expect((await post(`/api/friends/${a.id}/respond`, b.cookie, { accept: true })).json().ok).toBe(true);
    expect((await get('/api/friends', a.cookie)).json().friends.map((u: { id: string }) => u.id)).toEqual([b.id]);

    // By code; asking someone who already asked you accepts.
    const codeC = (await get('/api/friends', c.cookie)).json().code;
    expect((await post('/api/friends/request', a.cookie, { code: codeC.toLowerCase() })).json().status).toBe('requested');
    expect((await post('/api/friends/request', c.cookie, { username: a.username })).json().status).toBe('friends');

    const board = (await get('/api/friends/leaderboard', a.cookie)).json().rows;
    expect(board).toHaveLength(3);
    expect(board.filter((r: { me: boolean }) => r.me)).toHaveLength(1);

    await t.app.inject({ method: 'DELETE', url: `/api/friends/${b.id}`, headers: { cookie: a.cookie } });
    expect((await get('/api/friends', b.cookie)).json().friends).toHaveLength(0);
  });

  it('friends-only decks are readable by friends, not strangers', async () => {
    const owner = await login('owner');
    const friend = await login('pal');
    const stranger = await login('stranger');
    const deck = await sampleDeck(owner.cookie);
    await t.db.query("UPDATE decks SET visibility = 'friends' WHERE id = $1", [deck]);
    await post('/api/friends/request', owner.cookie, { username: friend.username });
    await post(`/api/friends/${owner.id}/respond`, friend.cookie, { accept: true });
    expect((await get(`/api/decks/${deck}`, friend.cookie)).statusCode).toBe(200);
    expect((await get(`/api/decks/${deck}`, stranger.cookie)).statusCode).toBe(404);
  });
});

describe('study groups', () => {
  it('create, join by code, share a deck, daily quiz counts once', async () => {
    const a = await login('gina');
    const b = await login('hugo');
    const outsider = await login('ivy');
    const { id } = (await post('/api/groups', a.cookie, { name: 'Bio squad' })).json();
    const g = (await get(`/api/groups/${id}`, a.cookie)).json();
    expect(g.isOwner).toBe(true);
    expect((await post(`/api/groups/${id}/daily`, a.cookie)).json().error).toBe('no_group_decks');

    expect((await post('/api/groups/join', b.cookie, { code: g.inviteCode.toLowerCase() })).json().id).toBe(id);
    expect((await get(`/api/groups/${id}`, outsider.cookie)).statusCode).toBe(404);

    const deck = await sampleDeck(a.cookie);
    expect((await post(`/api/groups/${id}/decks`, b.cookie, { deckId: deck })).json().error).toBe('deck_not_found'); // not b's deck
    expect((await post(`/api/groups/${id}/decks`, a.cookie, { deckId: deck })).json().ok).toBe(true);
    expect((await get(`/api/decks/${deck}`, b.cookie)).statusCode).toBe(200); // shared with the group
    expect((await get(`/api/decks/${deck}`, outsider.cookie)).statusCode).toBe(404);

    // b plays the daily quiz to the end.
    const start = (await post(`/api/groups/${id}/daily`, b.cookie)).json();
    let q = start.question;
    let done = false;
    for (let i = 0; i < 30 && !done; i++) {
      const row = (await t.db.query('SELECT current FROM quiz_sessions WHERE id = $1', [start.session.id])).rows[0];
      const r = (await post(`/api/sessions/${start.session.id}/answer`, b.cookie, { questionId: q.id, answer: perfectAnswer(row.current as Question) })).json();
      done = !!r.summary;
      q = r.next ?? q;
    }
    expect(done).toBe(true);
    const after = (await get(`/api/groups/${id}`, a.cookie)).json();
    expect(after.daily.results).toHaveLength(1);
    expect(after.daily.results[0].username).toBe(b.username);
    expect(after.members.map((m: { id: string }) => m.id).sort()).toEqual([a.id, b.id].sort());

    // Owner leaves: b becomes owner.
    await post(`/api/groups/${id}/leave`, a.cookie);
    expect((await get(`/api/groups/${id}`, b.cookie)).json().isOwner).toBe(true);
    await post(`/api/groups/${id}/leave`, b.cookie);
    expect((await get(`/api/groups/${id}`, b.cookie)).statusCode).toBe(404);
  }, 30_000);
});

// ------------------------------------------------------------------- live

function client(cookie: string) {
  const s = connect(base, { path: '/api/live/socket', extraHeaders: { cookie }, transports: ['websocket'], forceNew: true });
  sockets.push(s);
  return s;
}
const emit = <T = Record<string, unknown>>(s: Socket, ev: string, body: object) =>
  new Promise<T & { ok: boolean; error?: string }>((res) => s.emit(ev, body, res));
const nextState = (s: Socket, pred: (v: LivePublic) => boolean) =>
  new Promise<LivePublic>((res) => {
    const on = (v: LivePublic) => {
      if (pred(v)) {
        s.off('live:state', on);
        res(v);
      }
    };
    s.on('live:state', on);
  });

describe('live games', () => {
  it('rejects sockets without a session', async () => {
    const s = connect(base, { path: '/api/live/socket', transports: ['websocket'], forceNew: true });
    sockets.push(s);
    const err = await new Promise<Error>((res) => s.on('connect_error', res));
    expect(err.message).toBe('unauthorized');
  });

  it('two players: lobby, answers graded on the server, podium rewards', async () => {
    const host = await login('host');
    const guest = await login('guest');
    const deck = await sampleDeck(host.cookie);
    const hs = client(host.cookie);
    const gs = client(guest.cookie);

    const created = await emit<{ code: string }>(hs, 'live:create', { deckId: deck, count: 3 });
    expect(created.ok).toBe(true);
    const code = created.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Guest can't create from a deck they can't see.
    expect((await emit(gs, 'live:create', { deckId: deck, count: 3 })).error).toBe('deck_not_found');

    await emit(hs, 'live:join', { code });
    expect((await emit(hs, 'live:start', { code })).error).toBe('not_enough_players');
    const joined = await emit<{ state: LivePublic }>(gs, 'live:join', { code: code.toLowerCase() });
    expect(joined.state.players).toHaveLength(2);
    expect((await emit(gs, 'live:start', { code })).error).toBe('not_host');

    const questionSeen = nextState(gs, (v) => v.phase === 'question');
    expect((await emit(hs, 'live:start', { code })).ok).toBe(true);
    let view = await questionSeen;
    expect(JSON.stringify(view.question)).not.toMatch(/"correct|answerKey|"keyPoints/);

    const internal = (t.ctx.live as unknown as { games: Map<string, { state: { questions: Question[] } }> }).games.get(code)!;
    for (let i = 0; i < 3; i++) {
      const q = internal.state.questions[i]!;
      const revealed = nextState(hs, (v) => v.phase === 'reveal' && v.index === i);
      expect((await emit(hs, 'live:answer', { code, questionId: q.id, answer: perfectAnswer(q) })).ok).toBe(true);
      expect((await emit(hs, 'live:answer', { code, questionId: q.id, answer: perfectAnswer(q) })).error).toBe('already_answered');
      // The guest answers something wrong.
      await emit(gs, 'live:answer', { code, questionId: q.id, answer: { kind: 'text', text: 'no idea' } });
      view = await revealed;
      expect(view.reveal!.results[host.id]!.correct).toBe(true);
      expect(view.reveal!.results[host.id]!.points).toBeGreaterThan(500);
      expect(view.reveal!.results[guest.id]!.points).toBe(0);
      if (i < 2) {
        const nextQ = nextState(gs, (v) => v.phase === 'question' && v.index === i + 1);
        await emit(hs, 'live:next', { code });
        await nextQ;
      }
    }

    const hostReward = new Promise<{ rank: number; xp: number; coins: number }>((res) => hs.once('live:reward', res));
    const guestReward = new Promise<{ rank: number; xp: number; coins: number }>((res) => gs.once('live:reward', res));
    const podium = nextState(gs, (v) => v.phase === 'podium');
    await emit(hs, 'live:next', { code });
    expect((await podium).players.find((p) => p.id === host.id)!.rank).toBe(1);
    const [hr, gr] = await Promise.all([hostReward, guestReward]);
    expect(hr.rank).toBe(1);
    expect(gr.rank).toBe(2);
    expect(hr.xp).toBeGreaterThan(gr.xp);
    expect(gr.xp).toBeGreaterThan(0); // everyone gets something

    expect((await emit(hs, 'live:next', { code })).error).toBe('wrong_phase'); // rewards only once
    const xp = (await t.db.query("SELECT user_id, sum(amount)::int AS s FROM xp_events WHERE reason = 'live' GROUP BY user_id")).rows;
    expect(xp.find((r) => r.user_id === host.id).s).toBe(hr.xp);
    const saved = (await t.db.query('SELECT status, results FROM live_games WHERE code = $1', [code])).rows[0];
    expect(saved.status).toBe('done');
    expect(saved.results[0].userId).toBe(host.id);
    const badges = (await get('/api/game/badges', host.cookie)).json().badges;
    expect(badges.find((b: { id: string }) => b.id === 'live_champion').earnedAt).toBeTruthy();
  }, 30_000);

  it('joining after start is refused; host can kick in the lobby', async () => {
    const host = await login('host2');
    const a = await login('paula');
    const b = await login('pablo');
    const deck = await sampleDeck(host.cookie);
    const hs = client(host.cookie);
    const as = client(a.cookie);
    const bs = client(b.cookie);
    const { code } = await emit<{ code: string }>(hs, 'live:create', { deckId: deck, count: 3 });
    await emit(hs, 'live:join', { code });
    await emit(as, 'live:join', { code });
    const kicked = new Promise((res) => as.once('live:kicked', res));
    expect((await emit(as, 'live:kick', { code, playerId: host.id })).error).toBe('not_host');
    await emit(hs, 'live:kick', { code, playerId: a.id });
    await kicked;
    expect((await emit(as, 'live:join', { code })).error).toBe('not_in_game');
    await emit(bs, 'live:join', { code });
    await emit(hs, 'live:start', { code });
    const late = client((await login('late')).cookie);
    expect((await emit(late, 'live:join', { code })).error).toBe('started');
    expect((await emit(late, 'live:join', { code: 'ZZZZZZ' })).error).toBe('not_in_game');
  }, 30_000);
});
