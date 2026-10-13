import type { PublicQuestion } from '@lumo/core';

export type Mode = 'practice' | 'review' | 'challenge' | 'wrong_only' | 'exam';

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
}

export interface SessionSummary {
  answered: number;
  correct: number;
  accuracy: number;
  xp: number;
  coins: number;
  bestCombo: number;
  streak: { days: number; extended: boolean };
  heartsGained: number;
  endedReason: 'done' | 'out_of_hearts';
  concepts: { id: string; term: string; score: number; band: string }[];
}

export interface AnswerResponse {
  result: AnswerResult;
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
