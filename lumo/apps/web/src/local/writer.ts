import { dedupeQuestions, hashString, readDraftLines, readDraftWhole, type Concept, type Locale, type Question } from '@lumo/core';
import { api, NETLIFY } from '../lib/api';
import { aboutLearner, explainStyle } from './memory';
import { getSample } from './reader';

/**
 * Claude writes the deck's test questions. Concepts go out a few at a time (two calls at once, the
 * most a viewer runs together), each reply is read line by line AS IT STREAMS, and every finished
 * question is saved right away, so the first ones can be played while Claude is still writing.
 * A reply cut short keeps all its finished lines. One run per deck; pages subscribe to its progress.
 */

export interface WriteState {
  status: 'writing' | 'done' | 'error';
  /** Questions this run added. */
  saved: number;
  /** Questions the deck has now. */
  bank: number;
  groupsDone: number;
  groups: number;
  /** About how many questions this run should write (for a progress bar). */
  expected: number;
  /** Why it stopped: not_granted, rate_limited, unavailable, nothing_found, upstream_error… */
  error?: string;
}

type Listener = (s: WriteState) => void;
interface Run {
  state: WriteState;
  promise: Promise<WriteState>;
  ctl: AbortController;
}
const runs = new Map<string, Run>();
const listeners = new Map<string, Set<Listener>>();

export const writingState = (deckId: string): WriteState | null => {
  const s = runs.get(deckId)?.state;
  return s ? { ...s } : null;
};

/** Hear about a deck's writing (called right away with the current state, if any). */
export function onWriting(deckId: string, fn: Listener): () => void {
  const set = listeners.get(deckId) ?? new Set<Listener>();
  set.add(fn);
  listeners.set(deckId, set);
  const now = writingState(deckId);
  if (now) fn(now);
  return () => {
    set.delete(fn);
  };
}

export function stopWriting(deckId: string) {
  runs.get(deckId)?.ctl.abort();
}

/** Errors that end the whole run (asking again right away would fail the same way). */
const FATAL = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'rate_limited', 'session_expired', 'cancelled', 'unavailable']);

const GROUP = 4; // concepts per call
const FIRST_GROUP = 2; // the first call is small (and quick) so the first questions arrive fast
const PER_CONCEPT = 3; // questions per concept per call
// Inside Claude a viewer runs a couple of calls at once; the website's own endpoint takes more.
const PARALLEL = NETLIFY ? 4 : 2;

/**
 * Write (or, with `more`, add new) test questions for a deck. Safe to call again while it runs:
 * the same run is returned.
 */
export function writeQuestions(deckId: string, opts: { more?: boolean } = {}): Promise<WriteState> {
  const running = runs.get(deckId);
  if (running && running.state.status === 'writing') return running.promise;
  const run: Run = {
    state: { status: 'writing', saved: 0, bank: 0, groupsDone: 0, groups: 0, expected: 0 },
    ctl: new AbortController(),
    promise: Promise.resolve(null as never),
  };
  runs.set(deckId, run);
  const emit = () => {
    const snapshot = { ...run.state };
    for (const fn of listeners.get(deckId) ?? []) fn(snapshot);
  };
  run.promise = (async () => {
    try {
      await go(deckId, opts, run, emit);
    } catch (e) {
      run.state.status = 'error';
      run.state.error = (e as { code?: string })?.code ?? 'upstream_error';
    }
    if (run.state.status === 'writing') run.state.status = 'done';
    emit();
    return { ...run.state };
  })();
  emit();
  return run.promise;
}

interface DeckForWriting {
  deck: { id: string; title: string; subject: string; language: Locale };
  concepts: Concept[];
  bank: Question[];
}

