import type { KV } from './kv.ts';
import { bearer, json, limiter, verifySession, type Session } from './session.ts';

/**
 * Shared data and live rooms for the standalone site (Netlify Edge Function at /api/data and
 * /api/room). It gives the page the same small document store and "who's here right now" rooms it
 * gets inside Claude, kept in the site's own Netlify Blobs store, with the same rules:
 *
 *   profiles/<id>, decks/<id>, games/<id>   everyone signed in reads; only <id> writes
 *   data/users/<id>/<doc>                    only <id> reads or writes (their progress, decks, friends)
 *   rooms                                    everyone signed in; each learner writes only their own presence
 *
 * Pages ask "has this changed?" with the version they last saw, so a check that finds nothing new
 * costs one small read.
 */

const PUBLIC = new Set(['profiles', 'decks', 'games']);
const SEG = /^[A-Za-z0-9_.:@-]{1,160}$/;
const MAX_DOC = 900_000;
const MAX_PRESENCE = 20_000;
const STALE_MS = 45_000;

type Env = (k: string) => string | undefined;
export interface DataDeps {
  kv: KV;
  env: Env;
  now?: () => number;
}

type Op = '==' | '!=' | '<' | '<=' | '>' | '>=';
const OPS = new Set<Op>(['==', '!=', '<', '<=', '>', '>=']);

const segsOf = (path: unknown): string[] | null => {
  if (typeof path !== 'string' || path.length > 600) return null;
  const s = path.split('/');
  return s.every((x) => SEG.test(x) && x !== '.' && x !== '..') ? s : null;
};

/** Who may read/write this document. */
function docAccess(s: string[], me: string): { read: boolean; write: boolean } {
  if (s.length === 2 && PUBLIC.has(s[0]!)) return { read: true, write: s[1] === me };
  if (s.length === 4 && s[0] === 'data' && s[1] === 'users') return { read: s[2] === me, write: s[2] === me };
  return { read: false, write: false };
}
function collAccess(s: string[], me: string): boolean {
  if (s.length === 1) return PUBLIC.has(s[0]!);
  return s.length === 3 && s[0] === 'data' && s[1] === 'users' && s[2] === me;
}

const parse = (v: string | undefined): Record<string, unknown> | null => {
  if (!v) return null;
  try {
    const o = JSON.parse(v) as unknown;
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const cmp = (a: unknown, op: Op, b: unknown): boolean => {
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return (a as number) < (b as number);
    case '<=':
      return (a as number) <= (b as number);
    case '>':
      return (a as number) > (b as number);
    case '>=':
      return (a as number) >= (b as number);
  }
};

async function digest(s: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...h.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Read a document and merge `patch` into it, retrying if someone wrote in between. */
async function merge(kv: KV, key: string, patch: Record<string, unknown>): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    const cur = await kv.get(key);
    const next = JSON.stringify({ ...(parse(cur?.value) ?? {}), ...patch });
    if (next.length > MAX_DOC) return false;
    if (await kv.set(key, next, cur ? { ifMatch: cur.etag } : { ifNew: true })) return true;
  }
  return false;
}

