import type { Server as HttpServer } from 'node:http';
import {
  allAnswered,
  chooseFormat,
  createLive,
  generateLocal,
  hashString,
  joinLive,
  LIVE_FORMATS,
  LiveError,
  liveRewards,
  newProgress,
  endLive,
  nextLive,
  openPart,
  publicView,
  ranking,
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
  type Locale,
  type ConceptProgress,
  type LiveState,
  type OpenGrade,
  type Question,
} from '@lumo/core';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import type { AiProvider } from '../ai/provider.ts';
import type { Sessions } from '../auth/session.ts';
import { SESSION_COOKIE } from '../auth/session.ts';
import type { Db } from '../db/pool.ts';
import { emptyRewards, type GameService, type Rewards } from '../game/service.ts';
import { answerSchema } from '../quiz/schemas.ts';
import { QuizError, type QuizService } from '../quiz/service.ts';
import { makeCode } from '../social/service.ts';
import { getUser } from '../users.ts';

const JUDGE_TIMEOUT_MS = 4_000;
const HOST_AWAY_ADVANCE_MS = 10_000; // keep the game moving if the host drops during a reveal
const IDLE_LOBBY_MS = 30 * 60_000;
const PODIUM_KEEP_MS = 10 * 60_000;

interface Game {
  id: string;
  state: LiveState;
  /** Sockets per player: a learner may have two tabs open. */
  sockets: Map<string, Set<string>>;
  kicked: Set<string>;
  timer: NodeJS.Timeout | null;
  revealing: boolean;
  touchedAt: number;
  rewards: Map<string, { rank: number; xp: number; coins: number; rewards: Rewards }>;
}

export interface LivePlayerReward {
  rank: number;
  xp: number;
  coins: number;
  rewards: Rewards;
}

type Ack = (r: unknown) => void;

/** At most this many Live questions are written by the AI per game (long games stay fast and cheap). */
const AI_LIVE_QUESTIONS = 20;
const createBody = z.object({ deckId: z.string().uuid(), count: z.number().int().min(3).max(100).default(10) });
const codeBody = z.object({ code: z.string().trim().min(4).max(8) });
const answerBody = z.object({ code: z.string().max(8), questionId: z.string().max(60), answer: answerSchema });
const kickBody = z.object({ code: z.string().max(8), playerId: z.string().uuid() });

/**
 * Live games: the state machine lives in core; this service owns the clock, the sockets and the rewards.
 * Clients only ever receive `publicView()`; answers are graded here, never in the browser.
 */
export class LiveService {
  private games = new Map<string, Game>();
  private lastCreate = new Map<string, number>();
  private io: Server | null = null;
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private db: Db,
    private ai: AiProvider,
    private quiz: QuizService,
    private game: GameService,
    private log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  attach(server: HttpServer, sessions: Sessions, origin: string) {
    const io = new Server(server, { path: '/api/live/socket', cors: { origin, credentials: true }, maxHttpBufferSize: 64_000 });
    this.io = io;
    io.use(async (socket, next) => {
      const token = parseCookie(socket.handshake.headers.cookie ?? '')[SESSION_COOKIE];
      const id = await sessions.verify(token);
      const user = id ? await getUser(this.db, id) : null;
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = { id: user.id, name: user.username, avatar: user.avatar };
      next();
    });
    io.on('connection', (s) => this.onConnection(s));
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  async close() {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const g of this.games.values()) if (g.timer) clearTimeout(g.timer);
    this.games.clear();
    await this.io?.close();
  }

  /** Active game count (for tests and health). */
  get size() {
    return this.games.size;
  }

  // ------------------------------------------------------------- sockets

