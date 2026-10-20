import type { Format } from '@lumo/core';
import { api } from '../lib/api';

/**
 * What Lumo knows about the learner, for Claude's prompts: what they told Lumo (their class, their
 * book, what's hard, what they like) and how they like to study. Kept short; it fits the questions,
 * examples and explanations to them and is never repeated back.
 */

export interface StudyPrefs {
  explain: 'short' | 'normal' | 'detailed';
  level: 'auto' | 'easier' | 'harder';
  adapt: boolean;
}
export interface MemoryView {
  notes: { id: string; text: string; at: number }[];
  prefs: StudyPrefs;
  noticed: {
    answered: number;
    accuracy: number | null;
    weakFormats: { format: Format; accuracy: number; n: number }[];
    strongFormats: { format: Format; accuracy: number; n: number }[];
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | null;
    subjects: string[];
    weakIdeas: string[];
  };
  suggestions: string[];
}

let cached: { at: number; v: MemoryView } | null = null;
export async function loadMemory(fresh = false): Promise<MemoryView | null> {
  if (!fresh && cached && Date.now() - cached.at < 20_000) return cached.v;
  try {
    const v = await api<MemoryView>('/api/local/memory');
    cached = { at: Date.now(), v };
    return v;
  } catch {
    return null;
  }
}
export const forgetMemoryCache = () => {
  cached = null;
};

const FORMAT_NAMES: Partial<Record<Format, string>> = {
  multiple_choice: 'multiple choice',
  true_false: 'true/false',
  type_answer: 'short typed answers',
  fill_blank: 'fill in the blank',
  explain: 'written explanations',
  apply: 'applying ideas to new situations',
  compare: 'comparing ideas',
  ordering: 'putting steps in order',
  matching: 'matching',
};

/** A short "about this student" paragraph for a prompt ('' when Lumo knows nothing yet). */
export async function aboutLearner(): Promise<string> {
  const m = await loadMemory();
  if (!m) return '';
  const lines: string[] = [];
  if (m.notes.length) lines.push(`What the student told Lumo about themselves (their class, books, level, interests):\n${m.notes.map((n) => `- ${n.text}`).join('\n').slice(0, 1500)}`);
  if (m.prefs.adapt) {
    const weak = m.noticed.weakFormats.map((f) => FORMAT_NAMES[f.format] ?? f.format.replace(/_/g, ' '));
    if (weak.length) lines.push(`They find these harder, so practise them a little more: ${weak.join(', ')}.`);
    if (m.noticed.accuracy !== null && m.noticed.accuracy >= 0.85) lines.push('They have been getting most questions right lately: lean towards deeper application questions.');
    if (m.noticed.accuracy !== null && m.noticed.accuracy < 0.5) lines.push('They have found recent questions hard: build up gently, with very clear wording.');
  }
  if (m.prefs.level === 'easier') lines.push('They asked for easier questions.');
  if (m.prefs.level === 'harder') lines.push('They asked for harder, more challenging questions.');
  if (m.prefs.explain === 'short') lines.push('Keep explanations very short and simple.');
  if (m.prefs.explain === 'detailed') lines.push('They like detailed explanations with an example.');
  if (!lines.length) return '';
  return `\nAbout this student (use it to fit the content: their level, their course and book, examples from what they like; never mention or repeat it):\n${lines.join('\n')}\n`;
}

/** How long Lumo's explanations should be for this learner. */
export async function explainStyle(): Promise<StudyPrefs['explain']> {
  return (await loadMemory())?.prefs.explain ?? 'normal';
}
