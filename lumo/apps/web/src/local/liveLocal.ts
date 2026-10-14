import {
  allAnswered,
  chooseFormat,
  createLive,
  generateLocal,
  hashString,
  joinLive,
  LIVE_FORMATS,
  LiveError,
  newProgress,
  nextLive,
  publicView,
  removePlayer,
  revealLive,
  seededRng,
  setConnected,
  shortAnswersToCheck,
  shuffle,
  startLive,
  submitLive,
  type Answer,
  type Concept,
  type ConceptProgress,
  type LiveState,
  type Locale,
  type Question,
} from '@lumo/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { LivePublic, LiveReward, RoomStatus } from '../lib/live';
import { judgeShort } from './reader';
import { namesFor, plain, together } from './together';

/**
 * Live games in the browser-only build. The HOST's page runs the game (the same core state machine the
 * server uses) and publishes what players may see to `games/<hostId>`; players send their answers
 * through presence in the game's named room. Answer keys never leave the host's page until the reveal.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomName = (code: string) => `game-${code.toLowerCase()}`;

interface GameDoc {
  code: string;
  title: string;
  hostId: string;
  phase: LivePublic['phase'];
  view: LivePublic;
  correct: Record<string, number>;
  kicked: string[];
  updatedAt: number;
}

// ------------------------------------------------------------------ host

class HostGame {
  state: LiveState;
  private listeners = new Set<(v: LivePublic) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revealing = false;
  private kicked = new Set<string>();
  private dirty = false;
  private writing = false;
  private unsubPeers: (() => void) | null = null;
  private seenAnswer = new Map<string, string>(); // player -> question id already taken

  constructor(
    public code: string,
    state: LiveState,
    private t: NonNullable<Awaited<ReturnType<typeof together>>>,
    private named: Any,
  ) {
    this.state = state;
    this.unsubPeers = named.onPeers((change: Any) => void this.onPeers(change.peers));
  }

  view(): LivePublic {
    return { ...publicView(this.state), serverNow: Date.now() };
  }

  subscribe(fn: (v: LivePublic) => void) {
    this.listeners.add(fn);
    fn(this.view());
    return () => this.listeners.delete(fn);
  }

  private changed() {
    const v = this.view();
    for (const fn of this.listeners) fn(v);
    this.schedule();
    void this.publish();
    if (this.state.phase === 'question' && allAnswered(this.state)) void this.reveal();
  }

  /** Write what players may see; one write at a time, the latest state wins. */
  private async publish() {
    this.dirty = true;
    if (this.writing) return;
    this.writing = true;
    try {
      while (this.dirty) {
        this.dirty = false;
        const correct = Object.fromEntries(this.state.players.map((p) => [p.id, p.correctCount]));
        const doc: GameDoc = { code: this.code, title: this.state.title, hostId: this.t.me, phase: this.state.phase, view: this.view(), correct, kicked: [...this.kicked], updatedAt: Date.now() };
        await this.t.db.doc(`games/${this.t.me}`).set(doc as Any);
      }
    } catch {
      /* a failed write is retried by the next change */
    } finally {
      this.writing = false;
    }
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const s = this.state;
    if (s.phase === 'question' && s.startedAt !== null) this.timer = setTimeout(() => void this.reveal(), Math.max(0, s.startedAt + s.durationMs - Date.now()) + 300);
  }

  private async onPeers(peers: Any[]) {
    const here = new Set<string>();
    const fresh: string[] = [];
    for (const p of peers) {
      const pr = p.presence ?? {};
      const id = p.by as string | null;
      if (!id || pr.player !== this.code || this.kicked.has(id)) continue;
      here.add(id);
      if (!this.state.players.some((x) => x.id === id) && this.state.phase === 'lobby') fresh.push(id);
      const a = pr.answer as { qid?: string; a?: Answer } | undefined;
      const q = this.state.questions[this.state.index];
      if (a?.qid && q && a.qid === q.id && this.seenAnswer.get(id) !== q.id && this.state.phase === 'question' && !this.revealing && a.a && typeof a.a === 'object') {
        this.seenAnswer.set(id, q.id);
        try {
          this.state = submitLive(this.state, id, q.id, a.a, Date.now());
        } catch {
          /* late, duplicate or not a player */
        }
      }
    }
    if (fresh.length) {
      const names = await namesFor(fresh);
      for (const id of fresh) {
        try {
          this.state = joinLive(this.state, { id, name: names[id]?.name || 'Player', avatar: 'firefly-amber' }, Date.now());
        } catch {
          /* full or started */
        }
      }
    }
    for (const p of this.state.players) {
      if (p.id === this.t.me) continue;
      if (p.connected !== here.has(p.id)) this.state = setConnected(this.state, p.id, here.has(p.id));
    }
    this.changed();
  }

  start() {
    this.state = startLive(this.state, this.t.me, Date.now());
    this.changed();
  }

  submit(questionId: string, a: Answer) {
    if (this.revealing) throw new LiveError('wrong_phase');
    this.state = submitLive(this.state, this.t.me, questionId, a, Date.now());
    this.changed();
  }

  kick(playerId: string) {
    if (playerId === this.t.me) return;
    this.kicked.add(playerId);
    this.state = removePlayer(this.state, playerId);
    this.changed();
  }

  next() {
    this.state = nextLive(this.state, this.t.me, Date.now());
    this.changed();
  }

  private async reveal() {
    if (this.state.phase !== 'question' || this.revealing) return;
    this.revealing = true;
    const index = this.state.index;
    const q = this.state.questions[index]!;
    // Answers in other words: the host's Claude decides, briefly (else the word list stands).
    const meanings: Record<string, Record<string, boolean>> = {};
    await Promise.all(
      Object.entries(this.state.answers).map(async ([id, a]) => {
        const checks = shortAnswersToCheck(q, a.answer);
        if (checks.length) meanings[id] = await Promise.race([judgeShort(q.prompt, checks, q.language), new Promise<Record<string, boolean>>((r) => setTimeout(() => r({}), 6000))]);
      }),
    );
    this.revealing = false;
    if (this.state.phase !== 'question' || this.state.index !== index) return;
    this.state = revealLive(this.state, {}, meanings);
    this.changed();
  }

  async close() {
    if (this.timer) clearTimeout(this.timer);
    this.unsubPeers?.();
    this.listeners.clear();
    await this.named.leave().catch(() => {});
    if (this.state.phase !== 'podium') await this.t.db.doc(`games/${this.t.me}`).delete().catch(() => {});
    if (host === this) host = null;
  }
}

