import {
  newQuest,
  questTurn,
  QUEST_MONSTERS,
  type QuestAbility,
  type QuestState,
  BLOOM_LEVELS,
  bloomIndex,
  PASS,
  shuffle,
  addFreeze,
  addPetXp,
  advanceQuest,
  canRepair,
  currentFullness,
  DUPLICATE_PET_XP,
  DUPLICATE_PET_SNACKS,
  EGG_EMOJI,
  EGG_TARGET,
  feedPet,
  FIRST_EGG_TARGET,
  hatch,
  hatchRarity,
  ITEMS,
  petMood,
  petXpPerk,
  MAX_ACTIVE_PETS,
  petBuff,
  petBuffs,
  gradeFor,
  GRADES,
  SANDBOX_KINDS as ALL_SANDBOX_KINDS,
  DAILY_GIFTS,
  dailyGiftDay,
  ascendedBuff,
  lumoPower,
  checkCustomPet,
  customPoints,
  CUSTOM_PET_PRICE,
  CUSTOM_PET_POINTS,
  RARITY_EGG_PRICE,
  BOOST_LEVELS,
  PET_MAX_LEVEL,
  RARITIES,
  type PetBuffKind,
  petTooHungry,
  teamBuffs,
  questDef,
  questsFor,
  repairStreak,
  rollChest,
  rollEggRarity,
  speciesOf,
  STARTER_PETS,
  validateUsername,
  XP_BOOST_BONUS,
  XP_BOOST_MS,
  type ChestKind,
  type ItemId,
  type PetSpeciesId,
  type PetState,
  type Rarity,
  applyAnswer,
  openPart,
  pickFromBank,
  applyStats,
  BADGES,
  buildStudyPlan,
  chooseFormat,
  comboMultiplier,
  correctAnswerText,
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
  petTier,
  PET_UPGRADES,
  nextRarity,
  upgradeBlocker,
  upgradePet,
  xpForLevel,
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
  deferHead,
  dropHead,
  factCoverage,
  factKey,
  FULL_ROUND_MAX,
  nextFact,
  planFullRound,
  planQuickRound,
  testsFact,
  questionFromDraft,
  computeVariantKey,
  type FactLog,
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
  sampleBank,
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
import { gradeOpenWithClaude } from './bank';
import { cleanOptions, judgeShort, withTimeout } from './reader';
import { writingNow } from './writingNow';
import { parseCards } from './cards';
import { goOnline, plain, publishProfile, renameProfile, together } from './together';

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
  /** Real test questions written by Claude for this deck (see local/writer.ts). */
  bank?: Question[];
  bankAt?: number;
  /** How the learner wants this deck's questions (level, detail, difficulty, kinds, focus): see reader.ts DeckOptions. */
  options?: Record<string, unknown>;
}
interface StoredSession {
  id: string;
  deckId: string;
  mode: SessionMode;
  /** When the round started (for when-you-study patterns). */
  createdAt?: number;
  state: SessionState & {
    language: Locale;
    formats?: Format[];
    heartsLost: number;
    /** Coins the team's coin pets paid during this round (already added). */
    petCoins?: number;
    startedAt?: number;
    timeLimitMs?: number;
    skipped?: string[];
    endedAt?: number;
    /** Speed run: points scored. */
    points?: number;
    /** Boss battle: the boss's health and the player's shields. */
    boss?: { hp: number; max: number; shields: number };
    /** Monster Quest: the learner's health, the monster and the spells resting. */
    quest?: QuestState;
    /** Chests earned (one per 3 right answers) and chests already opened. */
    picks?: number;
    picked?: number;
    /** Questions missed this round, to review at the end. */
    missed?: { prompt: string; context?: string; answer: string; explanation: string; note?: string }[];
    /** The current question is a lightning one (double XP within 10 seconds). */
    lightning?: string;
    /** A surprise gift is waiting to be tapped (it drops in after a right answer, now and then). */
    gift?: { id: string; at: number } | null;
    /** Surprise gifts this round (at most 2) and when the last one came. */
    gifts?: number;
    giftAfter?: number;
    /** The next right answer is golden: double XP (from a surprise gift). */
    golden?: boolean;
    /** Options a hint already removed from the current question. */
    hinted?: string[];
    /** The whole deck in one round (one question per fact). */
    full?: boolean;
    /** How many times each item was put back because its questions were still being written. */
    deferred?: Record<string, number>;
    /** The fact the question on screen was picked for. */
    slotFact?: number;
    /** Claude is still writing what's left of the round. */
    waiting?: boolean;
  };
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
  language?: Locale;
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
    /** Friends already rewarded with coins (once each). */
    friendRewarded?: string[];
    /** The daily gift: the last day it was claimed, and how many days in a row. */
    daily?: { last: string; streak: number };
    /** The day the sandbox's daily challenge was last done (double XP once a day). */
    sandboxDaily?: string;
  };
  decks: Deck[];
  states: Record<string, ConceptStateView>;
  sessions: Record<string, StoredSession>;
  sandbox: Activity[];
  badges: Record<string, number>;
  plans: Record<string, { examDay: string; minutesPerDay: number }>;
  /** Decks deleted on purpose, so another device's copy doesn't bring them back. */
  deletedDecks?: string[];
  /** Eggs, pets, chests, quests, items. */
  game?: GameData;
  /** When each bank question (by variant key) was last asked, so they come back spaced out. */
  seen?: Record<string, number>;
  /** What the learner told Lumo about themselves, and how they like to study. */
  memory?: Memory;
  /** Personal bests per deck. */
  bests?: Record<string, { speed?: number; bossWins?: number }>;
  /** How the last question on each fact went (by `factKey`): rounds ask the facts that need it most. */
  factLog?: FactLog;
}

interface LocalPet {
  id: string;
  species: PetSpeciesId;
  name: string;
  level: number;
  xp: number;
  fullness: number;
  fedAt: number;
  /** The buddy shown on Home and in rounds (one of the team). */
  equipped: boolean;
  /** On the team (up to 4): its bonus counts. Unset on pets from before teams existed. */
  active?: boolean;
  /** Upgraded rarity (its species' rarity until then). */
  tier?: Rarity;
  /** The big boost it picked at level 50 (see core ascendedBuff). */
  boost?: PetBuffKind;
  /** A pet the learner designed: its own bonuses (its species is only its look). */
  custom?: Partial<Record<PetBuffKind, number>>;
}
interface GameData {
  inventory: Partial<Record<ItemId, number>>;
  chests: { id: string; kind: ChestKind; source: string; at: number }[];
  pets: LocalPet[];
  /** `${periodKey}:${questId}` -> progress */
  quests: Record<string, { progress: number; claimed: boolean }>;
  boostUntil: number | null;
  theme: string;
  /** The study egg: answering questions hatches it. */
  egg: { rarity: Rarity; progress: number; target: number };
  hatched: number;
}

// The standalone site keeps one copy per signed-in Google account (or guest).
const KEY = (globalThis as { __LUMO_KEY__?: string }).__LUMO_KEY__ ?? 'lumo_local_v1';
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
      username: (globalThis as { __LUMO_NAME__?: string }).__LUMO_NAME__ || generateUsername(),
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
  // Keep finished sessions small: only the last 30; rounds left halfway go after two weeks.
  const done = Object.values(d.sessions).filter((s) => s.status === 'done');
  for (const s of done.slice(0, Math.max(0, done.length - 30))) delete d.sessions[s.id];
  for (const s of Object.values(d.sessions)) if (s.status === 'active' && now() - (s.attempts.at(-1)?.at ?? s.createdAt ?? 0) > 14 * 86_400_000) delete d.sessions[s.id];
  const { savedAt: _s, ...content } = d;
  const str = JSON.stringify(content);
  if (str === lastSaved) return; // nothing changed (a read)
  lastSaved = str;
  d.savedAt = now();
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // Storage full: everything but the questions of decks the account holds (they come back from it), then of older decks.
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...d, decks: d.decks.map((dk, i) => (written.has(dk.id) || i >= 3 ? { ...dk, bank: undefined } : dk)) }));
    } catch {
      /* blocked: the account copy below still keeps it */
    }
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
      main = snap.exists ? (plain(snap.data()) as Partial<DB> & { deckIds?: string[] }) : null;
      if (main) docs = (await withTimeout<{ docs: typeof docs }>(t.db.collection(base).limit(1000).get(), 12_000)).docs;
    } catch {
      return; // can't read the account copy: never risk overwriting it
    }
    const local = load();
    const localIsNew = !local.savedAt || (local.decks.length === 0 && local.user.xp === 0);
    const cloudDecks = new Map<string, Deck>();
    const chunks = new Map<string, BankChunk[]>();
    const progs: ProgDoc[] = [];
    for (const d of docs) {
      if (!d.exists) continue;
      if (d.id.startsWith('deck-')) {
        const dk = plain(d.data()) as Deck & { bankChunks?: number };
        if (dk?.id && Array.isArray(dk.concepts)) cloudDecks.set(dk.id, dk);
      } else if (d.id.startsWith('bank-')) {
        const c = plain(d.data()) as BankChunk;
        if (c?.deckId && Array.isArray(c.questions)) chunks.set(c.deckId, [...(chunks.get(c.deckId) ?? []), c]);
      } else if (d.id.startsWith('prog-')) {
        const pr = plain(d.data()) as ProgDoc;
        if (pr?.deckId) progs.push(pr);
      }
    }
    // A deck's questions are kept in parts next to it: put them back together (the parts written with this copy of the deck).
    for (const dk of cloudDecks.values() as Iterable<Deck & { bankChunks?: number }>) {
      const parts = (chunks.get(dk.id) ?? []).filter((c) => c.at === (dk.bankAt ?? 0)).sort((a, b) => a.k - b.k);
      if (dk.bankChunks !== undefined && parts.length === dk.bankChunks) dk.bank = parts.flatMap((c) => c.questions);
      else if (dk.bankChunks !== undefined && !dk.bank) {
        // An unfinished write: the newest complete set of parts, else whatever is there.
        const all = (chunks.get(dk.id) ?? []).sort((a, b) => b.at - a.at || a.k - b.k);
        const at = all[0]?.at;
        dk.bank = all.filter((c) => c.at === at).flatMap((c) => c.questions);
      }
      delete dk.bankChunks;
    }
    // Progress is kept per deck too (older copies kept it all in "main").
    if (main && progs.length) {
      main.states = { ...(main.states ?? {}), ...Object.assign({}, ...progs.map((p) => p.states ?? {})) };
      main.seen = { ...(main.seen ?? {}), ...Object.assign({}, ...progs.map((p) => p.seen ?? {})) };
      main.factLog = { ...(main.factLog ?? {}), ...Object.assign({}, ...progs.map((p) => p.facts ?? {})) };
    }
    if (main?.user) {
      // A copy born on this device (a guest's, or one made while the account couldn't be reached) never
      // replaces the account: it only adds its decks and rounds. Same account: the newest copy wins.
      const sameAccount = !main.user.id || local.user.id === main.user.id;
      const accountWins = localIsNew || !sameAccount || (main.savedAt ?? 0) >= (local.savedAt ?? 0);
      const deleted = new Set([...(main.deletedDecks ?? []), ...(local.deletedDecks ?? [])]);
      // Every deck made on any device is kept (newest copy of each), unless it was deleted.
      const byId = new Map<string, Deck>();
      for (const dk of [...cloudDecks.values(), ...local.decks]) {
        if (deleted.has(dk.id)) continue;
        const had = byId.get(dk.id);
        if (!had || (dk.updatedAt ?? 0) > (had.updatedAt ?? 0)) byId.set(dk.id, dk);
      }
      for (const dk of cloudDecks.values()) if (byId.get(dk.id) === dk) written.set(dk.id, deckSig(dk));
      for (const [id, parts] of chunks) bankParts.set(id, Math.max(...parts.map((c) => c.k + 1)));
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
        seen: newest(loser.seen, winner.seen, (t) => t),
        factLog: newest(loser.factLog, winner.factLog, (x) => x.at),
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
const deckSig = (dk: Deck) => `${dk.title}|${dk.concepts.length}|${JSON.stringify(dk.concepts).length}|${dk.bankAt ?? 0}|${JSON.stringify(dk.options ?? {})}`;
const bankParts = new Map<string, number>(); // deck id -> how many question parts are in the account
const progWritten = new Map<string, string>(); // deck id -> progress last written

/** A part of a deck's questions (one document each, under the store's size limit). */
interface BankChunk {
  deckId: string;
  k: number;
  at: number;
  questions: Question[];
}
/** A deck's progress: how each of its ideas and facts is going, and when its questions were met. */
interface ProgDoc {
  deckId: string;
  states?: Record<string, ConceptStateView>;
  seen?: Record<string, number>;
  facts?: FactLog;
}
const CHUNK_CHARS = 150_000;

/** Two copies of a map: the newest entry of each key wins. */
function newest<T>(a: Record<string, T> | undefined, b: Record<string, T> | undefined, at: (v: T) => number): Record<string, T> {
  const out: Record<string, T> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) if (out[k] === undefined || at(v) >= at(out[k]!)) out[k] = v;
  return out;
}

