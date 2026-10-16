/**
 * Standalone site: the same `window.claude.use(...)` surface the app uses inside the Claude viewer,
 * backed by the site's own endpoints (netlify/lib): shared data (/api/data), live rooms (/api/room),
 * the signed-in learner, and Claude (/api/claude). The rest of Lumo doesn't change.
 *
 * Changes made by others (a friend's new score, someone joining a Live game) are picked up by asking
 * the site every few seconds while the page is open and visible; each check that finds nothing new
 * is one tiny request.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export interface SessionInfo {
  token: string;
  uid: string;
  name: string;
  kind: 'pw' | 'g';
}

const SESSION = 'lumo_session';

export function loadSession(): SessionInfo | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION) ?? 'null') as SessionInfo | null;
    if (!s?.token || !s.uid) return null;
    // Expired tokens are refused by the site anyway; drop them early so the sign-in screen shows.
    const exp = JSON.parse(atob(s.token.split('.')[0]!.replace(/-/g, '+').replace(/_/g, '/'))).exp as number;
    return exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}
export function saveSession(s: SessionInfo | null) {
  try {
    if (s) localStorage.setItem(SESSION, JSON.stringify(s));
    else localStorage.removeItem(SESSION);
  } catch {
    /* private mode: signed in for this visit only */
  }
}

export class CloudError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
  }
}

let signedOutHandler: (() => void) | null = null;
/** Called when the site no longer accepts this sign-in (it expired or the site's secret changed). */
export function onSignedOut(f: () => void) {
  signedOutHandler = f;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  } catch {
    throw new CloudError('network');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 401 && token) signedOutHandler?.();
    throw new CloudError(String(data.error ?? 'unavailable'), res.status);
  }
  return data as T;
}

// ------------------------------------------------------------------ accounts

export const signUp = (name: string, password: string) => post<SessionInfo>('/api/auth/signup', { name, password });
export const logIn = (name: string, password: string) => post<SessionInfo>('/api/auth/login', { name, password });
export const googleSignIn = (token: string) => post<SessionInfo>('/api/auth/google', { token });

/** Is Google sign-in switched on for this site (Netlify Identity with the Google provider)? */
export async function googleAvailable(): Promise<boolean> {
  try {
    const r = await fetch('/.netlify/identity/settings');
    if (!r.ok) return false;
    const s = (await r.json()) as { external?: { google?: boolean } };
    return s.external?.google === true;
  } catch {
    return false;
  }
}
export function startGoogle() {
  window.location.assign('/.netlify/identity/authorize?provider=google');
}
/** Back from Google: the Identity token (or an error) is in the address after "#". */
export function takeGoogleReturn(): { token: string } | { error: string } | null {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const token = h.get('access_token');
  const error = h.get('error');
  if (!token && !error) return null;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return token ? { token } : { error: error! };
}

// ------------------------------------------------------------------ polling

/** Runs `tick` now and then every `ms` while the page is visible; returns a stop function. */
function every(ms: number, tick: () => Promise<void> | void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = async () => {
    if (stopped) return;
    if (document.visibilityState === 'visible') await Promise.resolve(tick()).catch(() => {});
    if (!stopped) timer = setTimeout(run, ms);
  };
  const wake = () => {
    if (document.visibilityState !== 'visible' || stopped) return;
    if (timer) clearTimeout(timer);
    void run();
  };
  document.addEventListener('visibilitychange', wake);
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
  };
}

// ------------------------------------------------------------------ db

type Row = { id: string; data: Record<string, unknown> };
const snapOf = (id: string, exists: boolean, data: Record<string, unknown> | undefined) => ({ id, exists, data: () => data, metadata: { fromCache: false } });
const pack = (rows: Row[]) => {
  const docs = rows.map((r) => snapOf(r.id, true, r.data));
  return { docs, size: docs.length, empty: docs.length === 0, docChanges: () => [] };
};

