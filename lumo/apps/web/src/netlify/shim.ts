import type { User } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, onDisconnect, onValue, ref, remove, serverTimestamp, set, type Database } from 'firebase/database';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit as qLimit,
  onSnapshot,
  orderBy as qOrderBy,
  query,
  setDoc,
  where as qWhere,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import { firebase } from './firebase';

/**
 * Standalone site: the same `window.claude.use(...)` surface the app uses inside the Claude viewer,
 * backed by Firebase (shared data in Firestore, live rooms in the Realtime Database, the signed-in
 * Google user) and a Netlify edge function for Claude itself. The rest of Lumo doesn't change.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

// ------------------------------------------------------------------ db (Firestore)

/**
 * Documents are kept as one JSON string (`_j`) plus copies of their top-level plain fields (so
 * queries like phase == "lobby" still work). JSON keeps any shape Lumo stores (Firestore refuses
 * nested arrays and `undefined`).
 */
function encode(data: Record<string, unknown>): DocumentData {
  const out: DocumentData = { _j: JSON.stringify(data) };
  for (const [k, v] of Object.entries(data)) if (typeof v === 'string' ? v.length < 200 : typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  return out;
}
function decode(d: DocumentData | undefined): Record<string, unknown> | undefined {
  if (!d) return undefined;
  if (typeof d._j === 'string') {
    try {
      return JSON.parse(d._j) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return d;
}
const wrapSnap = (s: DocumentSnapshot) => ({ id: s.id, exists: s.exists(), data: () => decode(s.data()), metadata: { fromCache: s.metadata.fromCache } });

function makeDb(fs: Firestore) {
  const docRef = (path: string): Any => {
    const r = doc(fs, path);
    return {
      id: r.id,
      path,
      get: async () => wrapSnap(await getDoc(r)),
      set: async (data: Record<string, unknown>) => void (await setDoc(r, encode(data))),
      update: async (data: Record<string, unknown>) => {
        const cur = decode((await getDoc(r)).data()) ?? {};
        await setDoc(r, encode({ ...cur, ...data }));
      },
      delete: async () => void (await deleteDoc(r)),
      onSnapshot: (next: (s: Any) => void, err?: (e: Any) => void) => onSnapshot(r, (s) => next(wrapSnap(s)), (e) => err?.(e)),
      collection: (p: string) => colRef(`${path}/${p}`, []),
    };
  };
  const colRef = (path: string, cons: QueryConstraint[]): Any => {
    const q = () => query(collection(fs, path), ...cons);
    const pack = (docs: DocumentSnapshot[]) => {
      const list = docs.map(wrapSnap);
      return { docs: list, size: list.length, empty: list.length === 0, docChanges: () => [] };
    };
    return {
      path,
      where: (f: string, op: Any, v: unknown) => colRef(path, [...cons, qWhere(f, op === '==' ? '==' : op, v)]),
      limit: (n: number) => colRef(path, [...cons, qLimit(n)]),
      orderBy: (f: string, dir?: 'asc' | 'desc') => colRef(path, [...cons, qOrderBy(f, dir)]),
      doc: (id?: string) => docRef(`${path}/${id ?? crypto.randomUUID()}`),
      get: async () => pack((await getDocs(q())).docs),
      onSnapshot: (next: (s: Any) => void, err?: (e: Any) => void) => onSnapshot(q(), (s) => next(pack(s.docs)), (e) => err?.(e)),
    };
  };
  return { doc: docRef, collection: (path: string) => colRef(path, []) };
}

// ------------------------------------------------------------------ room (Realtime Database presence)

const safeKey = (s: string) => s.replace(/[.#$[\]/]/g, '_');

function makeRoom(rtdb: Database, me: string) {
  const join = (name: string) => {
    const peer = `${me}_${Math.random().toString(36).slice(2, 8)}`;
    const base = `rooms/${safeKey(name)}`;
    const mineRef = ref(rtdb, `${base}/${peer}`);
    let mine: Record<string, unknown> = {};
    let joined = false;
    const handlers = new Set<(c: Any) => void>();
    let peers: Any[] = [];
    let stop: (() => void) | null = null;
    const write = async () => {
      if (!joined) {
        joined = true;
        await onDisconnect(mineRef).remove(); // gone the moment the tab closes or the phone drops off
      }
      await set(mineRef, { by: me, presence: JSON.stringify(mine), at: serverTimestamp() });
    };
    const listen = () => {
      if (stop) return;
      stop = onValue(ref(rtdb, base), (snap) => {
        const v = (snap.val() ?? {}) as Record<string, { by: string; presence: string; at: number }>;
        peers = Object.entries(v).map(([id, p]) => {
          let presence = {};
          try {
            presence = JSON.parse(p.presence || '{}');
          } catch {
            /* ignore */
          }
          return { peer: id, by: p.by, presence, isMe: id === peer, sameTab: id === peer, kind: 'viewer', guest: false, updatedAt: p.at };
        });
        for (const h of handlers) h({ peers, joined: [], left: [], updated: [] });
      });
    };
    return {
      name,
      presence: async (patch: Record<string, unknown>) => {
        mine = { ...mine, ...patch };
        await write();
      },
      onPeers: (h: (c: Any) => void) => {
        handlers.add(h);
        listen();
        setTimeout(() => h({ peers, joined: [], left: [], updated: [] }));
        return () => handlers.delete(h);
      },
      peers: () => peers,
      leave: async () => {
        stop?.();
        stop = null;
        handlers.clear();
        await remove(mineRef).catch(() => {});
      },
      connected: () => true,
      emit: async () => {},
      on: () => () => {},
    };
  };
  const lobby = join('lobby');
  return { ...lobby, join: async (name: string) => join(name) };
}

// ------------------------------------------------------------------ user

/** A friendly initial avatar (no real photos or names are shared between learners). */
function avatarFor(name: string, id: string) {
  const hue = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  const letter = (name.trim()[0] ?? '?').toUpperCase().replace(/[<>&"']/g, '?');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="hsl(${hue} 70% 55%)"/><text x="20" y="27" font-size="20" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function makeUser(u: User, db: ReturnType<typeof makeDb>) {
  return {
    id: async () => u.uid,
    me: async () => ({ id: u.uid }),
    // Learners appear by their Lumo username only; Google names stay private.
    name: async () => '',
    can: async () => true,
    canEdit: async () => false,
    isOwner: async () => false,
    profiles: async (ids: string[]) => {
      const out: Record<string, { id: string; name: string; avatarUrl: string; color: string; isMe: boolean }> = {};
      await Promise.all(
        [...new Set(ids)].map(async (id) => {
          const s = await db.doc(`profiles/${id}`).get().catch(() => null);
          const name = String((s?.exists && s.data()?.username) || '');
          out[id] = { id, name, avatarUrl: avatarFor(name || id, id), color: '#888', isMe: id === u.uid };
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
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { media_type: b.type || 'image/jpeg', data: btoa(s) };
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
      if (text.length > before && onText) {
        try {
          onText({ text, delta: text.slice(before) });
        } catch {
          /* the page's handler failing never stops the answer */
        }
      }
      else if (ev.type === 'message_delta') stopReason = ev.delta?.stop_reason ?? stopReason;
      else if (ev.type === 'error') throw Object.assign(new Error(ev.error?.message ?? 'upstream_error'), { code: ev.error?.type === 'rate_limit_error' || ev.error?.type === 'overloaded_error' ? 'rate_limited' : 'upstream_error' });
    }
  }
  return { text, stopReason };
}

function makeSample(u: User) {
  const call = async (input: string, o: SampleOpts = {}) => {
    const token = await u.getIdToken();
    const images = o.images?.length ? await Promise.all(o.images.slice(0, 5).map(blobToBase64)) : [];
    let res: Response;
    try {
      res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ input: input.slice(0, 60_000), images, tier: o.modelTier ?? 'default', research: o.research === true }),
        signal: o.signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      throw Object.assign(new Error('network'), { code: 'upstream_error' });
    }
    if (res.status === 401) throw Object.assign(new Error('signed_out'), { code: 'not_granted' });
    if (res.status === 429) throw Object.assign(new Error('rate_limited'), { code: 'rate_limited' });
    if (!res.ok || !res.body) throw Object.assign(new Error('upstream'), { code: res.status === 503 ? 'unavailable' : 'upstream_error' });
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
  const sample = Object.assign(call, {
    canResearch: true,
    json: async <T,>(input: string, o: SampleOpts = {}): Promise<T> => {
      const { text } = await call(input, o);
      const a = text.indexOf('{');
      const b = text.lastIndexOf('}');
      if (a < 0 || b < a) throw Object.assign(new Error('bad_json'), { code: 'upstream_error' });
      return JSON.parse(text.slice(a, b + 1)) as T;
    },
    limits: async () => ({ images: { maxCount: 5, maxInputBytes: 4_000_000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } }),
  });
  return sample;
}

// ------------------------------------------------------------------ install

/** Make the signed-in Google learner's Firebase-backed capabilities available as `window.claude`. */
export function installClaude(u: User) {
  const f = firebase()!;
  const fs = initializeFirestore(f.app, { ignoreUndefinedProperties: true });
  const emu = import.meta.env.VITE_FIREBASE_EMULATOR as string | undefined;
  if (emu) connectFirestoreEmulator(fs, emu, 8081);
  const db = makeDb(fs);
  // Live rooms need the Realtime Database; without it everything else still works.
  let room: unknown = null;
  try {
    const rtdb = emu ? getDatabase(f.app, `http://${emu}:9000?ns=${f.app.options.projectId}`) : getDatabase(f.app);
    if (emu) connectDatabaseEmulator(rtdb, emu, 9000);
    room = makeRoom(rtdb, u.uid);
  } catch {
    room = null;
  }
  const caps: Record<string, unknown> = {
    db,
    room,
    user: makeUser(u, db),
    sample: makeSample(u),
    permissions: { state: async () => 'granted', request: async () => ({}) },
  };
  (window as Any).claude = { use: async (name: string) => caps[name] ?? null };
}