function splitBank(bank: Question[]): Question[][] {
  const parts: Question[][] = [];
  let cur: Question[] = [];
  let size = 0;
  for (const q of bank) {
    const n = JSON.stringify(q).length;
    if (cur.length && size + n > CHUNK_CHARS) {
      parts.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(q);
    size += n;
  }
  if (cur.length) parts.push(cur);
  return parts;
}

function progDoc(d: DB, dk: Deck): ProgDoc {
  const ids = new Set(dk.concepts.map((c) => c.id));
  const keys = new Set((dk.bank ?? []).map((q) => q.variantKey));
  return {
    deckId: dk.id,
    states: Object.fromEntries(Object.entries(d.states).filter(([id]) => ids.has(id))),
    seen: Object.fromEntries(Object.entries(d.seen ?? {}).filter(([k]) => keys.has(k))),
    facts: Object.fromEntries(Object.entries(d.factLog ?? {}).filter(([k]) => ids.has(k.slice(0, k.lastIndexOf(':'))))),
  };
}

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
      if (written.get(dk.id) !== sig) {
        // The questions first (in parts), then the deck that says how many parts to read.
        const { bank, ...rest } = dk;
        const parts = splitBank(bank ?? []);
        for (let k = 0; k < parts.length; k++) await cloud.db.doc(`${base}/bank-${dk.id}-${k}`).set({ deckId: dk.id, k, at: dk.bankAt ?? 0, questions: parts[k] } as never);
        await cloud.db.doc(`${base}/deck-${dk.id}`).set({ ...rest, bankChunks: parts.length } as never);
        for (let k = parts.length; k < (bankParts.get(dk.id) ?? 0); k++) await cloud.db.doc(`${base}/bank-${dk.id}-${k}`).delete().catch(() => {});
        bankParts.set(dk.id, parts.length);
        written.set(dk.id, sig);
      }
      const prog = progDoc(d, dk);
      const ps = JSON.stringify(prog);
      if (progWritten.get(dk.id) !== ps) {
        await cloud.db.doc(`${base}/prog-${dk.id}`).set(prog as never);
        progWritten.set(dk.id, ps);
      }
    }
    for (const id of [...written.keys()]) {
      if (d.decks.some((x) => x.id === id)) continue;
      await cloud.db.doc(`${base}/deck-${id}`).delete().catch(() => {});
      await cloud.db.doc(`${base}/prog-${id}`).delete().catch(() => {});
      for (let k = 0; k < (bankParts.get(id) ?? 0); k++) await cloud.db.doc(`${base}/bank-${id}-${k}`).delete().catch(() => {});
      written.delete(id);
      bankParts.delete(id);
      progWritten.delete(id);
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

/** Progress without the decks (and without each deck's own progress, kept next to it), trimmed to fit one document. */
function mainDoc(d: DB) {
  const { decks, states: _st, seen: _se, factLog: _fl, ...rest } = d;
  // Ideas of no deck any more (sample decks removed, older data) stay in main.
  const inDecks = new Set(decks.flatMap((dk) => dk.concepts.map((c) => c.id)));
  const states = Object.fromEntries(Object.entries(d.states).filter(([id]) => !inDecks.has(id)));
  const sessions = Object.values(d.sessions).sort((a, b) => (b.attempts.at(-1)?.at ?? 0) - (a.attempts.at(-1)?.at ?? 0));
  const keep = (n: number) => Object.fromEntries(sessions.filter((s, i) => (s.status === 'active' && i < 20) || i < n).map((s) => [s.id, s]));
  let doc = { ...rest, states, deckIds: decks.map((x) => x.id), sessions: keep(12), sandbox: d.sandbox.slice(0, 10) };
  if (JSON.stringify(doc).length > MAIN_LIMIT) doc = { ...doc, sandbox: [], sessions: keep(3) };
  if (JSON.stringify(doc).length > MAIN_LIMIT) doc = { ...doc, sessions: keep(0) };
  if (JSON.stringify(doc).length > MAIN_LIMIT) doc = { ...doc, sessions: Object.fromEntries(sessions.filter((s) => s.status === 'active').slice(0, 3).map((s) => [s.id, s])) };
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
    /** Grade 4 → Special Grade, from the level. */
    grade: gradeFor(levelFromXp(u.xp)),
    coins: u.coins,
    hearts: { current: hearts.hearts, nextRefillAt: hearts.nextRefillAt },
    streak: { ...u.streak, status: streakStatus(u.streak, dayKey(t, u.timezone)) },
    leagueTier: 'bronze',
    theme: game().theme,
    boostUntil: inventoryView().boostUntil,
    createdAt: new Date(u.createdAt).toISOString(),
  };
}

type Hatched = { species: PetSpeciesId; emoji: string; rarity: Rarity; duplicate: boolean; snacks?: number };
type Rewards = {
  xp: number;
  levelUp: { level: number; coins: number; chest?: ChestKind } | null;
  badges: string[];
  questsCompleted: string[];
  hatched?: Hatched;
  chest?: ChestKind;
  egg?: GameData['egg'];
  /** Promoted to a new grade (Grade 3, Grade 2… Special Grade): its coins and, at the top, a chest. */
  gradeUp?: { grade: string; emoji: string; coins: number; chest?: ChestKind };
};
const emptyRewards = (): Rewards => ({ xp: 0, levelUp: null, badges: [], questsCompleted: [] });

// ------------------------------------------------------------------ game: eggs, pets, chests, quests

const lootRng = () => seededRng(crypto.getRandomValues(new Uint32Array(1))[0]! >>> 1);

function game(): GameData {
  const d = load();
  if (!d.game) d.game = { inventory: {}, chests: [], pets: [], quests: {}, boostUntil: null, theme: 'default', egg: { rarity: 'common', progress: 0, target: FIRST_EGG_TARGET }, hatched: 0 };
  return d.game;
}
const petState = (p: LocalPet): PetState => ({ species: p.species, level: p.level, xp: p.xp, fullness: p.fullness, fedAt: p.fedAt, ...(p.tier ? { tier: p.tier } : {}), ...(p.boost ? { boost: p.boost } : {}), ...(p.custom ? { custom: p.custom } : {}) });
const equipped = () => game().pets.find((p) => p.equipped);
/** The active pets (up to 4). Before teams existed only the buddy helped: then the first 4 join, buddy first. */
function team(): LocalPet[] {
  const g = game();
  if (g.pets.length && g.pets.every((p) => p.active === undefined)) {
    const order = [...g.pets].sort((a, b) => Number(b.equipped) - Number(a.equipped));
    for (const p of g.pets) p.active = order.indexOf(p) < MAX_ACTIVE_PETS;
  }
  return g.pets.filter((p) => p.active).slice(0, MAX_ACTIVE_PETS);
}
const buffsNow = () => teamBuffs(team().map(petState), now());
/** Coins earned, with the team's extra share on top (Lumo power: +50 %). */
const withGold = (coins: number) => Math.round(coins * (1 + buffsNow().gold));

function addItem(id: ItemId, qty: number) {
  const g = game();
  g.inventory[id] = (g.inventory[id] ?? 0) + qty;
}
function takeItem(id: ItemId) {
  const g = game();
  if (!g.inventory[id]) throw new LocalError(409, 'not_enough_items');
  g.inventory[id] = g.inventory[id]! - 1;
}
function giveChest(kind: ChestKind, source: string) {
  game().chests.push({ id: uid(), kind, source, at: now() });
}

/** The site's gifts endpoint (website only). */
const giftsApi = () => (globalThis as { __LUMO_GIFTS__?: (body: Record<string, unknown>) => Promise<unknown> }).__LUMO_GIFTS__;

/** A gift from the creator: the pet at the rarity and level chosen (or, if you have it already, yours becomes it). */
function giftPet(species: PetSpeciesId, tier: Rarity, level = 1): LocalPet {
  const g = game();
  const lv = Math.max(1, Math.min(PET_MAX_LEVEL, Math.floor(level) || 1));
  const have = g.pets.find((p) => p.species === species && !p.custom);
  if (have) {
    have.tier = tier;
    have.level = Math.max(have.level, lv);
    return have;
  }
  const pet: LocalPet = { id: uid(), species, name: '', level: lv, xp: 0, fullness: 100, fedAt: now(), equipped: !g.pets.some((p) => p.equipped), active: team().length < MAX_ACTIVE_PETS, tier };
  g.pets.push(pet);
  return pet;
}

/** A new pet joins (or, if you have it already, your existing one powers up). */
function addPet(species: PetSpeciesId): { pet: LocalPet; duplicate: boolean } {
  const g = game();
  const have = g.pets.find((p) => p.species === species && !p.custom);
  const rarity = speciesOf(species)!.rarity;
  if (have) {
    // Already have it: it powers up, and you get snacks for your other pets.
    Object.assign(have, addPetXp(petState(have), DUPLICATE_PET_XP[rarity]));
    addItem('pet_food', DUPLICATE_PET_SNACKS);
    return { pet: have, duplicate: true };
  }
  // A new pet joins the team while there's room.
  const pet: LocalPet = { id: uid(), species, name: '', level: 1, xp: 0, fullness: 80, fedAt: now(), equipped: !g.pets.some((p) => p.equipped), active: team().length < MAX_ACTIVE_PETS };
  g.pets.push(pet);
  return { pet, duplicate: false };
}

function petView(p: LocalPet) {
  const u = load().user;
  const t = now();
  const st = petState(p);
  const mood = petMood(st, t, streakStatus(u.streak, dayKey(t, u.timezone)));
  const s = speciesOf(p.species)!;
  const tier = petTier(st);
  const cost = PET_UPGRADES[tier];
  const next = nextRarity(tier);
  return {
    id: p.id,
    species: p.species,
    emoji: s.emoji,
    rarity: tier,
    baseRarity: s.rarity,
    color: s.color,
    name: p.name,
    level: p.level,
    xp: p.xp,
    fullness: currentFullness(st, t),
    mood,
    perk: petXpPerk(st, mood),
    equipped: p.equipped,
    active: team().includes(p),
    /** What it adds while on the team (nothing while it's too hungry): its own bonuses (none for a Lumo pet). */
    buffs: petBuffs(st),
    off: petTooHungry(st, t),
    /** Lumo rarity: its Lumo power at its level (it adds up with other Lumo pets'). */
    lumoPower: tier === 'lumo' ? lumoPower(p.level) : null,
    /** Level 50/100: the boost it picked (and what it gives now), or whether it can pick one. */
    boost: p.boost ?? null,
    boostNow: ascendedBuff(st),
    canBoost: p.level >= BOOST_LEVELS.half,
    custom: !!p.custom,
    maxLevel: PET_MAX_LEVEL,
    upgrade: cost && next ? { to: next, coins: cost.coins, level: cost.level } : null,
  };
}

/** XP multiplier bonus from an active boost and the pets on the team. */
function boostNow(): number {
  const g = game();
  return (g.boostUntil && g.boostUntil > now() ? XP_BOOST_BONUS : 0) + buffsNow().xp;
}

function questPeriods() {
  const u = load().user;
  return { daily: dayKey(now(), u.timezone), weekly: weekId(now()) };
}
function currentQuests() {
  const g = game();
  const p = questPeriods();
  const list = [...questsFor(load().user.id, p.daily, 'daily').map((q) => ({ q, key: p.daily, period: 'daily' as const })), ...questsFor(load().user.id, p.weekly, 'weekly').map((q) => ({ q, key: p.weekly, period: 'weekly' as const }))];
  // Forget quests from past days and weeks.
  for (const k of Object.keys(g.quests)) if (!k.startsWith(`${p.daily}:`) && !k.startsWith(`${p.weekly}:`)) delete g.quests[k];
  return list.map(({ q, key, period }) => {
    const st = (g.quests[`${key}:${q.id}`] ??= { progress: 0, claimed: false });
    return { id: q.id, period, metric: q.metric, progress: st.progress, target: q.target, claimed: st.claimed, reward: q.reward, st };
  });
}
const publicQuests = () => currentQuests().map(({ st: _s, ...q }) => q);

function inventoryView() {
  const g = game();
  return {
    coins: load().user.coins,
    items: (Object.entries(g.inventory) as [ItemId, number][]).filter(([, n]) => n > 0).sort().map(([id, qty]) => ({ id, qty, emoji: ITEMS[id]?.emoji })),
    chests: g.chests.map(({ id, kind, source }) => ({ id, kind, source })),
    boostUntil: g.boostUntil && g.boostUntil > now() ? new Date(g.boostUntil).toISOString() : null,
    theme: g.theme,
  };
}

function checkPetName(name: string): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (n.length < 1 || n.length > 16 || !/^[\p{L}\p{N} '-]+$/u.test(n)) throw new LocalError(400, 'bad_pet_name');
  if (validateUsername(n.replace(/[^A-Za-z0-9]/g, '') || 'pet') === 'blocked') throw new LocalError(400, 'bad_pet_name');
  return n;
}

function useItem(itemId: ItemId, petId?: string) {
  const g = game();
  const def = ITEMS[itemId];
  if (!def) throw new LocalError(404, 'unknown_item');
  const u = load().user;
  if (def.kind === 'cosmetic') {
    if (!g.inventory[itemId]) throw new LocalError(409, 'not_enough_items');
    g.theme = itemId;
    return { theme: itemId };
  }
  switch (itemId) {
    case 'streak_freeze':
      if (u.streak.freezes >= 3) throw new LocalError(409, 'max_freezes');
      takeItem(itemId);
      u.streak = addFreeze(u.streak);
      return { ok: true };
    case 'heart_refill':
      takeItem(itemId);
      u.hearts = MAX_HEARTS;
      u.heartsUpdatedAt = now();
      return { ok: true };
    case 'xp_boost':
      takeItem(itemId);
      g.boostUntil = Math.max(g.boostUntil ?? 0, now()) + XP_BOOST_MS;
      return { boostUntil: new Date(g.boostUntil).toISOString() };
    case 'pet_food': {
      const pet = g.pets.find((p) => p.id === petId);
      if (!pet) throw new LocalError(404, 'pet_not_found');
      takeItem(itemId);
      Object.assign(pet, feedPet(petState(pet), now()));
      award(0, [{ type: 'pet_fed' }]);
      return { pet: petView(pet) };
    }
    case 'egg_common':
    case 'egg_rare': {
      takeItem(itemId);
      const { pet, duplicate } = addPet(hatch(itemId, lootRng()));
      g.hatched++;
      return { pet: petView(pet), duplicate, snacks: duplicate ? DUPLICATE_PET_SNACKS : 0 };
    }
    default:
      throw new LocalError(400, 'cannot_use');
  }
}

/** Every question answered warms the study egg; when it's ready, it hatches. */
function warmEgg(answers: number): Hatched | undefined {
  if (answers <= 0) return;
  const g = game();
  g.egg.progress += answers;
  if (g.egg.progress < g.egg.target) return;
  const rng = lootRng();
  const species = hatchRarity(g.egg.rarity, rng);
  const { duplicate } = addPet(species);
  g.hatched++;
  const s = speciesOf(species)!;
  const next = rollEggRarity(rng);
  g.egg = { rarity: next, progress: 0, target: EGG_TARGET[next] };
  return { species, emoji: s.emoji, rarity: s.rarity, duplicate, ...(duplicate ? { snacks: DUPLICATE_PET_SNACKS } : {}) };
}

// ------------------------------------------------------------------ memory: what Lumo knows about you

interface MemoryNote {
  id: string;
  text: string;
  at: number;
}
export interface StudyPrefs {
  /** How long explanations should be. */
  explain: 'short' | 'normal' | 'detailed';
  /** auto = Lumo picks the depth from how you're doing. */
  level: 'auto' | 'easier' | 'harder';
  /** Lumo adapts questions to you (weak spots, depth). */
  adapt: boolean;
}
interface Memory {
  notes: MemoryNote[];
  prefs: StudyPrefs;
  /** Suggestions the learner said no to. */
  dismissed?: string[];
}
const DEFAULT_PREFS: StudyPrefs = { explain: 'normal', level: 'auto', adapt: true };

function memory(): Memory {
  const d = load();
  d.memory ??= { notes: [], prefs: { ...DEFAULT_PREFS } };
  d.memory.prefs = { ...DEFAULT_PREFS, ...d.memory.prefs };
  return d.memory;
}

/** Answers from the latest rounds, oldest first. */
function recentAnswers(limit: number) {
  return Object.values(load().sessions)
    .sort((a, b) => (a.createdAt ?? a.state.startedAt ?? 0) - (b.createdAt ?? b.state.startedAt ?? 0))
    .flatMap((s) => s.state.history.map((h) => ({ ...h, at: s.createdAt ?? s.state.startedAt ?? 0 })))
    .slice(-limit);
}

/** What Lumo noticed from how you play (only from this account's own answers). */
function noticed() {
  const d = load();
  const answers = recentAnswers(400);
  const byFormat = new Map<Format, { n: number; ok: number }>();
  for (const h of answers) {
    const v = byFormat.get(h.format) ?? { n: 0, ok: 0 };
    v.n++;
    if (h.score >= PASS) v.ok++;
    byFormat.set(h.format, v);
  }
  const formats = [...byFormat].filter(([, v]) => v.n >= 4).map(([format, v]) => ({ format, accuracy: v.ok / v.n, n: v.n }));
  const last = answers.slice(-40);
  const hours = Object.values(d.sessions).flatMap((s) => (s.createdAt ? [new Date(s.createdAt).getHours()] : []));
  const parts = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const h of hours) parts[h >= 5 && h < 12 ? 'morning' : h < 17 && h >= 12 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night']++;
  const timeOfDay = hours.length >= 3 ? (Object.entries(parts).sort((a, b) => b[1] - a[1])[0]![0] as keyof typeof parts) : null;
  const subjects = new Map<string, number>();
  for (const dk of d.decks) if (dk.subject) subjects.set(dk.subject, (subjects.get(dk.subject) ?? 0) + 1);
  const weakIdeas = d.decks.flatMap((dk) => dk.concepts.filter((c) => d.states[c.id] && masteryBand(d.states[c.id]!.progress) === 'learning').map((c) => c.term)).slice(0, 5);
  return {
    answered: answers.length,
    accuracy: last.length >= 8 ? last.filter((h) => h.score >= PASS).length / last.length : null,
    weakFormats: formats.filter((f) => f.accuracy < 0.6).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3),
    strongFormats: formats.filter((f) => f.accuracy >= 0.8).sort((a, b) => b.accuracy - a.accuracy).slice(0, 3),
    timeOfDay,
    subjects: [...subjects].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s),
    weakIdeas,
  };
}

