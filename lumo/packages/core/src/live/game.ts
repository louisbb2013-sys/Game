import type { Format, Millis } from '../types';
import { publicQuestion, correctAnswerText, type Answer, type PublicQuestion, type Question } from '../quiz/question';
import { grade, openPart, PASS, type GradeResult, type OpenGrade } from '../quiz/grade';

/**
 * Live multiplayer quiz: a pure state machine. The server owns the state and the clock;
 * clients only ever receive `publicView()` (no answer keys until the reveal).
 */

export const LIVE_MIN_PLAYERS = 2;
export const LIVE_MAX_PLAYERS = 50;

export type LivePhase = 'lobby' | 'question' | 'reveal' | 'podium';

export interface LivePlayer {
  id: string;
  name: string;
  avatar: string;
  score: number;
  streak: number;
  correctCount: number;
  connected: boolean;
  joinedAt: Millis;
}

export interface LiveAnswer {
  answer: Answer;
  at: Millis;
}

export interface LiveResult {
  score: number; // 0..1 accuracy
  correct: boolean;
  points: number;
  streak: number;
}

/** XP a player can put on whether someone else gets the question right. */
export const BET_STAKES = [10, 25, 50] as const;
export interface LiveBet {
  /** The player the bet is on. */
  on: string;
  /** Betting they get it right (true) or wrong (false). */
  right: boolean;
  stake: number;
}
export interface LiveBetResult extends LiveBet {
  won: boolean;
  /** XP won (+) or lost (-). */
  delta: number;
}

export interface LiveState {
  code: string;
  hostId: string;
  title: string;
  phase: LivePhase;
  players: LivePlayer[];
  questions: Question[];
  index: number; // current question
  startedAt: Millis | null; // when the current question opened
  durationMs: number;
  answers: Record<string, LiveAnswer>; // for the current question
  lastResults: Record<string, LiveResult>; // results of the current/last reveal
  /** Players' ranks before the current reveal, to show who moved up. */
  previousRanks: Record<string, number>;
  /** Bets on the current question, by the player who bet. */
  bets?: Record<string, LiveBet>;
  /** How the bets on the last revealed question went. */
  betResults?: Record<string, LiveBetResult>;
  /** XP each player has won or lost betting in this game. */
  betTotals?: Record<string, number>;
}

/** Time to answer depends on how much thinking/typing the format needs. */
export function durationFor(format: Format): number {
  switch (format) {
    case 'true_false':
      return 15_000;
    case 'multiple_choice':
    case 'cause_effect':
    case 'true_false_justify':
      return format === 'true_false_justify' ? 45_000 : 20_000;
    case 'multiple_select':
    case 'type_answer':
    case 'fill_blank':
    case 'spot_mistake':
    case 'calculation':
      return 30_000;
    case 'matching':
    case 'ordering':
    case 'categorize':
    case 'label_diagram':
      return 40_000;
    default:
      return 60_000; // explain / apply / compare
  }
}

/** Formats that work in a timed group game (teach-back needs a back-and-forth). */
export const LIVE_FORMATS: Format[] = [
  'multiple_choice',
  'true_false',
  'multiple_select',
  'type_answer',
  'fill_blank',
  'true_false_justify',
  'matching',
  'ordering',
  'categorize',
  'spot_mistake',
  'cause_effect',
  'calculation',
  'apply',
  'explain',
  'compare',
];

export class LiveError extends Error {
  constructor(public code: 'slow_down' | 'full' | 'started' | 'not_host' | 'not_enough_players' | 'not_in_game' | 'wrong_phase' | 'already_answered' | 'stale_question' | 'already_bet' | 'bad_bet') {
    super(code);
  }
}

export function createLive(code: string, host: { id: string; name: string; avatar: string }, title: string, questions: Question[], now: Millis): LiveState {
  return {
    code,
    hostId: host.id,
    title,
    phase: 'lobby',
    players: [{ ...host, score: 0, streak: 0, correctCount: 0, connected: true, joinedAt: now }],
    questions,
    index: -1,
    startedAt: null,
    durationMs: 0,
    answers: {},
    lastResults: {},
    previousRanks: {},
    bets: {},
    betResults: {},
    betTotals: {},
  };
}

