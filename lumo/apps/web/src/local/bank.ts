import { BLOOM_LEVELS, buildQuestion, hashString, type Bloom, type Concept, type Format, type Locale, type OpenGrade, type OpenGradeNeed, type Question } from '@lumo/core';
import { getSample, withTimeout } from './reader';

/**
 * Real test questions, written by Claude once per deck (the "question bank").
 *
 * Built on how exam writers and learning science say good questions work: a new scenario, excerpt
 * or document to work on (never the notes' own sentences with a word removed), wrong options taken
 * from real student misconceptions, a mix of recall / why-how / application / comparison / short
 * constructed answers graded with a rubric, and feedback that explains why the right answer is
 * right AND why the tempting wrong one is wrong. Claude may bring in what the course usually covers
 * around the notes (and research the web where it can), always tied to the student's concepts.
 */

type Sample = NonNullable<Awaited<ReturnType<typeof getSample>>>;

const BANK_FORMATS: Format[] = ['multiple_choice', 'multiple_select', 'type_answer', 'explain', 'apply', 'compare', 'true_false_justify', 'ordering', 'matching', 'categorize', 'spot_mistake', 'calculation'];

const SHAPES = `Each question is one JSON object with "c" (the concept number), "format", "bloom" (remember | understand | apply | analyze), "source" ("notes" or "enrichment"), plus the fields for its format:
- multiple_choice: "prompt", "options" (4 strings), "correctIndex" (0-3), "explanation"
- multiple_select: "prompt", "options" (5 strings), "correctIndexes" (2-3 numbers), "explanation"
- type_answer: "prompt", "accepted" (every acceptable short answer, 1-4 words each), "explanation"
- explain | apply | compare: "prompt", "keyPoints" (2-4 elements a full-mark answer must contain: the rubric), "modelAnswer" (2-4 sentences), "explanation"
- true_false_justify: "prompt", "statement", "isTrue", "keyPoints" (what a correct justification says), "explanation"
- ordering: "prompt", "stepsInOrder" (3-6 steps in the CORRECT order), "explanation"
- matching: "prompt", "pairs" ([{"left","right"}], 3-5), "explanation"
- categorize: "prompt", "categories" ([{"name","items"}], 2-3 groups of 2-3), "explanation"
- spot_mistake: "prompt", "segments" (3-6 parts of a statement or worked answer, exactly one wrong), "wrongIndex", "corrections" (acceptable fixes), "explanation"
- calculation (only for numeric concepts): "prompt", "given" ([{"symbol","name","value","unit"}]), "answer" (number), "unit", "steps" (worked solution), "explanation"`;

const PROMPT = (deck: { title: string; subject: string; language: Locale }, concepts: Concept[], research: boolean) => `You write test questions for Lumo, a study app for students aged 12-18 (Québec secondaire and similar school systems).
Subject: ${deck.subject || 'unknown'} · Deck: "${deck.title}" · Write everything in ${deck.language === 'fr' ? 'French (Québec school vocabulary)' : 'English'}.

The student's concepts (from their notes):
${concepts.map((c, i) => `${i + 1}. ${c.term} — ${c.summary}${c.keyPoints.length ? ` (key points: ${c.keyPoints.slice(0, 4).join('; ')})` : ''}${c.examples.length ? ` (examples: ${c.examples.slice(0, 2).join('; ')})` : ''}`).join('\n')}

${research ? 'First search the web for what this course and level usually test on these concepts (curriculum pages, past exams, teacher resources). Use it to make the questions realistic, but every question must stay tied to one of the student\'s concepts above.\n\n' : ''}Write about 6 questions for EACH concept, the kind a good teacher would put on a real test:
1. one recall question, reworded (not a sentence from the notes with a word removed);
2. one "why / how" question about a cause, mechanism or reason;
3. one application question built on a NEW scenario, example, text excerpt or situation the student has never seen;
4. one question that tells it apart from a concept students often confuse it with;
5. one question working on a short document, excerpt, data table or case you write into the prompt (the way ministry exams do: "D'après le document…", "Which best explains…");
6. one short constructed answer (2-4 sentences) graded with a 2-4 element rubric (keyPoints).
At most 2 of a concept's questions may be multiple choice; vary the formats across the deck.

Rules (strict):
- Never copy the notes: no stem may reuse 5 or more words in a row from the concepts above; names, numbers, scenarios and excerpts must be new.
- Multiple choice: the stem is a full question answerable without the options; wrong options are real student misconceptions or typical errors, same length and style as the right one; no "all/none of the above"; exactly one correct (or 2-3 for multiple_select).
- "explanation" (1-3 sentences): why the right answer is right AND, for choices, why the most tempting wrong option is wrong (name the misconception). Kind and clear for a teenager.
- Put any scenario, excerpt or table at the start of "prompt", then a blank line, then the question.
- You may add what the course usually covers around a concept (classic examples, confusions, how it is tested): mark those questions "source": "enrichment". Stay at the student's level; leave out anything you are not sure is accurate.
- "c" is the concept's number in the list above.

${SHAPES}

Reply with only one JSON object, no other text: {"questions": [ ... ]}`;