/** Things Lumo could remember, spotted in what you made (a grade, your subjects): one tap to keep. */
function suggestions(): string[] {
  const d = load();
  const m = memory();
  const fr = d.user.locale === 'fr';
  const out: string[] = [];
  const text = d.decks.map((dk) => `${dk.title} ${dk.subject}`).join(' \n ');
  const grade = text.match(/\b(?:grade|gr\.?)\s*(\d{1,2})\b/i)?.[1];
  const sec = text.match(/\bsec(?:ondaire)?\.?\s*(\d)\b/i)?.[1];
  if (sec) out.push(fr ? `Je suis en secondaire ${sec}.` : `I'm in secondaire ${sec} (Québec).`);
  else if (grade) out.push(fr ? `Je suis en ${grade}e année.` : `I'm in grade ${grade}.`);
  const subjects = noticed().subjects;
  if (subjects.length) out.push(fr ? `J'étudie surtout : ${subjects.join(', ')}.` : `I mostly study: ${subjects.join(', ')}.`);
  const have = m.notes.map((n) => n.text.toLowerCase());
  return out.filter((x) => !have.some((h) => h.includes(x.toLowerCase().slice(0, 18))) && !(m.dismissed ?? []).includes(x));
}

/**
 * How Lumo adapts a round to you: which question depth to aim for and which formats to give a bit
 * more of (your weak spots), from your settings and your latest answers.
 */
function adaptation(): { shift: number; boost: Partial<Record<Format, number>> } {
  const m = memory();
  if (!m.prefs.adapt) return { shift: 0, boost: {} };
  let shift = m.prefs.level === 'easier' ? -1 : m.prefs.level === 'harder' ? 1 : 0;
  if (m.prefs.level === 'auto') {
    const last = recentAnswers(30);
    if (last.length >= 12) {
      const acc = last.filter((h) => h.score >= PASS).length / last.length;
      shift = acc >= 0.85 ? 1 : acc < 0.5 ? -1 : 0;
    }
  }
  const boost: Partial<Record<Format, number>> = {};
  for (const f of noticed().weakFormats) boost[f.format] = 1.8;
  return { shift, boost };
}

/** Choices shown in a new order each time (lists of numbers stay in order, as on a real test). */
function freshOrder(q: Question, rng: () => number): Question {
  if ((q.format === 'multiple_choice' || q.format === 'cause_effect' || q.format === 'multiple_select') && !q.options.every((o) => /^[\d\s.,%$€+\-/×x^]+[a-zA-Z%°]{0,4}$/.test(o.text.trim()))) return { ...q, options: shuffle(q.options, rng) };
  return q;
}

const gameRoutes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/game\/overview$/, () => {
    const g = game();
    const p = equipped();
    return { quests: publicQuests(), chests: g.chests.length, boostUntil: inventoryView().boostUntil, pet: p ? petView(p) : null, hasPets: g.pets.length > 0, egg: { ...g.egg, emoji: EGG_EMOJI[g.egg.rarity] } };
  }],
  ['GET', /^\/api\/game\/inventory$/, () => inventoryView()],
  ['GET', /^\/api\/game\/quests$/, () => ({ quests: publicQuests() })],
  ['GET', /^\/api\/game\/pets$/, () => {
    const t = team();
    const g = game();
    // The team first (in the order they joined it), then everyone else.
    const pets = [...t, ...g.pets.filter((p) => !t.includes(p))].map(petView);
    return { pets, buffs: buffsNow(), maxActive: MAX_ACTIVE_PETS, egg: { ...g.egg, emoji: EGG_EMOJI[g.egg.rarity] } };
  }],
  ['POST', /^\/api\/game\/shop\/buy$/, (_m, b) => {
    const id = String(b.itemId) as ItemId;
    const def = ITEMS[id];
    if (!def || def.price === null) throw new LocalError(404, 'not_for_sale');
    const u = load().user;
    if (def.kind === 'cosmetic' && game().inventory[id]) throw new LocalError(409, 'already_owned');
    // Several at once ("max" = as many as the coins pay for); a cosmetic only once.
    const most = Math.floor(u.coins / def.price);
    const qty = def.kind === 'cosmetic' ? 1 : b.qty === 'max' ? Math.min(99, most) : Math.max(1, Math.min(99, Math.floor(Number(b.qty) || 1)));
    if (qty < 1 || u.coins < def.price * qty) throw new LocalError(402, 'not_enough_coins');
    u.coins -= def.price * qty;
    for (let i = 0; i < qty; i++) {
      if (def.kind === 'chest') giveChest('common', 'shop');
      else addItem(id, 1);
    }
    return { coins: u.coins, qty };
  }],
  ['POST', /^\/api\/game\/shop\/egg$/, (_m, b) => {
    // An egg of the rarity chosen: the pet inside is always that rarity.
    const rarity = String(b.rarity) as Rarity;
    const price = RARITY_EGG_PRICE[rarity];
    if (!price) throw new LocalError(404, 'not_for_sale');
    const u = load().user;
    if (u.coins < price) throw new LocalError(402, 'not_enough_coins');
    u.coins -= price;
    const { pet, duplicate } = addPet(hatchRarity(rarity, lootRng()));
    game().hatched++;
    return { pet: petView(pet), duplicate, snacks: duplicate ? DUPLICATE_PET_SNACKS : 0, coins: u.coins };
  }],
  ['POST', /^\/api\/game\/pets\/custom$/, (_m, b) => {
    // A pet the learner designs: its look, its rarity and its bonuses, within the rules (core checkCustomPet).
    const rarity = String(b.rarity) as Rarity;
    const body = String(b.body ?? '');
    const buffs: Partial<Record<PetBuffKind, number>> = {};
    for (const k of ['xp', 'coins', 'heart', 'egg'] as PetBuffKind[]) {
      const v = Number((b.buffs as Record<string, unknown> | undefined)?.[k] ?? 0);
      if (v) buffs[k] = v;
    }
    const problem = checkCustomPet({ rarity, body, buffs });
    if (problem) throw new LocalError(422, problem);
    const price = CUSTOM_PET_PRICE[rarity]!;
    const u = load().user;
    if (u.coins < price) throw new LocalError(402, 'not_enough_coins');
    const name = checkPetName(String(b.name ?? ''));
    u.coins -= price;
    const g = game();
    const pet: LocalPet = { id: uid(), species: body as PetSpeciesId, name, level: 1, xp: 0, fullness: 100, fedAt: now(), equipped: !g.pets.some((p) => p.equipped), active: team().length < MAX_ACTIVE_PETS, tier: rarity, custom: buffs };
    g.pets.push(pet);
    return { pet: petView(pet), coins: u.coins };
  }],
  ['GET', /^\/api\/game\/pets\/custom$/, () => ({ prices: CUSTOM_PET_PRICE, points: CUSTOM_PET_POINTS, eggs: RARITY_EGG_PRICE, coins: load().user.coins })],
  ['POST', /^\/api\/game\/pets\/([\w-]+)\/boost$/, (m, b) => {
    // From level 50 a pet picks its big boost (and can change it).
    const pet = game().pets.find((p) => p.id === m[1]);
    if (!pet) throw new LocalError(404, 'pet_not_found');
    if (pet.level < BOOST_LEVELS.half) throw new LocalError(409, 'level_too_low');
    const kind = String(b.kind) as PetBuffKind;
    if (!['xp', 'coins', 'heart', 'egg'].includes(kind)) throw new LocalError(400, 'bad_boost');
    pet.boost = kind;
    return { pet: petView(pet) };
  }],
  ['POST', /^\/api\/game\/pets\/feed-all$/, () => {
    // Snacks for every pet that isn't full, the hungriest first, while there are snacks.
    const g = game();
    let fed = 0;
    const order = g.pets.slice().sort((a, b) => currentFullness(petState(a), now()) - currentFullness(petState(b), now()));
    for (let round = 0; round < 3; round++) {
      for (const pet of order) {
        if ((g.inventory.pet_food ?? 0) <= 0) break;
        if (currentFullness(petState(pet), now()) >= 95) continue;
        takeItem('pet_food');
        Object.assign(pet, feedPet(petState(pet), now()));
        fed++;
      }
    }
    if (fed) award(0, [{ type: 'pet_fed' }]);
    return { fed, snacks: g.inventory.pet_food ?? 0 };
  }],
  ['POST', /^\/api\/game\/chests\/([\w-]+)\/open$/, (m) => {
    const g = game();
    const chest = g.chests.find((c) => c.id === m[1]);
    if (!chest) throw new LocalError(404, 'chest_not_found');
    g.chests = g.chests.filter((c) => c !== chest);
    const loot = rollChest(chest.kind, lootRng());
    load().user.coins += loot.coins;
    for (const i of loot.items) addItem(i.id, i.qty);
    const r = award(0, [{ type: 'chest_opened' }]);
    return { kind: chest.kind, loot, badges: r.badges };
  }],
  ['POST', /^\/api\/game\/items\/use$/, (_m, b) => useItem(String(b.itemId) as ItemId, b.petId ? String(b.petId) : undefined)],
  ['POST', /^\/api\/game\/pets\/adopt$/, (_m, b) => {
    const species = String(b.species) as PetSpeciesId;
    if (!STARTER_PETS.includes(species)) throw new LocalError(400, 'not_a_starter');
    if (game().pets.length) throw new LocalError(409, 'already_has_pet');
    const name = checkPetName(String(b.name ?? ''));
    const { pet } = addPet(species);
    pet.name = name;
    return petView(pet);
  }],
  ['PATCH', /^\/api\/game\/pets\/([\w-]+)$/, (m, b) => {
    const g = game();
    const pet = g.pets.find((p) => p.id === m[1]);
    if (!pet) throw new LocalError(404, 'pet_not_found');
    if (b.name !== undefined) pet.name = checkPetName(String(b.name));
    const onTeam = team();
    // Join the team (up to 4) or leave it; the buddy is always one of the team.
    if ((b.active === true || b.equipped) && !onTeam.includes(pet)) {
      if (onTeam.length >= MAX_ACTIVE_PETS) throw new LocalError(409, 'team_full');
      pet.active = true;
    }
    if (b.active === false && onTeam.includes(pet)) {
      pet.active = false;
      if (pet.equipped) {
        pet.equipped = false;
        const next = team()[0];
        if (next) next.equipped = true;
      }
    }
    if (b.equipped) for (const p of g.pets) p.equipped = p === pet;
    return petView(pet);
  }],
  ['GET', /^\/api\/game\/gifts$/, async () => {
    // Gifts from the creator (website only): claim each one and add the Lumo pet.
    const call = giftsApi();
    if (!call) return { creator: false, gifts: [] };
    const r = (await call({ op: 'list' })) as { creator: boolean; gifts: { id: string; species: string; tier: Rarity }[] };
    const got: ReturnType<typeof petView>[] = [];
    for (const g of r.gifts) {
      const claimed = (await call({ op: 'claim', id: g.id }).catch(() => null)) as { gift?: { species: string; tier: Rarity; level?: number } } | null;
      if (!claimed?.gift || !speciesOf(claimed.gift.species)) continue;
      const tier = RARITIES.includes(claimed.gift.tier) ? claimed.gift.tier : 'lumo';
      got.push(petView(giftPet(claimed.gift.species as PetSpeciesId, tier, claimed.gift.level ?? 1)));
    }
    return { creator: r.creator, gifts: got };
  }],
  ['POST', /^\/api\/game\/gifts\/unlock$/, async (_m, b) => {
    // The creator's code turns on creator mode for this account (website only).
    const call = giftsApi();
    if (!call) throw new LocalError(403, 'bad_code');
    try {
      return await call({ op: 'unlock', code: String(b.code ?? '') });
    } catch (e) {
      throw new LocalError(400, (e as { code?: string }).code ?? 'network');
    }
  }],
  ['POST', /^\/api\/game\/gifts\/give$/, async (_m, b) => {
    const call = giftsApi();
    if (!call) throw new LocalError(403, 'not_creator');
    try {
      return await call({ op: 'give', username: String(b.username ?? ''), species: String(b.species ?? 'lumo_firefly'), tier: RARITIES.includes(b.tier as Rarity) ? b.tier : 'lumo', level: Math.max(1, Math.min(PET_MAX_LEVEL, Math.floor(Number(b.level) || 1))) });
    } catch (e) {
      throw new LocalError(400, (e as { code?: string }).code ?? 'network');
    }
  }],
  ['POST', /^\/api\/game\/pets\/([\w-]+)\/upgrade$/, (m) => {
    // Rarity goes up one tier: common → rare → epic → legendary → mythical.
    const pet = game().pets.find((p) => p.id === m[1]);
    if (!pet) throw new LocalError(404, 'pet_not_found');
    const u = load().user;
    const st = petState(pet);
    const why = upgradeBlocker(st, u.coins);
    if (why) throw new LocalError(409, why);
    u.coins -= PET_UPGRADES[petTier(st)]!.coins;
    pet.tier = petTier(upgradePet(st));
    award(0, [{ type: 'pet_fed' }]);
    return { pet: petView(pet), coins: u.coins };
  }],
  ['POST', /^\/api\/game\/quests\/([\w-]+)\/claim$/, (m) => {
    const q = currentQuests().find((x) => x.id === m[1]);
    const def = questDef(m[1]!);
    if (!q || !def) throw new LocalError(404, 'quest_not_found');
    if (q.st.claimed) throw new LocalError(409, 'already_claimed');
    if (q.st.progress < q.target) throw new LocalError(409, 'not_done');
    q.st.claimed = true;
    load().user.coins += def.reward.coins;
    if (def.reward.chest) giveChest(def.reward.chest, `quest_${def.id}`);
    // All of today's quests done: a bonus rare chest.
    const daily = currentQuests().filter((x) => x.period === 'daily');
    const allDone = q.period === 'daily' && daily.every((x) => x.st.claimed);
    if (allDone) giveChest('rare', 'daily_all');
    return { ...def.reward, bonusChest: allDone };
  }],
  ['GET', /^\/api\/game\/daily$/, () => dailyView()],
  ['POST', /^\/api\/game\/daily\/claim$/, () => {
    // Today's gift, better each day in a row (round a week).
    const v = dailyView();
    if (!v.available) throw new LocalError(409, 'already_claimed');
    const u = load().user;
    const gift = DAILY_GIFTS[v.day]!;
    if ('coins' in gift) u.coins += withGold(gift.coins);
    if ('item' in gift) addItem(gift.item as ItemId, gift.qty);
    if ('chest' in gift) giveChest(gift.chest as ChestKind, 'daily_gift');
    u.daily = { last: today(), streak: v.streak + 1 };
    return { ...dailyView(), got: gift, coins: u.coins };
  }],
  ['POST', /^\/api\/game\/streak\/repair$/, () => {
    const PRICE = 150;
    const u = load().user;
    if (!canRepair(u.streak, today())) throw new LocalError(409, 'cannot_repair');
    if (u.coins < PRICE) throw new LocalError(402, 'not_enough_coins');
    u.streak = repairStreak(u.streak, today());
    u.coins -= PRICE;
    award(0, [{ type: 'streak', days: u.streak.days }]);
    return { days: u.streak.days };
  }],
];

