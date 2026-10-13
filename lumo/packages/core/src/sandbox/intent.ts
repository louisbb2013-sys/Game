import type { Concept } from '../quiz/concept';
import { normalize } from '../quiz/text';
import type { SandboxKind } from './types';

/** Keywords (EN + FR, accents removed) that name a Sandbox format. Longest matches win. */
const KEYWORDS: [SandboxKind, string[]][] = [
  ['video', ['video', 'explainer', 'animation', 'animated', 'watch', 'film', 'clip', 'regarder', 'dessin anime']],
  ['podcast', ['podcast', 'listen', 'audio', 'radio', 'ecouter', 'balado']],
  ['story', ['story', 'comic', 'tale', 'adventure', 'histoire', 'conte', 'bd', 'bande dessinee', 'aventure', 'recit']],
  ['crossword', ['crossword', 'cross word', 'mots croises', 'mot croise']],
  ['word_search', ['word search', 'wordsearch', 'find the words', 'word find', 'mots caches', 'mots meles', 'mot cache']],
  ['memory', ['memory', 'match game', 'matching game', 'pairs', 'pair game', 'concentration', 'paires', 'jeu de memoire']],
  ['scramble', ['scramble', 'anagram', 'hangman', 'unscramble', 'jumble', 'pendu', 'anagramme', 'melange', 'lettres melangees']],
  ['quiz_show', ['jeopardy', 'game show', 'quiz show', 'gameshow', 'trivia', 'jeu televise', 'jeu tele', 'questionnaire jeu']],
  ['escape_room', ['escape', 'escape room', 'locked room', 'evasion', 'salle d evasion', 'jeu d evasion']],
  ['speed_round', ['speed', 'speed round', 'timed', 'rapid', 'fast', 'race', 'blitz', 'chrono', 'rapide', 'course contre la montre', 'eclair']],
  ['two_truths', ['two truths', 'truths and a lie', 'spot the lie', 'deux verites', 'mensonge', 'trouve le mensonge']],
  ['flashcards', ['flashcard', 'flash card', 'flash cards', 'cards', 'cartes', 'cartes memoire', 'fiches cartes']],
  ['mind_map', ['mind map', 'mindmap', 'concept map', 'map', 'diagram', 'carte mentale', 'carte conceptuelle', 'schema']],
  ['cheat_sheet', ['cheat sheet', 'cheatsheet', 'summary', 'study sheet', 'revision sheet', 'notes', 'one pager', 'resume', 'fiche', 'fiche de revision', 'synthese', 'aide memoire']],
  ['mnemonics', ['mnemonic', 'mnemonics', 'memory trick', 'acronym', 'rhyme', 'song', 'rap', 'moyen mnemotechnique', 'mnemotechnique', 'acronyme', 'chanson', 'truc pour retenir']],
  ['timeline', ['timeline', 'time line', 'sequence', 'order of events', 'chronology', 'chronologie', 'frise', 'ligne du temps', 'etapes']],
];

export interface SandboxIntent {
  kind: SandboxKind | null;
  /** Concept ids the request seems to be about (empty = whole deck). */
  focus: string[];
}

export function parseSandboxRequest(text: string, deck: readonly Concept[] = []): SandboxIntent {
  const t = ` ${normalize(text)} `;
  let best: { kind: SandboxKind; len: number } | null = null;
  for (const [kind, words] of KEYWORDS) {
    for (const w of words) {
      if (t.includes(` ${w} `) || t.includes(` ${w}s `)) {
        if (!best || w.length > best.len) best = { kind, len: w.length };
      }
    }
  }
  const focus = deck
    .filter((c) => {
      const term = normalize(c.term);
      const topic = normalize(c.topic);
      return (term.length >= 3 && t.includes(` ${term} `)) || (topic.length >= 4 && t.includes(topic));
    })
    .map((c) => c.id);
  return { kind: best?.kind ?? null, focus };
}
