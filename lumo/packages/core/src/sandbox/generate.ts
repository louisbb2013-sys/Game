import { shuffle, type Rng } from '../rng';
import type { ConceptKind, Locale } from '../types';
import type { Concept } from '../quiz/concept';
import { generateLocal } from '../quiz/generate';
import { normalize } from '../quiz/text';
import type { Format } from '../types';
import type { CheckQ, CrosswordEntry, SandboxActivity, SandboxData, SandboxKind, VideoScene } from './types';

/** Offline generators for every Sandbox format. Claude can rewrite the scripts (video/podcast/story/mnemonics) for richer text. */

const KIND_EMOJI: Record<ConceptKind, string> = {
  definition: '💡',
  process: '⚙️',
  cause_effect: '🔁',
  formula: '🧮',
  comparison: '⚖️',
  date: '📅',
  vocabulary: '📖',
  classification: '🗂️',
  fact: '📌',
};

const WORD_EMOJI: [RegExp, string][] = [
  [/cell|cellule|nucle|noyau|mitochond|organel/i, '🔬'],
  [/plant|leaf|feuille|chloro|photosynth|stomat/i, '🌿'],
  [/water|eau|osmos|rain|pluie|ocean|cloud|nuage/i, '💧'],
  [/sun|soleil|light|lumi[eè]re|energy|énergie/i, '☀️'],
  [/heart|blood|sang|coeur|cœur/i, '❤️'],
  [/war|guerre|battle|bataille|king|roi|empire/i, '🏰'],
  [/planet|planète|star|étoile|space|espace|orbit/i, '🪐'],
  [/force|motion|mouvement|speed|vitesse|newton/i, '🚀'],
  [/atom|molecul|chemical|chimi|reaction|réaction/i, '⚗️'],
  [/number|nombre|fraction|equation|équation|algebra|algèbre/i, '➗'],
  [/money|argent|econom|price|prix|trade|commerce/i, '💰'],
  [/word|mot|verb|verbe|noun|nom|grammar|grammaire/i, '✍️'],
  [/earth|terre|rock|roche|volcan|earthquake|séisme/i, '🌋'],
  [/micro|magnif|grossissement|lens|lentille/i, '🔍'],
  [/divis|mitos|repro|gene|gène|dna|adn/i, '🧬'],
];

export function emojiFor(c: Concept): string {
  const hay = `${c.term} ${c.topic} ${c.summary}`;
  return WORD_EMOJI.find(([re]) => re.test(hay))?.[1] ?? KIND_EMOJI[c.kind] ?? '💡';
}

