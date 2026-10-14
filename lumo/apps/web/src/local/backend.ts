import {
  applyAnswer,
  applyStats,
  BADGES,
  buildStudyPlan,
  chooseFormat,
  currentHearts,
  dayKey,
  emptyStats,
  EXAM_FORMATS,
  examReport,
  examTimeLimitMs,
  extractFromText,
  FORMATS,
  gainHearts,
  generateLocal,
  generateSandbox,
  generateUsername,
  grade,
  hashString,
  isMastered,
  isRetry,
  levelFromXp,
  levelProgress,
  levelUpRewards,
  liveRewards,
  weekId,
  loseHeart,
  MAX_HEARTS,
  masteryBand,
  masteryScore,
  newBadges,
  newProgress,
  newSession,
  newSrsState,
  newStreak,
  parseSandboxRequest,
  pickConcepts,
  publicQuestion,
  questionsFor,
  ratingFromScore,
  recordAttempt,
  recordStudyDay,
  review,
  SAMPLE_DECKS,
  SANDBOX_KINDS,
  SANDBOX_XP,
  sandboxSupports,
  seededRng,
  sessionDone,
  shortAnswersToCheck,
  streakStatus,
  xpForAnswer,
  type Answer,
  type Concept,
  type ConceptProgress,
  type ConceptStateView,
  type Format,
  type GameEvent,
  type Locale,
  type Question,
  type SandboxData,
  type SandboxKind,
  type SessionMode,
  type SessionState,
  type SrsState,
  type Stats,
  type StreakState,
} from '@lumo/core';
import { judgeShort, withTimeout } from './reader';
import { goOnline, publishProfile, together } from './together';

/**
 * Browser-only Lumo: the same rules as the server, run in the page and saved in this browser.
 * Only what makes sense for one learner on one device is here (no friends, Live games or AI).
 */

class LocalError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

interface Deck {
  id: string;
  title: string;
  subject: string;
  language: Locale;
  summary: string;
  concepts: Concept[];
  updatedAt: number;
}
interface StoredSession {
  id: string;
  deckId: string;
  mode: SessionMode;
  state: SessionState & { language: Locale; formats?: Format[]; heartsLost: number; startedAt?: number; timeLimitMs?: number; skipped?: string[]; endedAt?: number };
  current: Question | null;
  status: 'active' | 'done';
  attempts: { conceptId: string; format: Format; bloom: Question['bloom']; score: number; at: number }[];
}
interface Activity {
  id: string;
  deckId: string;
  kind: SandboxKind;
  title: string;
  data: SandboxData;
  score: number | null;
  xp: number;
  completedAt: number | null;
  createdAt: number;
}
interface DB {
  v: 1;
  /** When the content last changed (to pick the newer copy between this device and the account). */
  savedAt?: number;
  user: {
    id: string;
    username: string;
    avatar: string;
    locale: Locale;
    timezone: string;
    settings: Record<string, unknown>;
    xp: number;
    coins: number;
    hearts: number;
    heartsUpdatedAt: number;
    streak: StreakState;
    stats: Stats;
    createdAt: number;
    week?: { id: string; xp: number };
    liveRewarded?: string[];
  };
  decks: Deck[];
  states: Record<string, ConceptStateView>;
  sessions: Record<string, StoredSession>;
  sandbox: Activity[];
  badges: Record<string, number>;
  plans: Record<string, { examDay: string; minutesPerDay: number }>;
  /** Decks deleted on purpose, so another device's copy doesn't bring them back. */
  deletedDecks?: string[];
}

const KEY = 'lumo_local_v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

function freshDb(): DB {
  const locale: Locale = navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    /* keep UTC */
  }
  return {
    v: 1,
    user: {
      id: uid(),
      username: generateUsername(),
      avatar: 'firefly-amber',
      locale,
      timezone,
      settings: {},
      xp: 0,
      coins: 0,
      hearts: MAX_HEARTS,
      heartsUpdatedAt: Date.now(),
      streak: newStreak(),
      stats: emptyStats(),
      createdAt: Date.now(),
    },
    decks: [],
    states: {},
    sessions: {},
    sandbox: [],
    badges: {},
    plans: {},
  };
}

let db: DB | null = null;
function load(): DB {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) db = JSON.parse(raw) as DB;
  } catch {
    /* storage blocked or broken: start fresh in memory */
  }
  db ??= freshDb();
  return db;
}
let lastSaved = '';
function save() {
  const d = load();
  // Keep finished sessions small: only the last 30.
  const done = Object.values(d.sessions).filter((s) => s.status === 'done');
  for (const s of done.slice(0, Math.max(0, done.length - 30))) delete d.sessions[s.id];
  const { savedAt: _s, ...content } = d;
  const str = JSON.stringify(content);
  if (str === lastSaved) return; // nothing changed (a read)
  lastSaved = str;
  d.savedAt = now();
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage full or blocked: the account copy below still keeps it */
  }
  scheduleCloud();
}