export function joinLive(s: LiveState, p: { id: string; name: string; avatar: string }, now: Millis): LiveState {
  const existing = s.players.find((x) => x.id === p.id);
  if (existing) return { ...s, players: s.players.map((x) => (x.id === p.id ? { ...x, connected: true } : x)) }; // reconnect
  if (s.phase !== 'lobby') throw new LiveError('started');
  if (s.players.length >= LIVE_MAX_PLAYERS) throw new LiveError('full');
  return { ...s, players: [...s.players, { ...p, score: 0, streak: 0, correctCount: 0, connected: true, joinedAt: now }] };
}

export function setConnected(s: LiveState, playerId: string, connected: boolean): LiveState {
  return { ...s, players: s.players.map((x) => (x.id === playerId ? { ...x, connected } : x)) };
}

export function removePlayer(s: LiveState, playerId: string): LiveState {
  return { ...s, players: s.players.filter((x) => x.id !== playerId) };
}

export function startLive(s: LiveState, by: string, now: Millis): LiveState {
  if (by !== s.hostId) throw new LiveError('not_host');
  if (s.phase !== 'lobby') throw new LiveError('wrong_phase');
  if (s.players.length < LIVE_MIN_PLAYERS) throw new LiveError('not_enough_players');
  return openQuestion(s, 0, now);
}

function openQuestion(s: LiveState, index: number, now: Millis): LiveState {
  const q = s.questions[index]!;
  return { ...s, phase: 'question', index, startedAt: now, durationMs: durationFor(q.format), answers: {}, lastResults: {}, bets: {}, betResults: {} };
}

export function submitLive(s: LiveState, playerId: string, questionId: string, answer: Answer, now: Millis): LiveState {
  if (s.phase !== 'question') throw new LiveError('wrong_phase');
  if (!s.players.some((p) => p.id === playerId)) throw new LiveError('not_in_game');
  if (s.questions[s.index]!.id !== questionId) throw new LiveError('stale_question');
  if (s.answers[playerId]) throw new LiveError('already_answered');
  return { ...s, answers: { ...s.answers, [playerId]: { answer, at: Math.min(now, (s.startedAt ?? now) + s.durationMs) } } };
}

/** Bet XP that another player gets the current question right (or wrong). One bet per question. */
export function betLive(s: LiveState, by: string, questionId: string, bet: LiveBet): LiveState {
  if (s.phase !== 'question') throw new LiveError('wrong_phase');
  if (!s.players.some((p) => p.id === by)) throw new LiveError('not_in_game');
  if (s.questions[s.index]!.id !== questionId) throw new LiveError('stale_question');
  if (s.bets?.[by]) throw new LiveError('already_bet');
  if (bet.on === by || !s.players.some((p) => p.id === bet.on) || typeof bet.right !== 'boolean' || !(BET_STAKES as readonly number[]).includes(bet.stake)) throw new LiveError('bad_bet');
  return { ...s, bets: { ...s.bets, [by]: { on: bet.on, right: bet.right, stake: bet.stake } } };
}

export const allAnswered = (s: LiveState) => s.players.filter((p) => p.connected).every((p) => s.answers[p.id]);
export const timeIsUp = (s: LiveState, now: Millis) => s.startedAt !== null && now >= s.startedAt + s.durationMs;

/** Points: accuracy × (500 base + up to 500 for speed) × streak bonus (up to +50%). */
export function livePoints(score: number, elapsedMs: number, durationMs: number, streak: number): number {
  if (score <= 0) return 0;
  const speed = Math.max(0, 1 - elapsedMs / durationMs);
  const streakBonus = 1 + Math.min(streak, 5) * 0.1;
  return Math.round(score * (500 + 500 * speed) * streakBonus);
}

/** Which current answers need a judge (open text); the server may grade them with AI first. */
export function openAnswersToJudge(s: LiveState): { playerId: string; text: string }[] {
  const q = s.questions[s.index]!;
  return Object.entries(s.answers).flatMap(([playerId, a]) => {
    const need = openPart(q, a.answer);
    return need ? [{ playerId, text: need.text }] : [];
  });
}