const S = {
  en: {
    videoTitle: (t: string) => `Let’s understand: ${t}`,
    videoIntro: (t: string, n: number) => `Hi! I’m Lumo. In the next few minutes we’ll explore ${t} — ${n} big ideas. Get ready to pause and think!`,
    ideaNarr: (term: string, sum: string) => `First, ${term}. ${sum}`,
    pointsHead: 'How it works',
    exampleHead: 'In real life',
    checkHead: 'Pause and predict!',
    checkNarr: 'Your turn! Pause and pick the answer before we continue.',
    recapHead: 'Recap',
    recapNarr: 'Great job! Let’s recap the big ideas.',
    whichDescribes: (s: string) => `Which idea is this? “${s}”`,
    trueOrFalse: (s: string) => `True or false: “${s}”`,
    tf: ['True', 'False'],
    podcastHosts: ['Lumo', 'Nova'] as [string, string],
    podIntro: (t: string) => `Welcome to Study Out Loud! I’m Lumo, and today with Nova we’re breaking down ${t}.`,
    podIntro2: 'Hi everyone! I always mix some of this up, so let’s go slowly.',
    podAsk: (term: string) => `Okay Lumo, explain ${term} like I’m twelve.`,
    podMore: 'Wait — why does that matter?',
    podExample: (e: string) => `Oh! So that’s why ${lowerFirst(e)}`,
    podMyth: (m: string) => `I used to think that ${lowerFirst(m)}`,
    podBust: (k: string) => `That’s a really common mix-up! Actually: ${k}`,
    podOutro: 'That’s a wrap! Quick challenge: explain one idea from today to someone at dinner tonight.',
    storyTitle: (t: string) => `The Mystery of ${t}`,
    storyOpen: (t: string) => `Detective Lumo’s flashlight flickers on. A strange case has arrived about ${t}, and only someone who truly understands it can solve it.`,
    storyChapter: (term: string, sum: string, e?: string) =>
      `The next clue is labelled “${term}”. Lumo reads it carefully: ${sum}${e ? ` The witness adds: “${e}”` : ''} To open the next door, you must prove you understand.`,
    storyEnd: 'The last door swings open. Case closed — and every clue makes sense now. You didn’t memorize the answer: you understood it.',
    crosswordClue: (s: string) => s,
    escapeIntro: (t: string) => `You wake up locked in the ${t} lab. The door has a code lock. Each room hides one digit — answer correctly to reveal it!`,
    escapeRoom: (n: number) => `Room ${n}`,
    escapeStory: ['A blinking screen shows a question.', 'A dusty notebook lies open on the desk.', 'A robot guard blocks the way and asks…', 'Glowing words appear on the wall.', 'A locked chest has a riddle carved on top.'],
    cheatTitle: (t: string) => `${t} — cheat sheet`,
    mnTitle: (t: string) => `Remember the ${t}`,
    mnTip: 'Say the sentence out loud 3 times, then try to rebuild the list without looking.',
    timelineTitle: (t: string) => `${t} — step by step`,
  },
  fr: {
    videoTitle: (t: string) => `Comprendre : ${t}`,
    videoIntro: (t: string, n: number) => `Salut ! Moi c’est Lumo. Dans quelques minutes, on explore ${t} — ${n} grandes idées. Prépare-toi à faire pause et réfléchir !`,
    ideaNarr: (term: string, sum: string) => `D’abord : ${term}. ${sum}`,
    pointsHead: 'Comment ça marche',
    exampleHead: 'Dans la vraie vie',
    checkHead: 'Pause : à toi de prédire !',
    checkNarr: 'À toi ! Fais pause et choisis la réponse avant qu’on continue.',
    recapHead: 'Récap',
    recapNarr: 'Bravo ! Récapitulons les grandes idées.',
    whichDescribes: (s: string) => `De quelle notion s’agit-il ? « ${s} »`,
    trueOrFalse: (s: string) => `Vrai ou faux : « ${s} »`,
    tf: ['Vrai', 'Faux'],
    podcastHosts: ['Lumo', 'Nova'] as [string, string],
    podIntro: (t: string) => `Bienvenue dans Révise à voix haute ! Je suis Lumo, et aujourd’hui avec Nova on décortique ${t}.`,
    podIntro2: 'Salut tout le monde ! Je mélange toujours un peu tout ça, alors on y va doucement.',
    podAsk: (term: string) => `Ok Lumo, explique-moi ${term} comme si j’avais douze ans.`,
    podMore: 'Attends — pourquoi c’est important ?',
    podExample: (e: string) => `Ah ! Donc c’est pour ça que ${lowerFirst(e)}`,
    podMyth: (m: string) => `Avant, je pensais que ${lowerFirst(m)}`,
    podBust: (k: string) => `C’est une erreur super fréquente ! En fait : ${k}`,
    podOutro: 'C’est tout pour aujourd’hui ! Petit défi : explique une idée d’aujourd’hui à quelqu’un ce soir au souper.',
    storyTitle: (t: string) => `Le mystère de ${t}`,
    storyOpen: (t: string) => `La lampe de l’inspecteur Lumo s’allume. Une drôle d’affaire est arrivée au sujet de ${t}, et seul quelqu’un qui comprend vraiment pourra la résoudre.`,
    storyChapter: (term: string, sum: string, e?: string) =>
      `Le prochain indice s’appelle « ${term} ». Lumo le lit attentivement : ${sum}${e ? ` Le témoin ajoute : « ${e} »` : ''} Pour ouvrir la porte suivante, prouve que tu as compris.`,
    storyEnd: 'La dernière porte s’ouvre. Affaire classée — et chaque indice a du sens maintenant. Tu n’as pas appris par cœur : tu as compris.',
    crosswordClue: (s: string) => s,
    escapeIntro: (t: string) => `Tu te réveilles enfermé dans le labo de ${t}. La porte a un cadenas à code. Chaque salle cache un chiffre — réponds juste pour le découvrir !`,
    escapeRoom: (n: number) => `Salle ${n}`,
    escapeStory: ['Un écran clignote et affiche une question.', 'Un vieux cahier est ouvert sur le bureau.', 'Un robot gardien te bloque le passage et demande…', 'Des mots lumineux apparaissent sur le mur.', 'Un coffre verrouillé porte une énigme gravée.'],
    cheatTitle: (t: string) => `${t} — fiche de révision`,
    mnTitle: (t: string) => `Retenir : ${t}`,
    mnTip: 'Dis la phrase à voix haute 3 fois, puis essaie de refaire la liste sans regarder.',
    timelineTitle: (t: string) => `${t} — étape par étape`,
  },
};

