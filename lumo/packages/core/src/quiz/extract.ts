import type { ConceptKind, Locale } from '../types';
import type { ConceptInput } from './concept';

/**
 * Offline note reader: turns plain text (typed notes, Quizlet/Anki exports, copied
 * slides) into concepts with simple patterns. The AI extractor does far better and
 * also reads photos/PDFs; this keeps Revio useful without a key.
 */

const DEF_PATTERNS: RegExp[] = [
  /^(?<term>[^.:;=]{2,60}?)\s+(?:is|are|means|refers to|is called|is defined as)\s+(?<def>.{6,})$/i,
  /^(?<term>[^.:;=]{2,60}?)\s+(?:est|sont|désigne|signifie|correspond à|c['’]est)\s+(?<def>.{6,})$/i,
  /^(?<term>[^.:;=\t]{2,60}?)\s*(?:\t|:| - | – | — |=)\s*(?<def>.{4,})$/,
];

const CAUSE_PATTERNS: RegExp[] = [
  /^(?:if|when)\s+(?<cause>.{4,}?),\s*(?:then\s+)?(?<effect>.{4,})$/i,
  /^(?:si|quand|lorsque)\s+(?<cause>.{4,}?),\s*(?:alors\s+)?(?<effect>.{4,})$/i,
  /^(?<cause>.{4,}?)\s+(?:causes|leads to|results in|produces|→|->|entraîne|provoque|cause)\s+(?<effect>.{4,})$/i,
];

const EXAMPLE_RE = /\b(e\.g\.|for example|for instance|such as|par exemple|comme|ex\s*:)/i;
const PROCESS_HEADING_RE = /\b(steps?|stages?|process|procedure|sequence|cycle|how to|étapes?|processus|cycle|déroulement)\b/i;
const BULLET_RE = /^\s*(?:[-*•▪◦]|\d+[.)]|[a-z][.)])\s+/i;

