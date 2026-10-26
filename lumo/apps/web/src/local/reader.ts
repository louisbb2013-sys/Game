import { CONCEPT_KINDS, type ConceptInput, type ConceptKind, type Locale } from '@lumo/core';
import { aboutLearner } from './memory';

/**
 * Browser-only build: read photos of notes with Claude through the page's `sample` capability
 * (the viewer's own Claude account, after they allow it). Absent outside a Claude viewer.
 */

type Sample = ((input: string, options?: object) => Promise<{ text: string }>) & {
  json: <T>(input: string, options?: object) => Promise<T>;
  limits: () => Promise<{ images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>;
};

let samplePromise: Promise<Sample | null> | null = null;
/** Rejects when `p` takes longer than `ms` (the platform call itself is left to settle on its own). */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

function use<T>(name: string): Promise<T | null> {
  const u = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude?.use;
  if (!u) return Promise.resolve(null);
  return withTimeout(u(name) as Promise<T | null>, 3000).then((x) => x ?? null, () => null);
}

export function getSample(): Promise<Sample | null> {
  const use = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude?.use;
  if (!use) return Promise.resolve(null);
  samplePromise ??= use('sample').then((s) => (s as Sample | null) ?? null, () => null);
  return samplePromise;
}

/** Photos (or files) one deck can be made from: they're read a few at a time (see readPhotos). */
export const PHOTOS_PER_DECK = 20;
/** Most sub-aspects one deck keeps (each with up to MAX_FACTS facts). */
const MAX_CONCEPTS = 90;
const MAX_FACTS = 8;

/** What this view can send: null = no photo reading here. `maxCount` is per deck; `perCall` per request. */
export async function photoLimits() {
  const s = await getSample();
  if (!s) return null;
  const l = await s.limits().catch(() => null);
  if (!l?.images) return null;
  return { ...l.images, perCall: l.images.maxCount, maxCount: Math.max(l.images.maxCount, PHOTOS_PER_DECK) };
}

export class ReaderError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** How the learner wants a deck made (chosen on the create screen, kept with the deck for every question Claude writes). */
export interface DeckOptions {
  /** School level, in their words ("Secondaire 2", "Grade 9"). */
  level?: string;
  /** key = the main ideas only; all = every fact (default); deep = every fact, plus the why and how. */
  detail?: 'key' | 'all' | 'deep';
  difficulty?: 'easier' | 'normal' | 'harder';
  /** Kinds of questions they want (none chosen = a good mix). */
  styles?: QuestionStyle[];
  /** What to focus on, what to skip, what the test is about. */
  focus?: string;
}
export const QUESTION_STYLES = ['quick', 'understand', 'apply', 'written'] as const;
export type QuestionStyle = (typeof QUESTION_STYLES)[number];

/** Keep only well-formed options (from the create screen or a stored deck). */
export function cleanOptions(o: unknown): DeckOptions {
  const x = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
  const out: DeckOptions = {};
  if (typeof x.level === 'string' && x.level.trim()) out.level = x.level.trim().slice(0, 60);
  if (x.detail === 'key' || x.detail === 'all' || x.detail === 'deep') out.detail = x.detail;
  if (x.difficulty === 'easier' || x.difficulty === 'normal' || x.difficulty === 'harder') out.difficulty = x.difficulty;
  if (Array.isArray(x.styles)) {
    const styles = QUESTION_STYLES.filter((st) => (x.styles as unknown[]).includes(st));
    if (styles.length && styles.length < QUESTION_STYLES.length) out.styles = styles;
  }
  if (typeof x.focus === 'string' && x.focus.trim()) out.focus = x.focus.trim().slice(0, 600);
  return out;
}

export interface DeckDraft {
  title: string;
  subject: string;
  summary: string;
  language: Locale;
  concepts: ConceptInput[];
  options?: DeckOptions;
}

/** A sub-aspect a deck already has (when adding new notes to it). */
export interface KnownIdea {
  topic: string;
  term: string;
  facts: string[];
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, n: number, max = 300) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}0-9]+/gu, ' ').trim();