function lowerFirst(s: string) {
  return s && s[1] !== s[1]?.toUpperCase() ? s[0]!.toLowerCase() + s.slice(1) : s;
}
const pick = <T>(a: readonly T[], rng: Rng) => a[Math.floor(rng() * a.length)]!;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hideTerm = (s: string, c: Concept) =>
  [c.term, ...c.synonyms].filter(Boolean).reduce((acc, t) => acc.replace(new RegExp(`(?<![\\p{L}])${escapeRe(t)}(?![\\p{L}])`, 'giu'), '…'), s);

/** A multiple-choice check built from the deck (used inside videos, podcasts and stories). */
export function checkFor(c: Concept, deck: readonly Concept[], rng: Rng, lang: Locale): CheckQ {
  const others = shuffle(
    deck.filter((o) => o.id !== c.id && o.term.toLowerCase() !== c.term.toLowerCase()),
    rng,
  );
  const L = S[lang];
  if (others.length >= 2) {
    const options = shuffle([c.term, ...others.slice(0, 3).map((o) => o.term)], rng);
    return { prompt: L.whichDescribes(hideTerm(c.summary, c)), options, correctIndex: options.indexOf(c.term), explanation: `${c.term}: ${c.summary}` };
  }
  const useMyth = c.misconceptions.length > 0 && rng() < 0.5;
  const stmt = useMyth ? pick(c.misconceptions, rng) : pick(c.keyPoints.length ? c.keyPoints : [c.summary], rng);
  return { prompt: L.trueOrFalse(stmt), options: [...L.tf], correctIndex: useMyth ? 1 : 0, explanation: `${c.term}: ${c.summary}` };
}

export interface SandboxContext {
  deck: readonly Concept[];
  title: string;
  language: Locale;
  rng: Rng;
}

/** Which formats make sense for this material. */
export function sandboxSupports(kind: SandboxKind, deck: readonly Concept[]): boolean {
  const n = deck.length;
  switch (kind) {
    case 'crossword':
    case 'word_search':
      return deck.filter((c) => wordOf(c.term).length >= 3 && wordOf(c.term).length <= 13).length >= 3;
    case 'memory':
    case 'two_truths':
      return n >= 3;
    case 'quiz_show':
    case 'escape_room':
      return n >= 3;
    case 'timeline':
      return deck.some((c) => (c.steps?.length ?? 0) >= 3) || deck.filter((c) => c.date).length >= 3;
    case 'mnemonics':
      return deck.some((c) => (c.steps?.length ?? 0) >= 3 || (c.categories?.some((g) => g.items.length >= 3) ?? false)) || n >= 3;
    default:
      return n >= 1;
  }
}

export function generateSandbox(kind: SandboxKind, ctx: SandboxContext): SandboxActivity | null {
  if (!sandboxSupports(kind, ctx.deck)) return null;
  const data = build(kind, ctx);
  return data ? { kind, title: ctx.title, data } : null;
}

