import type { Concept, Locale, Question } from '@lumo/core';
import { useEffect, useState } from 'react';

/**
 * Browser-only build, playing together: the page's shared data (`db`), live rooms (`room`) and who is
 * viewing (`user`), as the Claude page viewer provides them. Everything is optional: outside a viewer,
 * or for someone the page isn't shared with, these resolve null and the page stays single-player.
 *
 * Shared data (rules declared at publish):
 *   profiles/<id>   each learner's public study stats (they write their own)
 *   decks/<id>      the decks a learner made public (they write their own)
 *   games/<id>      the Live game a learner is hosting (they write their own)
 *   data/users/<id>/me   private: their friends list
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/**
 * On the public website anyone can sign up, so learners only ever see the people they added as
 * friends (by typing their exact Lumoly name): no list of strangers, no strangers' decks or games.
 * Inside a Claude page, everyone it was shared with is already a known group.
 */
export const FRIENDS_ONLY = import.meta.env.VITE_NETLIFY === '1';
/** A plain copy of data handed over by the viewer (its objects may not survive copying as-is). */
export const plain = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));

const use = (name: string): Promise<Any | null> => {
  const c = (window as Any).claude;
  if (!c?.use) return Promise.resolve(null);
  return c.use(name).then((x: Any) => x ?? null, () => null);
};

export interface Together {
  db: Any;
  room: Any | null;
  user: Any;
  me: string;
  canWrite: boolean;
}

// Claude only lets some viewers save shared data: people in the owner's own Claude team, or friends
// invited by email as Editor. Anyone else opening a shared link can look but not save: their writes
// are refused. Once that happens, the page says so instead of failing quietly.
let readOnly = false;
const readOnlyListeners = new Set<(v: boolean) => void>();
function markReadOnly() {
  if (readOnly) return;
  readOnly = true;
  for (const f of readOnlyListeners) f(true);
}
/** A refused write (`invalid_argument` on a well-formed write = below the level the page needs). */
function refused(e: unknown) {
  if ((e as { code?: string } | null)?.code === 'invalid_argument') markReadOnly();
}
/** True once Claude has refused to save this viewer's shared data. */
export function useReadOnly() {
  const [v, setV] = useState(readOnly);
  useEffect(() => {
    readOnlyListeners.add(setV);
    setV(readOnly);
    return () => {
      readOnlyListeners.delete(setV);
    };
  }, []);
  return v;
}

let ready: Promise<Together | null> | null = null;
let myId = '';
/** Resolves once: null when this view can't share data (no viewer, signed out, not shared). */
export function together(): Promise<Together | null> {
  ready ??= (async () => {
    const [db, room, user] = await Promise.all([use('db'), use('room'), use('user')]);
    if (!db || !user) return null;
    const me = await user.id();
    if (!me) return null;
    myId = me;
    const can = await user.can('data.write');
    if (can === false) markReadOnly();
    return { db, room, user, me, canWrite: can !== false };
  })().catch(() => null);
  return ready;
}

export function useTogether() {
  const [t, setT] = useState<Together | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void together().then((x) => alive && setT(x));
    return () => {
      alive = false;
    };
  }, []);
  return t; // undefined = still finding out
}

/** Names and avatars as THIS viewer sees them (never stored). */
export async function namesFor(ids: string[]): Promise<Record<string, { name: string; avatarUrl: string; color: string }>> {
  const t = await together();
  if (!t || ids.length === 0) return {};
  return t.user.profiles(ids).catch(() => ({}));
}

export function useNames(ids: string[]) {
  const [names, setNames] = useState<Record<string, { name: string; avatarUrl: string; color: string }>>({});
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    let alive = true;
    if (key) void namesFor(key.split(',')).then((n) => alive && setNames(n));
    return () => {
      alive = false;
    };
  }, [key]);
  return names;
}

// ------------------------------------------------------------------ profiles

export interface PublicProfile {
  id: string;
  /** The Lumoly username friends type to add each other. */
  username: string;
  level: number;
  xp: number;
  weekId: string;
  weeklyXp: number;
  streak: number;
  lastDay: string | null;
  decks: number;
  updatedAt: number;
}

let pendingProfile: Omit<PublicProfile, 'id' | 'updatedAt'> | null = null;
let writing = false;
/** Publish my study stats (coalesced: one write at a time, the latest wins). */
export async function publishProfile(p: Omit<PublicProfile, 'id' | 'updatedAt'>) {
  pendingProfile = p;
  if (writing) return;
  const t = await together();
  if (!t?.canWrite) return;
  writing = true;
  try {
    while (pendingProfile) {
      const next = pendingProfile;
      pendingProfile = null;
      await t.db.doc(`profiles/${t.me}`).set({ ...next, updatedAt: Date.now() });
    }
  } catch (e) {
    refused(e); // read-only viewer (or quota): stats stay local
  } finally {
    writing = false;
  }
}