/** The daily gift: today's (and whether it can be claimed), and the days in a row so far. */
function dailyView() {
  const u = load().user;
  const yesterday = dayKey(now() - 86_400_000, u.timezone);
  const streak = u.daily && (u.daily.last === today() || u.daily.last === yesterday) ? u.daily.streak : 0;
  const { day, available } = dailyGiftDay(u.daily?.last ?? null, streak, today(), yesterday);
  return { day, available, streak, gifts: DAILY_GIFTS };
}

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
      if (lu.chest) giveChest(lu.chest, `level_${level}`);
      r.levelUp = { level, coins: lu.coins, chest: lu.chest };
      all.push({ type: 'level', level });
    }
    // A new grade: a promotion with its own reward.
    const was = gradeFor(before);
    const is = gradeFor(levelFromXp(d.user.xp));
    if (is.index > was.index) {
      const g = GRADES[is.index]!;
      const chest: ChestKind | undefined = is.index >= GRADES.length - 2 ? 'epic' : undefined;
      d.user.coins += g.coins;
      if (chest) giveChest(chest, `grade_${g.id}`);
      r.gradeUp = { grade: g.id, emoji: g.emoji, coins: g.coins, ...(chest ? { chest } : {}) };
    }
    // The pets on the team grow a little with every bit of study.
    for (const pet of team()) Object.assign(pet, addPetXp(petState(pet), xp * PET_GROWTH));
  }
  // Quests
  for (const q of currentQuests()) {
    const def = questDef(q.id)!;
    const next = Math.min(q.target, all.reduce((acc, e) => advanceQuest(def.metric, acc, e), q.st.progress));
    if (q.st.progress < q.target && next >= q.target) r.questsCompleted.push(q.id);
    q.st.progress = next;
  }
  // The study egg (egg pets sometimes make an answer count twice)
  const answers = events.filter((e) => e.type === 'answer').length;
  const eggChance = buffsNow().egg;
  let warmth = answers;
  for (let i = 0; i < answers && eggChance > 0; i++) if (Math.random() < eggChance) warmth++;
  const hatched = warmEgg(warmth);
  if (hatched) r.hatched = hatched;
  r.egg = { ...game().egg };
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
  const log = load().factLog ?? {};
  const cover = factCoverage(dk.concepts, dk.bank ?? []);
  const facts = dk.concepts.reduce((a, c) => a + Math.max(1, c.keyPoints.length), 0);
  return {
    deck: { id: dk.id, title: dk.title, subject: dk.subject, language: dk.language, mine: true, options: dk.options ?? {} },
    bankSize: dk.bank?.length ?? 0,
    best: load().bests?.[dk.id] ?? {},
    /** Facts in the notes, how many have a question, and how long the whole-deck round is. */
    facts,
    factsCovered: [...cover.values()].filter((x) => x.have > 0).length,
    roundSize: Math.min(FULL_ROUND_MAX, facts),
    resume: resumable(dk.id),
    concepts: dk.concepts.map((c) => {
      const s = load().states[c.id];
      const p = s?.progress ?? newProgress();
      const fs = c.keyPoints.length ? c.keyPoints.map((_, i) => i) : [-1];
      return {
        id: c.id,
        term: c.term,
        topic: c.topic,
        kind: c.kind,
        band: masteryBand(p),
        score: masteryScore(p),
        formatsPassed: p.formatsPassed.length,
        due: s?.srs ? s.srs.due <= t : false,
        facts: fs.length,
        factsKnown: fs.filter((f) => log[factKey(c.id, f)]?.ok).length,
      };
    }),
  };
}

function createDeck(input: { title: string; subject?: string; language: Locale; summary?: string; concepts: Omit<Concept, 'id'>[]; options?: unknown }) {
  const options = cleanOptions(input.options);
  const d: Deck = {
    id: uid(),
    title: input.title,
    subject: input.subject ?? '',
    language: input.language,
    summary: input.summary ?? '',
    concepts: input.concepts.map((c) => ({ ...c, id: uid() }) as Concept),
    updatedAt: now(),
    ...(Object.keys(options).length ? { options: options as Record<string, unknown> } : {}),
  };
  load().decks.unshift(d);
  award(0, [{ type: 'deck_created' }]);
  return { id: d.id };
}

/** Most questions a deck keeps (the ones met longest ago make room for new ones). */
const MAX_BANK = 320;

/** Keep a deck's bank under MAX_BANK: questions this learner met longest ago go first, never unmet ones. */
function capBank(dk: Deck) {
  let list = dk.bank ?? [];
  if (list.length <= MAX_BANK) return;
  const seen = load().seen ?? {};
  const old = list.flatMap((q) => (seen[q.variantKey] !== undefined ? [{ k: q.variantKey, t: seen[q.variantKey]! }] : [])).sort((a, b) => a.t - b.t);
  const drop = new Set(old.slice(0, list.length - MAX_BANK).map((x) => x.k));
  list = list.filter((q) => !drop.has(q.variantKey));
  if (list.length > MAX_BANK) list = list.slice(list.length - MAX_BANK);
  dk.bank = list;
}

const normWords = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}0-9]+/gu, ' ')
    .trim();
const strList = (v: unknown, n: number, max = 300) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, max)).slice(0, n) : []);

/**
 * New notes added to a deck: a new idea is added after the others of its topic; new facts about an idea
 * the deck already has go at the end of its list (so the facts its questions are tagged with keep their
 * numbers). Returns what changed, for Claude to write questions on.
 */
function addIdeas(deckId: string, incoming: Omit<Concept, 'id'>[]) {
  const dk = deck(deckId);
  let ideas = 0;
  let facts = 0;
  const changed: string[] = [];
  for (const raw of incoming.slice(0, 150)) {
    if (!raw || typeof raw.term !== 'string' || !raw.term.trim()) continue;
    const keyPoints = strList(raw.keyPoints, 16);
    const had = dk.concepts.find((c) => normWords(c.term) === normWords(raw.term));
    if (had) {
      const known = new Set(had.keyPoints.map(normWords));
      const fresh = keyPoints.filter((f) => !known.has(normWords(f)) && known.add(normWords(f)));
      if (fresh.length === 0) continue;
      had.keyPoints = [...had.keyPoints, ...fresh].slice(0, 16);
      facts += fresh.length;
      changed.push(had.id);
      continue;
    }
    if (dk.concepts.length >= 200) break;
    const c: Concept = {
      id: uid(),
      topic: String(raw.topic || 'General').slice(0, 120),
      kind: raw.kind ?? 'definition',
      term: raw.term.trim().slice(0, 160),
      summary: String(raw.summary || keyPoints[0] || raw.term).slice(0, 600),
      keyPoints,
      misconceptions: strList(raw.misconceptions, 6),
      examples: strList(raw.examples, 4),
      synonyms: strList(raw.synonyms, 8, 160),
      ...(Array.isArray(raw.steps) && raw.steps.length >= 2 ? { steps: strList(raw.steps, 10) } : {}),
      ...(Array.isArray(raw.causeEffects) && raw.causeEffects.length ? { causeEffects: raw.causeEffects.slice(0, 6) } : {}),
    };
    const at = dk.concepts.map((x) => x.topic).lastIndexOf(c.topic);
    dk.concepts.splice(at >= 0 ? at + 1 : dk.concepts.length, 0, c);
    ideas += 1;
    facts += Math.max(1, keyPoints.length);
    changed.push(c.id);
  }
  if (changed.length === 0) throw new LocalError(422, 'nothing_new');
  dk.updatedAt = now();
  return { ideas, facts, changed };
}

/** A question the learner wrote or fixed on the questions page (only its shape is checked). */
function saveOwnQuestion(deckId: string, b: Record<string, unknown>, replaceKey?: string) {
  const dk = deck(deckId);
  const old = replaceKey ? dk.bank?.find((x) => x.variantKey === replaceKey) : undefined;
  if (replaceKey && !old) throw new LocalError(404, 'question_not_found');
  const c = dk.concepts.find((x) => x.id === (b.conceptId ?? old?.conceptId));
  if (!c) throw new LocalError(422, 'concept_not_found');
  const draft = (b.draft && typeof b.draft === 'object' ? b.draft : {}) as Record<string, unknown>;
  const why = typeof draft.why === 'string' ? draft.why.trim() : '';
  const q = questionFromDraft({ ...draft, c: 1, why: why || '-' }, { concepts: [c], language: dk.language, seed: hashString(uid()), lenient: true });
  if (!q) throw new LocalError(422, 'bad_question');
  if (!why) q.explanation = correctAnswerText(q);
  if (!q.facts && old?.facts) q.facts = old.facts;
  q.variantKey = computeVariantKey(q);
  const list = (dk.bank ?? []).filter((x) => x.variantKey !== replaceKey);
  if (list.some((x) => x.variantKey === q.variantKey)) throw new LocalError(409, 'duplicate');
  list.splice(old ? (dk.bank ?? []).indexOf(old) : list.length, 0, q);
  dk.bank = list;
  dk.bankAt = now();
  return { question: { ...q, answer: correctAnswerText(q), seen: null } };
}

// ------------------------------------------------------------------ quiz

const LOCAL_FORMATS = FORMATS.filter((f) => f !== 'teach_back'); // teach-back needs an AI follow-up question
/** One tap to answer: the only formats quick enough for a speed run. */
const SPEED_FORMATS: Format[] = ['multiple_choice', 'true_false'];
export const SPEED_MS = 60_000;
const BOSS_LENGTH = 12;
const BOSS_HP = 800; // about 7-8 right answers, fewer with a combo
const BOSS_SHIELDS = 3;
const HINT_COST = 5;
const LIGHTNING_FORMATS: Format[] = ['multiple_choice', 'true_false'];
/** Lightning questions come up in learning rounds (never in a speed run, a boss fight or a mock exam). */
const LIGHTNING_MODES: SessionMode[] = ['practice', 'review', 'wrong_only', 'challenge'];
const LIGHTNING_MS = 10_000;

/** Monster Quest: quick formats, so a fight keeps moving. */
const QUEST_FORMATS: Format[] = ['multiple_choice', 'true_false', 'type_answer', 'cause_effect'];
/** Rounds that never run dry: more ideas join before the queue empties. */
const ENDLESS = (m: SessionMode) => m === 'speed' || m === 'quest';
const modeFormats = (s: StoredSession): readonly Format[] => s.state.formats ?? (s.mode === 'speed' ? SPEED_FORMATS : s.mode === 'quest' ? QUEST_FORMATS : LOCAL_FORMATS);

/** Variant keys of the questions this round already asked (and the one on screen): a round never asks one twice. */
const usedIn = (s: StoredSession) => new Set([...s.state.history.map((h) => h.variantKey), ...(s.current ? [s.current.variantKey] : [])]);

