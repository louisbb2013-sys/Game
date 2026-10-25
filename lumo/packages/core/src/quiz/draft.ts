import { seededRng } from '../rng';
import { BLOOM_LEVELS, type Bloom, type Format, type Locale } from '../types';
import { buildQuestion } from './build';
import type { Concept } from './concept';
import { makeId } from './generate';
import { computeVariantKey, type ChoiceQ, type Question } from './question';

/**
 * Test questions written by Claude, one compact JSON object per line (so a stream can be used
 * line by line, and a reply cut short still keeps every finished question). This file turns a line
 * into a checked Question and rejects the kinds of question students hate: a sentence from their
 * notes with a word removed, an answer given away in the question, "all of the above", and so on.
 */

/** The question types Claude writes, in the compact form it writes them. */
export const DRAFT_TYPES = ['mcq', 'tf', 'typed', 'multi', 'order', 'match', 'sort', 'written', 'calc'] as const;
export type DraftType = (typeof DRAFT_TYPES)[number];

export const TF_LABELS: Record<Locale, [string, string]> = { en: ['True', 'False'], fr: ['Vrai', 'Faux'] };

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.replace(/\s+\n/g, '\n').trim().slice(0, max) : '');
const strs = (v: unknown, n: number, max = 300) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[\p{L}0-9]+/gu) ?? [];

function bloomOf(level: unknown, type: DraftType): Bloom {
  const b = String(level ?? '').toLowerCase();
  if ((BLOOM_LEVELS as readonly string[]).includes(b)) return b as Bloom;
  if (b === 'evaluate' || b === 'create' || b === 'analyse') return 'analyze';
  return type === 'tf' || type === 'typed' || type === 'match' ? 'remember' : type === 'written' ? 'understand' : 'understand';
}

/**
 * A sentence lifted from the notes, not a real question: a long run of the notes' words in a row
 * (9+), or a shorter run (5+) that is most of the question. Short names and terms can repeat.
 */
export function copiesNotes(text: string, c: Pick<Concept, 'summary' | 'keyPoints'>): boolean {
  const w = words(text);
  if (w.length < 5) return false;
  const notes = [c.summary, ...c.keyPoints].map(words);
  let longest = 0;
  for (const n of notes) {
    // Longest run of consecutive words shared with this sentence of the notes.
    const prev = new Array<number>(n.length + 1).fill(0);
    for (let i = 1; i <= w.length; i++) {
      let diag = 0;
      for (let j = 1; j <= n.length; j++) {
        const up = prev[j]!;
        prev[j] = w[i - 1] === n[j - 1] ? diag + 1 : 0;
        if (prev[j]! > longest) longest = prev[j]!;
        diag = up;
      }
    }
  }
  return longest >= 9 || (longest >= 5 && longest >= w.length * 0.6);
}

const GIVEAWAY = /\b(all|none|both) of (the|these) (above|answers|options)\b|\btoutes? (les|ces) (réponses|réponse)s? (ci-dessus|précédentes)?\b|\baucune (de ces|des) réponses?\b|\btoutes ces réponses\b/i;

/** "According to the text…" with no text: the student can't answer it. */
const NEEDS_DOCUMENT =
  /\b(according to|based on|in|from|using) (the|this) (text|passage|document|excerpt|extract|table|graph|chart|data)\b|\b(the|this) (text|passage|document|excerpt|table|graph|chart) (above|below)\b|\b(d['’]après|selon|dans|à l['’]aide d['’]?) ?(le |la |ce |cette |l['’])(texte|document|extrait|tableau|graphique|passage)\b/i;

/** Two options that say the same thing (or one option twice). */
function repeats(options: string[]): boolean {
  const seen = new Set(options.map((o) => words(o).join(' ')));
  return seen.size < options.length;
}

/** The answer is sitting in the question (e.g. "What is photosynthesis, the process plants use…" → "Photosynthesis"). */
function leaks(stem: string, answer: string): boolean {
  // Numbers repeat on purpose ("60 kg on Earth: what is the mass on the Moon?" → "60 kg").
  if (/\d/.test(answer)) return false;
  const a = words(answer);
  if (a.length === 0) return false;
  const s = ` ${words(stem).join(' ')} `;
  // Short answers (one or two words) leak when they appear whole; long options rarely do by accident.
  return a.length <= 4 && a.join('').length >= 4 && s.includes(` ${a.join(' ')} `);
}

export interface DraftContext {
  concepts: readonly Concept[];
  language: Locale;
  seed: number;
}