function makeDb(s: SessionInfo) {
  const call = <T>(body: Record<string, unknown>) => post<T>('/api/data', body, s.token);

  const docRef = (path: string): Any => {
    const id = path.split('/').pop()!;
    return {
      id,
      path,
      get: async () => {
        const r = await call<{ exists: boolean; data?: Record<string, unknown> }>({ op: 'get', path });
        return snapOf(id, r.exists, r.data);
      },
      set: async (data: Record<string, unknown>) => void (await call({ op: 'set', path, data: JSON.parse(JSON.stringify(data)) })),
      update: async (data: Record<string, unknown>) => void (await call({ op: 'update', path, data: JSON.parse(JSON.stringify(data)) })),
      delete: async () => void (await call({ op: 'delete', path })),
      onSnapshot: (next: (snap: Any) => void, err?: (e: Any) => void) => {
        let known = '';
        return every(5000, async () => {
          try {
            const r = await call<{ same?: boolean; exists?: boolean; data?: Record<string, unknown>; etag: string }>({ op: 'get', path, known });
            if (r.same) return;
            known = r.etag;
            next(snapOf(id, !!r.exists, r.data));
          } catch (e) {
            err?.(e);
          }
        });
      },
      collection: (p: string) => colRef(`${path}/${p}`, {}),
    };
  };

  type Q = { where?: [string, string, unknown][]; orderBy?: [string, string]; limit?: number };
  const colRef = (path: string, q: Q): Any => ({
    path,
    where: (f: string, op: string, v: unknown) => colRef(path, { ...q, where: [...(q.where ?? []), [f, op, v]] }),
    orderBy: (f: string, dir: 'asc' | 'desc' = 'asc') => colRef(path, { ...q, orderBy: [f, dir] }),
    limit: (n: number) => colRef(path, { ...q, limit: n }),
    doc: (id?: string) => docRef(`${path}/${id ?? crypto.randomUUID()}`),
    get: async () => pack((await call<{ docs: Row[] }>({ op: 'list', coll: path, ...q })).docs),
    onSnapshot: (next: (snap: Any) => void, err?: (e: Any) => void) => {
      let known = '';
      // Live games are looked for more often than friends' profiles change.
      return every(path === 'games' ? 2500 : 8000, async () => {
        try {
          const r = await call<{ same?: boolean; docs?: Row[]; tag: string }>({ op: 'list', coll: path, ...q, known });
          if (r.same) return;
          known = r.tag;
          next(pack(r.docs ?? []));
        } catch (e) {
          err?.(e);
        }
      });
    },
  });
  return { doc: docRef, collection: (path: string) => colRef(path, {}) };
}

// ------------------------------------------------------------------ room (who's here right now)

interface Peer {
  peer: string;
  by: string;
  presence: Record<string, unknown>;
  isMe: boolean;
  sameTab: boolean;
  kind: 'viewer';
  guest: false;
  updatedAt: number;
}

