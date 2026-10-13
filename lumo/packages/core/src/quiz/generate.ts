import { shuffle, type Rng } from '../rng';
import type { Bloom, Format, Locale } from '../types';
import type { Concept } from './concept';
import { evaluate } from './expr';
import { nearestBloom, supportsFormat } from './formats';
import { computeVariantKey, formatNumber, type Opt, type Question } from './question';

/**
 * Offline question generator. Builds a fresh variant from a concept with seeded
 * randomness: different templates, option order, distractors and numbers each time.
 * Used when no AI is configured, offline, and as a fallback if AI output is invalid.
 */

type Tpl = Record<Locale, string[]>;

const T = {
  mcTerm: { en: ['Which term matches this description?\n“{summary}”', 'What is being described here?\n“{summary}”', 'Your notes describe this: “{summary}” — what is it called?'], fr: ['Quel terme correspond à cette description ?\n« {summary} »', 'De quoi parle-t-on ici ?\n« {summary} »', 'Tes notes décrivent ceci : « {summary} » — comment ça s’appelle ?'] },
  mcDef: { en: ['What best describes {term}?', 'Which statement explains {term} correctly?', 'A classmate asks you what {term} is. Which answer is right?'], fr: ['Qu’est-ce qui décrit le mieux : {term} ?', 'Quel énoncé explique correctement : {term} ?', 'Un ami te demande ce qu’est {term}. Quelle réponse est la bonne ?'] },
  mcTrue: { en: ['Which statement about {term} is true?', 'Only one of these is correct about {term}. Which one?'], fr: ['Quel énoncé sur {term} est vrai ?', 'Un seul de ces énoncés sur {term} est correct. Lequel ?'] },
  mcExample: { en: ['Which example best illustrates {term}?', 'Which real-life situation is an example of {term}?'], fr: ['Quel exemple illustre le mieux : {term} ?', 'Quelle situation de la vie réelle est un exemple de {term} ?'] },
  multi: { en: ['Select ALL the statements that are true about {term}.', 'Which of these are correct about {term}? (choose all that apply)'], fr: ['Sélectionne TOUS les énoncés vrais sur {term}.', 'Lesquels sont corrects à propos de {term} ? (plusieurs réponses)'] },
  type: { en: ['Type the term: “{summary}”', 'Which word or term is this? “{summary}”', 'Name it: “{summary}”'], fr: ['Écris le terme : « {summary} »', 'Quel mot ou terme est-ce ? « {summary} »', 'Nomme-le : « {summary} »'] },
  typeExample: { en: ['“{example}” — this is an example of what?'], fr: ['« {example} » — c’est un exemple de quoi ?'] },
  fill: { en: ['Fill in the blank.', 'Complete the sentence.'], fr: ['Complète le trou.', 'Complète la phrase.'] },
  explain: { en: ['Explain {term} in your own words, as if to a friend who missed class.', 'In your own words: what is {term}, and why does it matter?', 'Explain how {term} works. Use your own words, not the textbook’s.'], fr: ['Explique {term} dans tes mots, comme à un ami qui a manqué le cours.', 'Dans tes mots : qu’est-ce que {term}, et pourquoi c’est important ?', 'Explique comment fonctionne {term}. Avec tes propres mots, pas ceux du manuel.'] },
  explainDeep: { en: ['Why is {term} important? Explain the reasoning, not just the definition.', 'What would go wrong without {term}? Explain why.'], fr: ['Pourquoi {term} est-il important ? Explique le raisonnement, pas juste la définition.', 'Que se passerait-il sans {term} ? Explique pourquoi.'] },
  tf: { en: ['True or false? Then explain why.'], fr: ['Vrai ou faux ? Puis explique pourquoi.'] },
  matching: { en: ['Match each term with its description.', 'Connect each idea to what it means.'], fr: ['Associe chaque terme à sa description.', 'Relie chaque idée à ce qu’elle veut dire.'] },
  ordering: { en: ['Put the steps of {term} in the right order.', 'What is the correct sequence for {term}?'], fr: ['Remets les étapes de {term} dans le bon ordre.', 'Quelle est la bonne séquence pour {term} ?'] },
  categorize: { en: ['Sort each item into the right group.', 'Drag each item into its category.'], fr: ['Classe chaque élément dans le bon groupe.', 'Glisse chaque élément dans sa catégorie.'] },
  label: { en: ['Label the diagram.'], fr: ['Identifie les parties du schéma.'] },
  mistake: { en: ['Spot the mistake: tap the wrong part, then fix it.', 'Something in this statement is wrong. Find it and correct it.'], fr: ['Trouve l’erreur : touche la partie fausse, puis corrige-la.', 'Quelque chose cloche dans cet énoncé. Trouve-le et corrige-le.'] },
  mistakeSteps: { en: ['A student wrote these steps of {term}. Find the step that is in the wrong place, and type the step that should be there.'], fr: ['Un élève a écrit ces étapes de {term}. Trouve l’étape mal placée et écris celle qui devrait être là.'] },
  causeFwd: { en: ['What happens if {cause}?', 'Scenario: {cause}. What is the most likely result?'], fr: ['Que se passe-t-il si {cause} ?', 'Situation : {cause}. Quel est le résultat le plus probable ?'] },
  causeBack: { en: ['What could cause this: {effect}?', 'You observe that {effect}. What is the most likely cause?'], fr: ['Qu’est-ce qui peut causer ceci : {effect} ?', 'Tu observes que {effect}. Quelle est la cause la plus probable ?'] },
  apply: { en: ['Here is a situation: “{example}”. Use what you know about {term} to explain what is going on.', 'Real-life case: “{example}”. How does {term} explain this? Be specific.'], fr: ['Voici une situation : « {example} ». Utilise ce que tu sais sur {term} pour expliquer ce qui se passe.', 'Cas réel : « {example} ». Comment {term} explique-t-il cela ? Sois précis.'] },
  calc: { en: ['Calculate {result} ({resultSymbol}).', 'Find {result}. Show your work if you like.', 'Use the formula for {term} to find {result}.'], fr: ['Calcule {result} ({resultSymbol}).', 'Trouve {result}. Tu peux montrer ta démarche.', 'Utilise la formule de {term} pour trouver {result}.'] },
  compare: { en: ['Compare {term} and {other}: give at least one similarity and one difference.', 'How are {term} and {other} alike, and how are they different?'], fr: ['Compare {term} et {other} : donne au moins une ressemblance et une différence.', 'En quoi {term} et {other} se ressemblent-ils, et en quoi diffèrent-ils ?'] },
  teach: { en: ['Teach me about {term}! I’m Lumo and I’ve never heard of it. Explain it simply.', 'Pretend I’m a younger student. Teach me {term} so I really get it.'], fr: ['Explique-moi {term} ! Je suis Lumo et je n’en ai jamais entendu parler. Explique simplement.', 'Imagine que je suis plus jeune que toi. Enseigne-moi {term} pour que je comprenne vraiment.'] },
  why: { en: ['{term}: {summary}', 'Remember: {summary}'], fr: ['{term} : {summary}', 'À retenir : {summary}'] },
  stepsExplain: { en: ['The order is: {steps}.'], fr: ['L’ordre est : {steps}.'] },
  calcSteps: { en: ['Formula: {formula}', 'Substitute: {sub}', 'Result: {res}'], fr: ['Formule : {formula}', 'On remplace : {sub}', 'Résultat : {res}'] },
} satisfies Record<string, Tpl>;

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

