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
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
export const randomId = (bytes = 9) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

let cached: { secret: string; key: CryptoKey } | null = null;

async function hmacKey(kv: KV, env: (k: string) => string | undefined): Promise<CryptoKey> {
  let secret = env('LUMO_SECRET') ?? '';
  if (secret.length < 16) {
    let stored = await kv.get(SECRET_KEY);
    if (!stored) {
      await kv.set(SECRET_KEY, JSON.stringify({ s: randomId(48) }), { ifNew: true });
      stored = await kv.get(SECRET_KEY);
    }
    secret = (JSON.parse(stored!.value) as { s: string }).s;
  }
  if (cached?.secret === secret) return cached.key;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  cached = { secret, key };
  return key;
}

export async function signSession(kv: KV, env: (k: string) => string | undefined, s: Omit<Session, 'exp'>, now = Date.now()): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...s, exp: now + SESSION_DAYS * DAY })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(kv, env), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(kv: KV, env: (k: string) => string | undefined, token: string | null | undefined, now = Date.now()): Promise<Session | null> {
  if (!token || token.length > 2000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(kv, env), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (typeof s.u !== 'string' || typeof s.exp !== 'number' || s.exp < now) return null;
    return s;
  } catch {
    return null;
  }
}

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