function makeQuestion(s: StoredSession, conceptId: string, concepts: Concept[], fact = -1): Question | null {
  const c = concepts.find((x) => x.id === conceptId);
  if (!c) return null;
  const stored = load().states[conceptId]?.progress ?? newProgress();
  const sessionFormats = s.state.history.filter((h) => h.conceptId === conceptId).map((h) => h.format).reverse();
  const progress: ConceptProgress = { ...stored, recentFormats: [...new Set([...sessionFormats, ...stored.recentFormats])].slice(0, 4) };
  const rng = seededRng(hashString(`${conceptId}:${now()}:${s.state.answered}`));
  const bank = deck(s.deckId).bank;
  if (bank?.length) {
    // Claude's real test questions only: once a deck has them, the built-in templates never come back.
    const d = load();
    // A boss asks for application and analysis, not recall.
    const base: ConceptProgress = s.mode === 'boss' && (progress.bloom === 'remember' || progress.bloom === 'understand') ? { ...progress, bloom: 'apply' } : progress;
    // Fitted to you: a step deeper when you're flying, a step back when it's hard, more of your weak formats.
    const fit = s.mode === 'exam' ? { shift: 0, boost: {} } : adaptation();
    const target: ConceptProgress = fit.shift ? { ...base, bloom: BLOOM_LEVELS[Math.max(0, Math.min(BLOOM_LEVELS.length - 1, bloomIndex(base.bloom) + fit.shift))]! } : base;
    const opts = { allowed: modeFormats(s), usedThisSession: usedIn(s), lastSeen: d.seen ?? {}, now: now(), formatBoost: fit.boost, ...(fact >= 0 ? { fact } : {}) };
    let picked = pickFromBank(bank, conceptId, target, opts, rng);
    if (!picked && ENDLESS(s.mode)) {
      // A speed run never stops before the clock: any one-tap question of the deck it hasn't asked yet,
      // and once it has asked them all, they come round again (never the one just asked).
      const pool = bank.filter((q) => modeFormats(s).includes(q.format));
      const used = usedIn(s);
      const fresh = pool.filter((q) => !used.has(q.variantKey));
      const from = fresh.length ? fresh : pool.filter((q) => q.variantKey !== s.current?.variantKey && q.variantKey !== s.state.history.at(-1)?.variantKey);
      picked = from[Math.floor(rng() * from.length)] ?? null;
    }
    if (!picked) return null;
    d.seen = { ...(d.seen ?? {}), [picked.variantKey]: now() };
    const keys = Object.keys(d.seen);
    if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete d.seen[k];
    return { ...freshOrder(structuredClone(picked), rng), id: uid() };
  }
  // No questions from Claude (it isn't available here): basic ones built from the notes.
  const tried: Format[] = [];
  for (let i = 0; i < 4; i++) {
    const choice = chooseFormat(c, concepts, progress, rng, { exclude: tried, allowed: modeFormats(s) });
    if (!choice) return null;
    const q = generateLocal(c, choice.format, choice.bloom, { deck: concepts, language: s.state.language, rng });
    if (q) return q;
    tried.push(choice.format);
  }
  return null;
}

/** Is another question left on this idea (and fact) that the round hasn't asked? Then a miss can come back. */
function canAskAgain(s: StoredSession, q: Question, fact: number): boolean {
  const bank = deck(s.deckId).bank;
  if (!bank?.length) return true; // built-in questions are new every time
  const used = usedIn(s);
  const allowed = modeFormats(s);
  return bank.some((x) => x.conceptId === q.conceptId && allowed.includes(x.format) && !used.has(x.variantKey) && testsFact(x, fact));
}

/**
 * The next question. An item whose questions Claude hasn't written yet goes to the back of the round
 * (while it's writing) or is left out. Null with `waiting`: Claude is still writing what's left.
 */
/** A speed run (or a quest) keeps going until the clock (or the fight) stops it: more ideas join its queue before it runs dry. */
function refillSpeed(s: StoredSession) {
  if (!ENDLESS(s.mode) || s.state.queue.length >= 3 || s.state.endedReason) return;
  const dk = deck(s.deckId);
  const more = pickConcepts(dk.concepts, statesMap(dk.concepts.map((c) => c.id)), 20, 'speed', now(), seededRng(hashString(`${s.id}:${s.state.answered}`)));
  s.state.queue = [...s.state.queue, ...more];
  s.state.total += more.length;
}

function serveNext(s: StoredSession): Question | null {
  const concepts = deck(s.deckId).concepts;
  refillSpeed(s);
  s.state.waiting = false;
  const writing = writingNow.has(s.deckId);
  for (let tries = s.state.queue.length; s.state.queue.length && tries > 0; tries--) {
    const fact = nextFact(s.state);
    const q = makeQuestion(s, s.state.queue[0]!, concepts, fact);
    if (q) {
      // Now and then a lightning question: answer within 10 seconds for double XP (never a penalty).
      s.state.lightning = LIGHTNING_MODES.includes(s.mode) && s.state.answered >= 2 && LIGHTNING_FORMATS.includes(q.format) && Math.random() < 0.15 ? q.id : undefined;
      s.state.hinted = [];
      s.state.slotFact = fact;
      return (s.current = q);
    }
    const key = factKey(s.state.queue[0]!, fact);
    const deferred = (s.state.deferred ??= {});
    if (writing && s.state.queue.length > 1 && (deferred[key] ?? 0) < 6) {
      deferred[key] = (deferred[key] ?? 0) + 1;
      s.state = { ...s.state, ...deferHead(s.state) };
    } else if (writing && s.state.full) {
      // Everything left is still being written: wait for it.
      s.state.waiting = true;
      s.current = null;
      return null;
    } else s.state = { ...s.state, ...dropHead(s.state) };
  }
  if (writing && s.state.full && s.state.queue.length) {
    s.state.waiting = true;
    s.current = null;
    return null;
  }
  // Nothing at all could be asked: whatever is left is dropped (the round ends).
  while (s.state.queue.length) s.state = { ...s.state, ...dropHead(s.state) };
  s.current = null;
  return null;
}

function publicSession(s: StoredSession) {
  const u = load().user;
  const dk = load().decks.find((d) => d.id === s.deckId);
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
    coins: u.coins,
    done: s.status === 'done' || (sessionDone(s.state) && !s.state.waiting),
    endsAt: s.state.startedAt && s.state.timeLimitMs ? s.state.startedAt + s.state.timeLimitMs : undefined,
    timeLimitMs: s.state.timeLimitMs,
    points: s.state.points,
    boss: s.state.boss,
    quest: s.state.quest,
    chests: Math.max(0, (s.state.picks ?? 0) - (s.state.picked ?? 0)),
    lightning: s.current && s.state.lightning === s.current.id ? LIGHTNING_MS : undefined,
    best: s.mode === 'speed' ? (load().bests?.[s.deckId]?.speed ?? 0) : undefined,
    language: s.state.language,
    /** The current question asks again about an idea missed earlier in this round. */
    retry: s.current ? isRetry(s.state, s.current.conceptId) : false,
    /** A whole-deck round, and the topic (chapter) the current question is from. */
    full: !!s.state.full,
    topic: s.current ? dk?.concepts.find((c) => c.id === s.current!.conceptId)?.topic : undefined,
    /** Claude is still writing the questions left in this round. */
    waiting: !!s.state.waiting,
  };
}

/** The question just answered was wrong or confusing: take it out of the deck (and keep a note to fix it). */
function reportLast(sessionId: string, reason: string) {
  const s = getSession(sessionId);
  const last = s.state.history.at(-1);
  const dk = deck(s.deckId);
  if (!last || !dk.bank?.some((q) => q.variantKey === last.variantKey)) return { ok: true, removed: 0 };
  const q = dk.bank.find((x) => x.variantKey === last.variantKey)!;
  dk.bank = dk.bank.filter((x) => x.variantKey !== last.variantKey);
  dk.bankAt = now();
  reportProblem('question', new Error(`reported${reason ? ` (${reason.slice(0, 80)})` : ''}: ${q.prompt.slice(0, 200)}`));
  return { ok: true, removed: 1 };
}

/** Missed facts and ideas: what a "fix my mistakes" round is made of. */
function shaky(concepts: Concept[], states: Map<string, ConceptStateView>, log: FactLog): Concept[] {
  return concepts.filter((c) => {
    const st = states.get(c.id);
    if (st?.progress.lastCorrect === false || (st?.srs?.lapses ?? 0) > 0) return true;
    return (c.keyPoints.length ? c.keyPoints.map((_, i) => i) : [-1]).some((f) => log[factKey(c.id, f)]?.ok === false);
  });
}

/**
 * Start a round. `full`: the whole deck, one question per fact of the notes (the default Play);
 * otherwise `length` questions on the facts that need it most (or, for a speed run, a boss or a mock
 * exam, spread over the deck).
 */
function startSession(deckId: string, mode: SessionMode, length: number, formats?: Format[], full = false) {
  const dk = deck(deckId);
  const u = load().user;
  if (mode === 'challenge' && currentHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, now()).hearts <= 0) throw new LocalError(403, 'no_hearts');
  const exam = mode === 'exam';
  const allowed: readonly Format[] = formats?.length ? formats : exam ? EXAM_FORMATS : mode === 'speed' ? SPEED_FORMATS : mode === 'quest' ? QUEST_FORMATS : LOCAL_FORMATS;
  const wholeDeck = full && mode === 'practice' && !formats?.length;
  // With a bank, only ideas that already have questions (Claude may still be writing the rest), except in
  // a whole-deck round: there, ideas still being written come later in the round.
  const covered = dk.bank?.length && !(wholeDeck && writingNow.has(deckId)) ? new Set(dk.bank.filter((q) => allowed.includes(q.format)).map((q) => q.conceptId)) : null;
  const pool = covered ? dk.concepts.filter((c) => covered.has(c.id)) : dk.concepts;
  if (pool.length === 0) throw new LocalError(422, 'no_questions');
  const count = mode === 'speed' || mode === 'quest' ? 40 : mode === 'boss' ? BOSS_LENGTH : length;
  const rng = seededRng(hashString(`${u.id}:${now()}`));
  const states = statesMap(pool.map((c) => c.id));
  const log = load().factLog ?? {};
  let ids: string[];
  let facts: number[] | undefined;
  if (wholeDeck) {
    const slots = planFullRound(pool, states, log, now(), rng);
    ids = slots.map((x) => x.conceptId);
    facts = slots.map((x) => x.fact);
  } else if ((mode === 'practice' || mode === 'review' || mode === 'wrong_only' || mode === 'challenge') && !formats?.length) {
    // Learning rounds: the facts that need it most, spread over as many ideas as possible.
    let from = pool;
    if (mode === 'wrong_only') from = shaky(pool, states, log);
    if (mode === 'review') from = pool.filter((c) => states.get(c.id)?.srs);
    if (from.length === 0) from = pool;
    const slots = planQuickRound(from, states, log, count, now(), rng);
    ids = slots.map((x) => x.conceptId);
    facts = slots.map((x) => x.fact);
  } else ids = pickConcepts(pool, states, count, mode, now(), rng);
  const s: StoredSession = {
    id: uid(),
    deckId,
    mode,
    createdAt: now(),
    state: {
      ...newSession(mode, ids, facts),
      language: dk.language,
      heartsLost: 0,
      formats: formats?.length ? formats : exam ? EXAM_FORMATS : mode === 'speed' ? SPEED_FORMATS : undefined,
      ...(exam ? { startedAt: now(), timeLimitMs: examTimeLimitMs(ids.length) } : {}),
      ...(mode === 'speed' ? { startedAt: now(), timeLimitMs: SPEED_MS, points: 0 } : {}),
      ...(mode === 'boss' ? { boss: { hp: BOSS_HP, max: BOSS_HP, shields: BOSS_SHIELDS } } : {}),
      ...(mode === 'quest' ? { quest: newQuest() } : {}),
      ...(wholeDeck ? { full: true } : {}),
      picks: 0,
      picked: 0,
      missed: [],
    },
    current: null,
    status: 'active',
    attempts: [],
  };
  load().sessions[s.id] = s;
  const q = serveNext(s);
  if (!q) {
    delete load().sessions[s.id];
    throw new LocalError(422, 'no_questions');
  }
  dk.updatedAt = now();
  return { session: publicSession(s), question: publicQuestion(q) };
}

/** A whole-deck round left halfway (in the last week), to pick up where it stopped. */
function resumable(deckId: string) {
  const s = Object.values(load().sessions)
    .filter((x) => x.deckId === deckId && x.status === 'active' && x.state.full && x.state.answered > 0 && now() - (x.attempts.at(-1)?.at ?? x.createdAt ?? 0) < 7 * 86_400_000)
    .sort((a, b) => (b.attempts.at(-1)?.at ?? 0) - (a.attempts.at(-1)?.at ?? 0))[0];
  return s ? { id: s.id, answered: s.state.answered, total: s.state.total } : null;
}

function getSession(id: string): StoredSession {
  const s = load().sessions[id];
  if (!s) throw new LocalError(404, 'session_not_found');
  return s;
}

/** Stars for a round: 3 when (almost) everything was right or every miss got fixed later. */
function starsFor(s: StoredSession): number {
  if (s.mode === 'boss') return s.state.endedReason === 'boss_defeated' ? Math.max(1, s.state.boss?.shields ?? 1) : 0;
  if (s.mode === 'quest') return s.state.endedReason === 'quest_won' ? 3 : Math.min(2, s.state.quest?.defeated ?? 0);
  const answered = s.state.answered;
  if (answered === 0) return 0;
  const accuracy = s.state.correct / answered;
  const last = new Map<string, number>();
  for (const h of s.state.history) last.set(h.conceptId, h.score);
  const fixedAll = [...last.values()].every((score) => score >= 0.8);
  if (accuracy >= 0.9 || (fixedAll && accuracy >= 0.75)) return 3;
  if (accuracy >= 0.7 || fixedAll) return 2;
  return accuracy >= 0.4 ? 1 : 0;
}

/** How fast team pets grow from study: a tenth of the XP earned (levelling pets takes work). */
const PET_GROWTH = 0.1;
const CHALLENGE_BONUS = 10;
/** Coins for each new friend: enough for 2 snacks. */
const FRIEND_COINS = 20;
/** Chance a right answer brings a surprise gift (see answer()). */
const GIFT_CHANCE = 0.14;