/** Keep only well-formed sub-aspects, trimmed to the same limits the server uses. */
function clean(raw: unknown): ConceptInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).flatMap((c: Record<string, unknown>) => {
    const term = str(c?.term, 160);
    const summary = str(c?.summary, 600);
    // Every fact the notes give about it (older replies called them keyPoints).
    const facts = [...new Map(list(c?.facts ?? c?.keyPoints, MAX_FACTS * 2).map((f) => [norm(f), f])).values()];
    if (!term || (!summary && facts.length === 0)) return [];
    const kind = (CONCEPT_KINDS as readonly string[]).includes(String(c.kind)) && c.kind !== 'formula' ? (c.kind as ConceptKind) : 'definition';
    const steps = list(c.steps, 10);
    const causeEffects = Array.isArray(c.causeEffects)
      ? (c.causeEffects as Record<string, unknown>[]).map((x) => ({ cause: str(x?.cause, 300), effect: str(x?.effect, 300) })).filter((x) => x.cause && x.effect).slice(0, 6)
      : [];
    const base = {
      topic: str(c.topic, 120) || 'General',
      kind: kind === 'process' && steps.length < 2 ? ('definition' as const) : kind,
      term,
      summary: summary || facts[0]!,
      misconceptions: list(c.misconceptions, 6),
      examples: list(c.examples, 4),
      synonyms: list(c.synonyms, 8, 160),
      ...(steps.length >= 2 ? { steps } : {}),
      ...(causeEffects.length ? { causeEffects } : {}),
    };
    return [{ ...base, keyPoints: facts }];
  });
}

const PART = /\s\((\d+)\)$/;

/** Words that carry a fact's meaning (not "the", "le", "est"…). */
const SMALL = new Set('the a an of in on at to is are was were and or for by with from that this it its le la les un une des de du au aux et ou en est sont était dans par pour sur avec qui que ce cette ces se sa son ses leur leurs'.split(' '));
function factWords(f: string): Set<string> {
  return new Set(norm(f).split(' ').filter((w) => w && !SMALL.has(w)));
}
/** Two facts that say the same thing in nearly the same words. */
function similar(a: Set<string>, b: Set<string>): boolean {
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both) >= 0.8;
}

/**
 * The same sub-aspect read twice (on two pages, or already in the deck) is kept once, with all its
 * facts; one with too many facts is split in parts ("Rome", "Rome (2)"), each fact still its own question.
 */
export function mergeIdeas(lists: ConceptInput[][]): ConceptInput[] {
  const byKey = new Map<string, ConceptInput>();
  for (const c of lists.flat()) {
    const term = c.term.replace(PART, '');
    const key = norm(term);
    const had = byKey.get(key);
    if (!had) {
      byKey.set(key, { ...c, term, keyPoints: [...c.keyPoints] });
      continue;
    }
    const seen = new Set(had.keyPoints.map(norm));
    for (const f of c.keyPoints) {
      if (seen.has(norm(f))) continue;
      seen.add(norm(f));
      had.keyPoints.push(f);
    }
    if (!had.examples.length) had.examples = c.examples;
    if (!had.misconceptions.length) had.misconceptions = c.misconceptions;
  }
  // The same fact written twice (under two ideas, or read on two pages): kept the first time only.
  const met: Set<string>[] = [];
  const emptied = new Set<ConceptInput>();
  for (const c of byKey.values()) {
    const had = c.keyPoints.length;
    c.keyPoints = c.keyPoints.filter((f) => {
      const w = factWords(f);
      if (w.size >= 3 && met.some((m) => similar(m, w))) return false;
      met.push(w);
      return true;
    });
    if (had && !c.keyPoints.length) emptied.add(c); // everything it said is said elsewhere
  }
  return [...byKey.values()]
    .filter((c) => !emptied.has(c))
    .flatMap((c) => {
      if (c.keyPoints.length <= MAX_FACTS) return [c];
      const parts: ConceptInput[] = [];
      for (let i = 0; i < c.keyPoints.length; i += MAX_FACTS) parts.push({ ...c, term: i ? `${c.term} (${i / MAX_FACTS + 1})` : c.term, keyPoints: c.keyPoints.slice(i, i + MAX_FACTS) });
      return parts;
    })
    .slice(0, MAX_CONCEPTS);
}

type Meta = { title?: unknown; subject?: unknown; summary?: unknown };

/**
 * Claude's reply, one JSON object per line: a first line with the title, then one line per
 * sub-aspect. A reply cut short keeps every finished line. A reply written as one big object
 * ({"title", "concepts": [...]}) is read too.
 */