// ------------------------------------------------------------------ account copy

/*
 * Browser storage inside the Claude viewer can be wiped between visits, so progress is also kept in
 * the viewer's own private space of the page's shared store (data/users/<id>/…), tied to their
 * Claude account: "main" holds progress, and each deck is its own document (size limit per document).
 */
let cloud: { db: any; me: string } | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
let booting: Promise<void> | null = null;
const MAIN_LIMIT = 230_000;

function boot(): Promise<void> {
  booting ??= (async () => {
    const t = await Promise.race([together(), new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
    if (!t) return; // no account here: this device only
    const base = `data/users/${t.me}`;
    let main: (Partial<DB> & { deckIds?: string[] }) | null = null;
    let docs: { id: string; exists: boolean; data: () => unknown }[] = [];
    try {
      const snap = await withTimeout<any>(t.db.doc(`${base}/main`).get(), 8000); // eslint-disable-line @typescript-eslint/no-explicit-any
      main = snap.exists ? (snap.data() as Partial<DB> & { deckIds?: string[] }) : null;
      if (main) docs = (await withTimeout<{ docs: typeof docs }>(t.db.collection(base).limit(300).get(), 10_000)).docs;
    } catch {
      return; // can't read the account copy: never risk overwriting it
    }
    const local = load();
    const localIsNew = !local.savedAt || (local.decks.length === 0 && local.user.xp === 0);
    const cloudDecks = new Map<string, Deck>();
    for (const d of docs) {
      if (!d.exists || !d.id.startsWith('deck-')) continue;
      const dk = d.data() as Deck;
      if (dk?.id && Array.isArray(dk.concepts)) cloudDecks.set(dk.id, dk);
    }
    if (main?.user) {
      const accountWins = localIsNew || (main.savedAt ?? 0) >= (local.savedAt ?? 0);
      const deleted = new Set([...(main.deletedDecks ?? []), ...(local.deletedDecks ?? [])]);
      // Every deck made on any device is kept (newest copy of each), unless it was deleted.
      const byId = new Map<string, Deck>();
      for (const dk of [...cloudDecks.values(), ...local.decks]) {
        if (deleted.has(dk.id)) continue;
        const had = byId.get(dk.id);
        if (!had || (dk.updatedAt ?? 0) > (had.updatedAt ?? 0)) byId.set(dk.id, dk);
      }
      for (const dk of cloudDecks.values()) if (byId.get(dk.id) === dk) written.set(dk.id, deckSig(dk));
      const order = [...(accountWins ? (main.deckIds ?? []) : local.decks.map((x) => x.id))];
      const decks = [...byId.values()].sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        return ia === -1 && ib === -1 ? b.updatedAt - a.updatedAt : ia === -1 ? -1 : ib === -1 ? 1 : ia - ib;
      });
      const winner = (accountWins ? { ...freshDb(), ...main } : local) as DB & { deckIds?: string[] };
      const loser = (accountWins ? local : { ...freshDb(), ...main }) as DB;
      db = {
        ...winner,
        decks,
        deletedDecks: [...deleted].slice(-200),
        states: { ...loser.states, ...winner.states },
        sessions: { ...loser.sessions, ...winner.sessions },
        badges: { ...loser.badges, ...winner.badges },
        plans: { ...loser.plans, ...winner.plans },
      } as DB;
      delete (db as DB & { deckIds?: string[] }).deckIds;
      lastSaved = '';
    } else if (localIsNew) {
      // First visit with this account: use their first name as the username when it fits.
      const full = typeof t.user.name === 'function' ? await withTimeout(t.user.name(), 3000).catch(() => '') : '';
      const name = String(full || '').split(/\s+/)[0]!.replace(/[^A-Za-z0-9_]/g, '');
      if (name.length >= 3 && name.length <= 20) local.user.username = name;
    }
    cloud = { db: t.db, me: t.me };
    save();
    scheduleCloud(true);
    shareStats(); // friends can find me by username right away
    void goOnline(load().user.username);
  })().catch(() => {});
  return booting;
}

let cloudTimer: ReturnType<typeof setTimeout> | null = null;
let cloudBusy = false;
let cloudAgain = false;
const written = new Map<string, string>(); // deck id -> content signature last written
const deckSig = (dk: Deck) => `${dk.title}|${dk.concepts.length}|${JSON.stringify(dk.concepts).length}`;

function scheduleCloud(now = false) {
  if (!cloud) return;
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => void pushCloud(), now ? 0 : 1500);
}