  private onConnection(s: Socket) {
    const me = s.data.user as { id: string; name: string; avatar: string };
    // Per-connection flood guard: plenty for a real player, useless for a script.
    let tokens = 20;
    let refilled = Date.now();
    const safe = (fn: (body: unknown) => Promise<unknown> | unknown) => async (body: unknown, ack?: Ack) => {
      const now = Date.now();
      tokens = Math.min(20, tokens + ((now - refilled) / 1000) * 5);
      refilled = now;
      if (tokens < 1) {
        if (typeof ack === 'function') ack({ ok: false, error: 'slow_down' });
        return;
      }
      tokens -= 1;
      try {
        const r = await fn(body);
        if (typeof ack === 'function') ack({ ok: true, ...(r as object) });
      } catch (err) {
        const code = err instanceof LiveError || err instanceof QuizError ? err.code : err instanceof z.ZodError ? 'invalid' : 'server_error';
        if (code === 'server_error') this.log('live error', err);
        if (typeof ack === 'function') ack({ ok: false, error: code });
      }
    };

    s.on('live:create', safe(async (b) => {
      const { deckId, count } = createBody.parse(b);
      // Making a game generates many questions (AI calls): one new game per 15 seconds per host.
      const last = this.lastCreate.get(me.id) ?? 0;
      if (Date.now() - last < 15_000) throw new LiveError('slow_down');
      this.lastCreate.set(me.id, Date.now());
      return { code: await this.create(me, deckId, count) };
    }));
    s.on('live:join', safe((b) => this.join(s, me, codeBody.parse(b).code.toUpperCase())));
    s.on('live:start', safe((b) => this.withGame(codeBody.parse(b).code, (g) => (g.state = startLive(g.state, me.id, Date.now())))));
    s.on('live:answer', safe((b) => {
      const { code, questionId, answer } = answerBody.parse(b);
      return this.withGame(code, (g) => {
        if (g.revealing) throw new LiveError('wrong_phase');
        g.state = submitLive(g.state, me.id, questionId, answer as Answer, Date.now());
      });
    }));
    s.on('live:next', safe((b) => this.withGame(codeBody.parse(b).code, (g) => this.advance(g, me.id))));
    s.on('live:end', safe((b) => this.withGame(codeBody.parse(b).code, (g) => {
      if (g.revealing) throw new LiveError('wrong_phase');
      g.state = endLive(g.state, me.id);
      void this.finish(g);
    })));
    s.on('live:kick', safe((b) => {
      const { code, playerId } = kickBody.parse(b);
      return this.withGame(code, (g) => {
        if (me.id !== g.state.hostId) throw new LiveError('not_host');
        if (playerId === me.id) return;
        g.kicked.add(playerId);
        g.state = removePlayer(g.state, playerId);
        for (const sid of g.sockets.get(playerId) ?? []) {
          this.io?.to(sid).emit('live:kicked', { code: g.state.code });
          this.io?.sockets.sockets.get(sid)?.leave(room(g));
        }
        g.sockets.delete(playerId);
      });
    }));
    s.on('live:leave', safe((b) => this.leave(s, me.id, codeBody.parse(b).code.toUpperCase())));
    s.on('disconnect', () => {
      for (const g of this.games.values()) this.dropSocket(g, me.id, s.id);
    });
  }

  private find(code: string) {
    const g = this.games.get(code.toUpperCase());
    if (!g) throw new LiveError('not_in_game');
    return g;
  }

  /** Apply a change, then broadcast and re-arm the clock. */
  private withGame(code: string, fn: (g: Game) => void) {
    const g = this.find(code);
    fn(g);
    g.touchedAt = Date.now();
    this.afterChange(g);
    return {};
  }

  private afterChange(g: Game) {
    this.broadcast(g);
    this.schedule(g);
    if (g.state.phase === 'question' && allAnswered(g.state)) void this.reveal(g);
  }

  private broadcast(g: Game) {
    this.io?.to(room(g)).emit('live:state', view(g));
  }

  private schedule(g: Game) {
    if (g.timer) clearTimeout(g.timer);
    g.timer = null;
    const s = g.state;
    if (s.phase === 'question' && s.startedAt !== null) {
      g.timer = setTimeout(() => void this.reveal(g), Math.max(0, s.startedAt + s.durationMs - Date.now()) + 250);
    } else if (s.phase === 'reveal' && !s.players.find((p) => p.id === s.hostId)?.connected) {
      g.timer = setTimeout(() => this.safely(() => this.advance(g, s.hostId)), HOST_AWAY_ADVANCE_MS);
    }
  }

  private safely(fn: () => void) {
    try {
      fn();
    } catch (err) {
      if (!(err instanceof LiveError)) this.log('live timer error', err);
    }
  }

  // ------------------------------------------------------------- game flow