/** Open the surprise gift that dropped in: a few coins, a snack, or a golden next answer (double XP). */
function openGift(sessionId: string, id: string) {
  const s = getSession(sessionId);
  const g = s.state.gift;
  // Tapped in time (it floats away after a few seconds) and not opened yet.
  if (!g || g.id !== id || now() - g.at > 15_000) throw new LocalError(409, 'gift_gone');
  s.state.gift = null;
  const roll = Math.random();
  if (roll < 0.55) {
    const coins = withGold(3 + Math.floor(Math.random() * 6));
    load().user.coins += coins;
    return { kind: 'coins' as const, coins, total: load().user.coins };
  }
  if (roll < 0.8) {
    addItem('pet_food', 1);
    return { kind: 'snack' as const };
  }
  s.state.golden = true;
  return { kind: 'golden' as const };
}

function finish(s: StoredSession) {
  const d = load();
  const u = d.user;
  const t = now();
  const studied = s.state.answered >= 3;
  const st = studied ? recordStudyDay(u.streak, dayKey(t, u.timezone)) : { state: u.streak, extended: false };
  u.streak = st.state;
  const accuracy = s.state.answered ? s.state.correct / s.state.answered : 0;
  let coins = studied ? 3 + s.state.correct + (accuracy === 1 && s.state.answered >= 5 ? 5 : 0) : 0;
  // A Challenge played to the end with hearts to spare earns a bonus.
  if (s.mode === 'challenge' && studied && s.state.endedReason !== 'out_of_hearts') coins += CHALLENGE_BONUS;
  let heartsGained = 0;
  if ((s.mode === 'review' || s.mode === 'practice') && studied) {
    const before = currentHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, t).hearts;
    const h = gainHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, t, s.mode === 'review' ? 2 : 1);
    u.hearts = h.hearts;
    u.heartsUpdatedAt = h.updatedAt;
    heartsGained = h.hearts - before;
  }
  // Personal bests.
  const bests = (d.bests ??= {});
  const mine = (bests[s.deckId] ??= {});
  const previousBest = mine.speed ?? 0;
  const newBest = s.mode === 'speed' && (s.state.points ?? 0) > previousBest;
  if (newBest) mine.speed = s.state.points;
  const bossWon = s.mode === 'boss' && s.state.endedReason === 'boss_defeated';
  if (bossWon) {
    mine.bossWins = (mine.bossWins ?? 0) + 1;
    coins += 15;
  }
  // Monster Quest: each beaten monster already paid; the whole run beaten pays a little more.
  const questWon = s.mode === 'quest' && s.state.endedReason === 'quest_won';
  if (questWon) coins += 20;
  coins = withGold(coins);
  u.coins += coins;
  s.status = 'done';
  s.current = null;
  const stars = starsFor(s);
  const rewards = award(0, [
    { type: 'session_done', perfect: accuracy === 1 && s.state.answered >= 5, answered: s.state.answered },
    ...(st.extended ? [{ type: 'streak' as const, days: st.state.days }] : []),
  ]);
  // A chest for a finished round: better for a perfect round, a beaten boss or a new record.
  let chest: ChestKind | null = null;
  if (bossWon) chest = (s.state.boss?.shields ?? 0) >= BOSS_SHIELDS ? 'epic' : 'rare';
  else if (questWon) chest = 'epic';
  else if (s.mode === 'quest') chest = (s.state.quest?.defeated ?? 0) >= 3 ? 'rare' : (s.state.quest?.defeated ?? 0) >= 1 ? 'common' : null;
  else if (newBest && previousBest > 0) chest = 'common';
  else if (s.mode !== 'speed' && s.mode !== 'boss' && s.state.answered >= 5) chest = accuracy === 1 ? 'rare' : 'common';
  if (chest) {
    giveChest(chest, 'round');
    rewards.chest = chest;
  }
  const ids = [...new Set(s.state.history.map((h) => h.conceptId))];
  const terms = new Map(deck(s.deckId).concepts.map((c) => [c.id, c.term]));
  return {
    mode: s.mode,
    answered: s.state.answered,
    correct: s.state.correct,
    accuracy,
    stars,
    xp: s.state.xp,
    coins: coins + (s.state.petCoins ?? 0),
    petCoins: s.state.petCoins ?? 0,
    bestCombo: s.state.bestCombo,
    streak: { days: st.state.days, extended: st.extended },
    heartsGained,
    endedReason: s.state.endedReason ?? 'done',
    points: s.state.points,
    best: s.mode === 'speed' ? Math.max(previousBest, s.state.points ?? 0) : undefined,
    newBest,
    boss: s.state.boss,
    quest: s.state.quest,
    chestsLeft: Math.max(0, (s.state.picks ?? 0) - (s.state.picked ?? 0)),
    missed: (s.state.missed ?? []).slice(0, 12),
    rewards,
    concepts: ids.map((id) => {
      const p = d.states[id]?.progress ?? newProgress();
      return { id, term: terms.get(id) ?? '', score: masteryScore(p), band: masteryBand(p) };
    }),
  };
}

async function answer(sessionId: string, questionId: string, a: Answer, timeMs?: number, ability?: QuestAbility) {
  const t = now();
  const s = getSession(sessionId);
  if (s.status !== 'active') throw new LocalError(409, 'session_done');
  if (s.mode === 'speed' && s.state.startedAt && t > s.state.startedAt + SPEED_MS + 4000) return endRun(s, 'time_up');
  if (s.mode === 'exam' && s.state.startedAt && s.state.timeLimitMs && t > s.state.startedAt + s.state.timeLimitMs + 15_000) {
    handIn(sessionId);
    throw new LocalError(409, 'time_up');
  }
  const q = s.current;
  if (!q || q.id !== questionId) throw new LocalError(409, 'stale_question');
  // Same meaning in other words ("round" for "circular"): ask Claude when the word list says no.
  const checks = shortAnswersToCheck(q, a);
  const need = openPart(q, a);
  const [meaning, open] = await Promise.all([checks.length ? judgeShort(q.prompt, checks, q.language) : Promise.resolve({}), need ? gradeOpenWithClaude(q, need, q.language) : Promise.resolve(undefined)]);
  if (s.current?.id !== questionId) throw new LocalError(409, 'stale_question');
  const g = grade(q, a, open, meaning);
  const d = load();
  const u = d.user;

  const prev = d.states[q.conceptId];
  const progress = recordAttempt(prev?.progress ?? newProgress(), q.format, q.bloom, g.score);
  const srs: SrsState = review(prev?.srs ?? newSrsState(t), ratingFromScore(g.score), t);
  const masteredNow = isMastered(progress) && !isMastered(prev?.progress ?? newProgress());
  d.states[q.conceptId] = { conceptId: q.conceptId, progress, srs };

  const firstTry = !isRetry(s.state, q.conceptId);
  const comboAfter = g.correct ? s.state.combo + 1 : 0;
  const lightning = s.state.lightning === q.id && g.correct && typeof timeMs === 'number' && timeMs <= LIGHTNING_MS + 500;
  const golden = !!s.state.golden && g.correct;
  if (golden) s.state.golden = false;
  const xp = xpForAnswer({ format: q.format, bloom: q.bloom, score: g.score, firstTry, combo: comboAfter, boost: boostNow() }) * (lightning ? 2 : 1) * (golden ? 2 : 1);
  const fact = s.state.slotFact ?? -1;
  // A miss comes back later only with another question (a round never asks the same one twice).
  const canRetry = !g.correct && canAskAgain(s, q, fact);
  const outcome = applyAnswer(s.state, { conceptId: q.conceptId, format: q.format, bloom: q.bloom, score: g.score, variantKey: q.variantKey, ...(fact >= 0 ? { fact } : {}) }, xp, {
    canRetry,
    ...(s.state.full ? { maxRetries: Math.max(4, Math.ceil(s.state.total * 0.2)) } : {}),
  });
  s.state = { ...s.state, ...outcome.state };
  // How it went on each fact this question was about.
  const log = (d.factLog ??= {});
  for (const f of new Set([...(q.facts ?? []), ...(fact >= 0 ? [fact] : [])])) log[factKey(q.conceptId, f)] = { at: t, ok: g.correct };
  // A whole-deck round goes topic by topic: the last question of a topic closes that chapter.
  const concepts = deck(s.deckId).concepts;
  const topicOf = (id: string) => concepts.find((c) => c.id === id)?.topic ?? '';
  const topic = topicOf(q.conceptId);
  let topicDone: { topic: string; right: number; total: number; next?: string } | undefined;
  if (s.state.full && topic && !s.state.queue.some((id) => topicOf(id) === topic)) {
    const here = s.state.history.filter((h) => topicOf(h.conceptId) === topic);
    if (here.length >= 3) topicDone = { topic, right: here.filter((h) => h.score >= PASS).length, total: here.length, ...(s.state.queue.length ? { next: topicOf(s.state.queue[0]!) } : {}) };
  }
  // A missed idea answered right on its second chance.
  const fixed = g.correct && !firstTry;
  s.attempts.push({ conceptId: q.conceptId, format: q.format, bloom: q.bloom, score: g.score, at: t });
  if (!g.correct) {
    const missed = (s.state.missed ??= []);
    if (!missed.some((m) => m.prompt === q.prompt) && missed.length < 20) missed.push({ prompt: q.format === 'true_false' ? q.prompt : q.prompt, ...(q.context ? { context: q.context } : {}), answer: g.correctAnswer, explanation: g.explanation, ...(g.chosenNote ? { note: g.chosenNote } : {}) });
  }

  // The team helps: coin pets pay for a right answer, heart pets sometimes win a heart back.
  let petCoins = 0;
  let petGift: { kind: 'heart'; name: string; species: string } | undefined;
  if (g.correct) {
    const buffs = buffsNow();
    petCoins = withGold(buffs.coins);
    u.coins += petCoins;
    s.state.petCoins = (s.state.petCoins ?? 0) + petCoins;
    const hearts = currentHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, t).hearts;
    if (buffs.heart > 0 && hearts < MAX_HEARTS && Math.random() < buffs.heart) {
      const h = gainHearts({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, t, 1);
      u.hearts = h.hearts;
      u.heartsUpdatedAt = h.updatedAt;
      const giver = team().find((p) => (petBuffs(petState(p)).some((b) => b.kind === 'heart') || p.boost === 'heart' || p.tier === 'lumo') && !petTooHungry(petState(p), t));
      if (giver) petGift = { kind: 'heart', name: giver.name, species: giver.species };
    }
  }
  if (s.mode === 'challenge' && g.score < 0.5) {
    const h = loseHeart({ hearts: u.hearts, updatedAt: u.heartsUpdatedAt }, t);
    u.hearts = h.hearts;
    u.heartsUpdatedAt = h.updatedAt;
    s.state.heartsLost += 1;
    if (h.hearts <= 0) s.state.endedReason = 'out_of_hearts';
  }
  // Speed run: points for each right answer, more on a streak.
  let points = 0;
  if (s.mode === 'speed' && g.correct) {
    points = Math.round(100 * comboMultiplier(outcome.combo));
    s.state.points = (s.state.points ?? 0) + points;
  }
  // Boss battle: a right answer hits the boss (harder on a streak); a miss cracks a shield; 3 in a row mends one.
  let damage = 0;
  let shield: 'lost' | 'mended' | undefined;
  const boss = s.state.boss;
  if (s.mode === 'boss' && boss) {
    if (g.correct) {
      damage = Math.round(100 * comboMultiplier(outcome.combo) * (q.bloom === 'analyze' ? 1.2 : q.bloom === 'apply' ? 1.1 : 1));
      boss.hp = Math.max(0, boss.hp - damage);
      if (outcome.combo > 0 && outcome.combo % 3 === 0 && boss.shields < BOSS_SHIELDS) {
        boss.shields += 1;
        shield = 'mended';
      }
      if (boss.hp === 0) s.state.endedReason = 'boss_defeated';
    } else {
      boss.shields = Math.max(0, boss.shields - 1);
      shield = 'lost';
      if (boss.shields === 0) s.state.endedReason = 'out_of_hearts';
    }
  }
  // Monster Quest: a right answer casts the spell picked; a miss lets the monster strike.
  let questMove: (Omit<ReturnType<typeof questTurn>, 'state'> & { coins: number }) | undefined;
  if (s.mode === 'quest' && s.state.quest) {
    const { state: qs, ...turn } = questTurn(s.state.quest, ability ?? 'strike', g.correct, outcome.combo);
    s.state.quest = qs;
    const coins = turn.defeated ? withGold(turn.defeated.coins) : 0;
    u.coins += coins;
    s.state.petCoins = (s.state.petCoins ?? 0) + coins;
    questMove = { ...turn, coins };
    if (turn.finished) s.state.endedReason = turn.finished === 'won' ? 'quest_won' : 'quest_lost';
  }
  // Now and then, a surprise gift drops in after a right answer (tap it to open). Not in a mock exam,
  // never in the first few answers, at most two a round.
  let gift: string | undefined;
  const answeredNow = s.state.answered;
  const maxGifts = Math.max(2, Math.floor(s.state.total / 15));
  if (g.correct && s.mode !== 'exam' && s.mode !== 'speed' && s.mode !== 'quest' && answeredNow >= 3 && (s.state.gifts ?? 0) < maxGifts && answeredNow >= (s.state.giftAfter ?? 0) && Math.random() < GIFT_CHANCE) {
    gift = uid();
    s.state.gift = { id: gift, at: now() };
    s.state.gifts = (s.state.gifts ?? 0) + 1;
    s.state.giftAfter = answeredNow + 4;
  }
  // Every few right answers earn a chest to pick (every 3 in a short round, every 6 in a long one; not in a mock exam or a speed run).
  let chest = false;
  const chestEvery = s.state.total >= 40 ? 6 : 3;
  if (g.correct && s.mode !== 'exam' && s.mode !== 'speed' && s.mode !== 'quest' && s.state.correct > 0 && s.state.correct % chestEvery === 0) {
    s.state.picks = (s.state.picks ?? 0) + 1;
    chest = true;
  }
  let rewards = award(xp, [{ type: 'answer', correct: g.correct, combo: comboAfter }, ...(masteredNow ? [{ type: 'mastered' as const }] : [])]);
  s.current = null;
  const next = sessionDone(s.state) ? null : serveNext(s);
  if (!next && s.mode === 'boss' && boss && boss.hp > 0 && !s.state.endedReason) s.state.endedReason = 'boss_escaped';
  const summary = next || s.state.waiting ? null : finish(s);
  if (summary) rewards = mergeRewards(rewards, summary.rewards);
  const { gradedBy: _g, ...result } = g;
  return {
    rewards,
    result: { ...result, xp, combo: outcome.combo, multiplier: outcome.multiplier, retryScheduled: outcome.retryScheduled, mastered: masteredNow, masteredTerm: masteredNow ? concepts.find((c) => c.id === q.conceptId)?.term : undefined, points, damage, shield, chest, lightning, quest: questMove, petCoins, petGift, gift, golden, topicDone, fixed },
    session: publicSession(s),
    next: next ? publicQuestion(next) : null,
    summary,
  };
}