let host: HostGame | null = null;

function makeQuestions(concepts: Concept[], language: Locale, count: number): Question[] {
  const rng = seededRng(hashString(`${Date.now()}:${Math.random()}`));
  const order = shuffle(concepts, rng);
  const progress = new Map<string, ConceptProgress>();
  const out: Question[] = [];
  for (let i = 0; out.length < count && i < count * 3; i++) {
    const c = order[i % order.length]!;
    const p = progress.get(c.id) ?? newProgress();
    const choice = chooseFormat(c, concepts, p, rng, { allowed: LIVE_FORMATS });
    if (!choice) continue;
    const q = generateLocal(c, choice.format, choice.bloom, { deck: concepts, language, rng });
    progress.set(c.id, { ...p, recentFormats: [choice.format, ...p.recentFormats].slice(0, 4) });
    if (q) out.push(q);
  }
  return out;
}

/** Create a game from one of my decks (or a shared deck I copied). Returns its code. */
export async function hostLocalGame(deckId: string, count: number): Promise<string> {
  const t = await together();
  if (!t?.room) throw new LiveError('not_in_game');
  if (!t.canWrite) throw Object.assign(new Error('read_only'), { code: 'read_only' });
  const deck = await api<{ deck: { title: string; language: Locale }; concepts: Concept[] }>(`/api/decks/${deckId}/offline`);
  const questions = makeQuestions(deck.concepts, deck.deck.language, count);
  if (questions.length < 3) throw Object.assign(new Error('deck_too_small'), { code: 'deck_too_small' });
  if (host) await host.close();
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  const named = await t.room.join(roomName(code));
  const names = await namesFor([t.me]);
  const state = createLive(code, { id: t.me, name: names[t.me]?.name || 'Host', avatar: 'firefly-violet' }, deck.deck.title, questions, Date.now());
  host = new HostGame(code, state, t, named);
  await named.presence({ player: code, host: true });
  host.subscribe(() => {});
  return code;
}

// ------------------------------------------------------------------ open games (lobby list)

