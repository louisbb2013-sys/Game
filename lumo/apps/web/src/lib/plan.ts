import { questionsFor, type PlanDay } from '@lumo/core';
import { api } from './api';

/** Start the session that matches a plan day: a mock exam, fixing weak spots, reviewing, or learning. */
export async function startPlanDay(deckId: string, day: PlanDay) {
  const kinds = day.tasks.map((t) => t.kind);
  const mode = kinds.includes('mock_exam') ? 'exam' : kinds.every((k) => k === 'review') ? 'review' : kinds.every((k) => k === 'fix') ? 'wrong_only' : 'practice';
  const length = mode === 'exam' ? 15 : questionsFor(day);
  return api<{ session: { id: string } }>(`/api/decks/${deckId}/sessions`, { method: 'POST', body: { mode, length } });
}