const mergeRewards = (a: Rewards, b: Rewards): Rewards => ({
  ...a,
  badges: [...a.badges, ...b.badges],
  levelUp: b.levelUp ?? a.levelUp,
  chest: b.chest ?? a.chest,
  hatched: a.hatched ?? b.hatched,
  questsCompleted: [...a.questsCompleted, ...b.questsCompleted],
});

/** End a speed run (time's up) or leave a round early; returns the round's summary. */
function endRun(s: StoredSession, reason: 'time_up' | 'done') {
  if (s.status !== 'active') throw new LocalError(409, 'session_done');
  s.state.endedReason = s.state.endedReason ?? reason;
  s.state.queue = [];
  const summary = finish(s);
  return { rewards: summary.rewards, result: null, session: publicSession(s), next: null, summary };
}

/** Speed run: the clock starts after the 3-2-1, not when the round was made. */
function goNow(sessionId: string) {
  const s = getSession(sessionId);
  if (s.mode === 'speed' && s.state.answered === 0 && s.status === 'active') s.state.startedAt = now();
  return { session: publicSession(s) };
}

/** A hint costs a few coins: one wrong option disappears, or the first letter of the answer shows. */
function hint(sessionId: string) {
  const s = getSession(sessionId);
  const q = s.current;
  if (!q || s.status !== 'active') throw new LocalError(409, 'stale_question');
  const u = load().user;
  if (u.coins < HINT_COST) throw new LocalError(402, 'not_enough_coins');
  let out: { removeOptionId?: string; firstLetter?: string; letters?: number };
  if (q.format === 'multiple_choice' || q.format === 'cause_effect') {
    const removed = (s.state.hinted ??= []);
    const wrong = q.options.filter((o) => o.id !== q.correctId && !removed.includes(o.id));
    if (wrong.length <= 1) throw new LocalError(409, 'no_hint');
    const pick = wrong[Math.floor(Math.random() * wrong.length)]!;
    removed.push(pick.id);
    out = { removeOptionId: pick.id };
  } else if (q.format === 'type_answer') {
    const a = q.accepted[0] ?? '';
    out = { firstLetter: a.slice(0, 1), letters: a.length };
  } else throw new LocalError(409, 'no_hint');
  u.coins -= HINT_COST;
  return { ...out, coins: u.coins };
}

type Loot = { kind: 'coins' | 'xp' | 'egg'; amount: number } | { kind: 'item'; item: ItemId; amount: 1 };

/** Pick one of three chests (Blooket-style): it always holds something good. The other two are shown too. */
function pickChest(sessionId: string, choice: number) {
  const s = getSession(sessionId);
  if ((s.state.picks ?? 0) <= (s.state.picked ?? 0)) throw new LocalError(409, 'no_chest');
  s.state.picked = (s.state.picked ?? 0) + 1;
  const rng = lootRng();
  const roll = (): Loot => {
    const r = rng();
    if (r < 0.42) return { kind: 'coins', amount: [5, 10, 15, 25][Math.floor(rng() * 4)]! };
    if (r < 0.72) return { kind: 'xp', amount: [10, 20, 30][Math.floor(rng() * 3)]! };
    if (r < 0.92) return { kind: 'egg', amount: [1, 2, 3][Math.floor(rng() * 3)]! };
    return { kind: 'item', item: (['streak_freeze', 'xp_boost', 'pet_food', 'heart_refill'] as const)[Math.floor(rng() * 4)]!, amount: 1 };
  };
  const options = [roll(), roll(), roll()];
  const got = options[Math.max(0, Math.min(2, Math.floor(choice) || 0))]!;
  const u = load().user;
  let rewards = emptyRewards();
  if (got.kind === 'coins') u.coins += got.amount;
  else if (got.kind === 'xp') rewards = award(got.amount, []);
  else if (got.kind === 'egg') {
    const hatched = warmEgg(got.amount);
    if (hatched) rewards.hatched = hatched;
    rewards.egg = { ...game().egg };
  } else if (got.kind === 'item') addItem(got.item, 1);
  return { options, chosen: Math.max(0, Math.min(2, Math.floor(choice) || 0)), got, rewards, chests: Math.max(0, (s.state.picks ?? 0) - (s.state.picked ?? 0)), coins: u.coins };
}

// ------------------------------------------------------------------ flashcards

/** Cards to flip: Claude's questions when the deck has them (recall the answer, no options), else the notes. */
function cards(deckId: string) {
  const dk = deck(deckId);
  const states = statesMap(dk.concepts.map((c) => c.id));
  const ids = pickConcepts(dk.concepts, states, Math.min(20, dk.concepts.length), 'practice', now(), seededRng(hashString(`${deckId}:${now()}`)));
  const order = [...new Set(ids)];
  const rank: Format[] = ['type_answer', 'multiple_choice', 'true_false', 'explain', 'apply'];
  return {
    deck: { id: dk.id, title: dk.title, language: dk.language },
    cards: order.flatMap((id) => {
      const c = dk.concepts.find((x) => x.id === id);
      if (!c) return [];
      const qs = (dk.bank ?? []).filter((q) => q.conceptId === id && rank.includes(q.format)).sort((a, b) => rank.indexOf(a.format) - rank.indexOf(b.format));
      const q = qs[Math.floor(Math.random() * Math.min(2, qs.length))];
      if (q) {
        const back = q.format === 'true_false' ? `${correctAnswerText(q)}` : correctAnswerText(q);
        return [{ conceptId: id, term: c.term, front: q.prompt, context: q.context, back, why: q.explanation }];
      }
      return [{ conceptId: id, term: c.term, front: c.term, back: c.summary, why: c.keyPoints.slice(0, 3).join(' · ') }];
    }),
  };
}

function rateCard(deckId: string, conceptId: string, knew: boolean) {
  const dk = deck(deckId);
  if (!dk.concepts.some((c) => c.id === conceptId)) throw new LocalError(404, 'concept_not_found');
  const d = load();
  const t = now();
  const prev = d.states[conceptId];
  d.states[conceptId] = { conceptId, progress: prev?.progress ?? newProgress(), srs: review(prev?.srs ?? newSrsState(t), knew ? 'good' : 'again', t) };
  const rewards = award(knew ? 2 : 1, [{ type: 'answer', correct: knew, combo: 0 }]);
  return { ok: true, rewards };
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

const pubActivity = (a: Activity) => ({ id: a.id, deckId: a.deckId, kind: a.kind, title: a.title, data: a.data, score: a.score, xp: a.xp, completed: !!a.completedAt, language: a.language ?? load().decks.find((d) => d.id === a.deckId)?.language });

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
  const a: Activity = { id: uid(), deckId, kind, title, data, score: null, xp: 0, completedAt: null, createdAt: now(), language: dk.language };
  load().sandbox.unshift(a);
  load().sandbox = load().sandbox.slice(0, 40);
  return pubActivity(a);
}

/** Today's sandbox challenge: one game a day that gives double XP (the same for everyone on a day). */
function sandboxDaily(): SandboxKind {
  const games = SANDBOX_GROUPS_PLAY;
  return games[hashString(`sandbox:${today()}`) % games.length]!;
}
const SANDBOX_GROUPS_PLAY: SandboxKind[] = ['quiz_show', 'escape_room', 'crossword', 'word_search', 'memory', 'scramble', 'speed_round', 'two_truths'].filter((k) => (ALL_SANDBOX_KINDS as readonly string[]).includes(k)) as SandboxKind[];

function completeActivity(id: string, score: number) {
  const a = load().sandbox.find((x) => x.id === id);
  if (!a) throw new LocalError(404, 'activity_not_found');
  const s = Math.min(1, Math.max(0, score));
  const u = load().user;
  let xp = 0;
  const first = !a.completedAt;
  let daily = false;
  if (first) {
    xp = Math.round(SANDBOX_XP[a.kind] * s);
    // The daily challenge, done well: double XP, once a day.
    if (a.kind === sandboxDaily() && s >= 0.5 && u.sandboxDaily !== today()) {
      xp *= 2;
      u.sandboxDaily = today();
      daily = true;
    }
    a.score = s;
    a.xp = xp;
    a.completedAt = now();
  }
  const st = s >= 0.3 ? recordStudyDay(u.streak, today()) : { state: u.streak, extended: false };
  u.streak = st.state;
  const rewards = award(xp, [...(first ? [{ type: 'sandbox_done' as const, kind: a.kind, score: s }] : []), ...(st.extended ? [{ type: 'streak' as const, days: st.state.days }] : [])]);
  return { xp, daily, streak: { days: st.state.days, extended: st.extended }, rewards };
}