async function go(deckId: string, opts: { more?: boolean }, run: Run, emit: () => void) {
  const d = await api<DeckForWriting>(`/api/decks/${deckId}/offline`);
  run.state.bank = d.bank.length;
  const s = await getSample();
  if (!s) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
  const groups: Concept[][] = [];
  for (let i = 0; i < d.concepts.length; ) {
    const size = i === 0 ? FIRST_GROUP : GROUP;
    groups.push(d.concepts.slice(i, i + size));
    i += size;
  }
  const about = await aboutLearner();
  run.state.groups = groups.length;
  run.state.expected = d.concepts.length * PER_CONCEPT;
  emit();

  let existing = d.bank.slice();
  let fatal: string | null = null;
  let lastError: string | null = null;
  // Saves are queued so the bank is written in order, never twice at once.
  let saving: Promise<void> = Promise.resolve();
  const save = (qs: Question[]) => {
    const fresh = dedupeQuestions(existing, qs);
    if (fresh.length === 0) return;
    existing = existing.concat(fresh);
    saving = saving.then(async () => {
      const r = await api<{ count: number }>(`/api/local/decks/${deckId}/bank`, { method: 'PATCH', body: { add: fresh } });
      run.state.saved += fresh.length;
      run.state.bank = r.count;
      emit();
    });
  };

  const drop = (keys: Set<string>) => {
    existing = existing.filter((q) => !keys.has(q.variantKey));
    saving = saving.then(async () => {
      const r = await api<{ count: number; removed: number }>(`/api/local/decks/${deckId}/bank`, { method: 'PATCH', body: { remove: [...keys] } });
      run.state.saved = Math.max(0, run.state.saved - r.removed);
      run.state.bank = r.count;
      emit();
    });
  };

  const writeGroup = async (concepts: Concept[], gi: number) => {
    const ctx = { concepts, language: d.deck.language, seedBase: `${deckId}:${gi}:${Date.now()}` };
    const already = opts.more ? existing.filter((q) => concepts.some((c) => c.id === q.conceptId)).map((q) => q.prompt) : [];
    let read = 0;
    const mine: Question[] = [];
    const take = (text: string, final: boolean) => {
      const got = readDraftLines(text, read, { ...ctx, final }, hashString);
      read = got.next;
      mine.push(...got.questions);
      save(got.questions);
    };
    try {
      const res = await (s as unknown as (input: string, o: object) => Promise<{ text: string }>)(writingPrompt(d.deck, concepts, already, about), {
        signal: run.ctl.signal,
        // The first small batch is quick, so there's something to play within seconds.
        modelTier: gi === 0 ? 'quick' : 'default',
        cache: false,
        onText: ({ text }: { text: string }) => take(text, false),
      });
      take(res.text, true);
      if (mine.length === 0) {
        const whole = readDraftWhole(res.text, ctx, hashString);
        mine.push(...whole);
        save(whole);
      }
      // A second, independent look (alongside the next batch, not holding it up): drop any question
      // whose key it disputes.
      checks.push(checkAnswers(mine, concepts, d.deck.language, run.ctl.signal).then((bad) => bad.size && drop(bad)));
    } catch (e) {
      const err = e as { code?: string; text?: string };
      const code = err?.code ?? 'upstream_error';
      // Whatever was written before a failure is kept.
      if (typeof err?.text === 'string') take(err.text, true);
      if (FATAL.has(code)) {
        fatal ??= code;
        run.ctl.abort();
      } else lastError = code;
    } finally {
      run.state.groupsDone += 1;
      emit();
    }
  };

  const checks: Promise<unknown>[] = [];
  // A few calls at once: more just wait their turn.
  let next = 0;
  const worker = async () => {
    while (next < groups.length && !fatal) {
      const gi = next++;
      await writeGroup(groups[gi]!, gi);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  await Promise.all(checks);
  await saving;
  if (run.state.saved === 0 && (fatal || lastError || existing.length === 0)) {
    throw Object.assign(new Error('failed'), { code: fatal ?? lastError ?? 'nothing_found' });
  }
}

/** Style examples (from good test practice), in the deck's language. Claude is told not to reuse them. */
const EXAMPLES: Record<Locale, string> = {
  en: [
    '{"c":1,"type":"mcq","level":"apply","q":"An astronaut has a mass of 60 kg on Earth. What is her mass on the Moon?","options":["60 kg","10 kg","0 kg"],"answer":0,"why":"Mass is the amount of matter in her body, and a trip to the Moon doesn\'t change it. Only her weight drops.","wrong":["","That is her weight dropping to about 1/6, not her mass: mass and weight are different things.","Less gravity doesn\'t remove matter: she is made of exactly the same stuff."]}',
    '{"c":2,"type":"mcq","level":"understand","q":"Why is it warmer in Québec in July than in January?","options":["Earth is closer to the Sun in July","The Sun gives off more energy in July","The Northern Hemisphere is tilted toward the Sun in July"],"answer":2,"why":"Earth\'s tilted axis makes the Sun\'s rays hit us more directly, and for longer days, in July.","wrong":["The classic mistake: Earth is actually farthest from the Sun in early July.","The Sun\'s output barely changes over a year.",""]}',
    '{"c":3,"type":"mcq","level":"analyze","context":"Mercury: 0.39 AU from the Sun, year = 88 days. Earth: 1 AU, 365 days. Mars: 1.52 AU, 687 days. Jupiter: 5.2 AU, 4 333 days.","q":"According to the table, which relationship holds?","options":["The farther a planet is from the Sun, the longer its year","The bigger a planet is, the longer its year","A planet\'s year does not depend on its distance"],"answer":0,"why":"Every planet farther out takes longer to go around the Sun.","wrong":["","Size isn\'t in the table, and Mars is smaller than Earth yet has a longer year.","The table shows the year growing with distance every time."]}',
    '{"c":4,"type":"tf","level":"understand","q":"Astronauts float in the space station because there is no gravity up there.","answer":false,"why":"At 400 km, gravity is still about 90% as strong: astronauts float because they are falling around Earth together with the station."}',
  ].join('\n'),
  fr: [
    '{"c":1,"type":"mcq","level":"apply","context":"« Pourquoi ai-je dit oui? Je déteste les hauteurs. Si je recule, Max ne me reparlera jamais. » Marc agrippa la rampe.","q":"Quel procédé révèle surtout l\'état intérieur de Marc?","options":["Le monologue intérieur","Un dialogue avec Max","La description des lieux"],"answer":0,"why":"Les phrases entre guillemets sont les pensées de Marc : il se parle à lui-même, ce qui montre sa peur.","wrong":["","Piège : les guillemets font penser à un dialogue, mais Marc ne s\'adresse à personne.","La rampe est un détail du lieu, mais elle ne dit rien de ce que Marc ressent."]}',
    '{"c":2,"type":"mcq","level":"apply","q":"Dans un récit, quelle phrase est l\'élément déclencheur?","options":["Un matin, une lettre sans adresse l\'attendait sur la table.","Depuis trois ans, Léa vivait seule avec sa grand-mère au bord du fleuve.","Elle courut jusqu\'au quai, mais le traversier était déjà parti."],"answer":0,"why":"La lettre mystérieuse brise l\'équilibre de départ : c\'est elle qui lance l\'histoire.","wrong":["","C\'est la situation initiale : elle décrit la vie avant que quelque chose change.","C\'est une péripétie du déroulement : l\'action est déjà lancée."]}',
    '{"c":3,"type":"tf","level":"understand","q":"Dans une nouvelle, la situation finale peut être absente.","answer":true,"why":"Beaucoup de nouvelles se terminent sur le dénouement ou une chute, sans situation finale."}',
    '{"c":4,"type":"written","level":"analyze","context":"Au début, Marc refuse de monter sur le pont. À la fin, il y monte en tremblant.","q":"Qu\'est-ce qui a changé chez Marc? Justifie avec un indice de chaque passage.","points":["Nomme le changement (il affronte sa peur)","Donne un indice du début (il refuse)","Donne un indice de la fin (il monte malgré ses tremblements)"],"model":"Marc a appris à affronter sa peur : au début il refuse de monter, mais à la fin il monte même s\'il tremble.","why":"Un changement se prouve en comparant le personnage au début et à la fin."}',
  ].join('\n'),
};

/** What Claude is asked for. Built on item-writing research and what real school tests look like. */
export function writingPrompt(deck: { title: string; subject: string; language: Locale }, concepts: Concept[], already: string[] = [], about = ''): string {
  const fr = deck.language === 'fr';
  const list = concepts
    .map((c, i) => {
      const bits = [`${i + 1}. ${c.term} — ${c.summary}`];
      if (c.keyPoints.length) bits.push(`   Key points: ${c.keyPoints.slice(0, 5).join('; ')}`);
      if (c.examples.length) bits.push(`   Examples from the notes: ${c.examples.slice(0, 2).join('; ')}`);
      if (c.misconceptions.length) bits.push(`   Mistakes students make: ${c.misconceptions.slice(0, 3).join('; ')}`);
      if (c.steps?.length) bits.push(`   Steps in order: ${c.steps.join(' → ')}`);
      return bits.join('\n');
    })
    .join('\n');
  const n = PER_CONCEPT;
  return `You are an expert ${deck.subject || 'school'} teacher writing a real test for students aged 12-18 (Québec secondaire or a similar level: match the level the deck suggests).
Deck: "${deck.title}"${deck.subject ? ` · Subject: ${deck.subject}` : ''}
Write everything in ${fr ? 'French, with the vocabulary Québec schools use (PFEQ)' : 'English'}.

What the student studied (from their notes):
${list}
${about}
Write ${n} questions for EACH concept above (${n * concepts.length} lines in all). They must feel like a good teacher's test or a ministry exam at this level: they check that the student UNDERSTANDS and can USE each idea, never that they remember the notes' wording.

For each concept:
1. One "mcq" that tests understanding. Before writing it, think of the mistakes real students make about this idea (a misconception, a confusion with a related idea from this deck, a typical error); each wrong option is exactly what a student with one of those mistakes would answer. Give 3 or 4 options: only as many wrong options as there are genuinely tempting mistakes, never a silly filler.
2. One quick check: a "tf" statement (a false one states a real misconception, never a silly word swap; about half true, half false) OR a "typed" short answer (1-3 words: a term, name, date or number).
3. One application, whichever fits the concept best:
   - an "mcq" or "written" built on a short NEW document in "context" (an excerpt, a quotation, a data table, a situation or an experiment the student has never seen) that can only be answered by using that document, the way ministry exams do ("D'après le document…", "Quel passage montre que…", "Which best explains…");
   - a "written" answer (1-3 sentences: explain why or how, justify, or apply the idea) with 2-4 rubric points;
   - an "order" (only for a real sequence: steps, events, stages) or a "match" (3-5 pairs: example ↔ idea, cause ↔ effect).
When two concepts of this deck are easy to confuse, make questions that make the student tell them apart.
${already.length ? `\nThe student already has these questions, so write DIFFERENT ones (new situations, other angles):\n${already.slice(0, 40).map((p) => `- ${p.slice(0, 110).replace(/\n/g, ' ')}`).join('\n')}\n` : ''}
Rules (strict):
- Never copy the notes: no 5 or more words in a row from them. Invent new examples, names, numbers and excerpts.
- The question states the whole problem: it can be answered with the options covered. Never give the answer away (don't name the concept in a question whose answer is that concept; don't repeat a question word only in the right option).
- Options: same length, same grammar and style, no overlap, numbers in order; the right one must NOT be the longest or the most detailed. No "all/none of the above", no "always/never" giveaways, no trick wording, no double negatives; avoid "NOT"/"SAUF" questions.
- Exactly one defensible answer. Check every fact; if you are not completely sure something is accurate, write a different question.
- Keep each question short (25 words at most) and clear for this age; a "context" can be up to 70 words.
- "why": 1-2 kind sentences that teach WHY the answer is right (not just repeat it).
- mcq "wrong": for each option, in order, one short sentence on why it is wrong and which mistake makes it tempting ("" for the right option).
- "accepted" (typed): every acceptable answer: synonyms, with/without article, singular/plural, common spellings.
- "level": remember, understand, apply or analyze. Most questions should be understand or apply.

Examples of the style (from another deck: don't reuse them):
${EXAMPLES[deck.language]}

Reply with one JSON object per line and nothing else (no list, no code fence, no blank lines). "c" is the concept's number above. Shapes:
{"c":1,"type":"mcq","level":"understand","context":"(optional)","q":"…","options":["…","…","…","…"],"answer":2,"why":"…","wrong":["…","…","","…"]}
{"c":1,"type":"tf","level":"understand","q":"<the statement to judge>","answer":false,"why":"…"}
{"c":2,"type":"typed","level":"remember","q":"…","accepted":["…","…"],"why":"…"}
{"c":2,"type":"written","level":"apply","context":"(optional)","q":"…","points":["…","…","…"],"model":"…","why":"…"}
{"c":3,"type":"order","level":"understand","q":"…","steps":["first","second","third","fourth"],"why":"…"}
{"c":3,"type":"match","level":"understand","q":"…","pairs":[["…","…"],["…","…"],["…","…"]],"why":"…"}`;
}

/**
 * A second look by a fresh, quick Claude that never saw the answer key: it answers each one-tap
 * question; any it answers differently (or finds ambiguous) is dropped. Catches wrong keys and
 * questions with two defensible answers, the most common complaint about AI quizzes.
 */
export async function checkAnswers(questions: Question[], concepts: Concept[], language: Locale, signal?: AbortSignal): Promise<Set<string>> {
  const items = questions.filter((q): q is Extract<Question, { options: { id: string; text: string }[] }> & { correctId: string } => (q.format === 'multiple_choice' || q.format === 'true_false') && 'correctId' in q);
  if (items.length === 0) return new Set();
  const s = await getSample();
  if (!s) return new Set();
  const prompt = [
    `You are checking a school quiz (${language === 'fr' ? 'French' : 'English'}) before students see it. For each question, give the index of the one correct option. If no option is clearly correct, or two options could both be defended, answer -1.`,
    `Background from the student's course: ${concepts.map((c) => `${c.term}: ${c.summary}`).join(' | ').slice(0, 2500)}`,
    ...items.map((q, i) => `Q${i}: ${q.context ? `[${q.context}] ` : ''}${q.format === 'true_false' ? `True or false? ${q.prompt}` : q.prompt}\n${q.options.map((o, k) => `  ${k}) ${o.text}`).join('\n')}`),
    `Reply with only a JSON array of ${items.length} numbers, in order, for example [2,0,-1].`,
  ].join('\n\n');
  try {
    const raw = await (s as unknown as { json: <T>(i: string, o: object) => Promise<T> }).json<unknown>(prompt, { modelTier: 'quick', signal, cache: false });
    if (!Array.isArray(raw) || raw.length !== items.length) return new Set();
    const bad = new Set<string>();
    items.forEach((q, i) => {
      const k = Number(raw[i]);
      if (q.options[k]?.id !== q.correctId) bad.add(q.variantKey);
    });
    // A checker that disagrees with most of them is the one that's off: keep everything.
    return bad.size > items.length / 2 ? new Set() : bad;
  } catch {
    return new Set(); // no second look this time: keep them
  }
}

/** Gizmo-style "Explain": Claude explains one question again, differently, for this student. */
export async function explainAgain(x: { language: Locale; context?: string; prompt: string; options?: string[]; correct: string; given?: string; correctNow: boolean; explanation: string }): Promise<string> {
  const s = await getSample();
  if (!s) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
  const [style, about] = await Promise.all([explainStyle(), aboutLearner()]);
  const prompt = [
    `You are Revio, a friendly tutor for a student aged 12-18. Write in ${x.language === 'fr' ? 'French (Québec school vocabulary)' : 'English'}.`,
    'The student just answered this test question:',
    x.context ? `Document: ${x.context.slice(0, 1200)}` : '',
    `Question: ${x.prompt.slice(0, 800)}`,
    x.options?.length ? `Options: ${x.options.map((o) => `«${o}»`).join(', ')}` : '',
    `Correct answer: ${x.correct.slice(0, 600)}`,
    x.given ? `The student answered: ${x.given.slice(0, 600)} (${x.correctNow ? 'right' : 'wrong'})` : '',
    `The short explanation they already saw: ${x.explanation.slice(0, 600)}`,
    `Explain it again, differently and more simply, in ${style === 'short' ? '2 very short sentences' : style === 'detailed' ? '4-6 sentences' : '3-4 short sentences'}: why the correct answer is right${x.correctNow ? '' : ", what made the student's answer tempting and why it doesn't work"}. Use one everyday example or comparison a teenager knows${about ? ' (from what they like, if it fits)' : ''}. No greeting, no preamble, no markdown.`,
    about,
  ]
    .filter(Boolean)
    .join('\n');
  const r = await (s as unknown as (i: string, o: object) => Promise<{ text: string }>)(prompt, { modelTier: 'quick' });
  return r.text.trim().slice(0, 900);
}

const TOPUP_EVERY = 12 * 3_600_000;

/**
 * Questions always feel new: when a learner has met almost all of a deck's questions, Revio quietly
 * writes different ones in the background (at most twice a day per deck).
 */
export async function topUpIfLow(deckId: string) {
  if (runs.get(deckId)?.state.status === 'writing') return;
  const key = `lumo.topup.${deckId}`;
  try {
    if (Date.now() - Number(localStorage.getItem(key) ?? 0) < TOPUP_EVERY) return;
  } catch {
    /* no storage: still fine to check */
  }
  const f = await api<{ total: number; unseen: number; concepts: number }>(`/api/local/decks/${deckId}/fresh`).catch(() => null);
  if (!f || f.total === 0 || f.unseen >= Math.max(6, f.concepts)) return;
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* fine */
  }
  void writeQuestions(deckId, { more: true });
}