  async create(host: { id: string; name: string; avatar: string }, deckId: string, count: number): Promise<string> {
    // One running game per host: hosting a new one closes the old one.
    for (const g of this.games.values()) if (g.state.hostId === host.id) this.end(g, 'closed');
    const { deck, concepts } = await this.quiz.loadDeck(deckId, host.id);
    const questions = await this.makeQuestions(concepts, deck.language, count, hashString(`${host.id}:${Date.now()}`));
    if (questions.length < 3) throw new QuizError(422, 'deck_too_small');
    let code = makeCode(6);
    while (this.games.has(code)) code = makeCode(6);
    const now = Date.now();
    const { rows } = await this.db.query<{ id: string }>('INSERT INTO live_games (code, host_id, deck_id, title) VALUES ($1, $2, $3, $4) RETURNING id', [code, host.id, deckId, deck.title]);
    this.games.set(code, {
      id: rows[0]!.id,
      state: setConnected(createLive(code, host, deck.title, questions, now), host.id, false), // connected once their socket joins
      sockets: new Map(),
      kicked: new Set(),
      timer: null,
      revealing: false,
      touchedAt: now,
      rewards: new Map(),
    });
    return code;
  }

  private async makeQuestions(concepts: Concept[], language: Locale, count: number, seed: number): Promise<Question[]> {
    if (concepts.length === 0) return [];
    const rng = seededRng(seed);
    const order = shuffle(concepts, rng);
    const picks = Array.from({ length: count }, (_, i) => order[i % order.length]!);
    const progress = new Map<string, ConceptProgress>();
    const plans = picks.flatMap((c) => {
      const p = progress.get(c.id) ?? newProgress();
      const choice = chooseFormat(c, concepts, p, rng, { allowed: LIVE_FORMATS });
      if (!choice) return [];
      progress.set(c.id, { ...p, recentFormats: [choice.format, ...p.recentFormats].slice(0, 4) });
      return [{ c, ...choice, seed: Math.floor(rng() * 2 ** 31) }];
    });
    const qs = await Promise.all(
      plans.map(async (x, i) => {
        const local = () => generateLocal(x.c, x.format, x.bloom, { deck: concepts, language, rng: seededRng(x.seed) });
        if (i >= AI_LIVE_QUESTIONS) return local(); // long games: the rest come from the local generator
        try {
          return (await this.ai.generateQuestion({ concept: x.c, format: x.format, bloom: x.bloom, deck: concepts, language, avoidPrompts: [], seed: x.seed })) ?? local();
        } catch (err) {
          this.log('live question generation failed; using local generator', err);
          return local();
        }
      }),
    );
    return qs.filter((q): q is Question => !!q);
  }

  private join(s: Socket, me: { id: string; name: string; avatar: string }, code: string) {
    const g = this.games.get(code);
    if (!g) throw new LiveError('not_in_game');
    if (g.kicked.has(me.id)) throw new LiveError('not_in_game');
    g.state = joinLive(g.state, me, Date.now());
    if (!g.sockets.has(me.id)) g.sockets.set(me.id, new Set());
    g.sockets.get(me.id)!.add(s.id);
    void s.join(room(g));
    g.touchedAt = Date.now();
    this.afterChange(g);
    return { state: view(g), you: me.id, reward: g.rewards.get(me.id) ?? null };
  }

  private leave(s: Socket, userId: string, code: string) {
    const g = this.games.get(code);
    if (!g) return {};
    void s.leave(room(g));
    g.sockets.delete(userId);
    if (g.state.hostId === userId && g.state.phase === 'lobby') {
      this.end(g, 'closed');
      return {};
    }
    g.state = g.state.phase === 'lobby' ? removePlayer(g.state, userId) : setConnected(g.state, userId, false);
    this.afterChange(g);
    return {};
  }

  private dropSocket(g: Game, userId: string, socketId: string) {
    const set = g.sockets.get(userId);
    if (!set?.delete(socketId) || set.size > 0) return;
    g.state = setConnected(g.state, userId, false);
    this.afterChange(g);
  }

  /** Close the question: AI judges open answers (briefly), then everyone sees the results. */
  private async reveal(g: Game) {
    if (g.state.phase !== 'question' || g.revealing) return;
    g.revealing = true;
    const index = g.state.index;
    try {
      const [judged, meanings] = await Promise.all([this.judge(g), this.meanings(g)]);
      if (g.state.phase !== 'question' || g.state.index !== index || !this.games.has(g.state.code)) return;
      g.state = revealLive(g.state, judged, meanings);
    } finally {
      g.revealing = false;
    }
    this.afterChange(g);
  }