async function pushCloud() {
  if (!cloud) return;
  if (cloudBusy) {
    cloudAgain = true;
    return;
  }
  cloudBusy = true;
  const base = `data/users/${cloud.me}`;
  try {
    const d = load();
    for (const dk of d.decks) {
      const sig = deckSig(dk);
      if (written.get(dk.id) === sig) continue;
      await cloud.db.doc(`${base}/deck-${dk.id}`).set(dk as never);
      written.set(dk.id, sig);
    }
    for (const id of [...written.keys()]) {
      if (d.decks.some((x) => x.id === id)) continue;
      await cloud.db.doc(`${base}/deck-${id}`).delete().catch(() => {});
      written.delete(id);
    }
    await cloud.db.doc(`${base}/main`).set(mainDoc(d) as never);
  } catch {
    /* read-only viewer or a hiccup: the next change tries again */
  } finally {
    cloudBusy = false;
    if (cloudAgain) {
      cloudAgain = false;
      scheduleCloud();
    }
  }
}

/** Progress without the decks, trimmed to fit one document. */
function mainDoc(d: DB) {
  const { decks, ...rest } = d;
  const sessions = Object.values(d.sessions).sort((a, b) => (b.attempts.at(-1)?.at ?? 0) - (a.attempts.at(-1)?.at ?? 0));
  const keep = (n: number) => Object.fromEntries(sessions.filter((s, i) => (s.status === 'active' && i < 20) || i < n).map((s) => [s.id, s]));
  let doc = { ...rest, deckIds: decks.map((x) => x.id), sessions: keep(12), sandbox: d.sandbox.slice(0, 10) };
  if (JSON.stringify(doc).length > MAIN_LIMIT) doc = { ...doc, sandbox: [], sessions: keep(3) };
  if (JSON.stringify(doc).length > MAIN_LIMIT) doc = { ...doc, sessions: keep(0) };
  return doc;
}

// ------------------------------------------------------------------ helpers

const now = () => Date.now();
const today = () => dayKey(now(), load().user.timezone);

function profile() {
  const u = load().user;
  const t = now();
  const hearts = currentHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, t);
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    email: null,
    locale: u.locale,
    timezone: u.timezone,
    settings: u.settings,
    xp: u.xp,
    level: levelProgress(u.xp),
    coins: u.coins,
    hearts: { current: hearts.hearts, nextRefillAt: hearts.nextRefillAt },
    streak: { ...u.streak, status: streakStatus(u.streak, dayKey(t, u.timezone)) },
    leagueTier: 'bronze',
    theme: 'default',
    boostUntil: null,
    createdAt: new Date(u.createdAt).toISOString(),
  };
}

type Rewards = { xp: number; levelUp: { level: number; coins: number } | null; badges: string[]; questsCompleted: string[] };
const emptyRewards = (): Rewards => ({ xp: 0, levelUp: null, badges: [], questsCompleted: [] });

/** Same idea as the server's award(): XP, level-up coins, stats and badges in one place. */
function award(xp: number, events: GameEvent[]): Rewards {
  const d = load();
  const r = emptyRewards();
  const all = [...events];
  if (xp > 0) {
    const before = levelFromXp(d.user.xp);
    d.user.xp += xp;
    const wk = weekId(now());
    d.user.week = d.user.week?.id === wk ? { id: wk, xp: d.user.week.xp + xp } : { id: wk, xp };
    r.xp = xp;
    all.push({ type: 'xp', amount: xp });
    for (let level = before + 1; level <= levelFromXp(d.user.xp); level++) {
      const lu = levelUpRewards(level);
      d.user.coins += lu.coins;
      r.levelUp = { level, coins: lu.coins };
      all.push({ type: 'level', level });
    }
  }
  const statsBefore = { ...emptyStats(), ...d.user.stats };
  const statsAfter = all.reduce(applyStats, statsBefore);
  for (const b of newBadges(statsBefore, statsAfter)) {
    if (!d.badges[b]) {
      d.badges[b] = now();
      r.badges.push(b);
    }
  }
  d.user.stats = statsAfter;
  return r;
}

function deck(id: string): Deck {
  const d = load().decks.find((x) => x.id === id);
  if (!d) throw new LocalError(404, 'deck_not_found');
  return d;
}
const statesMap = (ids: string[]) => new Map(ids.flatMap((id) => (load().states[id] ? [[id, load().states[id]!] as const] : [])));

function masteryMap(id: string) {
  const dk = deck(id);
  const t = now();
  return {
    deck: { id: dk.id, title: dk.title, subject: dk.subject, language: dk.language, mine: true },
    concepts: dk.concepts.map((c) => {
      const s = load().states[c.id];
      const p = s?.progress ?? newProgress();
      return { id: c.id, term: c.term, topic: c.topic, kind: c.kind, band: masteryBand(p), score: masteryScore(p), formatsPassed: p.formatsPassed.length, due: s?.srs ? s.srs.due <= t : false };
    }),
  };
}

function createDeck(input: { title: string; subject?: string; language: Locale; summary?: string; concepts: Omit<Concept, 'id'>[] }) {
  const d: Deck = { id: uid(), title: input.title, subject: input.subject ?? '', language: input.language, summary: input.summary ?? '', concepts: input.concepts.map((c) => ({ ...c, id: uid() }) as Concept), updatedAt: now() };
  load().decks.unshift(d);
  award(0, [{ type: 'deck_created' }]);
  return { id: d.id };
}

