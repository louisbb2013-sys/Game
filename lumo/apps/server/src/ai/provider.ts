import {
  generateLocal,
  gradeKeyPoints,
  seededRng,
  type Bloom,
  type Concept,
  type Format,
  type Locale,
  type OpenGrade,
  type OpenGradeNeed,
  type Question,
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

/** Everything the app asks of an AI. The API key lives only in the server-side implementation. */
export interface AiProvider {
  readonly name: 'claude' | 'mock';
  generateQuestion(input: GenerateInput): Promise<Question | null>;
  gradeOpen(input: GradeOpenInput): Promise<OpenGrade>;
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
}