function makeRoom(s: SessionInfo) {
  const call = <T>(body: Record<string, unknown>) => post<T>('/api/room', body, s.token);
  const join = (name: string, ms: number) => {
    const room = name.replace(/[^A-Za-z0-9_:-]/g, '_').slice(0, 80);
    const peer = `${s.uid}_${Math.random().toString(36).slice(2, 8)}`;
    let mine: Record<string, unknown> | null = null;
    let peers: Peer[] = [];
    const cache = new Map<string, { etag: string; p: Peer }>();
    const handlers = new Set<(c: Any) => void>();
    let stop: (() => void) | null = null;
    let lastBeat = 0;

    const apply = (list: ({ peer: string; etag: string; same?: boolean; by?: string; presence?: Record<string, unknown>; at?: number } | null)[]) => {
      const next = new Map<string, { etag: string; p: Peer }>();
      for (const x of list) {
        if (!x) continue;
        const old = cache.get(x.peer);
        if (x.same && old) next.set(x.peer, old);
        else if (!x.same) next.set(x.peer, { etag: x.etag, p: { peer: x.peer, by: x.by!, presence: x.presence ?? {}, isMe: x.peer === peer, sameTab: x.peer === peer, kind: 'viewer', guest: false, updatedAt: x.at ?? Date.now() } });
      }
      cache.clear();
      for (const [k, v] of next) cache.set(k, v);
      peers = [...next.values()].map((v) => v.p);
      for (const h of handlers) h({ peers, joined: [], left: [], updated: [] });
    };
    const known = () => Object.fromEntries([...cache].map(([k, v]) => [k, v.etag]));
    const tick = async () => {
      // Being in the room means saying so now and then; otherwise just look.
      const beat = mine && Date.now() - lastBeat > 15_000;
      if (beat) lastBeat = Date.now();
      const r = await call<{ peers: Parameters<typeof apply>[0] }>(beat ? { op: 'beat', room, peer, presence: mine, known: known() } : { op: 'peers', room, known: known() });
      apply(r.peers);
    };
    const start = () => {
      stop ??= every(ms, tick);
    };
    const bye = () => {
      if (!mine) return;
      // The page is closing: a beacon still gets through (it carries the sign-in in its body).
      navigator.sendBeacon?.('/api/room', new Blob([JSON.stringify({ op: 'leave', room, peer, token: s.token })], { type: 'application/json' }));
    };
    window.addEventListener('pagehide', bye);

    return {
      name,
      presence: async (patch: Record<string, unknown>) => {
        mine = { ...(mine ?? {}), ...patch };
        lastBeat = Date.now();
        const r = await call<{ peers: Parameters<typeof apply>[0] }>({ op: 'beat', room, peer, presence: mine, known: known() });
        apply(r.peers);
        start();
      },
      onPeers: (h: (c: Any) => void) => {
        handlers.add(h);
        start();
        setTimeout(() => h({ peers, joined: [], left: [], updated: [] }));
        return () => handlers.delete(h);
      },
      peers: () => peers,
      leave: async () => {
        stop?.();
        stop = null;
        handlers.clear();
        window.removeEventListener('pagehide', bye);
        if (mine) await call({ op: 'leave', room, peer }).catch(() => {});
        mine = null;
      },
      connected: () => true,
      emit: async () => {},
      on: () => () => {},
    };
  };
  // The lobby (friends online) changes slowly; a Live game room is checked about every second.
  const lobby = join('lobby', 6000);
  return { ...lobby, join: async (name: string) => join(name, 1200) };
}

// ------------------------------------------------------------------ user

/** A friendly initial avatar (no real photos or names are shared between learners). */
function avatarFor(name: string, id: string) {
  const hue = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  const letter = (name.trim()[0] ?? '?').toUpperCase().replace(/[<>&"']/g, '?');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="hsl(${hue} 55% 42%)"/><text x="20" y="27" font-size="20" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function makeUser(s: SessionInfo, db: ReturnType<typeof makeDb>) {
  return {
    id: async () => s.uid,
    me: async () => ({ id: s.uid }),
    name: async () => '',
    can: async () => true,
    canEdit: async () => false,
    isOwner: async () => false,
    profiles: async (ids: string[]) => {
      const out: Record<string, { id: string; name: string; avatarUrl: string; color: string; isMe: boolean }> = {};
      await Promise.all(
        [...new Set(ids)].map(async (id) => {
          const snap = await db.doc(`profiles/${id}`).get().catch(() => null);
          const name = String((snap?.exists && snap.data()?.username) || '');
          out[id] = { id, name, avatarUrl: avatarFor(name || id, id), color: '#888', isMe: id === s.uid };
        }),
      );
      return out;
    },
  };
}

// ------------------------------------------------------------------ sample (Claude through the edge function)

type SampleOpts = { images?: Blob[]; signal?: AbortSignal; modelTier?: 'quick' | 'default' | 'complex'; research?: boolean; onText?: (u: { text: string; delta: string }) => void };

async function blobToBase64(b: Blob): Promise<{ media_type: string; data: string }> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let str = '';
  for (let i = 0; i < buf.length; i += 0x8000) str += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { media_type: b.type || 'image/jpeg', data: btoa(str) };
}

/** Reads Claude's streamed answer (server-sent events) and returns its text. */
async function readStream(res: Response, onText?: SampleOpts['onText']): Promise<{ text: string; stopReason: string | null }> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  let stopReason: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let ev: Any;
      try {
        ev = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      const before = text.length;
      if (ev.type === 'content_block_start' && ev.content_block?.type === 'text') text += ev.content_block.text ?? '';
      else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text;
      else if (ev.type === 'message_delta') stopReason = ev.delta?.stop_reason ?? stopReason;
      else if (ev.type === 'error') throw Object.assign(new Error(ev.error?.message ?? 'upstream_error'), { code: ev.error?.type === 'rate_limit_error' || ev.error?.type === 'overloaded_error' ? 'rate_limited' : 'upstream_error' });
      if (text.length > before && onText) {
        try {
          onText({ text, delta: text.slice(before) });
        } catch {
          /* the page's handler failing never stops the answer */
        }
      }
    }
  }
  return { text, stopReason };
}