// ------------------------------------------------------------------ quiz

const LOCAL_FORMATS = FORMATS.filter((f) => f !== 'teach_back'); // teach-back needs an AI follow-up question

function makeQuestion(s: StoredSession, conceptId: string, concepts: Concept[]): Question | null {
  const c = concepts.find((x) => x.id === conceptId);
  if (!c) return null;
  const stored = load().states[conceptId]?.progress ?? newProgress();
  const sessionFormats = s.state.history.filter((h) => h.conceptId === conceptId).map((h) => h.format).reverse();
  const progress: ConceptProgress = { ...stored, recentFormats: [...new Set([...sessionFormats, ...stored.recentFormats])].slice(0, 4) };
  const rng = seededRng(hashString(`${conceptId}:${now()}:${s.state.answered}`));
  const tried: Format[] = [];
  for (let i = 0; i < 4; i++) {
    const choice = chooseFormat(c, concepts, progress, rng, { exclude: tried, allowed: s.state.formats ?? LOCAL_FORMATS });
    if (!choice) return null;
    const q = generateLocal(c, choice.format, choice.bloom, { deck: concepts, language: s.state.language, rng });
    if (q) return q;
    tried.push(choice.format);
  }
  return null;
}

function serveNext(s: StoredSession): Question | null {
  const concepts = deck(s.deckId).concepts;
  while (s.state.queue.length) {
    const q = makeQuestion(s, s.state.queue[0]!, concepts);
    if (q) return (s.current = q);
    s.state.queue.shift();
    s.state.total = Math.max(s.state.answered, s.state.total - 1);
  }
  s.current = null;
  return null;
}

function publicSession(s: StoredSession) {
  const u = load().user;
  return {
    id: s.id,
    deckId: s.deckId,
    mode: s.mode,
    answered: s.state.answered,
    total: s.state.total,
    correct: s.state.correct,
    combo: s.state.combo,
    bestCombo: s.state.bestCombo,
    xp: s.state.xp,
    hearts: currentHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, now()).hearts,
    done: s.status === 'done' || sessionDone(s.state),
    endsAt: s.state.startedAt && s.state.timeLimitMs ? s.state.startedAt + s.state.timeLimitMs : undefined,
  };
}

function startSession(deckId: string, mode: SessionMode, length: number, formats?: Format[]) {
  const dk = deck(deckId);
  const u = load().user;
  if (mode === 'challenge' && currentHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, now()).hearts <= 0) throw new LocalError(403, 'no_hearts');
  const ids = pickConcepts(dk.concepts, statesMap(dk.concepts.map((c) => c.id)), length, mode, now(), seededRng(hashString(`${u.id}:${now()}`)));
  const exam = mode === 'exam';
  const s: StoredSession = {
    id: uid(),
    deckId,
    mode,
    state: {
      ...newSession(mode, ids),
      language: dk.language,
      heartsLost: 0,
      formats: formats?.length ? formats : exam ? EXAM_FORMATS : undefined,
      ...(exam ? { startedAt: now(), timeLimitMs: examTimeLimitMs(ids.length) } : {}),
    },
    current: null,
    status: 'active',
    attempts: [],
  };
  load().sessions[s.id] = s;
  const q = serveNext(s);
  if (!q) throw new LocalError(422, 'no_questions');
  dk.updatedAt = now();
  return { session: publicSession(s), question: publicQuestion(q) };
}

function getSession(id: string): StoredSession {
  const s = load().sessions[id];
  if (!s) throw new LocalError(404, 'session_not_found');
  return s;
}

function finish(s: StoredSession) {
  const d = load();
  const u = d.user;
  const t = now();
  const studied = s.state.answered >= 3;
  const st = studied ? recordStudyDay(u.streak, dayKey(t, u.timezone)) : { state: u.streak, extended: false };
  u.streak = st.state;
  const accuracy = s.state.answered ? s.state.correct / s.state.answered : 0;
  const coins = studied ? 5 + s.state.correct * 2 + (accuracy === 1 && s.state.answered >= 5 ? 10 : 0) : 0;
  u.coins += coins;
  let heartsGained = 0;
  if ((s.mode === 'review' || s.mode === 'practice') && studied) {
    const before = currentHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, t).hearts;
    const h = gainHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, t, s.mode === 'review' ? 2 : 1);
    u.hearts = h.hearts;
    u.heartsUpdatedAt = h.updatedAt;
    heartsGained = h.hearts - before;
  }
  s.status = 'done';
  s.current = null;
  const rewards = award(0, [
    { type: 'session_done', perfect: accuracy === 1 && s.state.answered >= 5, answered: s.state.answered },
    ...(st.extended ? [{ type: 'streak' as const, days: st.state.days }] : []),
  ]);
  const ids = [...new Set(s.state.history.map((h) => h.conceptId))];
  const terms = new Map(deck(s.deckId).concepts.map((c) => [c.id, c.term]));
  return {
    answered: s.state.answered,
    correct: s.state.correct,
    accuracy,
    xp: s.state.xp,
    coins,
    bestCombo: s.state.bestCombo,
    streak: { days: st.state.days, extended: st.extended },
    heartsGained,
    endedReason: s.state.endedReason ?? 'done',
    rewards,
    concepts: ids.map((id) => {
      const p = d.states[id]?.progress ?? newProgress();
      return { id, term: terms.get(id) ?? '', score: masteryScore(p), band: masteryBand(p) };
    }),
  };
}