/**
 * Publish my profile under a new username right away. On the site, nobody else may already have the
 * name: false when it's taken (true where names aren't checked, or there is no one to tell).
 */
export async function renameProfile(p: Omit<PublicProfile, 'id' | 'updatedAt'>): Promise<boolean> {
  const t = await together();
  if (!t?.canWrite) return true;
  while (writing) await new Promise((r) => setTimeout(r, 50)); // let a write with the old name finish first
  pendingProfile = null;
  try {
    await t.db.doc(`profiles/${t.me}`).set({ ...p, updatedAt: Date.now() });
    return true;
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'username_taken') return false;
    refused(e);
    return true;
  }
}

/** Everyone's public profiles, read now (not live). */
export async function findProfiles(): Promise<PublicProfile[]> {
  const t = await together();
  if (!t) return [];
  const snap = await t.db.collection('profiles').limit(500).get().catch(() => null);
  return (snap?.docs ?? []).map((d: Any) => ({ id: d.id, ...plain(d.data()) }) as PublicProfile);
}

/** Live list of everyone's public profiles. */
export function useProfiles() {
  const [list, setList] = useState<PublicProfile[] | null>(null);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    void together().then((t) => {
      if (!t || !alive) return setList(t ? [] : null);
      unsub = t.db.collection('profiles').limit(500).onSnapshot(
        (snap: Any) => setList(snap.docs.map((d: Any) => ({ id: d.id, ...plain(d.data()) }) as PublicProfile)),
        () => setList([]),
      );
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  return list;
}

// ------------------------------------------------------------------ who's online

let onlineSet = false;
let onlineName = '';
/** Show up as online to everyone with this Lumoly open (presence in the page's lobby room). */
export async function goOnline(username: string) {
  const t = await together();
  if (!t?.room) return;
  onlineSet = true;
  onlineName = username.slice(0, 40);
  await t.room.presence({ online: true, username: onlineName }).catch(() => {});
}

// ------------------------------------------------------------------ Live invites

/** A Live game I'm hosting and the friends I invited to it, shown to them wherever they are in Lumoly. */
export interface LiveInvite {
  code: string;
  title: string;
  to: string[];
  at: number;
}

/**
 * Invites travel in the host's presence in the lobby room, which every open Lumoly already follows
 * (for "who's online"), so they cost nothing extra and vanish when the host leaves.
 */
export async function setLiveInvite(invite: LiveInvite | null) {
  const t = await together();
  if (!t?.room) return;
  await t.room.presence({ online: true, username: onlineName, invite: invite ? { ...invite, title: invite.title.slice(0, 80), to: invite.to.slice(0, 40) } : null }).catch(() => {});
}

/** Live games I've been invited to right now (newest first), with who invited me. */
export function useLiveInvites() {
  const friends = useFriends();
  const [list, setList] = useState<(LiveInvite & { from: string })[]>([]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    void together().then((t) => {
      if (!t?.room || !alive) return;
      unsub = t.room.onPeers((c: Any) => {
        const out = new Map<string, LiveInvite & { from: string }>();
        for (const p of c.peers) {
          const inv = plain(p.presence?.invite) as LiveInvite | null | undefined;
          if (!p.by || p.by === t.me || !inv || typeof inv.code !== 'string' || !Array.isArray(inv.to) || !inv.to.includes(t.me)) continue;
          if (Date.now() - Number(inv.at) > 30 * 60_000) continue;
          out.set(inv.code, { code: inv.code, title: String(inv.title ?? ''), to: inv.to, at: Number(inv.at), from: p.by });
        }
        setList([...out.values()].sort((a, b) => b.at - a.at));
      });
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  // On the website, only friends can invite me.
  return FRIENDS_ONLY ? list.filter((i) => (friends ?? []).includes(i.from)) : list;
}

/** Ids of people who have this Lumoly open right now (not me). */
export function useOnlineNow() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    void together().then((t) => {
      if (!t?.room || !alive) return;
      unsub = t.room.onPeers((c: Any) => {
        const set = new Set<string>();
        for (const p of c.peers) if (p.by && p.by !== t.me && p.kind === 'viewer') set.add(p.by);
        setIds([...set]);
      });
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  return ids;
}
export const isOnlineSet = () => onlineSet;

// ------------------------------------------------------------------ friends (private)

export function useFriends() {
  const [friends, setFriends] = useState<string[] | null>(null);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    void together().then((t) => {
      if (!t || !alive) return;
      unsub = t.db.doc(`data/users/${t.me}/me`).onSnapshot(
        (snap: Any) => setFriends(((snap.exists ? plain(snap.data()?.friends) : []) as string[]) ?? []),
        () => setFriends([]),
      );
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  return friends;
}

export async function setFriends(ids: string[]) {
  const t = await together();
  if (!t) return;
  await t.db
    .doc(`data/users/${t.me}/me`)
    .set({ friends: [...new Set(ids)].slice(0, 200) })
    .catch((e: unknown) => {
      refused(e);
      throw e;
    });
}

// ------------------------------------------------------------------ friend requests (website)

export interface FriendRequest {
  id: string;
  name: string;
  at: number;
}

/** Tell someone I added them, so they can add me back with one tap (website only). */
export async function sendFriendRequest(to: string, myName: string) {
  if (!FRIENDS_ONLY) return;
  const t = await together();
  if (!t || to === t.me) return;
  await t.db.doc(`inbox/${to}/req/${t.me}`).set({ name: myName.slice(0, 40), at: Date.now() }).catch(() => {});
}

/** People who added me (website only), live. */
export function useFriendRequests() {
  const [list, setList] = useState<FriendRequest[]>([]);
  useEffect(() => {
    if (!FRIENDS_ONLY) return;
    let unsub: (() => void) | null = null;
    let alive = true;
    void together().then((t) => {
      if (!t || !alive) return;
      unsub = t.db.collection(`inbox/${t.me}/req`).onSnapshot(
        (snap: Any) => setList(snap.docs.map((d: Any) => ({ id: d.id, name: String(plain(d.data())?.name ?? ''), at: Number(plain(d.data())?.at ?? 0) }))),
        () => {},
      );
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  return list;
}

/** Accept (add them back) or decline a friend request; either way it's cleared. */
export async function answerFriendRequest(from: string, accept: boolean, friends: string[]) {
  const t = await together();
  if (!t) return;
  if (accept && !friends.includes(from)) await setFriends([...friends, from]);
  await t.db.doc(`inbox/${t.me}/req/${from}`).delete().catch(() => {});
}

// ------------------------------------------------------------------ public decks

export interface PublicDeck {
  id: string;
  title: string;
  subject: string;
  language: Locale;
  concepts: Concept[];
  /** The deck's test questions, so a friend's copy plays right away. */
  bank?: Question[];
  /** Website: 'friends' (only people I added) or 'public' (anyone on Lumoly, and a link). */
  visibility?: 'friends' | 'public';
  updatedAt: number;
}

/** One person's shared deck (for a deck link), or null if it isn't shared any more. */
export async function sharedDeck(ownerId: string, deckId: string): Promise<PublicDeck | null> {
  const t = await together();
  if (!t) return null;
  const snap = await t.db.doc(`decks/${ownerId}`).get().catch(() => null);
  const list = (snap?.exists ? (plain(snap.data()?.decks) as PublicDeck[]) : []) ?? [];
  return list.find((d) => d.id === deckId) ?? null;
}

export async function setPublicDecks(decks: PublicDeck[]) {
  const t = await together();
  if (!t?.canWrite) throw new Error('read_only');
  // One document per learner, kept under the store's size limit: older decks lose their questions
  // first (friends' copies then get new ones written), then the oldest decks go.
  let list = decks.slice(0, 20);
  while (JSON.stringify(list).length > 230_000) {
    const i = list.map((d) => !!d.bank?.length).lastIndexOf(true);
    if (i >= 0) list = list.map((d, j) => (j === i ? { ...d, bank: undefined } : d));
    else if (list.length > 1) list = list.slice(0, -1);
    else break;
  }
  await t.db
    .doc(`decks/${t.me}`)
    .set({ decks: list, updatedAt: Date.now() })
    .catch((e: unknown) => {
      refused(e);
      throw e;
    });
  return list.length;
}

export async function myPublicDecks(): Promise<PublicDeck[]> {
  const t = await together();
  if (!t) return [];
  const snap = await t.db.doc(`decks/${t.me}`).get().catch(() => null);
  return (snap?.exists ? (plain(snap.data()?.decks) as PublicDeck[]) : []) ?? [];
}

/** Shared decks, live, with the owner's id: inside Claude everyone's; on the website my friends' and anyone's public ones. */
export function useSharedDecks() {
  const friends = useFriends();
  const [decks, setDecks] = useState<(PublicDeck & { ownerId: string })[] | null>(null);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    void together().then((t) => {
      if (!t || !alive) return setDecks(null);
      unsub = t.db.collection('decks').limit(300).onSnapshot(
        (snap: Any) =>
          setDecks(
            snap.docs.flatMap((d: Any) => ((plain(d.data()?.decks) ?? []) as PublicDeck[]).map((x) => ({ ...x, ownerId: d.id }))).sort((a: PublicDeck, b: PublicDeck) => b.updatedAt - a.updatedAt),
          ),
        () => setDecks([]),
      );
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  if (!decks) return decks;
  const circle = new Set(friends ?? []);
  return decks
    .filter((d) => !FRIENDS_ONLY || circle.has(d.ownerId) || d.ownerId === myId || d.visibility === 'public')
    .map((d) => ({ ...d, fromFriend: !FRIENDS_ONLY || circle.has(d.ownerId) }));
}