export function readDeckLines(text: string): { meta: Meta; concepts: ConceptInput[] } {
  let meta: Meta = {};
  const raw: unknown[] = [];
  for (const line0 of text.split('\n')) {
    const line = line0.trim().replace(/^[-*]\s+/, '').replace(/,$/, '');
    if (!line.startsWith('{') || !line.endsWith('}')) continue;
    try {
      const o = JSON.parse(line) as Record<string, unknown>;
      if (Array.isArray(o.concepts)) {
        meta = o;
        raw.push(...o.concepts);
      } else if (typeof o.term === 'string') raw.push(o);
      else if (typeof o.title === 'string' && !meta.title) meta = o;
    } catch {
      /* a broken line: skip it, keep the rest */
    }
  }
  if (raw.length === 0) {
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        const o = JSON.parse(text.slice(a, b + 1)) as Meta & { concepts?: unknown };
        if (Array.isArray(o.concepts)) return { meta: o, concepts: mergeIdeas([clean(o.concepts)]) };
      } catch {
        /* nothing readable */
      }
    }
  }
  return { meta, concepts: mergeIdeas([clean(raw)]) };
}

type Source = 'files' | 'notes' | 'topic';

/** What Claude is asked, for photos/files, typed notes or just a topic. */
export function readingPrompt(source: Source, language: Locale, o: { options?: DeckOptions; extra?: string; notes?: string; topic?: string; research?: boolean; known?: KnownIdea[]; part?: string } = {}): string {
  const opt = o.options ?? {};
  const detail = opt.detail ?? 'all';
  const lang = language === 'fr' ? 'French (with the vocabulary Québec schools use)' : 'English';
  const intro =
    source === 'files'
      ? "You are Lumo, a study helper for school students. The attached files are a student's study material: photos of their notes or textbook pages, or a PDF (notes, slides, a worksheet)."
      : source === 'notes'
        ? "You are Lumo, a study helper for school students. Below are a student's notes (typed or pasted)."
        : `You are Lumo, a study helper for school students. A student typed what they want to study, with no notes:\n"""${(o.topic ?? '').slice(0, 500)}"""\nIt may name a school level or program (for example "secondaire 2" is Québec grade 8, age 13-14; "Year 9", "5e", "Grade 10"). Match that level and that school system's curriculum.\n${o.research ? 'First search the web for reliable sources on this topic at that level (curriculum pages, school or teacher sites, encyclopedias), then build the deck from what you found.' : 'Build the deck from what a teacher would expect at that level.'}`;
  const amount =
    source === 'topic'
      ? detail === 'key'
        ? 'Cover the key ideas a test at that level asks about: about 12-20 sub-aspects, 35-60 facts in all.'
        : 'Cover what a student must know for a test on it at that level: about 20-35 sub-aspects, 70-110 facts in all.'
      : detail === 'key'
        ? 'Keep only what a test would most likely ask (main ideas, key terms, key dates and names); leave small details out.'
        : 'Leave nothing out: every fact in the material gets its own entry, even a small one (if the notes say "the Romans lived in Italy", that is a fact). There is no fixed number: a page of notes often holds 15-40 facts.';
  const fromWhere = source === 'topic' ? 'Only facts you are sure of, at this level.' : 'Only facts that are in the material (if the notes contain an obvious mistake, write the correct fact). Write them in clear words of your own.';
  return [
    intro,
    `Break it into the precise sub-aspects ("sous-aspects") a student must know for a test, and list every fact about each one. Write everything in ${lang}.`,
    opt.level ? `The student's level: ${opt.level.slice(0, 60)}. Match its vocabulary and depth.` : '',
    o.extra || opt.focus ? `The student says: """${[opt.focus, o.extra].filter(Boolean).join('\n').slice(0, 2000)}"""` : '',
    o.notes !== undefined ? `Notes:\n"""${o.notes.slice(0, 24_000)}"""` : '',
    '',
    'How to break it down:',
    '- "topic": the section or chapter it belongs to (2-8 words). Every sub-aspect of the same section uses exactly the same topic, and lines follow the order of the material.',
    '- One line = ONE sub-aspect: a single term, person, place, event, date, rule, process, part, cause or category. Something with several sides (a war: its causes, its main battles, its results) is split into one sub-aspect per side.',
    `- "facts": ${detail === 'key' ? '1-3' : '1-5'} facts about that sub-aspect, each one short, complete sentence that stands alone and that a test could ask about (who, what, when, where, how many, why, how, what it causes, what it is made of). One piece of information per fact (don't pack a date, a person and a cause into one sentence), but a short list that answers one question stays one fact (e.g. "On the forum, Romans did business, politics and religion"). More facts than that: split the sub-aspect in two.`,
    '- Each fact appears ONCE in the whole deck: never repeat a fact, a date or an event under another sub-aspect (put it under the one it fits best).',
    '- Everything a test could ask goes in "facts"; "synonyms", "examples", "steps" and "causeEffects" only add to the facts, never replace them.',
    `- ${amount}`,
    `- ${fromWhere}`,
    detail === 'deep' ? '- For each sub-aspect, add one more fact that explains WHY or HOW (what a good teacher would add at this level), only if you are sure it is correct.' : '',
    '- "summary": one clear sentence that explains the sub-aspect without repeating its name. "misconceptions": 0-2 mistakes students really make about it. "examples": 0-2 examples (from the material when it has some).',
    source === 'topic' ? '' : '- Skip page numbers, headers, the class date, the teacher\'s name and decoration.',
    o.known?.length
      ? `\nThe deck ALREADY has these sub-aspects (topic › term: facts):\n${o.known
          .slice(0, 120)
          .map((k) => `- ${k.topic} › ${k.term}: ${k.facts.join(' | ').slice(0, 300)}`)
          .join('\n')}\nOnly write lines for what is NEW in this material: a new sub-aspect, or new facts about one above (then use its exact term and topic, and list ONLY the new facts). Never repeat a fact already listed.`
      : '',
    o.part ?? '',
    '',
    'Reply with one JSON object per line and nothing else (no list around them, no code fence, no blank lines). The first line:',
    '{"title": "short title", "subject": "school subject", "summary": "one sentence"}',
    'then one line per sub-aspect, leaving out keys that would be empty:',
    `{"topic": "…", "kind": "${CONCEPT_KINDS.filter((k) => k !== 'formula').join(' | ')}", "term": "the sub-aspect, short", "summary": "…", "facts": ["…", "…"], "examples": ["…"], "misconceptions": ["…"], "synonyms": ["…"], "steps": ["only for a process, in order"], "causeEffects": [{"cause": "…", "effect": "…"}]}`,
    source === 'topic' ? 'If the request is not a school topic, reply only {"title": ""}.' : 'If there is no study material, reply only {"title": ""}.',
  ]
    .filter((x) => x !== '')
    .join('\n');
}