async function answer(sessionId: string, questionId: string, a: Answer) {
  const t = now();
  const s = getSession(sessionId);
  if (s.status !== 'active') throw new LocalError(409, 'session_done');
  if (s.state.startedAt && s.state.timeLimitMs && t > s.state.startedAt + s.state.timeLimitMs + 15_000) {
    handIn(sessionId);
    throw new LocalError(409, 'time_up');
  }
  const q = s.current;
  if (!q || q.id !== questionId) throw new LocalError(409, 'stale_question');
  // Same meaning in other words ("round" for "circular"): ask Claude when the word list says no.
  const checks = shortAnswersToCheck(q, a);
  const meaning = checks.length ? await judgeShort(q.prompt, checks, q.language) : {};
  if (s.current?.id !== questionId) throw new LocalError(409, 'stale_question');
  const g = grade(q, a, undefined, meaning);
  const d = load();
  const u = d.user;

  const prev = d.states[q.conceptId];
  const progress = recordAttempt(prev?.progress ?? newProgress(), q.format, q.bloom, g.score);
  const srs: SrsState = review(prev?.srs ?? newSrsState(t), ratingFromScore(g.score), t);
  const masteredNow = isMastered(progress) && !isMastered(prev?.progress ?? newProgress());
  d.states[q.conceptId] = { conceptId: q.conceptId, progress, srs };

  const firstTry = !isRetry(s.state, q.conceptId);
  const comboAfter = g.correct ? s.state.combo + 1 : 0;
  const xp = xpForAnswer({ format: q.format, bloom: q.bloom, score: g.score, firstTry, combo: comboAfter, boost: 0 });
  const outcome = applyAnswer(s.state, { conceptId: q.conceptId, format: q.format, bloom: q.bloom, score: g.score, variantKey: q.variantKey }, xp);
  s.state = { ...s.state, ...outcome.state };
  s.attempts.push({ conceptId: q.conceptId, format: q.format, bloom: q.bloom, score: g.score, at: t });

  if (s.mode === 'challenge' && g.score < 0.5) {
    const h = loseHeart({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, t);
    u.hearts = h.hearts;
    u.heartsUpdatedAt = h.updatedAt;
    s.state.heartsLost += 1;
    if (h.hearts <= 0) s.state.endedReason = 'out_of_hearts';
  }
  let rewards = award(xp, [{ type: 'answer', correct: g.correct, combo: comboAfter }, ...(masteredNow ? [{ type: 'mastered' as const }] : [])]);
  s.current = null;
  const next = sessionDone(s.state) ? null : serveNext(s);
  const summary = next ? null : finish(s);
  if (summary) rewards = { ...rewards, badges: [...rewards.badges, ...summary.rewards.badges], levelUp: summary.rewards.levelUp ?? rewards.levelUp };
  const { gradedBy: _g, ...result } = g;
  return {
    rewards,
    result: { ...result, xp, combo: outcome.combo, multiplier: outcome.multiplier, retryScheduled: outcome.retryScheduled, mastered: masteredNow },
    session: publicSession(s),
    next: next ? publicQuestion(next) : null,
    summary,
  };
}

function handIn(sessionId: string) {
  const s = getSession(sessionId);
  if (s.mode !== 'exam') throw new LocalError(400, 'not_an_exam');
  if (s.status === 'done') throw new LocalError(409, 'session_done');
  s.state.skipped = [...new Set(s.state.queue)];
  s.state.queue = [];
  s.state.endedAt = now();
  return { summary: finish(s) };
}

function report(sessionId: string) {
  const s = getSession(sessionId);
  if (s.mode !== 'exam') throw new LocalError(404, 'not_an_exam');
  if (s.status !== 'done') throw new LocalError(409, 'exam_not_finished');
  const dk = deck(s.deckId);
  const byId = new Map(dk.concepts.map((c) => [c.id, c]));
  const items = s.attempts.map((a) => ({ ...a, term: byId.get(a.conceptId)?.term ?? '', topic: byId.get(a.conceptId)?.topic ?? '' }));
  const end = s.state.endedAt ?? s.attempts.at(-1)?.at ?? now();
  const unanswered = (s.state.skipped ?? []).flatMap((id) => (byId.get(id) ? [{ conceptId: id, term: byId.get(id)!.term, topic: byId.get(id)!.topic }] : []));
  return { deckId: dk.id, deckTitle: dk.title, report: examReport(items, s.state.startedAt ? end - s.state.startedAt : 0, s.state.timeLimitMs ?? 0, unanswered) };
}

// ------------------------------------------------------------------ plans

function plan(deckId: string) {
  const p = load().plans[deckId];
  if (!p) return { plan: null };
  const m = masteryMap(deckId);
  const built = buildStudyPlan({ today: today(), examDay: p.examDay, concepts: m.concepts.map((c) => ({ id: c.id, band: c.band, due: c.due })), minutesPerDay: p.minutesPerDay });
  return { plan: { ...built, minutesPerDay: p.minutesPerDay, deckId, deckTitle: m.deck.title } };
}

// ------------------------------------------------------------------ sandbox

const pubActivity = (a: Activity) => ({ id: a.id, deckId: a.deckId, kind: a.kind, title: a.title, data: a.data, score: a.score, xp: a.xp, completed: !!a.completedAt });

function createActivity(deckId: string, kind: SandboxKind, focus: string[] = []) {
  const dk = deck(deckId);
  let chosen = dk.concepts;
  if (focus.length) {
    const picked = dk.concepts.filter((c) => focus.includes(c.id));
    const topics = new Set(picked.map((c) => c.topic));
    chosen = [...picked, ...dk.concepts.filter((c) => !focus.includes(c.id) && topics.has(c.topic)), ...dk.concepts.filter((c) => !focus.includes(c.id) && !topics.has(c.topic))].slice(0, Math.max(6, picked.length));
  }
  if (!sandboxSupports(kind, chosen)) throw new LocalError(422, 'format_not_possible');
  const title = focus.length && chosen.length < dk.concepts.length ? chosen.map((c) => c.term).slice(0, 3).join(', ') : dk.title;
  const data = generateSandbox(kind, { deck: chosen, title, language: dk.language, rng: seededRng(hashString(`${kind}:${now()}`)) })?.data;
  if (!data) throw new LocalError(422, 'format_not_possible');
  const a: Activity = { id: uid(), deckId, kind, title, data, score: null, xp: 0, completedAt: null, createdAt: now() };
  load().sandbox.unshift(a);
  load().sandbox = load().sandbox.slice(0, 40);
  return pubActivity(a);
}

function completeActivity(id: string, score: number) {
  const a = load().sandbox.find((x) => x.id === id);
  if (!a) throw new LocalError(404, 'activity_not_found');
  const s = Math.min(1, Math.max(0, score));
  const u = load().user;
  let xp = 0;
  const first = !a.completedAt;
  if (first) {
    xp = Math.round(SANDBOX_XP[a.kind] * s);
    a.score = s;
    a.xp = xp;
    a.completedAt = now();
  }
  const st = s >= 0.3 ? recordStudyDay(u.streak, today()) : { state: u.streak, extended: false };
  u.streak = st.state;
  const rewards = award(xp, [...(first ? [{ type: 'sandbox_done' as const, kind: a.kind, score: s }] : []), ...(st.extended ? [{ type: 'streak' as const, days: st.state.days }] : [])]);
  return { xp, streak: { days: st.state.days, extended: st.extended }, rewards };
}

/** Friends see my stats: publish them a moment after a change (only when the page can share data). */
let shareTimer: ReturnType<typeof setTimeout> | null = null;
function shareStats() {
  if (shareTimer) clearTimeout(shareTimer);
  shareTimer = setTimeout(() => {
    const u = load().user;
    const wk = weekId(now());
    void publishProfile({ username: u.username, level: levelFromXp(u.xp), xp: u.xp, weekId: wk, weeklyXp: u.week?.id === wk ? u.week.xp : 0, streak: u.streak.days, lastDay: u.streak.lastDay, decks: load().decks.length });
  }, 1500);
}

// ------------------------------------------------------------------ router

type Handler = (m: RegExpMatchArray, body: Record<string, unknown>) => unknown | Promise<unknown>;
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/auth\/providers$/, () => ({ google: false, email: false, guest: false, dev: false })],
  ['GET', /^\/api\/me$/, () => ({ user: profile() })],
  [
    'PATCH',
    /^\/api\/me$/,
    async (_m, b) => {
      const u = load().user;
      if (typeof b.username === 'string') {
        const n = b.username.trim();
        if (n.length < 3 || n.length > 20 || !/^[A-Za-z0-9_]+$/.test(n)) throw new LocalError(400, 'username_characters');
        // Friends add each other by username, so it must be unique among people on this Lumo.
        const t = await together();
        if (t && n.toLowerCase() !== u.username.toLowerCase()) {
          const snap = await t.db.collection('profiles').limit(1000).get().catch(() => null);
          const taken = snap?.docs.some((d: { id: string; data: () => { username?: string } }) => d.id !== t.me && d.data()?.username?.toLowerCase() === n.toLowerCase());
          if (taken) throw new LocalError(409, 'username_taken');
        }
        u.username = n;
        void goOnline(n);
      }
      if (b.locale === 'en' || b.locale === 'fr') u.locale = b.locale;
      if (typeof b.timezone === 'string') u.timezone = b.timezone;
      if (b.settings && typeof b.settings === 'object') u.settings = { ...u.settings, ...(b.settings as object) };
      return { user: profile() };
    },
  ],
  [
    'DELETE',
    /^\/api\/me$/,
    () => {
      db = freshDb();
      return { ok: true };
    },
  ],
  ['POST', /^\/api\/auth\/logout$/, () => ({ ok: true })],

  [
    'GET',
    /^\/api\/decks$/,
    () => ({
      decks: load().decks.map((d) => {
        const t = now();
        const st = d.concepts.map((c) => load().states[c.id]);
        return {
          id: d.id,
          title: d.title,
          subject: d.subject,
          language: d.language,
          updatedAt: new Date(d.updatedAt).toISOString(),
          conceptCount: d.concepts.length,
          masteredCount: st.filter((s) => s && isMastered(s.progress)).length,
          dueCount: st.filter((s) => s?.srs && s.srs.due <= t).length,
        };
      }),
    }),
  ],
  ['POST', /^\/api\/decks\/sample$/, (_m, b) => createDeck(SAMPLE_DECKS[(b.language as Locale) ?? load().user.locale] as never)],
  [
    'POST',
    /^\/api\/local\/decks\/from-notes$/,
    (_m, b) => {
      const text = String(b.text ?? '');
      const language: Locale = b.language === 'fr' ? 'fr' : 'en';
      const r = extractFromText(text, language);
      if (r.concepts.length === 0) throw new LocalError(422, 'nothing_found');
      return createDeck({ title: String(b.title || r.title || 'My notes').slice(0, 120), language, summary: r.summary, concepts: r.concepts });
    },
  ],
  [
    'POST',
    /^\/api\/local\/decks$/,
    (_m, b) => {
      // A draft already cleaned by the photo reader.
      const concepts = Array.isArray(b.concepts) ? (b.concepts as Omit<Concept, 'id'>[]) : [];
      if (concepts.length === 0) throw new LocalError(422, 'nothing_found');
      return createDeck({ title: String(b.title || 'My notes').slice(0, 120), subject: String(b.subject ?? ''), language: b.language === 'fr' ? 'fr' : 'en', summary: String(b.summary ?? ''), concepts });
    },
  ],
  ['GET', /^\/api\/decks\/([\w-]+)$/, (m) => masteryMap(m[1]!)],
  [
    'DELETE',
    /^\/api\/decks\/([\w-]+)$/,
    (m) => {
      const d = load();
      deck(m[1]!);
      d.decks = d.decks.filter((x) => x.id !== m[1]);
      d.deletedDecks = [...(d.deletedDecks ?? []), m[1]!].slice(-200);
      delete d.plans[m[1]!];
      return { ok: true };
    },
  ],
  ['POST', /^\/api\/decks\/([\w-]+)\/sessions$/, (m, b) => startSession(m[1]!, (b.mode as SessionMode) ?? 'practice', Math.min(40, Math.max(3, Number(b.length) || 10)), b.formats as Format[] | undefined)],
  [
    'GET',
    /^\/api\/decks\/([\w-]+)\/offline$/,
    (m) => {
      const d = deck(m[1]!);
      return { deck: { id: d.id, title: d.title, subject: d.subject, language: d.language }, concepts: d.concepts, savedAt: now() };
    },
  ],
  ['GET', /^\/api\/decks\/([\w-]+)\/plan$/, (m) => plan(m[1]!)],
  [
    'PUT',
    /^\/api\/decks\/([\w-]+)\/plan$/,
    (m, b) => {
      deck(m[1]!);
      const examDay = String(b.examDay ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(examDay)) throw new LocalError(400, 'bad_date');
      if (examDay < today()) throw new LocalError(400, 'date_in_past');
      load().plans[m[1]!] = { examDay, minutesPerDay: Number(b.minutesPerDay) || 20 };
      return plan(m[1]!);
    },
  ],
  [
    'DELETE',
    /^\/api\/decks\/([\w-]+)\/plan$/,
    (m) => {
      delete load().plans[m[1]!];
      return { ok: true };
    },
  ],
  [
    'GET',
    /^\/api\/plans\/today$/,
    () => ({
      plans: Object.keys(load().plans)
        .flatMap((id) => {
          if (!load().decks.some((d) => d.id === id)) return [];
          const p = plan(id).plan;
          if (!p || p.daysLeft < 0) return [];
          const day = p.days[0] ?? null;
          return [{ deckId: id, deckTitle: p.deckTitle, examDay: p.examDay, daysLeft: p.daysLeft, today: day, questions: day ? questionsFor(day) : 0 }];
        })
        .sort((a, b) => a.examDay.localeCompare(b.examDay)),
    }),
  ],

  [
    'GET',
    /^\/api\/sessions\/([\w-]+)$/,
    (m) => {
      const s = getSession(m[1]!);
      return { session: publicSession(s), question: s.current ? publicQuestion(s.current) : null };
    },
  ],
  ['POST', /^\/api\/sessions\/([\w-]+)\/answer$/, (m, b) => answer(m[1]!, String(b.questionId), b.answer as Answer)],
  ['POST', /^\/api\/sessions\/([\w-]+)\/hand-in$/, (m) => handIn(m[1]!)],
  ['GET', /^\/api\/sessions\/([\w-]+)\/report$/, (m) => report(m[1]!)],

  [
    'GET',
    /^\/api\/sandbox$/,
    () => ({ activities: load().sandbox.slice(0, 20).map((a) => ({ id: a.id, deckId: a.deckId, kind: a.kind, title: a.title, score: a.score, xp: a.xp, completedAt: a.completedAt ? new Date(a.completedAt).toISOString() : null, createdAt: new Date(a.createdAt).toISOString() })) }),
  ],
  ['GET', /^\/api\/decks\/([\w-]+)\/sandbox$/, (m) => ({ formats: SANDBOX_KINDS.map((kind) => ({ kind, available: sandboxSupports(kind, deck(m[1]!).concepts) })) })],
  ['POST', /^\/api\/sandbox$/, (_m, b) => createActivity(String(b.deckId), b.kind as SandboxKind, (b.focus as string[]) ?? [])],
  [
    'POST',
    /^\/api\/sandbox\/ask$/,
    (_m, b) => {
      const deckId = (b.deckId as string | undefined) ?? load().decks[0]?.id;
      if (!deckId) throw new LocalError(404, 'no_deck');
      const intent = parseSandboxRequest(String(b.text ?? ''), deck(deckId).concepts);
      if (!intent.kind) throw new LocalError(422, 'unknown_format');
      return createActivity(deckId, intent.kind, intent.focus);
    },
  ],
  [
    'GET',
    /^\/api\/sandbox\/([\w-]+)$/,
    (m) => {
      const a = load().sandbox.find((x) => x.id === m[1]);
      if (!a) throw new LocalError(404, 'activity_not_found');
      return pubActivity(a);
    },
  ],
  ['POST', /^\/api\/sandbox\/([\w-]+)\/complete$/, (m, b) => completeActivity(m[1]!, Number(b.score) || 0)],

  [
    'POST',
    /^\/api\/local\/live-reward$/,
    (_m, b) => {
      // Once per game: everyone gets something, the podium gets more (same rule as the server).
      const u = load().user;
      const code = String(b.code ?? '');
      if (!code || (u.liveRewarded ?? []).includes(code)) throw new LocalError(409, 'already_rewarded');
      u.liveRewarded = [...(u.liveRewarded ?? []), code].slice(-50);
      const rank = Math.max(1, Number(b.rank) || 1);
      const players = Math.max(1, Math.min(50, Number(b.players) || 1));
      const r = liveRewards(rank, players, Math.max(0, Math.min(50, Number(b.correct) || 0)));
      u.coins += r.coins;
      const rewards = award(r.xp, [{ type: 'live_done', rank, players }]);
      return { rank, xp: r.xp, coins: r.coins, rewards };
    },
  ],
  ['GET', /^\/api\/game\/overview$/, () => ({ quests: [], chests: 0, boostUntil: null, pet: null, hasPets: true })],
  [
    'GET',
    /^\/api\/game\/badges$/,
    () => ({ stats: { ...emptyStats(), ...load().user.stats }, badges: BADGES.filter((b) => !b.id.endsWith('_league') && b.id !== 'chest_hunter' && b.id !== 'pet_pal').map((b) => ({ id: b.id, emoji: b.emoji, earnedAt: load().badges[b.id] ? new Date(load().badges[b.id]!).toISOString() : null })) }),
  ],
];

/** Handles an API call in the page, as if a server had answered. */
export async function localApi<T>(method: string, path: string, body: unknown): Promise<T> {
  // The account copy loads in the background; never keep a tap waiting on it for long.
  await withTimeout(boot(), 12_000).catch(() => {});
  const p = path.split('?')[0]!;
  for (const [m, re, fn] of routes) {
    if (m !== method) continue;
    const match = p.match(re);
    if (!match) continue;
    try {
      const out = await fn(match, (body ?? {}) as Record<string, unknown>);
      save();
      shareStats();
      return structuredClone(out) as T;
    } catch (e) {
      save();
      if (e instanceof LocalError) throw e;
      console.error(e);
      throw new LocalError(500, 'error');
    }
  }
  throw new LocalError(404, 'not_available_here');
}

export { LocalError };
