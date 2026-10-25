import { dedupeQuestions, factCoverage, hashString, readDraftLines, readDraftWhole, type Concept, type Locale, type Question } from '@lumo/core';
import { api, NETLIFY } from '../lib/api';
import { aboutLearner, explainStyle } from './memory';
import { getSample, type DeckOptions } from './reader';
import { writingNow } from './writingNow';

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

/** First writing: two questions on every fact (two angles), so a round has a choice and a retry. */
export const PER_FACT = 2;
/** Questions per call (about 5,000 words of reply); the first call is small so play can start fast. */
const PER_CALL = 24;
const FIRST_CALL = 8;
// Inside Claude a viewer runs a couple of calls at once; the website's own endpoint takes more.
const PARALLEL = NETLIFY ? 4 : 2;

/** The deck as the writer needs it. */
interface DeckForWriting {
  deck: { id: string; title: string; subject: string; language: Locale; options?: DeckOptions };
  concepts: Concept[];
  bank: Question[];
}

/** One fact to write about, and how many new questions it needs. */
interface Need {
  fact: number; // -1 = the idea as a whole (an idea with no listed facts)
  n: number;
  already: string[];
}
interface Task {
  concept: Concept;
  needs: Need[];
}

/**
 * Write (or, with `more`, add new) test questions for a deck. Safe to call again while it runs:
 * the same run is returned.
 * - first time (or after new notes were added): every fact gets PER_FACT questions;
 * - `more`: one new question, from a new angle, on every fact;
 * - `refresh`: one new question on each fact the learner has met every question of.
 */
export function writeQuestions(deckId: string, opts: { more?: boolean; refresh?: boolean } = {}): Promise<WriteState> {
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
  writingNow.add(deckId);
  run.promise = (async () => {
    try {
      await go(deckId, opts, run, emit);
    } catch (e) {
      run.state.status = 'error';
      run.state.error = (e as { code?: string })?.code ?? 'upstream_error';
    }
    writingNow.delete(deckId);
    if (run.state.status === 'writing') run.state.status = 'done';
    emit();
    return { ...run.state };
  })();
  emit();
  return run.promise;
}

/** What each fact needs written this time. */
function plan(d: DeckForWriting, opts: { more?: boolean; refresh?: boolean }, seen: Record<string, number>): Task[] {
  const cover = factCoverage(d.concepts, d.bank, seen);
  return d.concepts.flatMap((concept) => {
    const facts = concept.keyPoints.length ? concept.keyPoints.map((_, i) => i) : [-1];
    const needs = facts.flatMap((fact) => {
      const x = cover.get(`${concept.id}:${fact}`)!;
      const n = opts.more ? 1 : opts.refresh ? (x.unseen === 0 ? 1 : 0) : Math.max(0, PER_FACT - x.have);
      return n > 0 ? [{ fact, n, already: x.prompts.slice(-4) }] : [];
    });
    return needs.length ? [{ concept, needs }] : [];
  });
}