type TextSample = (input: string, o: object) => Promise<{ text: string; truncated?: boolean }>;

/** One reading call: its finished lines, even when the reply was cut short or failed midway. */
async function readOnce(s: Sample, prompt: string, o: object): Promise<{ meta: Meta; concepts: ConceptInput[] }> {
  try {
    const r = await (s as unknown as TextSample)(prompt, { modelTier: 'default', cache: false, ...o });
    return readDeckLines(r.text);
  } catch (e) {
    const partial = (e as { text?: unknown })?.text;
    if (typeof partial === 'string') {
      const got = readDeckLines(partial);
      if (got.concepts.length) return got;
    }
    throw new ReaderError(String((e as { code?: string })?.code ?? 'upstream_error'));
  }
}

function draftFrom(read: { meta: Meta; concepts: ConceptInput[] }[], language: Locale, options: DeckOptions | undefined, fallbackTitle = ''): DeckDraft {
  const concepts = mergeIdeas(read.map((r) => r.concepts));
  if (concepts.length === 0) throw new ReaderError('nothing_found');
  const first = read.find((r) => str(r.meta.title, 120)) ?? read[0]!;
  const opts = cleanOptions(options);
  return { title: str(first.meta.title, 120) || fallbackTitle.slice(0, 120), subject: str(first.meta.subject, 80), summary: str(first.meta.summary, 1000), language, concepts, ...(Object.keys(opts).length ? { options: opts } : {}) };
}

/**
 * Photos (and optional instructions) → a deck draft. Many pages are read a few at a time (all at
 * once), then put together. Throws ReaderError with a code for the UI.
 */
export async function readPhotos(files: File[], language: Locale, extra: string, signal?: AbortSignal, options?: DeckOptions, known?: KnownIdea[]): Promise<DeckDraft> {
  const s = await getSample();
  if (!s) throw new ReaderError('unavailable');
  const per = Math.max(1, (await s.limits().catch(() => null))?.images?.maxCount ?? 5);
  const groups: File[][] = [];
  for (let i = 0; i < files.length; i += per) groups.push(files.slice(i, i + per));
  const about = await aboutLearner();
  const results = await Promise.allSettled(
    groups.map((group, i) => {
      const part = groups.length > 1 ? `(These are pages ${i * per + 1}-${i * per + group.length} of ${files.length}; the other pages are read separately, so cover only these.)` : '';
      return readOnce(s, readingPrompt('files', language, { options, extra, known, part }) + about, { images: group, signal });
    }),
  );
  const read = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!read.some((r) => r.concepts.length)) {
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw failed ? (failed.reason instanceof ReaderError ? failed.reason : new ReaderError('upstream_error')) : new ReaderError('nothing_found');
  }
  return draftFrom(read, language, options);
}