/** Close the question: grade everyone, award points, rank. `judged` holds AI grades for open answers; `meanings`, accepted short answers. */
export function revealLive(s: LiveState, judged: Record<string, OpenGrade> = {}, meanings: Record<string, Record<string, boolean>> = {}): LiveState {
  if (s.phase !== 'question') throw new LiveError('wrong_phase');
  const q = s.questions[s.index]!;
  const previousRanks = Object.fromEntries(ranking(s).map((p, i) => [p.id, i + 1]));
  const lastResults: Record<string, LiveResult> = {};
  const players = s.players.map((p) => {
    const a = s.answers[p.id];
    const g: GradeResult | null = a ? grade(q, a.answer, judged[p.id], meanings[p.id]) : null;
    const score = g?.score ?? 0;
    const correct = score >= PASS;
    const streak = correct ? p.streak + 1 : 0;
    const points = a ? livePoints(score, a.at - (s.startedAt ?? a.at), s.durationMs, correct ? p.streak : 0) : 0;
    lastResults[p.id] = { score, correct, points, streak };
    return { ...p, score: p.score + points, streak, correctCount: p.correctCount + (correct ? 1 : 0) };
  });
  // Bets: a good call wins the stake in XP, a bad one loses it.
  const betResults: Record<string, LiveBetResult> = {};
  const betTotals = { ...s.betTotals };
  for (const [by, b] of Object.entries(s.bets ?? {})) {
    const target = lastResults[b.on];
    if (!target) continue; // they left the game: the bet is off
    const won = target.correct === b.right;
    const delta = won ? b.stake : -b.stake;
    betResults[by] = { ...b, won, delta };
    betTotals[by] = (betTotals[by] ?? 0) + delta;
  }
  return { ...s, phase: 'reveal', players, lastResults, previousRanks, betResults, betTotals };
}

export function nextLive(s: LiveState, by: string, now: Millis): LiveState {
  if (by !== s.hostId) throw new LiveError('not_host');
  if (s.phase !== 'reveal') throw new LiveError('wrong_phase');
  if (s.index + 1 >= s.questions.length) return { ...s, phase: 'podium', startedAt: null };
  return openQuestion(s, s.index + 1, now);
}

/** The host stops a long game early: straight to the podium with the scores so far. */
export function endLive(s: LiveState, by: string): LiveState {
  if (by !== s.hostId) throw new LiveError('not_host');
  if (s.phase !== 'question' && s.phase !== 'reveal') throw new LiveError('wrong_phase');
  return { ...s, phase: 'podium', startedAt: null };
}

export function ranking(s: LiveState): LivePlayer[] {
  return s.players.slice().sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
}

export interface LivePublic {
  code: string;
  hostId: string;
  title: string;
  phase: LivePhase;
  players: { id: string; name: string; avatar: string; score: number; streak: number; connected: boolean; answered: boolean; rank: number; previousRank: number | null; betXp: number }[];
  index: number;
  total: number;
  question: PublicQuestion | null;
  endsAt: Millis | null;
  answeredCount: number;
  reveal: { correctAnswer: string; explanation: string; results: Record<string, LiveResult>; bets: Record<string, LiveBetResult> } | null;
  /** Who bet on whom for the current question (stakes and sides are open: it's part of the fun). */
  bets: ({ by: string } & LiveBet)[];
}

/** The only view clients get: no answer keys during the question, nobody else's answers. */
export function publicView(s: LiveState): LivePublic {
  const q = s.index >= 0 ? s.questions[s.index] : undefined;
  const rankOf = new Map(ranking(s).map((p, i) => [p.id, i + 1]));
  return {
    code: s.code,
    hostId: s.hostId,
    title: s.title,
    phase: s.phase,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      streak: p.streak,
      connected: p.connected,
      answered: !!s.answers[p.id],
      rank: rankOf.get(p.id)!,
      previousRank: s.previousRanks[p.id] ?? null,
      betXp: s.betTotals?.[p.id] ?? 0,
    })),
    index: s.index,
    total: s.questions.length,
    question: q && (s.phase === 'question' || s.phase === 'reveal') ? publicQuestion(q) : null,
    endsAt: s.phase === 'question' && s.startedAt !== null ? s.startedAt + s.durationMs : null,
    answeredCount: Object.keys(s.answers).length,
    reveal: q && s.phase === 'reveal' ? { correctAnswer: correctAnswerText(q), explanation: q.explanation, results: s.lastResults, bets: s.betResults ?? {} } : null,
    bets: s.phase === 'question' || s.phase === 'reveal' ? Object.entries(s.bets ?? {}).map(([by, b]) => ({ by, ...b })) : [],
  };
}

/** End-of-game rewards (server-granted): everyone gets something, podium gets more. */
export function liveRewards(rank: number, players: number, correctCount: number): { xp: number; coins: number } {
  const podium = rank === 1 ? 30 : rank === 2 ? 20 : rank === 3 ? 10 : 0;
  return { xp: 10 + correctCount * 5 + (players >= 3 ? podium : Math.floor(podium / 2)), coins: 5 + (rank <= 3 ? 15 - (rank - 1) * 5 : 0) };
}