export function makeDataHandler(deps: DataDeps) {
  const { kv, env } = deps;
  const now = deps.now ?? Date.now;
  const allow = limiter(900, 60_000);

  async function db(body: Record<string, unknown>, me: Session): Promise<Response> {
    const op = body.op;
    if (op === 'list') {
      const s = segsOf(body.coll);
      if (!s || !collAccess(s, me.u)) return json(403, { error: 'denied' });
      const prefix = `d/${s.join('/')}/`;
      const all = (await kv.list(prefix)).filter((b) => !b.key.slice(prefix.length).includes('/'));
      all.sort((a, b) => (a.key < b.key ? -1 : 1));
      const tag = await digest(all.map((b) => `${b.key}=${b.etag}`).join('|'));
      if (typeof body.known === 'string' && body.known === tag) return json(200, { same: true, tag });
      const rows = (
        await Promise.all(
          all.slice(0, 1000).map(async (b) => {
            const v = await kv.get(b.key);
            const data = parse(v?.value);
            return data ? { id: b.key.slice(prefix.length), data } : null;
          }),
        )
      ).filter((r): r is { id: string; data: Record<string, unknown> } => r !== null);
      let docs = rows;
      const where = Array.isArray(body.where) ? body.where.slice(0, 4) : [];
      for (const w of where) {
        if (!Array.isArray(w) || typeof w[0] !== 'string' || !OPS.has(w[1] as Op)) return json(400, { error: 'bad_request' });
        docs = docs.filter((d) => cmp(d.data[w[0] as string], w[1] as Op, w[2]));
      }
      if (Array.isArray(body.orderBy) && typeof body.orderBy[0] === 'string') {
        const [f, dir] = body.orderBy as [string, string];
        const sign = dir === 'desc' ? -1 : 1;
        docs = [...docs].sort((a, b) => {
          const x = a.data[f] as number | string;
          const y = b.data[f] as number | string;
          return x === y ? 0 : x < y ? -sign : sign;
        });
      }
      const limit = typeof body.limit === 'number' ? Math.max(0, Math.min(1000, body.limit)) : 1000;
      return json(200, { docs: docs.slice(0, limit), tag });
    }

    const s = segsOf(body.path);
    if (!s || s.length % 2 !== 0) return json(400, { error: 'bad_request' });
    const access = docAccess(s, me.u);
    const key = `d/${s.join('/')}`;
    if (op === 'get') {
      if (!access.read) return json(403, { error: 'denied' });
      if (typeof body.known === 'string' && body.known) {
        const etag = await kv.etag(key);
        if (etag === body.known) return json(200, { same: true, etag });
      }
      const v = await kv.get(key);
      return json(200, v ? { exists: true, data: parse(v.value) ?? {}, etag: v.etag } : { exists: false, etag: '' });
    }
    if (!access.write) return json(403, { error: 'denied' });
    if (op === 'delete') {
      await kv.del(key);
      return json(200, { ok: true });
    }
    const data = body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json(400, { error: 'bad_request' });
    if (op === 'set') {
      const text = JSON.stringify(data);
      if (text.length > MAX_DOC) return json(413, { error: 'too_big' });
      await kv.set(key, text);
      return json(200, { ok: true });
    }
    if (op === 'update') return (await merge(kv, key, data as Record<string, unknown>)) ? json(200, { ok: true }) : json(409, { error: 'busy' });
    return json(400, { error: 'bad_request' });
  }

  async function room(body: Record<string, unknown>, me: Session): Promise<Response> {
    const name = body.room;
    if (typeof name !== 'string' || !/^[A-Za-z0-9_:-]{1,80}$/.test(name)) return json(400, { error: 'bad_request' });
    const prefix = `r/${name}/`;
    const peer = body.peer;
    const mine = typeof peer === 'string' && peer.startsWith(`${me.u}_`) && /^[A-Za-z0-9_-]{1,80}$/.test(peer);
    const t = now();
    if (body.op === 'leave') {
      if (mine) await kv.del(prefix + peer);
      return json(200, { ok: true });
    }
    if (body.op === 'beat') {
      if (!mine) return json(403, { error: 'denied' });
      const presence = JSON.stringify(body.presence ?? {});
      if (presence.length > MAX_PRESENCE) return json(413, { error: 'too_big' });
      await kv.set(prefix + peer, JSON.stringify({ by: me.u, presence: JSON.parse(presence), at: t }));
    } else if (body.op !== 'peers') return json(400, { error: 'bad_request' });

    const known = body.known && typeof body.known === 'object' ? (body.known as Record<string, string>) : {};
    const peers = await Promise.all(
      (await kv.list(prefix)).map(async (b) => {
        const id = b.key.slice(prefix.length);
        if (known[id] === b.etag) return { peer: id, etag: b.etag, same: true };
        const v = parse((await kv.get(b.key))?.value);
        if (!v || typeof v.at !== 'number') return null;
        if (t - v.at > STALE_MS) {
          await kv.del(b.key).catch(() => {}); // the tab closed without saying goodbye
          return null;
        }
        return { peer: id, etag: b.etag, by: v.by, presence: v.presence ?? {}, at: v.at };
      }),
    );
    return json(200, { peers: peers.filter(Boolean), now: t });
  }

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    let body: Record<string, unknown>;
    try {
      const text = await req.text();
      if (text.length > MAX_DOC + 50_000) return json(413, { error: 'too_big' });
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return json(400, { error: 'bad_request' });
    }
    // A page closing sends its goodbye with the token in the body (it can't set headers then).
    const me = await verifySession(kv, env, bearer(req) ?? (typeof body.token === 'string' ? body.token : null), now());
    if (!me) return json(401, { error: 'signed_out' });
    if (!allow(me.u, now())) return json(429, { error: 'rate_limited' });
    try {
      return new URL(req.url).pathname.endsWith('/room') ? await room(body, me) : await db(body, me);
    } catch {
      return json(503, { error: 'unavailable' });
    }
  };
}