const wordOf = (term: string) => normalize(term).replace(/[^a-z]/g, '').toUpperCase();

function build(kind: SandboxKind, ctx: SandboxContext): SandboxData | null {
  const { rng, language: lang } = ctx;
  const L = S[lang];
  const deck = shuffle(ctx.deck, rng);

  switch (kind) {
    case 'video': {
      const focus = deck.slice(0, 5);
      const scenes: VideoScene[] = [{ type: 'title', heading: L.videoTitle(ctx.title), text: '', emoji: '🎬', narration: L.videoIntro(ctx.title, focus.length) }];
      focus.forEach((c, i) => {
        const emoji = emojiFor(c);
        scenes.push({ type: 'idea', heading: c.term, text: c.summary, emoji, narration: L.ideaNarr(c.term, c.summary) });
        const pts = (c.steps?.length ? c.steps : c.keyPoints).slice(0, 4);
        if (pts.length > 1) scenes.push({ type: 'points', heading: L.pointsHead, text: c.term, bullets: pts, emoji, narration: pts.join('. ') });
        if (c.examples[0]) scenes.push({ type: 'example', heading: L.exampleHead, text: c.examples[0], emoji: '🌍', narration: c.examples[0] });
        if (i % 2 === 1 || i === focus.length - 1) scenes.push({ type: 'check', heading: L.checkHead, text: '', emoji: '⏸️', narration: L.checkNarr, check: checkFor(c, ctx.deck, rng, lang) });
      });
      scenes.push({ type: 'recap', heading: L.recapHead, text: '', bullets: focus.map((c) => `${c.term} — ${c.summary}`), emoji: '✨', narration: L.recapNarr });
      return { kind, scenes };
    }

    case 'podcast': {
      const focus = deck.slice(0, 4);
      const lines: { host: 0 | 1; text: string }[] = [
        { host: 0, text: L.podIntro(ctx.title) },
        { host: 1, text: L.podIntro2 },
      ];
      const checks: { afterLine: number; q: CheckQ }[] = [];
      for (const c of focus) {
        lines.push({ host: 1, text: L.podAsk(c.term) });
        lines.push({ host: 0, text: c.summary });
        lines.push({ host: 1, text: L.podMore });
        lines.push({ host: 0, text: c.keyPoints.slice(0, 2).join(' ') || c.summary });
        if (c.misconceptions[0]) {
          lines.push({ host: 1, text: L.podMyth(c.misconceptions[0]) });
          lines.push({ host: 0, text: L.podBust(c.keyPoints[0] ?? c.summary) });
        } else if (c.examples[0]) {
          lines.push({ host: 1, text: L.podExample(c.examples[0]) });
        }
        checks.push({ afterLine: lines.length - 1, q: checkFor(c, ctx.deck, rng, lang) });
      }
      lines.push({ host: 0, text: L.podOutro });
      return { kind, hosts: L.podcastHosts, lines, checks };
    }

    case 'story': {
      const focus = deck.slice(0, 4);
      return {
        kind,
        title: L.storyTitle(ctx.title),
        chapters: [
          { emoji: '🔦', text: L.storyOpen(ctx.title), q: checkFor(focus[0]!, ctx.deck, rng, lang) },
          ...focus.slice(1).map((c) => ({ emoji: emojiFor(c), text: L.storyChapter(c.term, c.summary, c.examples[0]), q: checkFor(c, ctx.deck, rng, lang) })),
        ],
        ending: L.storyEnd,
      };
    }

    case 'crossword': {
      const words = deck
        .map((c) => ({ answer: wordOf(c.term), display: c.term, clue: hideTerm(c.summary, c) }))
        .filter((w) => w.answer.length >= 3 && w.answer.length <= 13);
      const entries = layoutCrossword(dedupe(words, (w) => w.answer).slice(0, 12), rng);
      if (entries.length < 3) return null;
      const width = Math.max(...entries.map((e) => e.col + (e.dir === 'across' ? e.answer.length : 1)));
      const height = Math.max(...entries.map((e) => e.row + (e.dir === 'down' ? e.answer.length : 1)));
      return { kind, width, height, entries };
    }

    case 'word_search': {
      const words = dedupe(
        deck.map((c) => ({ word: wordOf(c.term), display: c.term, clue: hideTerm(c.summary, c) })).filter((w) => w.word.length >= 3 && w.word.length <= 13),
        (w) => w.word,
      ).slice(0, 8);
      const size = Math.min(15, Math.max(10, ...words.map((w) => w.word.length + 1)));
      const grid = layoutWordSearch(words.map((w) => w.word), size, rng);
      if (!grid) return null;
      return { kind, size, grid: grid.grid, words: words.filter((w) => grid.placed.includes(w.word)) };
    }

    case 'memory': {
      const pairs = deck.slice(0, 8).map((c, i) => ({ id: `p${i}`, a: c.term, b: shorten(hideTerm(c.summary, c), 90) }));
      return { kind, pairs };
    }

    case 'scramble': {
      const items = deck
        .filter((c) => wordOf(c.term).length >= 4 && wordOf(c.term).length <= 14)
        .slice(0, 8)
        .map((c) => {
          const answer = wordOf(c.term);
          let scrambled = answer;
          for (let i = 0; i < 10 && scrambled === answer; i++) scrambled = shuffle([...answer], rng).join('');
          return { answer, scrambled, clue: hideTerm(c.summary, c) };
        });
      return items.length ? { kind, items } : null;
    }

    case 'quiz_show': {
      // Topics become categories; deeper questions are worth more (100 = recall … 400 = apply/analyze).
      const byTopic = groupBy(ctx.deck, (c) => c.topic);
      let cats = [...byTopic.entries()].map(([name, cs]) => ({ name, cs }));
      if (cats.length < 2) cats = chunk(deck, Math.ceil(deck.length / 3)).map((cs, i) => ({ name: `${lang === 'fr' ? 'Thème' : 'Round'} ${i + 1}`, cs }));
      const levels: [number, Format[], 'remember' | 'understand' | 'apply' | 'analyze'][] = [
        [100, ['multiple_choice', 'type_answer'], 'remember'],
        [200, ['multiple_choice', 'fill_blank', 'matching'], 'understand'],
        [300, ['cause_effect', 'multiple_select', 'ordering', 'spot_mistake'], 'understand'],
        [400, ['calculation', 'multiple_choice', 'categorize', 'spot_mistake'], 'apply'],
      ];
      const categories = cats.slice(0, 4).map(({ name, cs }) => ({
        name,
        cells: levels
          .map(([value, formats, bloom], i) => {
            const c = cs[i % cs.length]!;
            for (const f of shuffle(formats, rng)) {
              const q = generateLocal(c, f, bloom, { deck: ctx.deck, language: lang, rng });
              if (q) return { value, q };
            }
            const q = generateLocal(c, 'multiple_choice', bloom, { deck: ctx.deck, language: lang, rng }) ?? generateLocal(c, 'type_answer', 'remember', { deck: ctx.deck, language: lang, rng });
            return q ? { value, q } : null;
          })
          .filter((x): x is { value: number; q: NonNullable<ReturnType<typeof generateLocal>> } => !!x),
      }));
      return categories.some((c) => c.cells.length) ? { kind, categories } : null;
    }

    case 'escape_room': {
      const rooms = deck.slice(0, 4).map((c, i) => {
        const formats: Format[] = shuffle(['multiple_choice', 'type_answer', 'fill_blank', 'cause_effect', 'ordering', 'calculation', 'spot_mistake', 'matching'], rng);
        let q = null;
        for (const f of formats) if ((q = generateLocal(c, f, i < 2 ? 'understand' : 'apply', { deck: ctx.deck, language: lang, rng }))) break;
        return q ? { title: L.escapeRoom(i + 1), emoji: emojiFor(c), story: L.escapeStory[i % L.escapeStory.length]!, q, digit: Math.floor(rng() * 10) } : null;
      });
      const ok = rooms.filter((r): r is NonNullable<typeof r> => !!r);
      if (ok.length < 3) return null;
      return { kind, intro: L.escapeIntro(ctx.title), rooms: ok, code: ok.map((r) => r.digit).join(''), minutes: 10 };
    }

    case 'speed_round': {
      const items = shuffle(
        ctx.deck.flatMap((c) => [
          ...c.keyPoints.slice(0, 2).map((k) => ({ statement: k, isTrue: true, explanation: c.summary })),
          ...c.misconceptions.slice(0, 2).map((m) => ({ statement: m, isTrue: false, explanation: `${c.term}: ${c.summary}` })),
        ]),
        rng,
      ).slice(0, 30);
      return items.length >= 5 ? { kind, seconds: 60, items } : null;
    }

    case 'two_truths': {
      const rounds = deck
        .map((c) => {
          const truths = c.keyPoints.slice(0, 2);
          const other = deck.find((o) => o.id !== c.id && o.misconceptions.length);
          const lie = c.misconceptions[0] ?? other?.misconceptions[0];
          if (truths.length < 2 || !lie) return null;
          const statements = shuffle([...truths, lie], rng);
          return { term: c.term, statements, lieIndex: statements.indexOf(lie), explanation: `${c.term}: ${c.summary}` };
        })
        .filter((r): r is NonNullable<typeof r> => !!r)
        .slice(0, 6);
      return rounds.length ? { kind, rounds } : null;
    }

    case 'flashcards':
      return { kind, cards: ctx.deck.map((c) => ({ front: c.term, back: c.summary, hint: c.examples[0] ?? c.keyPoints[0] })) };

    case 'mind_map': {
      const byTopic = groupBy(ctx.deck, (c) => c.topic);
      return {
        kind,
        center: ctx.title,
        branches: [...byTopic].slice(0, 6).map(([topic, cs]) => ({ topic, nodes: cs.slice(0, 5).map((c) => ({ term: c.term, summary: c.summary })) })),
      };
    }

    case 'cheat_sheet': {
      const byTopic = groupBy(ctx.deck, (c) => c.topic);
      return {
        kind,
        title: L.cheatTitle(ctx.title),
        sections: [...byTopic].map(([topic, cs]) => ({
          topic,
          items: cs.map((c) => ({
            term: c.term,
            summary: c.summary,
            points: (c.steps ?? c.keyPoints).filter((k) => k !== c.summary).slice(0, 3),
            formula: c.formula ? `${c.formula.result.symbol} = ${c.formula.expression}` : undefined,
          })),
        })),
      };
    }

    case 'mnemonics': {
      const lists: { title: string; list: string[] }[] = [];
      for (const c of ctx.deck) {
        if ((c.steps?.length ?? 0) >= 3) lists.push({ title: c.term, list: c.steps! });
        for (const g of c.categories ?? []) if (g.items.length >= 3) lists.push({ title: g.name, list: g.items });
      }
      if (lists.length === 0) lists.push({ title: ctx.title, list: ctx.deck.slice(0, 6).map((c) => c.term) });
      return {
        kind,
        items: lists.slice(0, 4).map((l) => {
          const firsts = l.list.map((x) => firstLetter(x));
          return { title: L.mnTitle(l.title), list: l.list, acronym: firsts.join(''), sentence: mnemonicSentence(firsts, lang, rng), tip: L.mnTip };
        }),
      };
    }

    case 'timeline': {
      const proc = ctx.deck.find((c) => (c.steps?.length ?? 0) >= 3);
      if (proc) return { kind, title: L.timelineTitle(proc.term), events: proc.steps!.map((s, i) => ({ label: `${i + 1}`, detail: s })) };
      const dated = ctx.deck.filter((c) => c.date).sort((a, b) => (a.date! < b.date! ? -1 : 1));
      return { kind, title: L.timelineTitle(ctx.title), events: dated.map((c) => ({ label: c.date!, detail: `${c.term} — ${c.summary}` })) };
    }
  }
}

