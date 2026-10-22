import {
  extractFromText,
  generateLocal,
  gradeKeyPoints,
  normalize,
  type ConceptInput,
  type SandboxData,
  type SandboxKind,
  seededRng,
  type Bloom,
  type Concept,
  type Format,
  type Locale,
  type OpenGrade,
  type OpenGradeNeed,
  type Question,
  type ShortCheck,
} from '@lumo/core';

export interface GenerateInput {
  concept: Concept;
  format: Format;
  bloom: Bloom;
  deck: Concept[];
  language: Locale;
  /** Prompts recently shown for this concept: the new question must differ. */
  avoidPrompts: string[];
  seed: number;
}

export interface GradeOpenInput {
  question: Question;
  need: OpenGradeNeed;
  language: Locale;
  /** For teach-back: the learner's first explanation, when grading the follow-up reply. */
  previous?: string;
  wantFollowUp?: boolean;
}

export interface Media {
  kind: 'image' | 'pdf' | 'text';
  mime: string;
  name: string;
  data: Buffer;
}

export interface ExtractInput {
  media: Media[];
  /** What the learner said: exam info, what to include/skip. */
  instruction: string;
  language: Locale;
}

export interface DeckDraft {
  title: string;
  subject: string;
  language: Locale;
  summary: string;
  /** What Revio deliberately left out (fluff, admin info…), shown for transparency. */
  ignored: string[];
  concepts: ConceptInput[];
}

export interface TutorInput {
  history: { role: 'user' | 'assistant'; content: string }[];
  language: Locale;
  deck?: { title: string; concepts: Concept[] };
}

/** Everything the app asks of an AI. The API key lives only in the server-side implementation. */
export interface AiProvider {
  readonly name: 'claude' | 'mock';
  generateQuestion(input: GenerateInput): Promise<Question | null>;
  gradeOpen(input: GradeOpenInput): Promise<OpenGrade>;
  /** Read notes (photos, PDFs, text) and keep only the important ideas. */
  extractConcepts(input: ExtractInput): Promise<DeckDraft>;
  /** Apply a plain-language change to the draft ("chapter 3 isn't on the exam"). Null if not understood. */
  editDraft(draft: DeckDraft, instruction: string): Promise<DeckDraft | null>;
  tutorReply(input: TutorInput): Promise<string>;
  /** Richer, AI-written content for a Sandbox activity; null = use the built-in generator. */
  sandboxScript(kind: SandboxKind, concepts: Concept[], title: string, language: Locale): Promise<SandboxData | null>;
  /** Short answers that didn't match word for word: does each mean the same as an accepted answer? */
  judgeShort(question: string, checks: ShortCheck[], language: Locale): Promise<Record<string, boolean>>;
}

export class NeedsAiError extends Error {
  constructor(public code: 'images_need_ai' | 'nothing_found') {
    super(code);
  }
}

/** Deterministic, offline provider: used in tests and whenever no API key is configured. */
export class MockProvider implements AiProvider {
  readonly name = 'mock' as const;

  async generateQuestion(i: GenerateInput): Promise<Question | null> {
    // Try a few seeds so we don't repeat a recent prompt verbatim.
    for (let k = 0; k < 6; k++) {
      const q = generateLocal(i.concept, i.format, i.bloom, { deck: i.deck, language: i.language, rng: seededRng(i.seed + k * 7919) });
      if (!q) return null;
      if (!i.avoidPrompts.includes(q.prompt) || k === 5) return q;
    }
    return null;
  }

  async gradeOpen(i: GradeOpenInput): Promise<OpenGrade> {
    const m = gradeKeyPoints(i.need.text, i.need.keyPoints, i.need.minPoints);
    const fr = i.language === 'fr';
    let followUp: string | undefined;
    if (i.wantFollowUp) {
      followUp = m.missing[0]
        ? fr
          ? `Intéressant ! Mais je ne comprends pas encore tout. Tu peux m’en dire plus sur ce point : comment ça marche exactement ?`
          : `Interesting! But I don’t get it all yet. Can you tell me more about how it actually works?`
        : fr
          ? `Super clair ! Tu peux me donner un exemple de la vraie vie ?`
          : `That’s really clear! Can you give me a real-life example?`;
    }
    return { score: m.score, matchedPoints: m.matched, missingPoints: m.missing, followUp };
  }

  async extractConcepts(i: ExtractInput): Promise<DeckDraft> {
    // Only the material is read; the learner's message ("my test is Friday") is an instruction, not notes.
    const texts = i.media.filter((m) => m.kind === 'text').map((m) => m.data.toString('utf8'));
    const needsVision = i.media.some((m) => m.kind !== 'text');
    if (texts.length === 0) throw new NeedsAiError(needsVision ? 'images_need_ai' : 'nothing_found');
    const r = extractFromText(texts.join('\n\n'), i.language);
    if (r.concepts.length === 0) throw new NeedsAiError(needsVision ? 'images_need_ai' : 'nothing_found');
    return { title: r.title, subject: '', language: i.language, summary: r.summary, ignored: [], concepts: r.concepts };
  }

  async editDraft(draft: DeckDraft, instruction: string): Promise<DeckDraft | null> {
    // Offline: understand "remove / skip / not on the exam <term or topic>".
    const t = ` ${normalize(instruction)} `;
    if (!/ (remove|delete|skip|drop|not on|without|enleve|retire|supprime|pas a l examen|sans) /.test(t)) return null;
    const hit = (s: string) => {
      const n = normalize(s);
      return n.length >= 3 && t.includes(` ${n} `);
    };
    const concepts = draft.concepts.filter((c) => !hit(c.term) && !hit(c.topic));
    return concepts.length === draft.concepts.length || concepts.length === 0 ? null : { ...draft, concepts };
  }

  async tutorReply(i: TutorInput): Promise<string> {
    const last = i.history.at(-1)?.content ?? '';
    const fr = i.language === 'fr';
    const c = i.deck?.concepts.find((x) => normalize(last).includes(normalize(x.term)));
    if (c) {
      const parts = [`**${c.term}** — ${c.summary}`, ...c.keyPoints.slice(0, 3).map((k) => `• ${k}`)];
      if (c.examples[0]) parts.push((fr ? 'Exemple : ' : 'Example: ') + c.examples[0]);
      if (c.misconceptions[0]) parts.push((fr ? 'Attention, erreur fréquente : ' : 'Careful, common mix-up: ') + c.misconceptions[0]);
      parts.push(fr ? 'Tu veux que je te pose une question là-dessus ?' : 'Want me to quiz you on it?');
      return parts.join('\n');
    }
    return fr
      ? 'Je peux lire tes notes (photos, PDF ou texte), créer un paquet et un quiz, t’expliquer une notion, ou te faire une activité du Bac à sable (vidéo, mots croisés, escape game…). Dis-moi ce que tu veux !'
      : 'I can read your notes (photos, PDFs or text), build a deck and quiz, explain an idea, or make a Sandbox activity (video, crossword, escape room…). Tell me what you need!';
  }

  async sandboxScript(): Promise<SandboxData | null> {
    return null;
  }

  async judgeShort(_question: string, _checks: ShortCheck[], _language: Locale): Promise<Record<string, boolean>> {
    return {}; // offline: the built-in synonym list in core already ran
  }
}