/**
 * One line from Claude → a Question, or null when it is malformed or a bad question.
 * Shapes (c = the concept's number in the list Claude was given):
 *   {"c":1,"type":"mcq","level":"apply","context":"…","q":"…","options":["…","…","…","…"],"answer":2,"why":"…","wrong":["…","…","","…"]}
 *   {"c":1,"type":"tf","q":"<statement>","answer":false,"why":"…"}
 *   {"c":1,"type":"typed","q":"…","accepted":["…"],"wrong":["tempting","wrong","answers"],"why":"…"}
 * Any line may carry "f": the fact(s) of the concept it tests, numbered from 1 (e.g. "f":2 or "f":[1,3]).
 *   {"c":1,"type":"multi","q":"…","options":[…5],"answer":[0,3],"why":"…"}
 *   {"c":1,"type":"order","q":"…","steps":["first",…],"why":"…"}
 *   {"c":1,"type":"match","q":"…","pairs":[["left","right"],…],"why":"…"}
 *   {"c":1,"type":"sort","q":"…","groups":[{"name":"…","items":["…"]}],"why":"…"}
 *   {"c":1,"type":"written","q":"…","points":["…"],"model":"…","why":"…"}
 *   {"c":1,"type":"calc","q":"…","given":[{"symbol","name","value","unit"}],"answer":12.5,"unit":"…","steps":["…"],"why":"…"}
 */
export function questionFromDraft(raw: unknown, ctx: DraftContext): Question | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const concept = ctx.concepts[Number(d.c) - 1];
  const type = String(d.type ?? '').toLowerCase() as DraftType;
  if (!concept || !(DRAFT_TYPES as readonly string[]).includes(type)) return null;
  const prompt = str(d.q, 500);
  const why = str(d.why, 600);
  const context = str(d.context, 900);
  if (prompt.length < 8 || !why) return null;
  if (copiesNotes(prompt, concept) || (context && copiesNotes(context, concept))) return null;
  if (!context && NEEDS_DOCUMENT.test(prompt)) return null;
  const bloom = bloomOf(d.level, type);
  // Which of the concept's facts it tests ("f": 2 or [1, 3], numbered from 1 as Claude was shown them).
  const facts = [...new Set((Array.isArray(d.f) ? d.f : d.f === undefined ? [] : [d.f]).map(Number))]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= concept.keyPoints.length)
    .map((n) => n - 1)
    .slice(0, 4);
  const meta = (format: Format) => ({ conceptId: concept.id, format, bloom, language: ctx.language, seed: ctx.seed });
  const withContext = (q: Question | null): Question | null => {
    if (!q) return null;
    if (context) {
      q.context = context;
      q.variantKey = computeVariantKey(q);
    }
    if (facts.length) q.facts = facts;
    return q;
  };

  switch (type) {
    case 'mcq': {
      const options = strs(d.options, 5, 220);
      const answer = Number(d.answer);
      if (options.length < 3 || !Number.isInteger(answer) || !options[answer] || repeats(options)) return null;
      if (options.some((o) => GIVEAWAY.test(o)) || leaks(prompt, options[answer]!)) return null;
      // The right answer can't stand out as the long, careful one.
      const longestWrong = Math.max(...options.filter((_, i) => i !== answer).map((o) => o.length));
      if (options[answer]!.length > 40 && options[answer]!.length > longestWrong * 1.8) return null;
      const q = buildQuestion({ prompt, options, correctIndex: answer, explanation: why }, meta('multiple_choice')) as ChoiceQ | null;
      if (!q) return null;
      // Why each wrong option is wrong, keyed by the option's id (options were shuffled).
      const wrong = Array.isArray(d.wrong) ? d.wrong.map((w) => str(w, 300)) : [];
      const notes: Record<string, string> = {};
      options.forEach((text, i) => {
        if (i === answer || !wrong[i]) return;
        const o = q.options.find((x) => x.text === text);
        if (o) notes[o.id] = wrong[i]!;
      });
      if (Object.keys(notes).length) q.optionNotes = notes;
      return withContext(q);
    }
    case 'tf': {
      if (typeof d.answer !== 'boolean' && d.answer !== 'true' && d.answer !== 'false') return null;
      const isTrue = d.answer === true || d.answer === 'true';
      const rng = seededRng(ctx.seed);
      const [t, f] = TF_LABELS[ctx.language];
      const options = [{ id: makeId(rng, 'o'), text: t }, { id: makeId(rng, 'o'), text: f }];
      const note = str(d.wrongWhy ?? d.trap, 300);
      const q: ChoiceQ = {
        id: makeId(rng, 'q'),
        conceptId: concept.id,
        format: 'true_false',
        bloom,
        language: ctx.language,
        prompt,
        explanation: why,
        options,
        correctId: options[isTrue ? 0 : 1]!.id,
        ...(note ? { optionNotes: { [options[isTrue ? 1 : 0]!.id]: note } } : {}),
        variantKey: '',
      };
      q.variantKey = computeVariantKey(q);
      return withContext(q);
    }
    case 'typed': {
      const accepted = strs(d.accepted ?? d.answer, 8, 80);
      if (accepted.length === 0 || accepted.some((a) => leaks(prompt, a))) return null;
      const q = withContext(buildQuestion({ prompt, accepted, explanation: why }, meta('type_answer')));
      // Tempting wrong answers, so it can also be played as a choice (in Live).
      const right = new Set(accepted.map((a) => words(a).join(' ')));
      const distractors = strs(d.wrong ?? d.near, 3, 80).filter((x) => !right.has(words(x).join(' ')));
      if (q?.format === 'type_answer' && distractors.length) q.distractors = distractors;
      return q;
    }
    case 'multi': {
      const options = strs(d.options, 6, 220);
      const answer = Array.isArray(d.answer) ? d.answer.map(Number).filter(Number.isInteger) : [];
      if (options.some((o) => GIVEAWAY.test(o))) return null;
      return withContext(buildQuestion({ prompt, options, correctIndexes: answer, explanation: why }, meta('multiple_select')));
    }
    case 'order': {
      const steps = strs(d.steps, 7, 200);
      return withContext(buildQuestion({ prompt, stepsInOrder: steps, explanation: why }, meta('ordering')));
    }
    case 'match': {
      const pairs = (Array.isArray(d.pairs) ? d.pairs : [])
        .map((p) => (Array.isArray(p) ? { left: str(p[0], 140), right: str(p[1], 200) } : { left: str((p as Record<string, unknown>)?.left, 140), right: str((p as Record<string, unknown>)?.right, 200) }))
        .filter((p) => p.left && p.right)
        .slice(0, 6);
      return withContext(buildQuestion({ prompt, pairs, explanation: why }, meta('matching')));
    }
    case 'sort': {
      const categories = (Array.isArray(d.groups) ? d.groups : [])
        .map((g) => ({ name: str((g as Record<string, unknown>)?.name, 80), items: strs((g as Record<string, unknown>)?.items, 5, 120) }))
        .filter((g) => g.name && g.items.length)
        .slice(0, 3);
      return withContext(buildQuestion({ prompt, categories, explanation: why }, meta('categorize')));
    }
    case 'written': {
      const keyPoints = strs(d.points, 4, 200);
      const modelAnswer = str(d.model, 900);
      if (keyPoints.length < 2) return null;
      return withContext(buildQuestion({ prompt, keyPoints, modelAnswer, explanation: why }, meta(bloom === 'apply' ? 'apply' : 'explain')));
    }
    case 'calc': {
      const given = (Array.isArray(d.given) ? d.given : [])
        .map((g) => {
          const o = g as Record<string, unknown>;
          return { symbol: str(o?.symbol, 12), name: str(o?.name, 60), value: Number(o?.value), unit: str(o?.unit, 20) };
        })
        .filter((g) => g.symbol && Number.isFinite(g.value));
      return withContext(buildQuestion({ prompt, given, answer: Number(d.answer), unit: str(d.unit, 20), steps: strs(d.steps, 8, 240), explanation: why }, meta('calculation')));
    }
  }
}