function pick<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export interface GenerateContext {
  deck: readonly Concept[];
  language: Locale;
  rng: Rng;
  idPrefix?: string;
}

export function makeId(rng: Rng, prefix = ''): string {
  return prefix + Math.floor(rng() * 2 ** 32).toString(36) + Math.floor(rng() * 2 ** 32).toString(36);
}

function opts(texts: string[], rng: Rng): Opt[] {
  return shuffle(
    texts.map((text) => ({ id: makeId(rng, 'o'), text })),
    rng,
  );
}

/** Unique non-empty strings not equal (case-insensitively) to any in `exclude`. */
function distinct(cands: readonly string[], exclude: readonly string[]): string[] {
  const seen = new Set(exclude.map((s) => s.trim().toLowerCase()));
  const out: string[] = [];
  for (const c of cands) {
    const k = c.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(c.trim());
    }
  }
  return out;
}

function why(c: Concept, lang: Locale, rng: Rng): string {
  return fill(pick(T.why[lang], rng), { term: c.term, summary: c.summary });
}

type Draft = Question extends infer Q ? (Q extends Question ? Omit<Q, 'id' | 'variantKey'> : never) : never;

export function generateLocal(c: Concept, format: Format, bloomTarget: Bloom, ctx: GenerateContext): Question | null {
  if (!supportsFormat(c, format, ctx.deck)) return null;
  const { rng, language: L } = ctx;
  const bloom = nearestBloom(format, bloomTarget);
  const others = shuffle(
    ctx.deck.filter((o) => o.id !== c.id),
    rng,
  );
  const base = { conceptId: c.id, bloom, language: L, explanation: why(c, L, rng) };
  let draft: Draft | null = null;

  switch (format) {
    case 'multiple_choice': {
      const variants: (() => Draft | null)[] = [];
      if (others.length >= 3) {
        variants.push(() => {
          const wrong = distinct(others.map((o) => o.term), [c.term, ...c.synonyms]).slice(0, 3);
          if (wrong.length < 3) return null;
          const options = opts([c.term, ...wrong], rng);
          return { ...base, format, prompt: fill(pick(T.mcTerm[L], rng), { summary: hideTerm(c.summary, c) }), options, correctId: options.find((o) => o.text === c.term)!.id };
        });
        variants.push(() => {
          const wrong = distinct(others.map((o) => o.summary), [c.summary]).slice(0, 3);
          if (wrong.length < 3) return null;
          const options = opts([c.summary, ...wrong], rng);
          return { ...base, format, prompt: fill(pick(T.mcDef[L], rng), { term: c.term }), options, correctId: options.find((o) => o.text === c.summary)!.id };
        });
      }
      if (bloom !== 'remember' && c.keyPoints.length >= 1) {
        variants.push(() => {
          const right = pick(c.keyPoints, rng);
          const wrong = distinct([...shuffle(c.misconceptions, rng), ...others.flatMap((o) => o.misconceptions)], [right, ...c.keyPoints]).slice(0, 3);
          if (wrong.length < 3) return null;
          const options = opts([right, ...wrong], rng);
          return { ...base, format, prompt: fill(pick(T.mcTrue[L], rng), { term: c.term }), options, correctId: options.find((o) => o.text === right)!.id };
        });
      }
      if (bloom === 'apply' && c.examples.length >= 1) {
        variants.push(() => {
          const right = pick(c.examples, rng);
          const wrong = distinct(others.flatMap((o) => o.examples), [right, ...c.examples]).slice(0, 3);
          if (wrong.length < 3) return null;
          const options = opts([right, ...wrong], rng);
          return { ...base, format, prompt: fill(pick(T.mcExample[L], rng), { term: c.term }), options, correctId: options.find((o) => o.text === right)!.id };
        });
      }
      for (const v of shuffle(variants, rng)) if ((draft = v())) break;
      break;
    }

    case 'multiple_select': {
      const nRight = Math.min(c.keyPoints.length, 2 + Math.floor(rng() * 2));
      const right = shuffle(c.keyPoints, rng).slice(0, nRight);
      const wrong = distinct([...shuffle(c.misconceptions, rng), ...shuffle(others.flatMap((o) => o.keyPoints), rng)], c.keyPoints).slice(0, 5 - nRight);
      if (wrong.length < 2) return null;
      const options = opts([...right, ...wrong], rng);
      draft = { ...base, format, prompt: fill(pick(T.multi[L], rng), { term: c.term }), options, correctIds: options.filter((o) => right.includes(o.text)).map((o) => o.id) };
      break;
    }

    case 'type_answer': {
      const useExample = c.examples.length > 0 && rng() < 0.35;
      const prompt = useExample ? fill(pick(T.typeExample[L], rng), { example: hideTerm(pick(c.examples, rng), c) }) : fill(pick(T.type[L], rng), { summary: hideTerm(c.summary, c) });
      draft = { ...base, format, prompt, accepted: [c.term, ...c.synonyms] };
      break;
    }

    case 'fill_blank': {
      const sentences = [c.summary, ...c.keyPoints].filter((s) => containsTerm(s, c));
      if (sentences.length > 0) {
        const s = pick(sentences, rng);
        draft = { ...base, format, prompt: pick(T.fill[L], rng), text: blankTerm(s, c), blanks: [{ accepted: [c.term, ...c.synonyms] }] };
      } else {
        // No sentence names the term: blank out its most specific word instead.
        const s = pick([c.summary, ...c.keyPoints], rng);
        const word = s.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, '')).sort((a, b) => b.length - a.length)[0];
        if (!word || word.length < 5) return null;
        draft = { ...base, format, prompt: pick(T.fill[L], rng), text: `${c.term}: ${s.replace(word, '___')}`, blanks: [{ accepted: [word] }] };
      }
      break;
    }

    case 'explain': {
      const tpl = bloom === 'analyze' ? T.explainDeep : T.explain;
      draft = { ...base, format, prompt: fill(pick(tpl[L], rng), { term: c.term }), keyPoints: c.keyPoints, modelAnswer: sentences([c.summary, ...c.keyPoints]), minPoints: Math.min(c.keyPoints.length, bloom === 'analyze' ? 3 : 2) };
      break;
    }

    case 'teach_back': {
      draft = { ...base, format, prompt: fill(pick(T.teach[L], rng), { term: c.term }), keyPoints: c.keyPoints, modelAnswer: sentences([c.summary, ...c.keyPoints]), minPoints: Math.min(c.keyPoints.length, 3) };
      break;
    }

    case 'true_false_justify': {
      const useFalse = c.misconceptions.length > 0 && (c.keyPoints.length === 0 || rng() < 0.5);
      const statement = useFalse ? pick(c.misconceptions, rng) : pick(c.keyPoints, rng);
      draft = { ...base, format, prompt: pick(T.tf[L], rng), statement, isTrue: !useFalse, keyPoints: useFalse ? [c.summary, ...c.keyPoints.slice(0, 2)] : [statement, c.summary] };
      break;
    }

    case 'matching': {
      const group = [c, ...others.slice(0, 2 + Math.floor(rng() * 2))];
      const left = group.map((g) => ({ id: makeId(rng, 'l'), text: g.term }));
      const right = group.map((g) => ({ id: makeId(rng, 'r'), text: rng() < 0.3 && g.examples[0] ? g.examples[0] : g.summary }));
      const pairs = Object.fromEntries(left.map((l, i) => [l.id, right[i]!.id]));
      draft = { ...base, format, prompt: pick(T.matching[L], rng), left: shuffle(left, rng), right: shuffle(right, rng), pairs };
      break;
    }

    case 'ordering': {
      const steps = c.steps!;
      const items = steps.map((text) => ({ id: makeId(rng, 's'), text }));
      let shown = shuffle(items, rng);
      for (let i = 0; i < 5 && shown.every((s, j) => s.id === items[j]!.id); i++) shown = shuffle(items, rng);
      draft = { ...base, format, prompt: fill(pick(T.ordering[L], rng), { term: c.term }), items: shown, correctOrder: items.map((s) => s.id), explanation: fill(T.stepsExplain[L][0]!, { steps: steps.join(' → ') }) };
      break;
    }

    case 'categorize': {
      let groups: { name: string; items: string[] }[];
      if ((c.categories?.length ?? 0) >= 2) groups = c.categories!;
      else {
        const byTopic = new Map<string, string[]>();
        for (const o of shuffle([c, ...others], rng)) byTopic.set(o.topic, [...(byTopic.get(o.topic) ?? []), o.term]);
        groups = [...byTopic].map(([name, items]) => ({ name, items }));
      }
      groups = shuffle(groups, rng).slice(0, 3).map((g) => ({ name: g.name, items: shuffle(g.items, rng).slice(0, 3) }));
      const categories = groups.map((g) => ({ id: makeId(rng, 'c'), text: g.name }));
      const items: Opt[] = [];
      const mapping: Record<string, string> = {};
      groups.forEach((g, gi) =>
        g.items.forEach((text) => {
          const id = makeId(rng, 'i');
          items.push({ id, text });
          mapping[id] = categories[gi]!.id;
        }),
      );
      if (items.length < 3) return null;
      draft = { ...base, format, prompt: pick(T.categorize[L], rng), categories, items: shuffle(items, rng), mapping };
      break;
    }

    case 'label_diagram': {
      const d = c.diagram!;
      const spots = d.spots.map((s) => ({ id: makeId(rng, 'p'), x: s.x, y: s.y }));
      const labels = d.spots.map((s) => ({ id: makeId(rng, 'b'), text: s.label }));
      const mapping = Object.fromEntries(spots.map((s, i) => [s.id, labels[i]!.id]));
      draft = { ...base, format, prompt: pick(T.label[L], rng), imageUrl: d.imageUrl, spots, labels: shuffle(labels, rng), mapping };
      break;
    }

    case 'spot_mistake': {
      if ((c.steps?.length ?? 0) >= 3 && (others.length === 0 || rng() < 0.5)) {
        // Replace one step with a step from elsewhere in the list (wrong place).
        const steps = c.steps!;
        const i = 1 + Math.floor(rng() * (steps.length - 1));
        const j = (i + 1 + Math.floor(rng() * (steps.length - 2))) % steps.length;
        const shown = steps.slice();
        shown[i] = steps[j]!;
        if (shown[i] === steps[i]) return null;
        const segments = shown.map((text, k) => ({ id: makeId(rng, 'g'), text: `${k + 1}. ${text}` }));
        draft = { ...base, format, prompt: fill(pick(T.mistakeSteps[L], rng), { term: c.term }), segments, wrongId: segments[i]!.id, correction: [steps[i]!] };
      } else {
        const other = others.find((o) => o.term.toLowerCase() !== c.term.toLowerCase());
        if (!other) return null;
        const clauses = c.summary.split(/(?<=[,;:])\s+/).filter(Boolean);
        const segments = [{ id: makeId(rng, 'g'), text: other.term }, ...clauses.map((text) => ({ id: makeId(rng, 'g'), text }))];
        draft = { ...base, format, prompt: pick(T.mistake[L], rng), segments, wrongId: segments[0]!.id, correction: [c.term, ...c.synonyms] };
      }
      break;
    }

    case 'cause_effect': {
      const ce = pick(c.causeEffects!, rng);
      const backwards = rng() < 0.4;
      const right = backwards ? ce.cause : ce.effect;
      const pool = [
        ...(c.causeEffects ?? []).filter((x) => x !== ce).map((x) => (backwards ? x.cause : x.effect)),
        ...c.misconceptions,
        ...others.flatMap((o) => (o.causeEffects ?? []).map((x) => (backwards ? x.cause : x.effect))),
        ...others.flatMap((o) => o.keyPoints),
      ];
      const wrong = distinct(shuffle(pool, rng), [right]).slice(0, 3);
      if (wrong.length < 3) return null;
      const options = opts([right, ...wrong], rng);
      const prompt = backwards ? fill(pick(T.causeBack[L], rng), { effect: lowerFirst(ce.effect) }) : fill(pick(T.causeFwd[L], rng), { cause: lowerFirst(ce.cause) });
      draft = { ...base, format, prompt, options, correctId: options.find((o) => o.text === right)!.id };
      break;
    }

    case 'apply': {
      draft = { ...base, format, prompt: fill(pick(T.apply[L], rng), { example: pick(c.examples, rng), term: c.term }), keyPoints: c.keyPoints, modelAnswer: sentences([c.summary, ...c.keyPoints]), minPoints: Math.min(2, c.keyPoints.length) };
      break;
    }

    case 'calculation': {
      const f = c.formula!;
      const vars: Record<string, number> = {};
      for (const v of f.variables) {
        const step = v.step ?? 1;
        const n = Math.round((v.max - v.min) / step);
        vars[v.symbol] = round(v.min + step * Math.floor(rng() * (n + 1)));
      }
      let answer: number;
      try {
        answer = evaluate(f.expression, vars);
      } catch {
        return null;
      }
      if (!Number.isFinite(answer)) return null;
      answer = round(answer);
      const sub = f.variables.reduce((e, v) => e.replace(new RegExp(`\\b${escapeRe(v.symbol)}\\b`, 'g'), formatNumber(vars[v.symbol]!)), f.expression);
      const res = `${f.result.symbol} = ${formatNumber(answer)}${f.result.unit ? ' ' + f.result.unit : ''}`;
      const [s1, s2, s3] = T.calcSteps[L];
      const steps = [fill(s1!, { formula: `${f.result.symbol} = ${f.expression}` }), fill(s2!, { sub: `${f.result.symbol} = ${sub}` }), fill(s3!, { res })];
      draft = {
        ...base,
        format,
        prompt: fill(pick(T.calc[L], rng), { result: f.result.name, resultSymbol: f.result.symbol, term: c.term }),
        given: f.variables.map((v) => ({ symbol: v.symbol, name: v.name, value: vars[v.symbol]!, unit: v.unit })),
        answer,
        unit: f.result.unit,
        tolerance: 0.02,
        steps,
        explanation: steps.join('\n'),
      };
      break;
    }

    case 'compare': {
      const cmp = c.comparison!;
      draft = { ...base, format, prompt: fill(pick(T.compare[L], rng), { term: c.term, other: cmp.with }), keyPoints: [...cmp.similarities, ...cmp.differences], modelAnswer: sentences([...cmp.similarities, ...cmp.differences]), minPoints: 2 };
      break;
    }
  }

  if (!draft) return null;
  const q = { ...draft, id: makeId(rng, ctx.idPrefix ?? 'q'), variantKey: '' } as Question;
  q.variantKey = computeVariantKey(q);
  return q;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const lowerFirst = (s: string) => (s && s[0] === s[0]!.toUpperCase() && s[1] !== s[1]?.toUpperCase() ? s[0]!.toLowerCase() + s.slice(1) : s).replace(/[.!]$/, '');

function termRegex(c: Concept): RegExp {
  const names = [c.term, ...c.synonyms].filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRe);
  return new RegExp(`(?<![\\p{L}])(${names.join('|')})(?![\\p{L}])`, 'giu');
}
const containsTerm = (s: string, c: Concept) => termRegex(c).test(s);
const blankTerm = (s: string, c: Concept) => {
  let first = true;
  return s.replace(termRegex(c), () => (first ? ((first = false), '___') : '…'));
};
/** Don't give the answer away in the prompt. */
const hideTerm = (s: string, c: Concept) => s.replace(termRegex(c), '…');

/** Join fragments into readable prose, adding a full stop where one is missing. */
function sentences(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).map((p) => (/[.!?…]$/.test(p) ? p : p + '.')).join(' ');
}
