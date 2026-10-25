import type { PublicQuestion } from '@lumo/core';

export type Mode = 'practice' | 'review' | 'challenge' | 'wrong_only' | 'exam' | 'speed' | 'boss';

export interface PublicSession {
  id: string;
  deckId: string;
  mode: Mode;
  answered: number;
  total: number;
  correct: number;
  combo: number;
  bestCombo: number;
  xp: number;
  hearts: number;
  done: boolean;
  endsAt?: number;
  /** Website game modes. */
  coins?: number;
  timeLimitMs?: number;
  points?: number;
  best?: number;
  boss?: { hp: number; max: number; shields: number };
  /** Chests waiting to be picked. */
  chests?: number;
  /** The current question is a lightning one: answer within this many ms for double XP. */
  lightning?: number;
  language?: 'en' | 'fr';
  /** The current question asks again about an idea missed earlier in the round. */
  retry?: boolean;
  /** A whole-deck round (one question per fact of the notes), and the topic of the current question. */
  full?: boolean;
  topic?: string;
  /** Lumo is still writing the questions left in this round. */
  waiting?: boolean;
}

export interface AnswerResult {
  score: number;
  correct: boolean;
  correctAnswer: string;
  explanation: string;
  itemResults?: Record<string, boolean>;
  matchedPoints?: string[];
  missingPoints?: string[];
  feedback?: string;
  xp: number;
  combo: number;
  multiplier: number;
  retryScheduled: boolean;
  mastered: boolean;
  /** Why the wrong option picked is wrong (multiple choice). */
  chosenNote?: string;
  points?: number;
  damage?: number;
  shield?: 'lost' | 'mended';
  /** A chest to pick was earned with this answer. */
  chest?: boolean;
  /** Coins a coin pet paid for this right answer. */
  petCoins?: number;
  /** A heart pet won a heart back. */
  petGift?: { kind: 'heart'; name: string; species: string };
  lightning?: boolean;
  /** A surprise gift dropped in (its id; tap it to open). */
  gift?: string;
  /** This answer was golden: double XP (from a surprise gift). */
  golden?: boolean;
  /** The idea mastered with this answer. */
  masteredTerm?: string;
  /** The last question of a topic in a whole-deck round: how that chapter went, and the next one. */
  topicDone?: { topic: string; right: number; total: number; next?: string };
  /** A missed idea, right on its second chance. */
  fixed?: boolean;
}

export interface MissedItem {
  prompt: string;
  context?: string;
  answer: string;
  explanation: string;
  note?: string;
}

export interface SessionSummary {
  mode?: Mode;
  stars?: number;
  points?: number;
  best?: number;
  newBest?: boolean;
  boss?: { hp: number; max: number; shields: number };
  chestsLeft?: number;
  missed?: MissedItem[];
  answered: number;
  correct: number;
  accuracy: number;
  xp: number;
  coins: number;
  bestCombo: number;
  streak: { days: number; extended: boolean };
  heartsGained: number;
  /** Coins the team's pets paid during the round (part of `coins`). */
  petCoins?: number;
  endedReason: 'done' | 'out_of_hearts' | 'time_up' | 'boss_defeated' | 'boss_escaped';
  concepts: { id: string; term: string; score: number; band: string }[];
}

export interface AnswerResponse {
  result: AnswerResult | null;
  followUp?: string;
  session: PublicSession;
  next: PublicQuestion | null;
  summary: SessionSummary | null;
}

export interface DeckListItem {
  id: string;
  title: string;
  subject: string;
  language: 'en' | 'fr';
  conceptCount: number;
  masteredCount: number;
  dueCount: number;
}

export interface MasteryItem {
  id: string;
  term: string;
  topic: string;
  kind: string;
  band: 'new' | 'learning' | 'familiar' | 'mastered';
  score: number;
  formatsPassed: number;
  due: boolean;
}

/** The deck you played last on this device (Home's "jump back in"). */
export function lastDeckId(): string | null {
  try {
    return localStorage.getItem('lumo:lastDeck');
  } catch {
    return null;
  }
}
export function rememberDeck(id: string) {
  try {
    localStorage.setItem('lumo:lastDeck', id);
  } catch {
    /* private mode: Home shows your first deck instead */
  }
}