  private async judge(g: Game): Promise<Record<string, OpenGrade>> {
    const q = g.state.questions[g.state.index]!;
    const jobs = Object.entries(g.state.answers).flatMap(([playerId, a]) => {
      const need = openPart(q, a.answer);
      return need ? [{ playerId, need }] : [];
    });
    if (jobs.length === 0) return {};
    const out: Record<string, OpenGrade> = {};
    await Promise.all(
      jobs.map(async ({ playerId, need }) => {
        try {
          out[playerId] = await timeout(this.ai.gradeOpen({ question: q, need, language: q.language }), JUDGE_TIMEOUT_MS);
        } catch {
          // Too slow or failed: the built-in key-point grader decides.
        }
      }),
    );
    return out;
  }

  /** Short answers in other words ("round" for "circular"): Claude decides, briefly; else the word list stands. */
  private async meanings(g: Game): Promise<Record<string, Record<string, boolean>>> {
    if (this.ai.name !== 'claude') return {};
    const q = g.state.questions[g.state.index]!;
    const out: Record<string, Record<string, boolean>> = {};
    await Promise.all(
      Object.entries(g.state.answers).map(async ([playerId, a]) => {
        const checks = shortAnswersToCheck(q, a.answer);
        if (!checks.length) return;
        out[playerId] = await timeout(this.ai.judgeShort(q.prompt, checks, q.language), JUDGE_TIMEOUT_MS).catch(() => ({}));
      }),
    );
    return out;
  }

  private advance(g: Game, by: string) {
    g.state = nextLive(g.state, by, Date.now());
    if (g.state.phase === 'podium') void this.finish(g);
  }

  /** Podium: everyone who played gets XP and coins (server-granted, once). */
  private async finish(g: Game) {
    const ranked = ranking(g.state);
    const players = ranked.length;
    for (const [i, p] of ranked.entries()) {
      const rank = i + 1;
      const r = liveRewards(rank, players, p.correctCount);
      const c = await this.db.connect();
      try {
        await c.query('BEGIN');
        await c.query('UPDATE users SET coins = coins + $2 WHERE id = $1', [p.id, r.coins]);
        const rewards = await this.game.award(c, p.id, { xp: r.xp, reason: 'live', events: [{ type: 'live_done', rank, players }] });
        await c.query('COMMIT');
        const reward = { rank, ...r, rewards };
        g.rewards.set(p.id, reward);
        for (const sid of g.sockets.get(p.id) ?? []) this.io?.to(sid).emit('live:reward', reward);
      } catch (err) {
        await c.query('ROLLBACK');
        this.log('live reward failed', err);
        g.rewards.set(p.id, { rank, xp: 0, coins: 0, rewards: emptyRewards() });
      } finally {
        c.release();
      }
    }
    const results = ranked.map((p, i) => ({ userId: p.id, name: p.name, rank: i + 1, score: p.score, correct: p.correctCount }));
    await this.db.query("UPDATE live_games SET status = 'done', results = $2, ended_at = now() WHERE id = $1", [g.id, JSON.stringify(results)]).catch((e) => this.log('live save failed', e));
  }

  private end(g: Game, why: 'closed' | 'expired') {
    if (g.timer) clearTimeout(g.timer);
    this.io?.to(room(g)).emit('live:closed', { code: g.state.code, why });
    this.io?.in(room(g)).socketsLeave(room(g));
    this.games.delete(g.state.code);
    if (g.state.phase !== 'podium') void this.db.query("UPDATE live_games SET status = 'cancelled', ended_at = now() WHERE id = $1", [g.id]).catch(() => {});
  }

  private sweep() {
    const now = Date.now();
    for (const [id, at] of this.lastCreate) if (now - at > 60_000) this.lastCreate.delete(id);
    for (const g of [...this.games.values()]) {
      const idle = now - g.touchedAt;
      const nobody = g.state.players.every((p) => !p.connected);
      if ((g.state.phase === 'podium' && idle > PODIUM_KEEP_MS) || idle > IDLE_LOBBY_MS || (nobody && idle > 5 * 60_000)) this.end(g, 'expired');
    }
  }
}

const room = (g: Game) => `live:${g.state.code}`;
/** serverNow lets clients correct their clock for the countdown. */
const view = (g: Game) => ({ ...publicView(g.state), serverNow: Date.now() });

function parseCookie(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}
