import type { KV } from './kv.ts';

/**
 * Signed sign-in tokens for the standalone site. A token says "this is learner u…" and is signed
 * with the site's secret (HMAC-SHA256), so the data and Claude endpoints can trust it without a
 * lookup. The secret is LUMO_SECRET when the site sets one; otherwise one is made the first time the
 * site runs and kept in the site's own store, so there is nothing to set up.
 */
export interface Session {
  /** Learner id. */
  u: string;
  /** Account name (shown in the app; may be empty for a new Google account). */
  n: string;
  /** Signed in with: "pw" (name + password) or "g" (Google). */
  k: 'pw' | 'g';
  exp: number;
}

const enc = new TextEncoder();
const SECRET_KEY = 'meta/secret';
const DAY = 86_400_000;
export const SESSION_DAYS = 180;

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
};
export const randomId = (bytes = 9) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

const keys = new Map<string, CryptoKey>();
async function keyFor(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keys.set(secret, k);
  }
  return k;
}

type Env = (k: string) => string | undefined;
const envSecret = (env: Env) => {
  const s = env('LUMO_SECRET') ?? '';
  return s.length >= 16 ? s : null;
};

/** The secret kept in the site's store (made the first time it's needed). Throws if the store can't be reached. */
let stored: string | null = null;
async function storedSecret(kv: KV): Promise<string> {
  if (stored) return stored;
  let v = await kv.get(SECRET_KEY);
  if (!v) {
    await kv.set(SECRET_KEY, JSON.stringify({ s: randomId(48) }), { ifNew: true });
    v = await kv.get(SECRET_KEY);
  }
  if (!v) throw new Error('secret_unavailable');
  stored = (JSON.parse(v.value) as { s: string }).s;
  return stored;
}

export async function signSession(kv: KV, env: Env, s: Omit<Session, 'exp'>, now = Date.now()): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...s, exp: now + SESSION_DAYS * DAY })));
  const secret = envSecret(env) ?? (await storedSecret(kv));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await keyFor(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/**
 * Who this token belongs to; null when it isn't a valid sign-in; 'unavailable' when it can't be
 * checked right now (the store didn't answer), so the page retries instead of signing the learner out.
 */
export async function verifySession(kv: KV, env: Env, token: string | null | undefined, now = Date.now()): Promise<Session | null | 'unavailable'> {
  if (!token || token.length > 2000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let s: Session;
  let mac: Uint8Array<ArrayBuffer>;
  try {
    s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    mac = fromB64url(sig);
  } catch {
    return null;
  }
  if (typeof s.u !== 'string' || typeof s.exp !== 'number' || s.exp < now) return null;
  const data = enc.encode(body);
  const fromEnv = envSecret(env);
  if (fromEnv && (await crypto.subtle.verify('HMAC', await keyFor(fromEnv), mac, data))) return s;
  // Signed with the store's own secret (sign-ins from before LUMO_SECRET was set, or none is set).
  try {
    const st = await storedSecret(kv);
    if (st !== fromEnv && (await crypto.subtle.verify('HMAC', await keyFor(st), mac, data))) return s;
    return null;
  } catch (e) {
    console.error('lumo: sign-in check could not read the store', e);
    return 'unavailable';
  }
}

/** Marks an account its learner deleted: its sign-ins can't save anything any more. */
export const goneKey = (uid: string) => `a/x/${uid}`;

export const bearer = (req: Request) => (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim() || null;

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** A small per-instance limit so one account (or a stuck tab) can't flood the site. */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (who: string, now = Date.now()) => {
    const list = (hits.get(who) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) return false;
    list.push(now);
    hits.set(who, list);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}