// ---------- helpers ----------

function dedupe<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
}
function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}
function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += Math.max(1, n)) out.push(xs.slice(i, i + n));
  return out;
}
function shorten(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}
function firstLetter(s: string) {
  return normalize(s).replace(/[^a-z]/g, '')[0]?.toUpperCase() ?? '?';
}

const WORDS: Record<Locale, Record<string, string[]>> = {
  en: {
    A: ['Always', 'Angry', 'Awesome'], B: ['Big', 'Brave', 'Bouncy'], C: ['Cats', 'Clever', 'Crazy'], D: ['Dogs', 'Dance', 'Dragons'], E: ['Eat', 'Every', 'Eagles'],
    F: ['Funny', 'Fly', 'Frogs'], G: ['Giant', 'Green', 'Giraffes'], H: ['Happy', 'Hungry', 'Hippos'], I: ['In', 'Icy', 'Igloos'], J: ['Jump', 'Jolly', 'Jellyfish'],
    K: ['Kind', 'Kings', 'Kick'], L: ['Lazy', 'Little', 'Llamas'], M: ['Many', 'Monkeys', 'Make'], N: ['Never', 'Noisy', 'Ninjas'], O: ['Only', 'Orange', 'Owls'],
    P: ['Purple', 'Pandas', 'Play'], Q: ['Quiet', 'Queens', 'Quickly'], R: ['Run', 'Red', 'Robots'], S: ['Silly', 'Sing', 'Snakes'], T: ['Tiny', 'Tigers', 'Talk'],
    U: ['Under', 'Unicorns', 'Use'], V: ['Very', 'Violet', 'Vans'], W: ['Wild', 'Whales', 'Wear'], X: ['Xylophones', 'X-rays'], Y: ['Yellow', 'Yaks', 'Yell'], Z: ['Zebras', 'Zoom', 'Zany'],
  },
  fr: {
    A: ['Avec', 'Ananas', 'Adorables'], B: ['Belles', 'Baleines', 'Bougent'], C: ['Chats', 'Chantent', 'Cinq'], D: ['Dix', 'Dragons', 'Dansent'], E: ['Elles', 'Éléphants', 'Encore'],
    F: ['Fous', 'Font', 'Fourmis'], G: ['Grands', 'Girafes', 'Gentiment'], H: ['Hiboux', 'Heureux', 'Hier'], I: ['Ils', 'Immenses', 'Ici'], J: ['Jolis', 'Jouent', 'Jaunes'],
    K: ['Koalas', 'Kangourous'], L: ['Lions', 'Lentement', 'Les'], M: ['Mon', 'Mangent', 'Moutons'], N: ['Neuf', 'Nagent', 'Noirs'], O: ['Ours', 'Oublient', 'Oranges'],
    P: ['Petits', 'Pingouins', 'Partent'], Q: ['Quatre', 'Quand'], R: ['Rouges', 'Renards', 'Rient'], S: ['Six', 'Singes', 'Sautent'], T: ['Tous', 'Tigres', 'Tournent'],
    U: ['Un', 'Unis'], V: ['Verts', 'Vont', 'Vaches'], W: ['Wapitis'], X: ['Xylophones'], Y: ['Yaks'], Z: ['Zèbres', 'Zigzaguent'],
  },
};

