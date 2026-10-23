import { describe, expect, it, vi } from 'vitest';
import { makeAuthHandler } from '../lib/auth';
import { makeDataHandler } from '../lib/data';
import { memoryKV } from '../lib/kv';

function site(identity: Record<string, string> = {}) {
  const kv = memoryKV();
  const env = () => undefined;
  let clock = 1_000_000;
  const now = () => clock;
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    const tok = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? '';
    expect(String(url)).toBe('https://lumo.example/.netlify/identity/user');
    return identity[tok] ? Response.json({ id: identity[tok], email: 'kid@example.com' }) : new Response('no', { status: 401 });
  }) as typeof fetch;
  const auth = makeAuthHandler({ kv, env, now, fetch: fetchMock, rounds: 1000 });
  const data = makeDataHandler({ kv, env, now });
  const call = async (h: (r: Request) => Promise<Response>, path: string, body: unknown, token?: string) => {
    const res = await h(new Request(`https://lumo.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
    return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  return {
    kv,
    tick: (ms: number) => (clock += ms),
    signup: (name: string, password: string) => call(auth, '/api/auth/signup', { name, password }),
    login: (name: string, password: string) => call(auth, '/api/auth/login', { name, password }),
    google: (token: string) => call(auth, '/api/auth/google', { token }),
    remove: (token: string) => call(auth, '/api/auth/delete', {}, token),
    db: (token: string, body: unknown) => call(data, '/api/data', body, token),
    room: (token: string, body: unknown) => call(data, '/api/room', body, token),
  };
}

describe('accounts', () => {
  it('signs up with a name and password, then logs in from another device', async () => {
    const s = site();
    const a = await s.signup('Louy_07', 'secret123');
    expect(a.status).toBe(200);
    expect(a.body.uid).toMatch(/^u/);
    expect(a.body.name).toBe('Louy_07');
    const b = await s.login('louy_07', 'secret123'); // the name isn't case-sensitive
    expect(b.body.uid).toBe(a.body.uid);
    // Only a salted hash is kept, never the password.
    expect([...s.kv.dump().values()].join()).not.toContain('secret123');
  });

  it('keeps names unique and checks the rules', async () => {
    const s = site();
    await s.signup('Mia', 'secret123');
    expect((await s.signup('MIA', 'other123')).body.error).toBe('name_taken');
    expect((await s.signup('a b', 'secret123')).body.error).toBe('bad_name');
    expect((await s.signup('Zoe_2', '123')).body.error).toBe('weak_password');
    expect((await s.signup('Zoe_2', '123456')).status).toBe(200);
    expect((await s.signup('Zoé', '123456')).body.problem).toBe('characters'); // same rules as Lumoly usernames
    expect((await s.signup('Mia2011', '123456')).body.problem).toBe('personal_info'); // no birth years
  });

  it('refuses a wrong password and locks the name for a while after many tries', async () => {
    const s = site();
    await s.signup('Sam', 'right-one');
    expect((await s.login('Sam', 'wrong')).status).toBe(401);
    expect((await s.login('Nobody', 'wrong')).body.error).toBe('wrong_login'); // same answer as a wrong password
    for (let i = 0; i < 7; i++) await s.login('Sam', 'wrong');
    expect((await s.login('Sam', 'right-one')).body.error).toBe('locked');
    s.tick(11 * 60_000);
    expect((await s.login('Sam', 'right-one')).status).toBe(200);
  });

  it('signs in with Google through Netlify Identity, the same learner each time', async () => {
    const s = site({ 'idn-token-1': 'a1b2c3d4-0000-1111', 'idn-token-2': 'a1b2c3d4-0000-1111' });
    const a = await s.google('idn-token-1');
    expect(a.status).toBe(200);
    expect(a.body.kind).toBe('g');
    const b = await s.google('idn-token-2');
    expect(b.body.uid).toBe(a.body.uid);
    expect((await s.google('forged')).status).toBe(401);
    expect([...s.kv.dump().values()].join()).not.toContain('kid@example.com'); // no e-mail kept
  });

  it('says which Google account it is (partly hidden), and only a new account is "fresh"', async () => {
    const s = site({ 'idn-token-1': 'a1b2c3d4-0000-1111', 'idn-token-2': 'a1b2c3d4-0000-1111' });
    const first = (await s.google('idn-token-1')).body;
    expect(first.hint).toBe('ki•••@example.com');
    expect(first.fresh).toBe('1');
    const again = (await s.google('idn-token-2')).body;
    expect(again.hint).toBe('ki•••@example.com');
    expect(again.fresh).toBeUndefined(); // a second device: its guest progress must not replace the account
  });
});

describe('one name per learner', () => {
  it("won't let a second learner take a name someone already uses", async () => {
    const s = site({ g1: 'idn-0001-aaaa', g2: 'idn-0002-bbbb' });
    const a = (await s.google('g1')).body;
    const b = (await s.google('g2')).body;
    expect((await s.db(a.token, { op: 'set', path: `profiles/${a.uid}`, data: { username: 'Louis', xp: 1 } })).status).toBe(200);
    // Same name, other case, other learner: refused.
    const clash = await s.db(b.token, { op: 'set', path: `profiles/${b.uid}`, data: { username: 'louis', xp: 0 } });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toBe('username_taken');
    // Saving my own profile again under my own name is fine.
    expect((await s.db(a.token, { op: 'update', path: `profiles/${a.uid}`, data: { username: 'Louis', xp: 2 } })).status).toBe(200);
    // A name-and-password account can't take it either, and a Google learner can't take theirs.
    expect((await s.signup('LOUIS', 'secret123')).body.error).toBe('name_taken');
    await s.signup('Mia', 'secret123');
    expect((await s.db(b.token, { op: 'set', path: `profiles/${b.uid}`, data: { username: 'Mia' } })).status).toBe(409);
    // Once Louis picks another name, the old one is free again.
    await s.db(a.token, { op: 'set', path: `profiles/${a.uid}`, data: { username: 'Louis_B' } });
    expect((await s.db(b.token, { op: 'set', path: `profiles/${b.uid}`, data: { username: 'Louis' } })).status).toBe(200);
  });

  it('knows names chosen before this rule existed', async () => {
    const s = site({ g1: 'idn-0001-aaaa', g2: 'idn-0002-bbbb' });
    const a = (await s.google('g1')).body;
    const b = (await s.google('g2')).body;
    await s.kv.set(`d/profiles/${a.uid}`, JSON.stringify({ username: 'Nora' })); // saved by an older version
    expect((await s.db(b.token, { op: 'set', path: `profiles/${b.uid}`, data: { username: 'nora' } })).status).toBe(409);
    expect((await s.db(a.token, { op: 'update', path: `profiles/${a.uid}`, data: { xp: 3 } })).status).toBe(200);
  });
});

describe('deleting an account', () => {
  it('removes everything kept for it, frees its name, and the next Google sign-in starts fresh', async () => {
    const s = site({ g1: 'idn-0001-aaaa', g1b: 'idn-0001-aaaa' });
    const a = (await s.google('g1')).body;
    const friend = (await s.signup('Ben', 'secret123')).body;
    await s.db(a.token, { op: 'set', path: `profiles/${a.uid}`, data: { username: 'Louis' } });
    await s.db(a.token, { op: 'set', path: `data/users/${a.uid}/main`, data: { xp: 5 } });
    await s.db(a.token, { op: 'set', path: `data/users/${a.uid}/deck-1`, data: { title: 'Cells' } });
    await s.db(a.token, { op: 'set', path: `decks/${a.uid}`, data: { list: [] } });
    await s.db(a.token, { op: 'set', path: `inbox/${friend.uid}/req/${a.uid}`, data: { at: 1 } });
    await s.db(friend.token, { op: 'set', path: `inbox/${a.uid}/req/${friend.uid}`, data: { at: 2 } });

    expect((await s.remove('not-a-token')).status).toBe(401);
    expect((await s.remove(a.token)).status).toBe(200);
    const left = [...s.kv.dump().keys()];
    expect(left.filter((k) => k.includes(a.uid) && !k.startsWith('a/x/'))).toEqual([]);
    expect(left.some((k) => k.startsWith('a/g/'))).toBe(false);
    // Another device still signed in to it is signed out at its next save.
    expect((await s.db(a.token, { op: 'set', path: `data/users/${a.uid}/main`, data: { xp: 6 } })).status).toBe(401);
    // Its name is free again, and the Google account gets a new, empty Lumoly account.
    const again = (await s.google('g1b')).body;
    expect(again.uid).not.toBe(a.uid);
    expect(again.fresh).toBe('1');
    expect((await s.db(again.token, { op: 'set', path: `profiles/${again.uid}`, data: { username: 'Louis' } })).status).toBe(200);
  });
});

describe('shared data', () => {
  it('lets everyone read profiles but only the owner write theirs', async () => {
    const s = site();
    const a = (await s.signup('Ana', 'secret123')).body;
    const b = (await s.signup('Ben', 'secret123')).body;
    expect((await s.db(a.token, { op: 'set', path: `profiles/${a.uid}`, data: { username: 'Ana', xp: 10 } })).status).toBe(200);
    expect((await s.db(b.token, { op: 'set', path: `profiles/${a.uid}`, data: { username: 'hacked' } })).status).toBe(403);
    const got = await s.db(b.token, { op: 'get', path: `profiles/${a.uid}` });
    expect(got.body.data).toEqual({ username: 'Ana', xp: 10 });
    expect((await s.db('not-a-token', { op: 'get', path: `profiles/${a.uid}` })).status).toBe(401);
  });

  it("keeps each learner's own space private", async () => {
    const s = site();
    const a = (await s.signup('Ana', 'secret123')).body;
    const b = (await s.signup('Ben', 'secret123')).body;
    await s.db(a.token, { op: 'set', path: `data/users/${a.uid}/main`, data: { xp: 5 } });
    await s.db(a.token, { op: 'update', path: `data/users/${a.uid}/main`, data: { coins: 3 } });
    expect((await s.db(a.token, { op: 'get', path: `data/users/${a.uid}/main` })).body.data).toEqual({ xp: 5, coins: 3 });
    expect((await s.db(b.token, { op: 'get', path: `data/users/${a.uid}/main` })).status).toBe(403);
    expect((await s.db(b.token, { op: 'list', coll: `data/users/${a.uid}` })).status).toBe(403);
    expect((await s.db(a.token, { op: 'list', coll: `data/users/${a.uid}` })).body.docs).toEqual([{ id: 'main', data: { xp: 5, coins: 3 } }]);
    expect((await s.db(a.token, { op: 'set', path: 'secrets/x', data: {} })).status).toBe(403);
    expect((await s.db(a.token, { op: 'get', path: '../d/x' })).status).toBe(400);
  });

  it('answers "nothing changed" cheaply and filters lists', async () => {
    const s = site();
    const a = (await s.signup('Ana', 'secret123')).body;
    const b = (await s.signup('Ben', 'secret123')).body;
    await s.db(a.token, { op: 'set', path: `games/${a.uid}`, data: { code: '123456', phase: 'lobby' } });
    await s.db(b.token, { op: 'set', path: `games/${b.uid}`, data: { code: '999999', phase: 'question' } });
    const lobby = await s.db(b.token, { op: 'list', coll: 'games', where: [['phase', '==', 'lobby']], limit: 50 });
    expect(lobby.body.docs.map((d: { id: string }) => d.id)).toEqual([a.uid]);
    const again = await s.db(b.token, { op: 'list', coll: 'games', where: [['phase', '==', 'lobby']], known: lobby.body.tag });
    expect(again.body.same).toBe(true);
    await s.db(a.token, { op: 'delete', path: `games/${a.uid}` });
    const after = await s.db(b.token, { op: 'list', coll: 'games', where: [['phase', '==', 'lobby']], known: lobby.body.tag });
    expect(after.body.same).toBeUndefined();
    expect(after.body.docs).toEqual([]);
    const doc = await s.db(b.token, { op: 'get', path: `games/${b.uid}` });
    expect((await s.db(b.token, { op: 'get', path: `games/${b.uid}`, known: doc.body.etag })).body.same).toBe(true);
  });
});

describe('friend requests', () => {
  it('lets anyone send me a request, only me read them, and either of us clear it', async () => {
    const s = site();
    const a = (await s.signup('Ana', 'secret123')).body;
    const b = (await s.signup('Ben', 'secret123')).body;
    const c = (await s.signup('Cam', 'secret123')).body;
    expect((await s.db(b.token, { op: 'set', path: `inbox/${a.uid}/req/${b.uid}`, data: { name: 'Ben', at: 1 } })).status).toBe(200);
    // Nobody can send a request in someone else's name, or to themselves.
    expect((await s.db(c.token, { op: 'set', path: `inbox/${a.uid}/req/${b.uid}`, data: { name: 'fake' } })).status).toBe(403);
    expect((await s.db(a.token, { op: 'set', path: `inbox/${a.uid}/req/${a.uid}`, data: {} })).status).toBe(403);
    expect((await s.db(a.token, { op: 'list', coll: `inbox/${a.uid}/req` })).body.docs).toEqual([{ id: b.uid, data: { name: 'Ben', at: 1 } }]);
    expect((await s.db(c.token, { op: 'list', coll: `inbox/${a.uid}/req` })).status).toBe(403);
    expect((await s.db(c.token, { op: 'delete', path: `inbox/${a.uid}/req/${b.uid}` })).status).toBe(403);
    expect((await s.db(a.token, { op: 'delete', path: `inbox/${a.uid}/req/${b.uid}` })).status).toBe(200);
    expect((await s.db(a.token, { op: 'list', coll: `inbox/${a.uid}/req` })).body.docs).toEqual([]);
  });
});

describe('when the store has a blip', () => {
  it("answers 'try again' instead of signing the learner out", async () => {
    const s = site();
    const a = (await s.signup('Ana', 'secret123')).body;
    // A fresh server instance (nothing cached) whose store fails: the sign-in can't be checked yet.
    const { makeDataHandler: fresh } = await import('../lib/data');
    const broken = { ...s.kv, get: async () => { throw new Error('store down'); }, list: async () => { throw new Error('store down'); } };
    vi.resetModules();
    const { makeDataHandler } = await import('../lib/data');
    const h = makeDataHandler({ kv: broken, env: () => undefined, now: () => 1_000_000 });
    const res = await h(new Request('https://lumo.example/api/data', { method: 'POST', headers: { authorization: `Bearer ${a.token}` }, body: JSON.stringify({ op: 'get', path: `profiles/${a.uid}` }) }));
    expect(res.status).toBe(503);
    expect(fresh).toBeTypeOf('function');
  });
});

describe('live rooms', () => {
  it("shows who is here, lets each learner set only their own presence, and drops tabs that went quiet", async () => {
    const s = site();
    const a = (await s.signup('Ana', 'secret123')).body;
    const b = (await s.signup('Ben', 'secret123')).body;
    await s.room(a.token, { op: 'beat', room: 'live-123456', peer: `${a.uid}_aa11`, presence: { role: 'host' } });
    const seen = await s.room(b.token, { op: 'beat', room: 'live-123456', peer: `${b.uid}_bb22`, presence: { answer: 2 } });
    expect(seen.body.peers.map((p: { by: string }) => p.by).sort()).toEqual([a.uid, b.uid].sort());
    expect((await s.room(b.token, { op: 'beat', room: 'live-123456', peer: `${a.uid}_aa11`, presence: { role: 'fake' } })).status).toBe(403);
    // Asking again with what it already has: only the versions come back.
    const known = Object.fromEntries(seen.body.peers.map((p: { peer: string; etag: string }) => [p.peer, p.etag]));
    const again = await s.room(a.token, { op: 'peers', room: 'live-123456', known });
    expect(again.body.peers.every((p: { same?: boolean }) => p.same)).toBe(true);
    s.tick(30_000);
    await s.room(a.token, { op: 'beat', room: 'live-123456', peer: `${a.uid}_aa11`, presence: { role: 'host' } });
    s.tick(30_000);
    const later = await s.room(a.token, { op: 'peers', room: 'live-123456' });
    expect(later.body.peers.map((p: { by: string }) => p.by)).toEqual([a.uid]);
    await s.room(a.token, { op: 'leave', room: 'live-123456', peer: `${a.uid}_aa11` });
    expect((await s.room(a.token, { op: 'peers', room: 'live-123456' })).body.peers).toEqual([]);
  });
});