/** Ideas packed into calls of about PER_CALL questions (an idea stays whole unless it alone is bigger). */
function packCalls(tasks: Task[]): Task[][] {
  const calls: Task[][] = [];
  let cur: Task[] = [];
  let size = 0;
  for (const t of tasks) {
    const n = t.needs.reduce((a, x) => a + x.n, 0);
    const room = calls.length === 0 ? FIRST_CALL : PER_CALL;
    if (cur.length && size + n > room) {
      calls.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(t);
    size += n;
  }
  if (cur.length) calls.push(cur);
  return calls;
}

async function go(deckId: string, opts: { more?: boolean; refresh?: boolean }, run: Run, emit: () => void) {
  const d = await api<DeckForWriting>(`/api/decks/${deckId}/offline`);
  run.state.bank = d.bank.length;
  const s = await getSample();
  if (!s) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
  const seen = opts.refresh ? await api<{ seen: Record<string, number> }>(`/api/local/decks/${deckId}/seen`).then((r) => r.seen, () => ({})) : {};
  const about = await aboutLearner();

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

  const checks: Promise<unknown>[] = [];
  const writeCall = async (tasks: Task[], gi: number) => {
    const concepts = tasks.map((t) => t.concept);
    const ctx = { concepts, language: d.deck.language, seedBase: `${deckId}:${gi}:${Date.now()}` };
    let read = 0;
    const mine: Question[] = [];
    const take = (text: string, final: boolean) => {
      const got = readDraftLines(text, read, { ...ctx, final }, hashString);
      read = got.next;
      mine.push(...got.questions);
      save(got.questions);
    };
    try {
      const res = await (s as unknown as (input: string, o: object) => Promise<{ text: string }>)(writingPrompt(d.deck, tasks, d.concepts, about), {
        signal: run.ctl.signal,
        // The first small batch is quick, so there's something to play within seconds.
        modelTier: gi === 0 && !opts.more && !opts.refresh ? 'quick' : 'default',
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

  // A few calls at once: more just wait their turn.
  const runCalls = async (calls: Task[][], offset: number) => {
    let next = 0;
    const worker = async () => {
      while (next < calls.length && !fatal) {
        const gi = next++;
        await writeCall(calls[gi]!, offset + gi);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
  };

  const calls = packCalls(plan(d, opts, seen));
  run.state.groups = calls.length;
  run.state.expected = calls.flat().reduce((a, t) => a + t.needs.reduce((b, x) => b + x.n, 0), 0);
  emit();
  await runCalls(calls, 0);
  await Promise.all(checks);
  await saving;
  // Every fact gets its question: one more pass for any fact the replies skipped (or the checker dropped).
  if (!fatal && !opts.more && !opts.refresh && calls.length) {
    const missed = plan({ ...d, bank: existing }, {}, {}).map((t) => ({ ...t, needs: t.needs.filter((x) => !factCoverage([t.concept], existing).get(`${t.concept.id}:${x.fact}`)?.have) }));
    const gaps = packCalls(missed.filter((t) => t.needs.length).map((t) => ({ ...t, needs: t.needs.map((x) => ({ ...x, n: 1 })) })));
    if (gaps.length) {
      run.state.groups += gaps.length;
      emit();
      await runCalls(gaps, calls.length);
      await Promise.all(checks);
      await saving;
    }
  }
  if (run.state.saved === 0 && (fatal || lastError || existing.length === 0)) {
    throw Object.assign(new Error('failed'), { code: fatal ?? lastError ?? 'nothing_found' });
  }
}

/** Style examples (from good test practice), in the deck's language. Claude is told not to reuse them. */
const EXAMPLES: Record<Locale, string> = {
  en: [
    '{"c":1,"f":2,"type":"mcq","level":"apply","q":"An astronaut has a mass of 60 kg on Earth. What is her mass on the Moon?","options":["60 kg","10 kg","0 kg"],"answer":0,"why":"Mass is the amount of matter in her body, and a trip to the Moon doesn\'t change it. Only her weight drops.","wrong":["","That is her weight dropping to about 1/6, not her mass: mass and weight are different things.","Less gravity doesn\'t remove matter: she is made of exactly the same stuff."]}',
    '{"c":2,"f":1,"type":"mcq","level":"understand","q":"Why is it warmer in Québec in July than in January?","options":["Earth is closer to the Sun in July","The Sun gives off more energy in July","The Northern Hemisphere is tilted toward the Sun in July"],"answer":2,"why":"Earth\'s tilted axis makes the Sun\'s rays hit us more directly, and for longer days, in July.","wrong":["The classic mistake: Earth is actually farthest from the Sun in early July.","The Sun\'s output barely changes over a year.",""]}',
    '{"c":3,"f":[1,2],"type":"mcq","level":"analyze","context":"Mercury: 0.39 AU from the Sun, year = 88 days. Earth: 1 AU, 365 days. Mars: 1.52 AU, 687 days. Jupiter: 5.2 AU, 4 333 days.","q":"According to the table, which relationship holds?","options":["The farther a planet is from the Sun, the longer its year","The bigger a planet is, the longer its year","A planet\'s year does not depend on its distance"],"answer":0,"why":"Every planet farther out takes longer to go around the Sun.","wrong":["","Size isn\'t in the table, and Mars is smaller than Earth yet has a longer year.","The table shows the year growing with distance every time."]}',
    '{"c":4,"f":1,"type":"tf","level":"understand","q":"Astronauts float in the space station because there is no gravity up there.","answer":false,"why":"At 400 km, gravity is still about 90% as strong: astronauts float because they are falling around Earth together with the station."}',
    '{"c":5,"f":3,"type":"typed","level":"remember","q":"Which planet has the shortest year?","accepted":["Mercury","planet Mercury"],"wrong":["Venus","Mars","Pluto"],"why":"Mercury is the closest planet to the Sun, so its orbit is the shortest: 88 days."}',
  ].join('\n'),
  fr: [
    '{"c":1,"f":1,"type":"mcq","level":"apply","context":"« Pourquoi ai-je dit oui? Je déteste les hauteurs. Si je recule, Max ne me reparlera jamais. » Marc agrippa la rampe.","q":"Quel procédé révèle surtout l\'état intérieur de Marc?","options":["Le monologue intérieur","Un dialogue avec Max","La description des lieux"],"answer":0,"why":"Les phrases entre guillemets sont les pensées de Marc : il se parle à lui-même, ce qui montre sa peur.","wrong":["","Piège : les guillemets font penser à un dialogue, mais Marc ne s\'adresse à personne.","La rampe est un détail du lieu, mais elle ne dit rien de ce que Marc ressent."]}',
    '{"c":2,"f":2,"type":"mcq","level":"apply","q":"Dans un récit, quelle phrase est l\'élément déclencheur?","options":["Un matin, une lettre sans adresse l\'attendait sur la table.","Depuis trois ans, Léa vivait seule avec sa grand-mère au bord du fleuve.","Elle courut jusqu\'au quai, mais le traversier était déjà parti."],"answer":0,"why":"La lettre mystérieuse brise l\'équilibre de départ : c\'est elle qui lance l\'histoire.","wrong":["","C\'est la situation initiale : elle décrit la vie avant que quelque chose change.","C\'est une péripétie du déroulement : l\'action est déjà lancée."]}',
    '{"c":3,"f":1,"type":"tf","level":"understand","q":"Dans une nouvelle, la situation finale peut être absente.","answer":true,"why":"Beaucoup de nouvelles se terminent sur le dénouement ou une chute, sans situation finale."}',
    '{"c":4,"f":2,"type":"typed","level":"remember","q":"Comment appelle-t-on l\'étape du schéma narratif qui met fin aux péripéties?","accepted":["le dénouement","dénouement"],"wrong":["la situation finale","l\'élément déclencheur","le déroulement"],"why":"Le dénouement règle le problème; la situation finale décrit ensuite le nouvel équilibre."}',
    '{"c":5,"f":[1,2],"type":"written","level":"analyze","context":"Au début, Marc refuse de monter sur le pont. À la fin, il y monte en tremblant.","q":"Qu\'est-ce qui a changé chez Marc? Justifie avec un indice de chaque passage.","points":["Nomme le changement (il affronte sa peur)","Donne un indice du début (il refuse)","Donne un indice de la fin (il monte malgré ses tremblements)"],"model":"Marc a appris à affronter sa peur : au début il refuse de monter, mais à la fin il monte même s\'il tremble.","why":"Un changement se prouve en comparant le personnage au début et à la fin."}',
  ].join('\n'),
};

/** The mix of question kinds, from the learner's choices for this deck. */
function mixLine(o: DeckOptions | undefined): string {
  const styles = o?.styles ?? [];
  const parts: string[] = [];
  if (styles.length === 0) parts.push('Mix the kinds over the whole test: about 45% "mcq", 20% "tf", 20% "typed", 15% "written", "order" or "match" (only where they fit).');
  else {
    parts.push('The student chose the kinds of questions they want, so most questions are of these kinds:');
    if (styles.includes('quick')) parts.push('- quick checks: "typed" short answers, "tf" and direct "mcq" (who, what, when, where);');
    if (styles.includes('understand')) parts.push('- understanding: "mcq" and "tf" on why and how, and on telling similar ideas apart;');
    if (styles.includes('apply')) parts.push('- using it: "mcq" or "written" questions on a new situation, example or short document in "context";');
    if (styles.includes('written')) parts.push('- written answers: "written" (1-3 sentences: explain, justify, compare) with 2-4 rubric points;');
    parts.push('Still vary the angle on each fact.');
  }
  const diff =
    o?.difficulty === 'easier'
      ? 'Level: on the easy side. Mostly remember and understand, direct and clear questions, wrong options that are plausible but not tricky.'
      : o?.difficulty === 'harder'
        ? 'Level: challenging. Mostly understand, apply and analyze; new situations; wrong options that only a student who truly understands can rule out (still fair, never trick wording).'
        : 'Level: most questions understand or apply, some remember.';
  return [...parts, diff].join('\n');
}

/** What Claude is asked for. Built on item-writing research and what real school tests look like. */
export function writingPrompt(deck: { title: string; subject: string; language: Locale; options?: DeckOptions }, tasks: Task[] | Concept[], all: readonly Concept[] = [], about = ''): string {
  const fr = deck.language === 'fr';
  // Plain concepts (no plan): two questions on each fact.
  const plan: Task[] = (tasks as (Task | Concept)[]).map((t) =>
    'needs' in t ? t : { concept: t, needs: (t.keyPoints.length ? t.keyPoints.map((_, i) => i) : [-1]).map((fact) => ({ fact, n: PER_FACT, already: [] })) },
  );
  const total = plan.reduce((a, t) => a + t.needs.reduce((b, x) => b + x.n, 0), 0);
  const list = plan
    .map((t, i) => {
      const c = t.concept;
      const bits = [`${i + 1}. ${c.term} — ${c.summary}`];
      if (c.keyPoints.length) {
        const wanted = new Map(t.needs.map((x) => [x.fact, x.n]));
        bits.push(...c.keyPoints.map((k, f) => `   [${f + 1}] ${k}${wanted.has(f) ? ` → write ${wanted.get(f)}` : ' (no question needed now)'}`));
      } else bits.push(`   (the idea as a whole) → write ${t.needs[0]?.n ?? PER_FACT}`);
      if (c.examples.length) bits.push(`   Examples from the notes: ${c.examples.slice(0, 2).join('; ')}`);
      if (c.misconceptions.length) bits.push(`   Mistakes students make: ${c.misconceptions.slice(0, 3).join('; ')}`);
      if (c.steps?.length) bits.push(`   Steps in order: ${c.steps.join(' → ')}`);
      const already = t.needs.filter((x) => x.already.length);
      if (already.length) bits.push(`   Already asked (write DIFFERENT questions, from other angles): ${already.map((x) => `${x.fact >= 0 ? `[${x.fact + 1}] ` : ''}${x.already.map((p) => `"${p.slice(0, 90).replace(/\n/g, ' ')}"`).join('; ')}`).join(' · ')}`);
      return bits.join('\n');
    })
    .join('\n');
  const mine = new Set(plan.map((t) => t.concept.id));
  const others = all.filter((c) => !mine.has(c.id)).slice(0, 40);
  const o = deck.options;
  return `You are an expert ${deck.subject || 'school'} teacher writing a real test for students aged 12-18 (${o?.level ? `level: ${o.level}` : 'Québec secondaire or a similar level: match the level the deck suggests'}).
Deck: "${deck.title}"${deck.subject ? ` · Subject: ${deck.subject}` : ''}
Write everything in ${fr ? 'French, with the vocabulary Québec schools use (PFEQ)' : 'English'}.
${o?.focus ? `The student says: """${o.focus}"""\n` : ''}
What the student studied: each idea has numbered facts, and next to each fact how many questions to write on it.
${list}
${others.length ? `\nOther ideas in this deck (use them for tempting wrong answers, and to make the student tell similar ideas apart): ${others.map((c) => `${c.term} (${c.summary.slice(0, 70)})`).join('; ')}\n` : ''}${about}
Write exactly the number of questions asked for each fact (${total} lines in all). Each question tests that fact and gives its number in "f" (a question that needs two facts of the same idea lists both). They must feel like a good teacher's test or a ministry exam at this level: they check that the student KNOWS and UNDERSTANDS each fact and can USE it, never that they remember the notes' wording.

When a fact gets two or more questions, each one takes a DIFFERENT angle, for example:
- ask for it directly (who, what, when, where, how many), as a "typed" short answer or an "mcq";
- the other way round: describe it and ask for the name, term, date or place;
- why or how it is so, or what it causes ("mcq" or "written");
- use it in a new situation, example or short document the student has never seen ("mcq" with a "context", or "written"), the way ministry exams do ("D'après le document…", "Which best explains…");
- tell it apart from a similar idea of this deck ("mcq" or "tf");
- a "tf" statement that is true, or false because of a mistake real students make (never a silly word swap); about half true, half false;
- an "order" (only for a real sequence: steps, events, stages) or a "match" (3-5 pairs) when the facts are steps or pairs.
${mixLine(o)}

Wrong options (they make or break a test):
- Each wrong option is what a student with a real gap would pick: a common misconception, a confusion with another idea of this deck, a nearby date or number, a person or place of the same kind.
- Same category and form as the right answer (dates with dates, cities with cities), same length and style; the right one must NOT be the longest or the most detailed.
- 4 options when there are 3 genuinely tempting wrong answers, else 3. Never a joke option, never an option that is also right.
- "typed": the answer is 1-3 words (a term, name, date or number); "accepted" lists every acceptable form (synonyms, with/without article, singular/plural, common spellings, a name with and without the first name); "wrong" gives 3 tempting wrong answers of the same kind.

Rules (strict):
- Never copy the notes: no 5 or more words in a row from them. Invent new examples, names, numbers and excerpts.
- The question states the whole problem: it can be answered with the options covered. Never give the answer away (don't name the concept in a question whose answer is that concept; don't repeat a question word only in the right option).
- No "all/none of the above", no "always/never" giveaways, no trick wording, no double negatives; avoid "NOT"/"SAUF" questions.
- Exactly one defensible answer. Check every fact; if you are not completely sure something is accurate, write a different question.
- Keep each question short (25 words at most) and clear for this age; a "context" can be up to 70 words.
- "why": 1-2 kind sentences that teach WHY the answer is right (not just repeat it).
- mcq "wrong": for each option, in order, one short sentence on why it is wrong and which mistake makes it tempting ("" for the right option).
- "level": remember, understand, apply or analyze.

Examples of the style (from another deck: don't reuse them):
${EXAMPLES[deck.language]}

Reply with one JSON object per line and nothing else (no list, no code fence, no blank lines). "c" is the idea's number above, "f" the fact's number. Shapes:
{"c":1,"f":1,"type":"mcq","level":"understand","context":"(optional)","q":"…","options":["…","…","…","…"],"answer":2,"why":"…","wrong":["…","…","","…"]}
{"c":1,"f":2,"type":"tf","level":"understand","q":"<the statement to judge>","answer":false,"why":"…"}
{"c":2,"f":1,"type":"typed","level":"remember","q":"…","accepted":["…","…"],"wrong":["…","…","…"],"why":"…"}
{"c":2,"f":[1,2],"type":"written","level":"apply","context":"(optional)","q":"…","points":["…","…","…"],"model":"…","why":"…"}
{"c":3,"f":[1,2,3],"type":"order","level":"understand","q":"…","steps":["first","second","third","fourth"],"why":"…"}
{"c":3,"f":1,"type":"match","level":"understand","q":"…","pairs":[["…","…"],["…","…"],["…","…"]],"why":"…"}`;
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
    `You are Lumo, a friendly tutor for a student aged 12-18. Write in ${x.language === 'fr' ? 'French (Québec school vocabulary)' : 'English'}.`,
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

const TOPUP_EVERY = 2 * 3_600_000;

/**
 * Questions always feel new: when the learner has met every question of some of a deck's facts,
 * Lumo quietly writes a new one, from another angle, for each of those facts (at most every 2 hours
 * per deck). The first writing that was cut short is finished too.
 */
export async function topUpIfLow(deckId: string) {
  if (runs.get(deckId)?.state.status === 'writing') return;
  const key = `lumo.topup.${deckId}`;
  try {
    if (Date.now() - Number(localStorage.getItem(key) ?? 0) < TOPUP_EVERY) return;
  } catch {
    /* no storage: still fine to check */
  }
  const f = await api<{ total: number; facts: number; uncovered: number; spent: number }>(`/api/local/decks/${deckId}/fresh`).catch(() => null);
  // Nothing written yet (that's the deck page's job), or plenty of new questions left.
  if (!f || f.total === 0 || (f.uncovered === 0 && f.spent < Math.max(3, f.facts / 4))) return;
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* fine */
  }
  void writeQuestions(deckId, f.uncovered > 0 ? {} : { refresh: true });
}