/** Friends see my stats: publish them a moment after a change (only when the page can share data). */
let shareTimer: ReturnType<typeof setTimeout> | null = null;
function shareStats() {
  // At most one publish every 1.5 s, starting from the first change (busy tapping never postpones it).
  if (shareTimer) return;
  shareTimer = setTimeout(() => {
    shareTimer = null;
    void publishProfile(myStats());
  }, 1500);
}
function myStats(username = load().user.username) {
  const u = load().user;
  const wk = weekId(now());
  return { username, level: levelFromXp(u.xp), xp: u.xp, weekId: wk, weeklyXp: u.week?.id === wk ? u.week.xp : 0, streak: u.streak.days, lastDay: u.streak.lastDay, decks: load().decks.length };
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
          // The site has the final say (two people could pick the same name at once).
          if (!(await renameProfile(myStats(n)))) throw new LocalError(409, 'username_taken');
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
  [
    'POST',
    /^\/api\/decks\/sample$/,
    (_m, b) => {
      // The sample deck comes with hand-written test questions, so the first game is a good one.
      const language: Locale = b.language === 'fr' || b.language === 'en' ? b.language : load().user.locale;
      const made = createDeck(SAMPLE_DECKS[language] as never);
      const dk = deck(made.id);
      dk.bank = sampleBank(language, dk.concepts);
      dk.bankAt = now();
      return made;
    },
  ],
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
    /^\/api\/local\/decks\/import$/,
    (_m, b) => {
      // A friend's shared deck: its ideas and its questions, so it plays right away (no Claude needed).
      const src = Array.isArray(b.concepts) ? (b.concepts as Concept[]) : [];
      if (src.length === 0) throw new LocalError(422, 'nothing_found');
      const made = createDeck({
        title: String(b.title || 'Shared deck').slice(0, 120),
        subject: String(b.subject ?? ''),
        language: b.language === 'fr' ? 'fr' : 'en',
        summary: String(b.summary ?? ''),
        concepts: src.map(({ id: _id, ...c }) => c),
      });
      const dk = deck(made.id);
      const ids = new Map(src.map((c, i) => [c.id, dk.concepts[i]!.id]));
      const bank = (Array.isArray(b.bank) ? (b.bank as Question[]) : []).flatMap((q) => {
        const id = q && typeof q === 'object' ? ids.get(q.conceptId) : undefined;
        return id && typeof q.prompt === 'string' && typeof q.variantKey === 'string' ? [{ ...q, conceptId: id }] : [];
      });
      if (bank.length) {
        dk.bank = bank;
        dk.bankAt = now();
      }
      return made;
    },
  ],
  [
    'POST',
    /^\/api\/local\/decks$/,
    (_m, b) => {
      // A draft already cleaned by the photo reader.
      const concepts = Array.isArray(b.concepts) ? (b.concepts as Omit<Concept, 'id'>[]) : [];
      if (concepts.length === 0) throw new LocalError(422, 'nothing_found');
      return createDeck({ title: String(b.title || 'My notes').slice(0, 120), subject: String(b.subject ?? ''), language: b.language === 'fr' ? 'fr' : 'en', summary: String(b.summary ?? ''), concepts, options: b.options });
    },
  ],
  ['GET', /^\/api\/decks\/([\w-]+)$/, (m) => masteryMap(m[1]!)],
  [
    'PUT',
    /^\/api\/local\/decks\/([\w-]+)\/translated$/,
    (m, b) => {
      // The same deck in another language: same ideas (same ids, so progress stays), same questions.
      const dk = deck(m[1]!);
      const concepts = Array.isArray(b.concepts) ? (b.concepts as Concept[]) : [];
      if (concepts.length !== dk.concepts.length || concepts.some((c, i) => !c || c.id !== dk.concepts[i]!.id || typeof c.term !== 'string')) throw new LocalError(422, 'bad_translation');
      const ids = new Set(dk.concepts.map((c) => c.id));
      dk.title = String(b.title || dk.title).slice(0, 120);
      dk.subject = String(b.subject ?? dk.subject).slice(0, 80);
      dk.summary = String(b.summary ?? dk.summary).slice(0, 1000);
      dk.language = b.language === 'fr' ? 'fr' : 'en';
      dk.concepts = concepts;
      if (Array.isArray(b.bank)) dk.bank = (b.bank as Question[]).filter((q) => q && typeof q === 'object' && ids.has(q.conceptId) && typeof q.prompt === 'string' && typeof q.variantKey === 'string').map((q) => ({ ...q, language: dk.language }));
      dk.updatedAt = now();
      return { ok: true, language: dk.language };
    },
  ],
  [
    'PUT',
    /^\/api\/local\/decks\/([\w-]+)\/bank$/,
    (m, b) => {
      const dk = deck(m[1]!);
      const ids = new Set(dk.concepts.map((c) => c.id));
      dk.bank = (Array.isArray(b.questions) ? (b.questions as Question[]) : []).filter((q) => q && typeof q === 'object' && ids.has(q.conceptId) && typeof q.prompt === 'string' && typeof q.variantKey === 'string');
      capBank(dk);
      dk.bankAt = now();
      return { count: dk.bank.length };
    },
  ],
  [
    'PATCH',
    /^\/api\/local\/decks\/([\w-]+)\/bank$/,
    (m, b) => {
      // Claude's questions arrive a few at a time while it writes; a checker or a learner may remove some.
      const dk = deck(m[1]!);
      const ids = new Set(dk.concepts.map((c) => c.id));
      const before = dk.bank?.length ?? 0;
      const remove = new Set(Array.isArray(b.remove) ? (b.remove as unknown[]).map(String) : []);
      const list = (dk.bank ?? []).filter((q) => !remove.has(q.variantKey));
      const removed = before - list.length;
      const have = new Set(list.map((q) => q.variantKey));
      for (const q of Array.isArray(b.add) ? (b.add as Question[]) : []) {
        if (!q || typeof q !== 'object' || !ids.has(q.conceptId) || typeof q.prompt !== 'string' || typeof q.variantKey !== 'string' || have.has(q.variantKey)) continue;
        have.add(q.variantKey);
        list.push(q);
      }
      dk.bank = list;
      capBank(dk);
      dk.bankAt = now();
      return { count: dk.bank.length, removed };
    },
  ],
  [
    'POST',
    /^\/api\/local\/decks\/([\w-]+)\/report$/,
    (m, b) => {
      // A learner flagged a question as wrong or confusing: it leaves the deck right away.
      const dk = deck(m[1]!);
      const key = String(b.variantKey ?? '');
      const q = dk.bank?.find((x) => x.variantKey === key);
      if (!q) return { ok: true, removed: 0 };
      dk.bank = dk.bank!.filter((x) => x.variantKey !== key);
      dk.bankAt = now();
      reportProblem('question', new Error(`reported: ${String(b.reason ?? '')} | ${q.prompt.slice(0, 200)}`));
      return { ok: true, removed: 1 };
    },
  ],
  [
    'POST',
    /^\/api\/local\/problem$/,
    (_m, b) => {
      reportProblem(String(b.where ?? 'page').slice(0, 60), new Error(String(b.message ?? '').slice(0, 500)));
      return { ok: true };
    },
  ],
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
  ['POST', /^\/api\/decks\/([\w-]+)\/sessions$/, (m, b) => startSession(m[1]!, (b.mode as SessionMode) ?? 'practice', Math.min(60, Math.max(3, Number(b.length) || 10)), b.formats as Format[] | undefined, b.full === true)],
  [
    'GET',
    /^\/api\/decks\/([\w-]+)\/offline$/,
    (m) => {
      const d = deck(m[1]!);
      return { deck: { id: d.id, title: d.title, subject: d.subject, language: d.language, summary: d.summary, options: d.options ?? {} }, concepts: d.concepts, bank: d.bank ?? [], savedAt: now() };
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
      // A round waiting for Claude's next questions: ask again (and end it if nothing more is coming).
      if (s.status === 'active' && !s.current && s.state.waiting && !serveNext(s) && !s.state.waiting) {
        const summary = finish(s);
        return { session: publicSession(s), question: null, summary, rewards: summary.rewards };
      }
      return { session: publicSession(s), question: s.current ? publicQuestion(s.current) : null };
    },
  ],
  ['POST', /^\/api\/sessions\/([\w-]+)\/answer$/, (m, b) => answer(m[1]!, String(b.questionId), b.answer as Answer, Number(b.timeMs), typeof b.ability === 'string' ? (b.ability as QuestAbility) : undefined)],
  ['POST', /^\/api\/sessions\/([\w-]+)\/end$/, (m) => endRun(getSession(m[1]!), 'time_up')],
  ['POST', /^\/api\/sessions\/([\w-]+)\/go$/, (m) => goNow(m[1]!)],
  ['POST', /^\/api\/sessions\/([\w-]+)\/hint$/, (m) => hint(m[1]!)],
  ['POST', /^\/api\/sessions\/([\w-]+)\/pick$/, (m, b) => pickChest(m[1]!, Number(b.choice))],
  ['POST', /^\/api\/sessions\/([\w-]+)\/gift$/, (m, b) => openGift(m[1]!, String(b.id ?? ''))],
  ['POST', /^\/api\/sessions\/([\w-]+)\/report$/, (m, b) => reportLast(m[1]!, String(b.reason ?? ''))],
  ['GET', /^\/api\/decks\/([\w-]+)\/cards$/, (m) => cards(m[1]!)],
  ['POST', /^\/api\/decks\/([\w-]+)\/cards$/, (m, b) => rateCard(m[1]!, String(b.conceptId), b.knew === true)],
  ['POST', /^\/api\/sessions\/([\w-]+)\/hand-in$/, (m) => handIn(m[1]!)],
  ['GET', /^\/api\/sessions\/([\w-]+)\/report$/, (m) => report(m[1]!)],

  [
    'GET',
    /^\/api\/sandbox$/,
    () => {
      const done = load().sandbox.filter((a) => a.completedAt);
      // Stars: up to 3 for each game played (by its score), and what you're best at.
      const stars = done.reduce((n, a) => n + Math.round((a.score ?? 0) * 3), 0);
      const best: Record<string, number> = {};
      for (const a of done) best[a.kind] = Math.max(best[a.kind] ?? 0, a.score ?? 0);
      return {
        activities: load().sandbox.slice(0, 20).map((a) => ({ id: a.id, deckId: a.deckId, kind: a.kind, title: a.title, score: a.score, xp: a.xp, completedAt: a.completedAt ? new Date(a.completedAt).toISOString() : null, createdAt: new Date(a.createdAt).toISOString() })),
        stats: { done: done.length, stars, best, daily: sandboxDaily(), dailyDone: load().user.sandboxDaily === today() },
      };
    },
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

  ['GET', /^\/api\/local\/memory$/, () => {
    const m = memory();
    return { notes: m.notes, prefs: m.prefs, noticed: noticed(), suggestions: suggestions() };
  }],
  ['POST', /^\/api\/local\/memory\/notes$/, (_m, b) => {
    const m = memory();
    const text = String(b.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text) throw new LocalError(422, 'empty');
    if (m.notes.length >= 40) throw new LocalError(409, 'too_many');
    m.notes.push({ id: uid(), text, at: now() });
    return { notes: m.notes };
  }],
  ['DELETE', /^\/api\/local\/memory\/notes\/([\w-]+)$/, (mm) => {
    const m = memory();
    m.notes = m.notes.filter((n) => n.id !== mm[1]);
    return { notes: m.notes };
  }],
  ['PATCH', /^\/api\/local\/memory\/prefs$/, (_m, b) => {
    const p = memory().prefs;
    if (['short', 'normal', 'detailed'].includes(String(b.explain))) p.explain = b.explain as StudyPrefs['explain'];
    if (['auto', 'easier', 'harder'].includes(String(b.level))) p.level = b.level as StudyPrefs['level'];
    if (typeof b.adapt === 'boolean') p.adapt = b.adapt;
    return { prefs: p };
  }],
  ['POST', /^\/api\/local\/memory\/dismiss$/, (_m, b) => {
    const m = memory();
    m.dismissed = [...(m.dismissed ?? []), String(b.text ?? '').slice(0, 300)].slice(-30);
    return { ok: true };
  }],
  ['GET', /^\/api\/local\/decks\/([\w-]+)\/fresh$/, (m) => {
    // Facts with no question yet, and facts whose questions this learner has all met (to write new ones before they run out).
    const dk = deck(m[1]!);
    const seen = load().seen ?? {};
    const bank = dk.bank ?? [];
    const cover = [...factCoverage(dk.concepts, bank, seen).values()];
    return { total: bank.length, unseen: bank.filter((q) => seen[q.variantKey] === undefined).length, concepts: dk.concepts.length, facts: cover.length, uncovered: cover.filter((x) => x.have === 0).length, spent: cover.filter((x) => x.have > 0 && x.unseen === 0).length };
  }],
  ['GET', /^\/api\/local\/decks\/([\w-]+)\/seen$/, (m) => {
    // When this learner last met each of the deck's questions.
    const seen = load().seen ?? {};
    return { seen: Object.fromEntries((deck(m[1]!).bank ?? []).flatMap((q) => (seen[q.variantKey] !== undefined ? [[q.variantKey, seen[q.variantKey]!]] : []))) };
  }],
  ['POST', /^\/api\/local\/decks\/([\w-]+)\/seen$/, (m, b) => {
    // Questions met in a Live game: next time, others come first.
    const keys = new Set((deck(m[1]!).bank ?? []).map((q) => q.variantKey));
    const d = load();
    const t = now();
    const seen = (d.seen ??= {});
    for (const k of Array.isArray(b.keys) ? b.keys.map(String) : []) if (keys.has(k)) seen[k] = t;
    return { ok: true };
  }],
  ['PUT', /^\/api\/local\/decks\/([\w-]+)\/options$/, (m, b) => {
    // How the learner wants this deck's questions (used for every question Claude writes from now on).
    const dk = deck(m[1]!);
    const options = cleanOptions(b.options);
    if (Object.keys(options).length) dk.options = options as Record<string, unknown>;
    else delete dk.options;
    dk.updatedAt = now();
    return { options: dk.options ?? {} };
  }],
  ['POST', /^\/api\/local\/decks\/cards$/, (_m, b) => {
    // Cards from Gizmo, Quizlet, Anki…: each card is an idea, its definition its fact.
    const cards = parseCards(String(b.text ?? ''));
    if (cards.length < 2) throw new LocalError(422, 'no_cards');
    const title = String(b.title || 'My cards').slice(0, 120);
    return createDeck({
      title,
      language: b.language === 'fr' ? 'fr' : 'en',
      concepts: cards.map((c) => ({ topic: title, kind: 'definition', term: c.term, summary: c.definition, keyPoints: [c.definition], misconceptions: [], examples: [], synonyms: [] })),
    });
  }],
  ['POST', /^\/api\/local\/decks\/([\w-]+)\/ideas$/, (m, b) => addIdeas(m[1]!, Array.isArray(b.concepts) ? (b.concepts as Omit<Concept, 'id'>[]) : [])],
  ['POST', /^\/api\/local\/decks\/([\w-]+)\/ideas-from-notes$/, (m, b) => {
    // New notes, read by Lumo's own reader (no Claude here).
    const r = extractFromText(String(b.text ?? ''), b.language === 'fr' ? 'fr' : 'en');
    return addIdeas(m[1]!, r.concepts);
  }],
  ['GET', /^\/api\/local\/decks\/([\w-]+)\/questions$/, (m) => {
    // Every question of the deck, answers included (the learner's own deck), to read, fix or remove.
    const dk = deck(m[1]!);
    const seen = load().seen ?? {};
    return {
      deck: { id: dk.id, title: dk.title, language: dk.language, mine: true },
      concepts: dk.concepts.map((c) => ({ id: c.id, term: c.term, topic: c.topic, facts: c.keyPoints })),
      questions: (dk.bank ?? []).map((q) => ({ ...q, answer: correctAnswerText(q), seen: seen[q.variantKey] ?? null })),
      writing: writingNow.has(dk.id),
    };
  }],
  ['POST', /^\/api\/local\/decks\/([\w-]+)\/questions$/, (m, b) => saveOwnQuestion(m[1]!, b)],
  ['PUT', /^\/api\/local\/decks\/([\w-]+)\/questions\/([^/]+)$/, (m, b) => saveOwnQuestion(m[1]!, b, decodeURIComponent(m[2]!))],
  ['DELETE', /^\/api\/local\/decks\/([\w-]+)\/questions\/([^/]+)$/, (m) => {
    const dk = deck(m[1]!);
    const key = decodeURIComponent(m[2]!);
    const before = dk.bank?.length ?? 0;
    dk.bank = (dk.bank ?? []).filter((q) => q.variantKey !== key);
    dk.bankAt = now();
    return { removed: before - dk.bank.length, count: dk.bank.length };
  }],
  [
    'POST',
    /^\/api\/local\/friend-reward$/,
    (_m, b) => {
      // A new friend: a few coins (enough for 2 snacks), once per friend.
      const u = load().user;
      const id = String(b.friendId ?? '').slice(0, 80);
      if (!id || (u.friendRewarded ?? []).includes(id)) return { coins: 0 };
      u.friendRewarded = [...(u.friendRewarded ?? []), id].slice(-500);
      u.coins += FRIEND_COINS;
      return { coins: FRIEND_COINS, total: u.coins };
    },
  ],
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
      const correct = Math.max(0, Math.min(100, Number(b.correct) || 0));
      const base = liveRewards(rank, players, correct);
      // Coin pets pay for right answers in Live too.
      const r = { ...base, coins: withGold(base.coins + correct * buffsNow().coins) };
      u.coins += r.coins;
      // Bets: XP won adds to the reward; XP lost comes off, but never below the start of your level.
      const bet = Math.max(-2500, Math.min(2500, Math.round(Number(b.betXp) || 0)));
      if (bet < 0) {
        const floor = xpForLevel(levelFromXp(u.xp));
        const lost = Math.min(-bet, u.xp - floor);
        u.xp -= lost;
        if (u.week?.id === weekId(now())) u.week.xp = Math.max(0, u.week.xp - lost);
      }
      const rewards = award(r.xp + Math.max(0, bet), [{ type: 'live_done', rank, players }, ...Array.from({ length: correct }, () => ({ type: 'answer' as const, correct: true, combo: 0 }))]);
      return { rank, xp: r.xp, coins: r.coins, betXp: bet, rewards };
    },
  ],
  ...gameRoutes,
  [
    'GET',
    /^\/api\/game\/badges$/,
    () => ({ stats: { ...emptyStats(), ...load().user.stats }, badges: BADGES.filter((b) => !b.id.endsWith('_league')).map((b) => ({ id: b.id, emoji: b.emoji, earnedAt: load().badges[b.id] ? new Date(load().badges[b.id]!).toISOString() : null })) }),
  ],
];

/** Keeps the last few unexpected errors in the learner's own private space, so they can be fixed. */
function reportProblem(where: string, e: unknown) {
  if (!cloud) return;
  const err = e instanceof Error ? e : new Error(String(e));
  const entry = { at: now(), where, message: String(err.message).slice(0, 500), stack: String(err.stack ?? '').slice(0, 2000), ua: navigator.userAgent.slice(0, 200) };
  problems = [entry, ...problems].slice(0, 10);
  void cloud.db.doc(`data/users/${cloud.me}/problems`).set({ list: problems }).catch(() => {});
}
let problems: { at: number; where: string; message: string; stack: string; ua: string }[] = [];

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
      const out = await fn(match, plain(body ?? {}) as Record<string, unknown>);
      save();
      shareStats();
      return plain(out) as T;
    } catch (e) {
      save();
      if (e instanceof LocalError) throw e;
      console.error(e);
      reportProblem(`${method} ${p}`, e);
      throw new LocalError(500, 'error');
    }
  }
  throw new LocalError(404, 'not_available_here');
}

export { LocalError };