/** Typed or pasted notes → a deck draft, read by Claude (better ideas than the built-in reader). */
export async function deckFromNotes(notes: string, language: Locale, signal?: AbortSignal, options?: DeckOptions, known?: KnownIdea[]): Promise<DeckDraft> {
  const s = await getSample();
  if (!s) throw new ReaderError('unavailable');
  const about = await aboutLearner();
  // Long notes are read in parts (all at once), so no reply runs out of room.
  const parts: string[] = [];
  for (let rest = notes.slice(0, 48_000); rest.length; ) {
    let cut = rest.length <= 12_000 ? rest.length : rest.lastIndexOf('\n', 12_000);
    if (cut < 6_000) cut = Math.min(rest.length, 12_000);
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  const results = await Promise.allSettled(
    parts.map((p, i) => readOnce(s, readingPrompt('notes', language, { options, notes: p, known, part: parts.length > 1 ? `(This is part ${i + 1} of ${parts.length} of the notes; the other parts are read separately, so cover only this one.)` : '' }) + about, { signal })),
  );
  const read = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!read.some((r) => r.concepts.length)) {
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw failed ? (failed.reason instanceof ReaderError ? failed.reason : new ReaderError('upstream_error')) : new ReaderError('nothing_found');
  }
  return draftFrom(read, language, options);
}

/** Can this view ask Claude at all (to read photos or build a deck from a topic)? */
export async function canAskClaude(): Promise<boolean> {
  return (await getSample()) !== null;
}

/** Just a topic (no notes): Claude researches it and builds a deck draft. */
export async function deckFromTopic(topic: string, language: Locale, signal?: AbortSignal, options?: DeckOptions, known?: KnownIdea[]): Promise<DeckDraft> {
  const s = await getSample();
  if (!s) throw new ReaderError('unavailable');
  // The standalone site's Claude can search the web first; inside the Claude viewer it uses what it knows.
  const research = (s as unknown as { canResearch?: boolean }).canResearch === true;
  const read = await readOnce(s, readingPrompt('topic', language, { options, topic, research, known }) + (await aboutLearner()), { signal, ...(research ? { research: true } : {}) });
  return draftFrom([read], language, options, topic);
}

/** Short answers in other words: Claude decides if each means the same as an expected answer. */
export async function judgeShort(question: string, checks: { key: string; given: string; expected: string[] }[], language: Locale): Promise<Record<string, boolean>> {
  if (checks.length === 0) return {};
  // Only when the viewer already allowed Claude here: a consent sheet popping up mid-quiz (on a
  // phone it can cover the Check button) must never hold up an answer.
  const perms = await use<{ state: (n: string) => Promise<string> }>('permissions');
  const state = perms ? await withTimeout(perms.state('sample'), 2000).catch(() => 'unavailable') : 'granted';
  if (state !== 'granted') return {};
  const s = await withTimeout(getSample(), 3000).catch(() => null);
  if (!s) return {};
  const prompt = [
    `A student answered a quiz question (${language === 'fr' ? 'French' : 'English'}). Question: ${question.slice(0, 1500)}`,
    "For each item, decide like a fair teacher if the student's short answer means the same thing as one of the expected answers: accept synonyms, everyday wording, another word form or a short phrase with the same meaning; reject vague, partly right, opposite or unrelated answers.",
    ...checks.map((c) => `Item ${c.key}: student wrote «${c.given.slice(0, 200)}»; expected one of: ${c.expected.slice(0, 6).map((e) => `«${e}»`).join(', ')}`),
    'Reply with only a JSON object mapping each item key to true or false, for example {"0": true}.',
  ].join('\n');
  const ctl = new AbortController();
  try {
    // A hard deadline of our own: the answer is graded either way.
    const r = await withTimeout(s.json<Record<string, unknown>>(prompt, { modelTier: 'quick', signal: ctl.signal }), 8000);
    return Object.fromEntries(checks.map((c) => [c.key, r?.[c.key] === true]));
  } catch {
    ctl.abort();
    return {}; // offline or slow: the word list decides
  }
}