export function useOpenGames() {
  const [games, setGames] = useState<{ code: string; title: string; hostId: string; players: number }[] | null>(null);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    void together().then((t) => {
      if (!t || !t.room || !alive) return setGames(null);
      unsub = t.db
        .collection('games')
        .where('phase', '==', 'lobby')
        .limit(50)
        .onSnapshot(
          (snap: Any) =>
            setGames(
              snap.docs
                .map((d: Any) => plain(d.data()) as GameDoc)
                .filter((g: GameDoc) => Date.now() - g.updatedAt < 30 * 60_000)
                .map((g: GameDoc) => ({ code: g.code, title: g.title, hostId: g.hostId, players: g.view?.players?.length ?? 0 })),
            ),
          () => setGames([]),
        );
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  return games;
}

// ------------------------------------------------------------------ the room hook (host or player)

/** Same shape as the server version's useLiveRoom, so the Live screens work unchanged. */
export function useLocalLiveRoom(code: string) {
  const [state, setState] = useState<LivePublic | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [status, setStatus] = useState<RoomStatus>('joining');
  const [error, setError] = useState<string | null>(null);
  const [reward, setReward] = useState<LiveReward | null>(null);
  const named = useRef<Any>(null);
  const rewarded = useRef(false);

  useEffect(() => {
    let alive = true;
    const cleanups: (() => void)[] = [];
    void (async () => {
      const t = await together();
      if (!alive) return;
      if (!t?.room) {
        setStatus('error');
        setError('not_in_game');
        return;
      }
      setMe(t.me);
      if (host?.code === code) {
        cleanups.push(host.subscribe((v) => setState(v)));
        setStatus('in');
        return;
      }
      // Player: follow the host's published game and send answers by presence.
      let seen = false;
      const unsub = t.db
        .collection('games')
        .where('code', '==', code)
        .limit(1)
        .onSnapshot(
          (snap: Any) => {
            const doc = plain(snap.docs[0]?.data()) as GameDoc | undefined;
            if (!doc) {
              if (seen) setStatus('closed');
              else {
                setStatus('error');
                setError('not_in_game');
              }
              return;
            }
            seen = true;
            if (doc.kicked?.includes(t.me)) return setStatus('kicked');
            const inGame = doc.view.players.some((p) => p.id === t.me);
            if (!inGame && doc.phase !== 'lobby') {
              setStatus('error');
              setError('started');
              return;
            }
            setState({ ...doc.view, serverNow: doc.updatedAt });
            setStatus(inGame ? 'in' : 'joining');
            if (doc.phase === 'podium' && !rewarded.current) {
              const p = doc.view.players.find((x) => x.id === t.me);
              if (p) {
                rewarded.current = true;
                void api<LiveReward>('/api/local/live-reward', { method: 'POST', body: { code, rank: p.rank, players: doc.view.players.length, correct: doc.correct?.[t.me] ?? 0 } }).then(setReward, () => {});
              }
            }
          },
          () => {
            setStatus('error');
            setError('network');
          },
        );
      cleanups.push(unsub);
      try {
        const r = await t.room.join(roomName(code));
        if (!alive) return void r.leave();
        named.current = r;
        await r.presence({ player: code });
        cleanups.push(() => void r.leave());
      } catch {
        setStatus('error');
        setError('network');
      }
    })();
    return () => {
      alive = false;
      cleanups.forEach((f) => f());
    };
  }, [code]);

  // The host gets their podium reward from their own engine.
  useEffect(() => {
    if (!state || state.phase !== 'podium' || rewarded.current || host?.code !== code || !me) return;
    const p = state.players.find((x) => x.id === me);
    if (!p) return;
    rewarded.current = true;
    const correct = host.state.players.find((x) => x.id === me)?.correctCount ?? 0;
    void api<LiveReward>('/api/local/live-reward', { method: 'POST', body: { code, rank: p.rank, players: state.players.length, correct } }).then(setReward, () => {});
  }, [state, code, me]);

  const send = useCallback(
    async (event: string, body: object = {}): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (host?.code !== code) return { ok: false as const, error: 'not_host' };
      try {
        if (event === 'live:start') host.start();
        else if (event === 'live:next') host.next();
        else if (event === 'live:kick') host.kick(String((body as { playerId?: string }).playerId));
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, error: e instanceof LiveError ? e.code : 'server_error' };
      }
    },
    [code],
  );

  const answer = useCallback(
    async (questionId: string, a: Answer): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        if (host?.code === code) host.submit(questionId, a);
        else {
          if (!named.current) return { ok: false as const, error: 'network' };
          await named.current.presence({ player: code, answer: { qid: questionId, a } });
        }
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, error: e instanceof LiveError ? e.code : 'invalid' };
      }
    },
    [code],
  );

  return { state, me, status, error, reward, connected: true, send, answer };
}

/** Leaving the host page for good ends the game for everyone. */
export async function endHostedGame(code: string) {
  if (host?.code === code) await host.close();
}

export const isHosting = (code: string) => host?.code === code;