/**
 * Read Claude's reply (whole or streamed so far) line by line. `from` is how many characters were
 * already read; returns the questions found in complete lines and where to continue next time.
 */
export function readDraftLines(text: string, from: number, ctx: Omit<DraftContext, 'seed'> & { seedBase: string; final?: boolean }, hash: (s: string) => number): { questions: Question[]; next: number } {
  const questions: Question[] = [];
  let next = from;
  for (;;) {
    const nl = text.indexOf('\n', next);
    const end = nl === -1 ? (ctx.final ? text.length : -1) : nl;
    if (end === -1 || end < next) break;
    const line = text.slice(next, end).trim().replace(/^[-*]\s+/, '').replace(/,$/, '');
    next = end + 1;
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const q = questionFromDraft(JSON.parse(line), { ...ctx, seed: hash(`${ctx.seedBase}:${next}:${line.length}`) });
        if (q) questions.push(q);
      } catch {
        /* a broken line: skip it, keep the rest */
      }
    }
    if (nl === -1) break;
  }
  return { questions, next };
}

/** A reply that ignored the one-per-line rule (a JSON array, or {"questions": [...]}) still counts. */
export function readDraftWhole(text: string, ctx: Omit<DraftContext, 'seed'> & { seedBase: string }, hash: (s: string) => number): Question[] {
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  if (start === -1 || end <= start) return [];
  let value: unknown;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(value) ? value : Array.isArray((value as { questions?: unknown })?.questions) ? (value as { questions: unknown[] }).questions : [value];
  return list.flatMap((item, i) => {
    const q = questionFromDraft(item, { ...ctx, seed: hash(`${ctx.seedBase}:whole:${i}`) });
    return q ? [q] : [];
  });
}

/** Drop near-duplicates (same concept, nearly the same stem) so a bank never asks the same thing twice. */
export function dedupeQuestions(existing: readonly Question[], incoming: readonly Question[]): Question[] {
  const key = (q: Question) => `${q.conceptId}|${words(q.prompt).slice(0, 14).join(' ')}`;
  const seen = new Set(existing.map(key));
  const seenVariant = new Set(existing.map((q) => q.variantKey));
  const out: Question[] = [];
  for (const q of incoming) {
    const k = key(q);
    if (seen.has(k) || seenVariant.has(q.variantKey)) continue;
    seen.add(k);
    seenVariant.add(q.variantKey);
    out.push(q);
  }
  return out;
}