const clean = (s: string) => s.replace(BULLET_RE, '').replace(/[ \u00a0]+/g, ' ').trim().replace(/[.;]+$/, '');
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function isHeading(line: string, next: string | undefined): boolean {
  const t = line.trim();
  if (/^#{1,6}\s/.test(t)) return true;
  if (t.length > 60 || t.length < 3 || BULLET_RE.test(t)) return false;
  if (/[:：]$/.test(t) && !t.slice(0, -1).includes(':')) return true;
  // Short Title Case line followed by content, without a full stop.
  return !/[.!?]$/.test(t) && /^[A-ZÀ-Ý0-9]/.test(t) && t.split(' ').length <= 6 && !!next && next.trim().length > 0 && !DEF_PATTERNS.some((p) => p.test(t));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ExtractResult {
  title: string;
  summary: string;
  concepts: ConceptInput[];
}

export function extractFromText(text: string, language: Locale, titleHint?: string): ExtractResult {
  const lines = text.replace(/\r/g, '').split('\n');
  let topic = titleHint || (language === 'fr' ? 'Notions' : 'Key ideas');
  const firstTopic = topic;
  const concepts = new Map<string, ConceptInput>();
  const loose: { topic: string; sentence: string }[] = [];
  let processSteps: { topic: string; steps: string[] } | null = null;

  const flushProcess = () => {
    if (processSteps && processSteps.steps.length >= 3) {
      const term = processSteps.topic.replace(/[:：#]/g, '').trim();
      upsert(concepts, {
        topic: processSteps.topic,
        kind: 'process',
        term,
        summary: language === 'fr' ? `${term} : ${processSteps.steps.length} étapes, dans l’ordre.` : `${term}: ${processSteps.steps.length} steps, in order.`,
        keyPoints: processSteps.steps.slice(0, 4),
        misconceptions: [],
        examples: [],
        synonyms: [],
        steps: processSteps.steps.slice(0, 8),
      });
    }
    processSteps = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (!raw.trim()) continue;
    if (isHeading(raw, lines[i + 1])) {
      flushProcess();
      topic = raw.replace(/^#+\s*/, '').replace(/[:：]\s*$/, '').trim();
      if (PROCESS_HEADING_RE.test(topic)) processSteps = { topic, steps: [] };
      continue;
    }
    if (processSteps && BULLET_RE.test(raw)) {
      processSteps.steps.push(cap(clean(raw)));
      continue;
    }
    const line = clean(raw);
    // Tab-separated exports (Quizlet/Anki): one card per line.
    const sentences = line.includes('\t') ? [line] : splitSentences(line);
    for (const sentence of sentences) {
      if (!parseSentence(sentence, topic, concepts, language)) loose.push({ topic, sentence });
    }
  }
  flushProcess();

  // Attach loose sentences to the concept they mention (key points / examples / cause-effect).
  const all = [...concepts.values()];
  for (const { topic: tp, sentence } of loose) {
    const c = all.find((x) => new RegExp(`\\b${escapeRe(x.term)}\\b`, 'i').test(sentence)) ?? all.filter((x) => x.topic === tp).at(-1);
    if (!c) continue;
    const cause = matchCause(sentence);
    if (cause) (c.causeEffects ??= []).push(cause);
    else if (EXAMPLE_RE.test(sentence)) c.examples.push(sentence);
    else if (c.keyPoints.length < 6 && sentence.length > 12) c.keyPoints.push(sentence);
  }
  for (const c of all) {
    if (c.keyPoints.length === 0) c.keyPoints.push(c.summary);
    if (c.causeEffects?.length) c.kind = c.kind === 'definition' ? 'cause_effect' : c.kind;
  }

  const result = all.slice(0, 60);
  const topics = [...new Set(result.map((c) => c.topic))];
  return {
    title: titleHint || (topics[0] && topics[0] !== firstTopic ? topics[0] : result[0]?.topic) || firstTopic,
    summary:
      language === 'fr'
        ? `${result.length} notions trouvées dans ${topics.length} thème(s) : ${topics.slice(0, 5).join(', ')}.`
        : `I found ${result.length} key concepts across ${topics.length} topic(s): ${topics.slice(0, 5).join(', ')}.`,
    concepts: result,
  };
}

function parseSentence(sentence: string, topic: string, out: Map<string, ConceptInput>, _lang: Locale): boolean {
  if (EXAMPLE_RE.test(sentence) || matchCause(sentence)) return false; // examples and causes attach to a concept later
  for (const re of DEF_PATTERNS) {
    const m = re.exec(sentence);
    if (!m?.groups) continue;
    const term = m.groups.term!.replace(/^(the|a|an|le|la|les|l['’]|un|une)\s+/i, '').trim();
    const def = cap(m.groups.def!.trim());
    if (term.split(' ').length > 6 || /\d{3,}/.test(term) || def.length < 4) continue;
    const kind: ConceptKind = /\d/.test(def) && /[=×÷/*]/.test(def) ? 'formula' : /\b(1[0-9]{3}|20[0-9]{2})\b/.test(def) ? 'date' : 'definition';
    upsert(out, { topic, kind, term, summary: def.endsWith('.') ? def : def + '.', keyPoints: [], misconceptions: [], examples: [], synonyms: [] });
    return true;
  }
  return false;
}

function matchCause(sentence: string): { cause: string; effect: string } | null {
  for (const re of CAUSE_PATTERNS) {
    const m = re.exec(sentence);
    if (m?.groups) return { cause: m.groups.cause!.trim(), effect: m.groups.effect!.trim().replace(/[.!]$/, '') };
  }
  return null;
}

function upsert(map: Map<string, ConceptInput>, c: ConceptInput) {
  const key = c.term.toLowerCase();
  const prev = map.get(key);
  if (prev) prev.keyPoints.push(c.summary);
  else map.set(key, c);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