/** Turn Claude's drafts into checked quiz questions (anything malformed is dropped). */
export function toQuestions(raw: unknown, concepts: Concept[], language: Locale, seedBase: string): Question[] {
  const list = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) return [];
  const out: Question[] = [];
  list.forEach((d: Record<string, unknown>, i) => {
    const concept = concepts[Number(d?.c) - 1];
    const format = String(d?.format) as Format;
    if (!concept || !BANK_FORMATS.includes(format)) return;
    const b = String(d.bloom);
    const bloom: Bloom = (BLOOM_LEVELS as readonly string[]).includes(b) ? (b as Bloom) : b === 'evaluate' || b === 'create' ? 'analyze' : 'understand';
    const q = buildQuestion(d, { conceptId: concept.id, format, bloom, language, seed: hashString(`${seedBase}:${i}`) });
    if (q && !copiesNotes(q, concept)) out.push(q);
  });
  return out;
}

/** The thing the student complained about: a sentence lifted from their notes. Reject those. */
function copiesNotes(q: Question, c: Concept): boolean {
  const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) ?? [];
  const notes = words([c.summary, ...c.keyPoints].join(' '));
  if (notes.length < 6) return false;
  const grams = new Set<string>();
  for (let i = 0; i + 6 <= notes.length; i++) grams.add(notes.slice(i, i + 6).join(' '));
  const stem = words(q.prompt);
  for (let i = 0; i + 6 <= stem.length; i++) if (grams.has(stem.slice(i, i + 6).join(' '))) return true;
  return false;
}

/**
 * Write the deck's question bank: concepts go to Claude in small groups (a few at a time), and
 * `onProgress` reports how many groups are done. Throws only if nothing at all could be written.
 */
export async function buildBank(
  deck: { id: string; title: string; subject: string; language: Locale; concepts: Concept[] },
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<Question[]> {
  const s = await getSample();
  if (!s) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
  const research = (s as unknown as { canResearch?: boolean }).canResearch === true;
  const groups: Concept[][] = [];
  for (let i = 0; i < deck.concepts.length; i += 5) groups.push(deck.concepts.slice(i, i + 5));
  let done = 0;
  opts.onProgress?.(0, groups.length);
  const results: Question[][] = [];
  let lastError: unknown = null;
  // Three groups at a time: quick enough, and gentle on rate limits.
  for (let g = 0; g < groups.length; g += 3) {
    const batch = groups.slice(g, g + 3);
    const got = await Promise.all(
      batch.map(async (concepts, k) => {
        try {
          const raw = await (s as Sample).json(PROMPT(deck, concepts, research), { signal: opts.signal, modelTier: 'default', ...(research ? { research: true } : {}) });
          return toQuestions(raw, concepts, deck.language, `${deck.id}:${g + k}:${Date.now()}`);
        } catch (e) {
          lastError = e;
          if ((e as { code?: string })?.code === 'cancelled' || opts.signal?.aborted) throw e;
          return [];
        } finally {
          opts.onProgress?.(++done, groups.length);
        }
      }),
    );
    results.push(...got);
  }
  const all = results.flat();
  if (all.length === 0) throw lastError ?? Object.assign(new Error('nothing_found'), { code: 'nothing_found' });
  return all;
}

/** Can Claude be asked right now without a permission pop-up mid-quiz? */
async function claudeReady(): Promise<Sample | null> {
  const u = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude?.use;
  if (!u) return null;
  const perms = (await withTimeout(u('permissions') as Promise<{ state: (n: string) => Promise<string> } | null>, 3000).catch(() => null)) ?? null;
  const state = perms ? await withTimeout(perms.state('sample'), 2000).catch(() => 'unavailable') : 'granted';
  if (state !== 'granted') return null;
  return withTimeout(getSample(), 3000).catch(() => null);
}

/** A written answer graded against its rubric, the way a teacher would. Undefined = use the word check. */
export async function gradeOpenWithClaude(q: Question, need: OpenGradeNeed, language: Locale): Promise<OpenGrade | undefined> {
  const s = await claudeReady();
  if (!s) return undefined;
  const prompt = [
    `You grade a student's written answer for a school test (ages 12-18). Feedback language: ${language === 'fr' ? 'French' : 'English'}.`,
    `Question: ${q.prompt.slice(0, 2000)}`,
    q.format === 'true_false_justify' ? `Statement: ${q.statement} (it is ${q.isTrue ? 'TRUE' : 'FALSE'})` : '',
    `Rubric — key points (a full-mark answer has at least ${need.minPoints}):\n${need.keyPoints.map((k, i) => `${i}. ${k}`).join('\n')}`,
    `Student answer: """${need.text.slice(0, 3000)}"""`,
    'Credit a key point when the idea is there in the student\'s own words; do not require exact wording. Be fair, not generous: vague or wrong statements earn nothing.',
    'Reply with only JSON: {"matched": [indexes of key points present], "feedback": "1-2 encouraging sentences on what to add or fix"}',
  ]
    .filter(Boolean)
    .join('\n\n');
  try {
    const r = await withTimeout(s.json<{ matched?: unknown; feedback?: unknown }>(prompt, { modelTier: 'quick' }), 12_000);
    const matched = (Array.isArray(r?.matched) ? r.matched : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < need.keyPoints.length);
    const set = [...new Set(matched)];
    const score = Math.min(1, set.length / Math.max(1, need.minPoints));
    return {
      score,
      matchedPoints: set.map((i) => need.keyPoints[i]!),
      missingPoints: need.keyPoints.filter((_, i) => !set.includes(i)),
      feedback: typeof r?.feedback === 'string' ? r.feedback.slice(0, 400) : undefined,
    };
  } catch {
    return undefined;
  }
}