/** Why Claude isn't answering right now, if the site said so (shown on the create screen). */
let aiProblem: 'budget' | 'not_configured' | null = null;
export const claudeProblem = () => aiProblem;

function makeSample(s: SessionInfo) {
  const call = async (input: string, o: SampleOpts = {}) => {
    const images = o.images?.length ? await Promise.all(o.images.slice(0, 5).map(blobToBase64)) : [];
    let res: Response;
    try {
      res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}` },
        body: JSON.stringify({ input: input.slice(0, 60_000), images, tier: o.modelTier ?? 'default', research: o.research === true }),
        signal: o.signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      throw Object.assign(new Error('network'), { code: 'upstream_error' });
    }
    if (res.status === 401) {
      signedOutHandler?.();
      throw Object.assign(new Error('signed_out'), { code: 'not_granted' });
    }
    if (res.status === 429) throw Object.assign(new Error('rate_limited'), { code: 'rate_limited' });
    if (res.status === 402 || res.status === 503) {
      aiProblem = res.status === 402 ? 'budget' : 'not_configured';
      throw Object.assign(new Error(aiProblem), { code: 'unavailable' });
    }
    if (!res.ok || !res.body) throw Object.assign(new Error('upstream'), { code: 'upstream_error' });
    let read: { text: string; stopReason: string | null };
    try {
      read = await readStream(res, o.onText);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      throw e;
    }
    const { text, stopReason } = read;
    if (stopReason === 'refusal') throw Object.assign(new Error('refused'), { code: 'refused' });
    return { text, truncated: stopReason === 'max_tokens' };
  };
  return Object.assign(call, {
    canResearch: true,
    json: async <T,>(input: string, o: SampleOpts = {}): Promise<T> => {
      const { text } = await call(input, o);
      const a = text.indexOf('{');
      const b = text.lastIndexOf('}');
      if (a < 0 || b < a) throw Object.assign(new Error('bad_json'), { code: 'upstream_error' });
      return JSON.parse(text.slice(a, b + 1)) as T;
    },
    limits: async () => ({ images: { maxCount: 5, maxInputBytes: 4_000_000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] } }),
  });
}

// ------------------------------------------------------------------ install

/** Make the signed-in learner's site-backed capabilities available as `window.claude`. */
export function installCloud(s: SessionInfo) {
  const db = makeDb(s);
  const caps: Record<string, unknown> = {
    db,
    room: makeRoom(s),
    user: makeUser(s, db),
    sample: makeSample(s),
    permissions: { state: async () => 'granted', request: async () => ({}) },
  };
  (window as Any).claude = { use: async (name: string) => caps[name] ?? null };
}
