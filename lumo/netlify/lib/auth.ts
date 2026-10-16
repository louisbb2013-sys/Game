import type { KV } from './kv.ts';
import { validateUsername } from '../../packages/core/src/usernames.ts';
import { json, limiter, randomId, signSession, type Session } from './session.ts';

/**
 * Accounts for the standalone site (Netlify Function at /api/auth/*), so progress, friends and Live
 * games follow a learner to any device:
 *   - a Lumo name + password (works the moment the site is up), or
 *   - Google, through the site's Netlify Identity (on when the site owner switches it on).
 * Passwords are stored only as a slow salted hash (PBKDF2-SHA256). Google accounts keep only the
 * Identity user id: no e-mail address or real name is stored.
 */

type Env = (k: string) => string | undefined;
export interface AuthDeps {
  kv: KV;
  env: Env;
  fetch?: typeof fetch;
  now?: () => number;
  /** PBKDF2 rounds (lower in tests). */
  rounds?: number;
}

interface PwRecord {
  uid: string;
  name: string;
  salt: string;
  hash: string;
  rounds: number;
  created: number;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const nameKey = (name: string) => `a/n/${encodeURIComponent(name.toLowerCase())}`;

async function hashPassword(password: string, salt: string, rounds: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: rounds }, key, 256));
}

/** Compare without leaking where the first difference is. */
const same = (a: string, b: string) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

export function makeAuthHandler(deps: AuthDeps) {
  const { kv, env } = deps;
  const now = deps.now ?? Date.now;
  const rounds = deps.rounds ?? 150_000;
  const doFetch = deps.fetch ?? fetch;
  const signups = limiter(30, 60 * 60_000);
  const tries = limiter(60, 10 * 60_000);

  const issue = async (s: Omit<Session, 'exp'>) => json(200, { token: await signSession(kv, env, s, now()), uid: s.u, name: s.n, kind: s.k });

  async function signup(b: Record<string, unknown>, ip: string) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const problem = validateUsername(name);
    if (problem) return json(400, { error: 'bad_name', problem });
    if (password.length < 6 || password.length > 200) return json(400, { error: 'weak_password' });
    if (!signups(ip, now())) return json(429, { error: 'rate_limited' });
    const salt = randomId(16);
    const rec: PwRecord = { uid: `u${randomId(12)}`, name, salt, hash: await hashPassword(password, salt, rounds), rounds, created: now() };
    if (!(await kv.set(nameKey(name), JSON.stringify(rec), { ifNew: true }))) return json(409, { error: 'name_taken' });
    return issue({ u: rec.uid, n: name, k: 'pw' });
  }

  async function login(b: Record<string, unknown>, ip: string) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!name || !password || password.length > 200) return json(400, { error: 'wrong_login' });
    if (!tries(ip, now())) return json(429, { error: 'rate_limited' });
    const failKey = `a/f/${encodeURIComponent(name.toLowerCase())}`;
    const fails = await kv.get(failKey);
    const f = fails ? (JSON.parse(fails.value) as { n: number; until: number }) : { n: 0, until: 0 };
    if (f.until > now()) return json(429, { error: 'locked' });
    const got = await kv.get(nameKey(name));
    const rec = got ? (JSON.parse(got.value) as PwRecord) : null;
    // Hash even when the name doesn't exist, so a wrong name and a wrong password take as long.
    const hash = await hashPassword(password, rec?.salt ?? 'no-such-account', rec?.rounds ?? rounds);
    if (!rec || !same(hash, rec.hash)) {
      const n = f.n + 1;
      await kv.set(failKey, JSON.stringify({ n: n >= 8 ? 0 : n, until: n >= 8 ? now() + 10 * 60_000 : 0 }));
      return json(401, { error: 'wrong_login' });
    }
    if (fails) await kv.del(failKey);
    return issue({ u: rec.uid, n: rec.name, k: 'pw' });
  }

  /** Google through Netlify Identity: the page hands over the Identity token it got back. */
  async function google(b: Record<string, unknown>, origin: string) {
    const token = typeof b.token === 'string' ? b.token : '';
    if (!token || token.length > 4000) return json(400, { error: 'bad_request' });
    let id = '';
    try {
      const r = await doFetch(`${origin}/.netlify/identity/user`, { headers: { authorization: `Bearer ${token}` } });
      if (!r.ok) return json(401, { error: 'google_failed' });
      id = String(((await r.json()) as { id?: unknown }).id ?? '');
    } catch {
      return json(502, { error: 'google_failed' });
    }
    if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return json(401, { error: 'google_failed' });
    const key = `a/g/${id}`;
    let got = await kv.get(key);
    if (!got) {
      await kv.set(key, JSON.stringify({ uid: `u${randomId(12)}`, created: now() }), { ifNew: true });
      got = await kv.get(key);
    }
    const rec = JSON.parse(got!.value) as { uid: string };
    return issue({ u: rec.uid, n: '', k: 'g' });
  }

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    let b: Record<string, unknown>;
    try {
      b = (await req.json()) as Record<string, unknown>;
    } catch {
      return json(400, { error: 'bad_request' });
    }
    const url = new URL(req.url);
    const ip = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
    try {
      if (url.pathname.endsWith('/signup')) return await signup(b, ip);
      if (url.pathname.endsWith('/login')) return await login(b, ip);
      if (url.pathname.endsWith('/google')) return await google(b, url.origin);
      return json(404, { error: 'not_found' });
    } catch {
      return json(503, { error: 'unavailable' });
    }
  };
}
