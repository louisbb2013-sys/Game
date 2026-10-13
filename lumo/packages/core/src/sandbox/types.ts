import type { Question } from '../quiz/question';

export const SANDBOX_KINDS = [
  'video',
  'podcast',
  'story',
  'crossword',
  'word_search',
  'memory',
  'scramble',
  'quiz_show',
  'escape_room',
  'speed_round',
  'two_truths',
  'flashcards',
  'mind_map',
  'cheat_sheet',
  'mnemonics',
  'timeline',
] as const;
export type SandboxKind = (typeof SANDBOX_KINDS)[number];

/** How the Sandbox groups formats on screen. */
export const SANDBOX_GROUPS: Record<'watch' | 'play' | 'make', SandboxKind[]> = {
  watch: ['video', 'podcast', 'story'],
  play: ['quiz_show', 'escape_room', 'crossword', 'word_search', 'memory', 'scramble', 'speed_round', 'two_truths'],
  make: ['flashcards', 'mind_map', 'cheat_sheet', 'mnemonics', 'timeline'],
};

export const SANDBOX_EMOJI: Record<SandboxKind, string> = {
  video: '🎬',
  podcast: '🎧',
  story: '📖',
  crossword: '✏️',
  word_search: '🔎',
  memory: '🃏',
  scramble: '🔤',
  quiz_show: '🏆',
  escape_room: '🔐',
  speed_round: '⚡',
  two_truths: '🕵️',
  flashcards: '🗂️',
  mind_map: '🧠',
  cheat_sheet: '📝',
  mnemonics: '🎵',
  timeline: '🧭',
};

/** Max XP one activity can give (server-side cap; games are played on the device). */
export const SANDBOX_XP: Record<SandboxKind, number> = {
  video: 25,
  podcast: 25,
  story: 25,
  crossword: 35,
  word_search: 20,
  memory: 20,
  scramble: 25,
  quiz_show: 45,
  escape_room: 45,
  speed_round: 30,
  two_truths: 30,
  flashcards: 25,
  mind_map: 20,
  cheat_sheet: 15,
  mnemonics: 20,
  timeline: 25,
};

/** A quick "pause and check" question inside watch/listen formats (retrieval, not just viewing). */
export interface CheckQ {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface VideoScene {
  type: 'title' | 'idea' | 'points' | 'example' | 'check' | 'recap';
  heading: string;
  text: string;
  bullets?: string[];
  emoji: string;
  narration: string;
  check?: CheckQ;
}

export type SandboxData =
  | { kind: 'video'; scenes: VideoScene[] }
  | { kind: 'podcast'; hosts: [string, string]; lines: { host: 0 | 1; text: string }[]; checks: { afterLine: number; q: CheckQ }[] }
  | { kind: 'story'; title: string; chapters: { emoji: string; text: string; q: CheckQ }[]; ending: string }
  | { kind: 'crossword'; width: number; height: number; entries: CrosswordEntry[] }
  | { kind: 'word_search'; size: number; grid: string[]; words: { word: string; display: string; clue: string }[] }
  | { kind: 'memory'; pairs: { id: string; a: string; b: string }[] }
  | { kind: 'scramble'; items: { answer: string; scrambled: string; clue: string }[] }
  | { kind: 'quiz_show'; categories: { name: string; cells: { value: number; q: Question }[] }[] }
  | { kind: 'escape_room'; intro: string; rooms: { title: string; emoji: string; story: string; q: Question; digit: number }[]; code: string; minutes: number }
  | { kind: 'speed_round'; seconds: number; items: { statement: string; isTrue: boolean; explanation: string }[] }
  | { kind: 'two_truths'; rounds: { term: string; statements: string[]; lieIndex: number; explanation: string }[] }
  | { kind: 'flashcards'; cards: { front: string; back: string; hint?: string }[] }
  | { kind: 'mind_map'; center: string; branches: { topic: string; nodes: { term: string; summary: string }[] }[] }
  | { kind: 'cheat_sheet'; title: string; sections: { topic: string; items: { term: string; summary: string; points: string[]; formula?: string }[] }[] }
  | { kind: 'mnemonics'; items: { title: string; list: string[]; acronym: string; sentence: string; tip: string }[] }
  | { kind: 'timeline'; title: string; events: { label: string; detail: string }[] };

export interface CrosswordEntry {
  number: number;
  answer: string; // A-Z only
  display: string; // original term
  clue: string;
  row: number;
  col: number;
  dir: 'across' | 'down';
}

export interface SandboxActivity {
  kind: SandboxKind;
  title: string;
  data: SandboxData;
}
