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
  history: { conceptId: string; format: Format; bloom: Bloom; score: number; variantKey: string }[];
  endedReason?: 'done' | 'out_of_hearts';
}

export const MAX_RETRIES_PER_CONCEPT = 2;
export const RETRY_GAP = 2; // ask the retry after this many other questions (spacing helps)

export function newSession(mode: SessionMode, conceptIds: string[]): SessionState {
  return { mode, queue: conceptIds.slice(), total: conceptIds.length, answered: 0, correct: 0, combo: 0, bestCombo: 0, xp: 0, retries: {}, retryIds: [], history: [] };
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

/** Apply a graded answer: update combo, schedule a similar-but-different retry if wrong. */
export function applyAnswer(s: SessionState, entry: SessionState['history'][number], xp: number): AnswerOutcome {
  const [head, ...rest] = s.queue;
  const queue = head === entry.conceptId ? rest : s.queue.filter((id, i) => !(id === entry.conceptId && i === s.queue.indexOf(entry.conceptId)));
  const correct = entry.score >= PASS;
  const combo = correct ? s.combo + 1 : 0;
  const firstTry = !s.retryIds.includes(entry.conceptId);
  let retryIds = s.retryIds.filter((id) => id !== entry.conceptId);
  const retries = { ...s.retries };
  let total = s.total;
  let retryScheduled = false;

  if (!correct && (retries[entry.conceptId] ?? 0) < MAX_RETRIES_PER_CONCEPT && s.mode !== 'exam') {
    retries[entry.conceptId] = (retries[entry.conceptId] ?? 0) + 1;
    queue.splice(Math.min(RETRY_GAP, queue.length), 0, entry.conceptId);
    retryIds = [...retryIds, entry.conceptId];
    total += 1;
    retryScheduled = true;
  }

  return {
    state: {
      ...s,
      queue,
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
