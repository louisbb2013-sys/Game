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

/** What this view can send: null = no photo reading here. */
export async function photoLimits() {
  const s = await getSample();
  if (!s) return null;
  const l = await s.limits().catch(() => null);
  return l?.images ?? null;
}

export class ReaderError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, n: number, max = 300) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** Keep only well-formed concepts, trimmed to the same limits the server uses. */
function clean(raw: unknown): ConceptInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 80).flatMap((c: Record<string, unknown>) => {
    const term = str(c?.term, 160);
    const summary = str(c?.summary, 600);
    if (!term || !summary) return [];
    const kind = (CONCEPT_KINDS as readonly string[]).includes(String(c.kind)) && c.kind !== 'formula' ? (c.kind as ConceptKind) : 'definition';
    const steps = list(c.steps, 10);
    const causeEffects = Array.isArray(c.causeEffects)
      ? (c.causeEffects as Record<string, unknown>[]).map((x) => ({ cause: str(x?.cause, 300), effect: str(x?.effect, 300) })).filter((x) => x.cause && x.effect).slice(0, 6)
      : [];
    return [
      {
        topic: str(c.topic, 120) || 'General',
        kind: kind === 'process' && steps.length < 2 ? 'definition' : kind,
        term,
        summary,
        keyPoints: list(c.keyPoints, 8),
        misconceptions: list(c.misconceptions, 8),
        examples: list(c.examples, 6),
        synonyms: list(c.synonyms, 8, 160),
        ...(steps.length >= 2 ? { steps } : {}),
        ...(causeEffects.length ? { causeEffects } : {}),
      },
    ];
  });
}

const PROMPT = (language: Locale, extra: string) => `You are Lumoly, a study helper for school students. The attached files are a student's study material: photos of their notes or textbook pages, or a PDF (notes, slides, a worksheet).
Read them and pull out the important ideas a student must understand for a test. Skip page numbers, headers, admin info and decoration.
Write everything in ${language === 'fr' ? 'French' : 'English'}.
${extra ? `The student says: """${extra.slice(0, 2000)}"""\n` : ''}
Reply with only one JSON object, no other text:
{"title": string, "subject": string, "summary": string (one sentence),
 "concepts": [{"topic": string, "kind": one of ${CONCEPT_KINDS.filter((k) => k !== 'formula').join(' | ')},
   "term": string (the key word or idea, short), "summary": string (one clear sentence that explains it, without repeating the term),
   "keyPoints": string[] (2-4 short facts a good answer mentions), "examples": string[] (0-2 real-life examples),
   "misconceptions": string[] (0-2 common mistakes), "synonyms": string[],
   "steps"?: string[] (only for processes, in order), "causeEffects"?: [{"cause": string, "effect": string}]}]}
Aim for 6-25 concepts. If the files hold no readable study material, reply {"title": "", "concepts": []}.`;

/** Photos (and optional instructions) → a deck draft. Throws ReaderError with a code for the UI. */
export async function readPhotos(files: File[], language: Locale, extra: string, signal?: AbortSignal) {
  const s = await getSample();
  if (!s) throw new ReaderError('unavailable');
  let raw: { title?: unknown; subject?: unknown; summary?: unknown; concepts?: unknown };
  try {
    raw = await s.json(PROMPT(language, extra) + (await aboutLearner()), { images: files, signal, modelTier: 'default' });
  } catch (e) {
    throw new ReaderError(String((e as { code?: string })?.code ?? 'upstream_error'));
  }
  const concepts = clean(raw?.concepts);
  if (concepts.length === 0) throw new ReaderError('nothing_found');
  return { title: str(raw.title, 120), subject: str(raw.subject, 80), summary: str(raw.summary, 1000), language, concepts };
}

