import { comboMultiplier } from '../xp';
import type { Bloom, Format } from '../types';
import type { SessionMode } from './planner';
import { PASS } from './grade';

/** Server-held quiz session state (pure data; the same rules run offline on the client). */
export interface SessionState {
  mode: SessionMode;
  queue: string[]; // concept ids still to ask
  total: number; // planned length incl. inserted retries
  answered: number;
  correct: number;
  combo: number;
  bestCombo: number;
  xp: number;
  retries: Record<string, number>; // conceptId -> retries inserted
  retryIds: string[]; // concepts whose next question is a retry (no first-try bonus)
  /** Which fact each queued question is about (same order as `queue`; -1 = the idea as a whole). */
  facts?: number[];
  history: { conceptId: string; format: Format; bloom: Bloom; score: number; variantKey: string; fact?: number }[];
  endedReason?: 'done' | 'out_of_hearts' | 'time_up' | 'boss_defeated' | 'boss_escaped' | 'quest_won' | 'quest_lost';
}

export const MAX_RETRIES_PER_CONCEPT = 2;
/** A struggling round still ends: at most this many missed ideas come back. */
export const MAX_RETRIES_PER_ROUND = 4;
export const RETRY_GAP = 3; // ask the retry after this many other questions (spacing helps)

export function newSession(mode: SessionMode, conceptIds: string[], facts?: number[]): SessionState {
  return {
    mode,
    queue: conceptIds.slice(),
    ...(facts ? { facts: conceptIds.map((_, i) => facts[i] ?? -1) } : {}),
    total: conceptIds.length,
    answered: 0,
    correct: 0,
    combo: 0,
    bestCombo: 0,
    xp: 0,
    retries: {},
    retryIds: [],
    history: [],
  };
}

/** The fact the next question is about (-1 = the idea as a whole). */
export const nextFact = (s: SessionState): number => s.facts?.[0] ?? -1;

/** Nothing can be asked for the next item: drop it (the round gets one shorter). */
export function dropHead(s: SessionState): SessionState {
  return { ...s, queue: s.queue.slice(1), ...(s.facts ? { facts: s.facts.slice(1) } : {}), total: Math.max(s.answered, s.total - 1) };
}

/** Nothing for the next item yet (its questions are still being written): ask it later in the round. */
export function deferHead(s: SessionState): SessionState {
  if (s.queue.length < 2) return s;
  const [c, ...queue] = s.queue;
  const facts = s.facts ? [...s.facts.slice(1), s.facts[0] ?? -1] : undefined;
  return { ...s, queue: [...queue, c!], ...(facts ? { facts } : {}) };
}

/**
 * A round that asks each idea twice, with other ideas in between (a b c a d b e c d e): recalling
 * something again after a short gap is what makes it stick (successive relearning).
 */
export function twiceSpaced(ids: readonly string[]): string[] {
  const uniq = [...new Set(ids)];
  const out: string[] = [];
  uniq.forEach((id, i) => {
    out.push(id);
    if (i >= 2) out.push(uniq[i - 2]!);
  });
  out.push(...uniq.slice(Math.max(0, uniq.length - 2)));
  return out;
}

export function nextConcept(s: SessionState): string | null {
  return s.queue[0] ?? null;
}

export interface AnswerOutcome {
  state: SessionState;
  combo: number;
  multiplier: number;
  retryScheduled: boolean;
  firstTry: boolean;
}

export interface ApplyOptions {
  /** False when no other question is left for this idea (a round never asks the same question twice). */
  canRetry?: boolean;
  /** Most retries this round (long rounds allow more). */
  maxRetries?: number;
}

/** Apply a graded answer: update combo, schedule a similar-but-different retry if wrong. */
export function applyAnswer(s: SessionState, entry: SessionState['history'][number], xp: number, o: ApplyOptions = {}): AnswerOutcome {
  const at = s.queue[0] === entry.conceptId ? 0 : s.queue.indexOf(entry.conceptId);
  const queue = at < 0 ? s.queue.slice() : s.queue.filter((_, i) => i !== at);
  const facts = s.facts ? (at < 0 ? s.facts.slice() : s.facts.filter((_, i) => i !== at)) : undefined;
  const correct = entry.score >= PASS;
  const combo = correct ? s.combo + 1 : 0;
  const firstTry = !s.retryIds.includes(entry.conceptId);
  let retryIds = s.retryIds.filter((id) => id !== entry.conceptId);
  const retries = { ...s.retries };
  let total = s.total;
  let retryScheduled = false;

  // A missed concept comes back a little later in another form (not in a mock exam or a race against the clock).
  const retriesSoFar = Object.values(retries).reduce((a, b) => a + b, 0);
  if (!correct && o.canRetry !== false && (retries[entry.conceptId] ?? 0) < MAX_RETRIES_PER_CONCEPT && retriesSoFar < (o.maxRetries ?? MAX_RETRIES_PER_ROUND) && s.mode !== 'exam' && s.mode !== 'speed' && s.mode !== 'quest') {
    retries[entry.conceptId] = (retries[entry.conceptId] ?? 0) + 1;
    const gap = Math.min(RETRY_GAP, queue.length);
    queue.splice(gap, 0, entry.conceptId);
    facts?.splice(gap, 0, entry.fact ?? -1);
    retryIds = [...retryIds, entry.conceptId];
    total += 1;
    retryScheduled = true;
  }

  return {
    state: {
      ...s,
      queue,
      ...(facts ? { facts } : {}),
      total,
      answered: s.answered + 1,
      correct: s.correct + (correct ? 1 : 0),
      combo,
      bestCombo: Math.max(s.bestCombo, combo),
      xp: s.xp + xp,
      retries,
      retryIds,
      history: [...s.history, entry],
    },
    combo,
    multiplier: comboMultiplier(combo),
    retryScheduled,
    firstTry,
  };
}

export const isRetry = (s: SessionState, conceptId: string) => s.retryIds.includes(conceptId);

export function sessionDone(s: SessionState): boolean {
  return s.queue.length === 0 || s.endedReason !== undefined;
}