function mnemonicSentence(letters: string[], lang: Locale, rng: Rng): string {
  return letters.map((l) => pick(WORDS[lang][l] ?? [l], rng)).join(' ');
}

// ---------- crossword layout ----------

type Cell = string | null;

function layoutCrossword(words: { answer: string; display: string; clue: string }[], rng: Rng): CrosswordEntry[] {
  const N = 30;
  const grid: Cell[][] = Array.from({ length: N }, () => Array<Cell>(N).fill(null));
  const placed: Omit<CrosswordEntry, 'number'>[] = [];
  const sorted = words.slice().sort((a, b) => b.answer.length - a.answer.length || rng() - 0.5);

  const fits = (w: string, r: number, c: number, dir: 'across' | 'down'): number => {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    const endR = r + dr * (w.length - 1);
    const endC = c + dc * (w.length - 1);
    if (r < 0 || c < 0 || endR >= N || endC >= N) return -1;
    // cells just before and after must be empty
    if (grid[r - dr]?.[c - dc]) return -1;
    if (grid[endR + dr]?.[endC + dc]) return -1;
    let crossings = 0;
    for (let i = 0; i < w.length; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const cur = grid[rr]![cc];
      if (cur) {
        if (cur !== w[i]) return -1;
        crossings++;
      } else {
        // no side-by-side neighbours for new letters
        const n1 = dir === 'across' ? grid[rr - 1]?.[cc] : grid[rr]?.[cc - 1];
        const n2 = dir === 'across' ? grid[rr + 1]?.[cc] : grid[rr]?.[cc + 1];
        if (n1 || n2) return -1;
      }
    }
    return crossings;
  };
  const put = (w: (typeof words)[number], r: number, c: number, dir: 'across' | 'down') => {
    for (let i = 0; i < w.answer.length; i++) grid[r + (dir === 'down' ? i : 0)]![c + (dir === 'across' ? i : 0)] = w.answer[i]!;
    placed.push({ answer: w.answer, display: w.display, clue: w.clue, row: r, col: c, dir });
  };

  for (const w of sorted) {
    if (placed.length === 0) {
      put(w, Math.floor(N / 2), Math.floor((N - w.answer.length) / 2), 'across');
      continue;
    }
    let best: { r: number; c: number; dir: 'across' | 'down'; score: number } | null = null;
    for (const p of placed) {
      for (let i = 0; i < p.answer.length; i++) {
        for (let j = 0; j < w.answer.length; j++) {
          if (p.answer[i] !== w.answer[j]) continue;
          const dir = p.dir === 'across' ? 'down' : 'across';
          const r = p.dir === 'across' ? p.row - j : p.row + i;
          const c = p.dir === 'across' ? p.col + i : p.col - j;
          const score = fits(w.answer, r, c, dir);
          if (score > 0 && (!best || score + rng() * 0.5 > best.score)) best = { r, c, dir, score };
        }
      }
    }
    if (best) put(w, best.r, best.c, best.dir);
  }

  // Crop and number like a real crossword (left-to-right, top-to-bottom).
  const minR = Math.min(...placed.map((p) => p.row));
  const minC = Math.min(...placed.map((p) => p.col));
  const shifted = placed.map((p) => ({ ...p, row: p.row - minR, col: p.col - minC }));
  const starts = [...new Set(shifted.map((p) => `${p.row},${p.col}`))].sort((a, b) => {
    const [ar, ac] = a.split(',').map(Number);
    const [br, bc] = b.split(',').map(Number);
    return ar! - br! || ac! - bc!;
  });
  return shifted.map((p) => ({ ...p, number: starts.indexOf(`${p.row},${p.col}`) + 1 }));
}

// ---------- word search layout ----------

function layoutWordSearch(words: string[], size: number, rng: Rng): { grid: string[]; placed: string[] } | null {
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1],
  ];
  const placed: string[] = [];
  for (const w of words.slice().sort((a, b) => b.length - a.length)) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const [dr, dc] = pick(dirs, rng) as [number, number];
      const word = rng() < 0.2 ? [...w].reverse().join('') : w; // a few backwards for challenge
      const r0 = Math.floor(rng() * size);
      const c0 = Math.floor(rng() * size);
      const r1 = r0 + dr * (word.length - 1);
      const c1 = c0 + dc * (word.length - 1);
      if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;
      let ok = true;
      for (let i = 0; i < word.length && ok; i++) {
        const cur = grid[r0 + dr * i]![c0 + dc * i];
        if (cur && cur !== word[i]) ok = false;
      }
      if (!ok) continue;
      for (let i = 0; i < word.length; i++) grid[r0 + dr * i]![c0 + dc * i] = word[i]!;
      placed.push(w);
      break;
    }
  }
  if (placed.length < 3) return null;
  const letters = placed.join('');
  return { grid: grid.map((row) => row.map((ch) => ch ?? letters[Math.floor(rng() * letters.length)]!).join('')), placed };
}