const TOPIC_PROMPT = (topic: string, language: Locale, research: boolean) => `You are Lumoly, a study helper for school students. A student typed what they want to study, with no notes:
"""${topic.slice(0, 500)}"""
It may name a school level or program (for example "secondaire 2" is Québec grade 8, age 13-14; "Year 9", "5e", "Grade 10"). Match that level and that school system's curriculum.
${research ? 'First search the web for reliable sources on this topic at that level (curriculum pages, school or teacher sites, encyclopedias), then build the deck from what you found.' : 'Build the deck from what a teacher would expect at that level.'}
Cover what a student must understand for a test on it: the key ideas, the vocabulary, how things work and why, typical examples, and the usual mistakes.
Write everything in ${language === 'fr' ? 'French' : 'English'}. Be accurate; leave out anything you are unsure of.
Reply with only one JSON object, no other text:
{"title": string (short), "subject": string, "summary": string (one sentence),
 "concepts": [{"topic": string, "kind": one of ${CONCEPT_KINDS.filter((k) => k !== 'formula').join(' | ')},
   "term": string (the key word or idea, short), "summary": string (one clear sentence that explains it, without repeating the term),
   "keyPoints": string[] (2-4 short facts a good answer mentions), "examples": string[] (1-2 examples),
   "misconceptions": string[] (0-2 common mistakes), "synonyms": string[],
   "steps"?: string[] (only for processes, in order), "causeEffects"?: [{"cause": string, "effect": string}]}]}
Aim for 12-20 concepts. If the request is not a school topic, reply {"title": "", "concepts": []}.`;

const NOTES_PROMPT = (notes: string, language: Locale) => `You are Lumoly, a study helper for school students. Below are a student's notes (typed or pasted).
Pull out the important ideas a student must understand for a test, in clear words. Fix obvious typos; skip page numbers, dates of the class and admin info.
Write everything in ${language === 'fr' ? 'French' : 'English'}.
Notes:
"""${notes.slice(0, 24_000)}"""
Reply with only one JSON object, no other text:
{"title": string (short), "subject": string, "summary": string (one sentence),
 "concepts": [{"topic": string, "kind": one of ${CONCEPT_KINDS.filter((k) => k !== 'formula').join(' | ')},
   "term": string (the key word or idea, short), "summary": string (one clear sentence that explains it, without repeating the term),
   "keyPoints": string[] (2-4 short facts a good answer mentions), "examples": string[] (0-2 examples),
   "misconceptions": string[] (0-2 mistakes students often make about it), "synonyms": string[],
   "steps"?: string[] (only for processes, in order), "causeEffects"?: [{"cause": string, "effect": string}]}]}
Aim for 6-25 concepts. If the text holds no study material, reply {"title": "", "concepts": []}.`;

/** Typed or pasted notes → a deck draft, read by Claude (better ideas than the built-in reader). */
export async function deckFromNotes(notes: string, language: Locale, signal?: AbortSignal) {
  const s = await getSample();
  if (!s) throw new ReaderError('unavailable');
  let raw: { title?: unknown; subject?: unknown; summary?: unknown; concepts?: unknown };
  try {
    raw = await s.json(NOTES_PROMPT(notes, language) + (await aboutLearner()), { signal, modelTier: 'default' });
  } catch (e) {
    throw new ReaderError(String((e as { code?: string })?.code ?? 'upstream_error'));
  }
  const concepts = clean(raw?.concepts);
  if (concepts.length === 0) throw new ReaderError('nothing_found');
  return { title: str(raw.title, 120), subject: str(raw.subject, 80), summary: str(raw.summary, 1000), language, concepts };
}

/** Can this view ask Claude at all (to read photos or build a deck from a topic)? */
export async function canAskClaude(): Promise<boolean> {
  return (await getSample()) !== null;
}

/** Just a topic (no notes): Claude researches it and builds a deck draft. */
export async function deckFromTopic(topic: string, language: Locale, signal?: AbortSignal) {
  const s = await getSample();
  if (!s) throw new ReaderError('unavailable');
  // The standalone site's Claude can search the web first; inside the Claude viewer it uses what it knows.
  const research = (s as unknown as { canResearch?: boolean }).canResearch === true;
  let raw: { title?: unknown; subject?: unknown; summary?: unknown; concepts?: unknown };
  try {
    raw = await s.json(TOPIC_PROMPT(topic, language, research) + (await aboutLearner()), { signal, modelTier: 'default', ...(research ? { research: true } : {}) });
  } catch (e) {
    throw new ReaderError(String((e as { code?: string })?.code ?? 'upstream_error'));
  }
  const concepts = clean(raw?.concepts);
  if (concepts.length === 0) throw new ReaderError('nothing_found');
  return { title: str(raw.title, 120) || topic.slice(0, 120), subject: str(raw.subject, 80), summary: str(raw.summary, 1000), language, concepts };
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
