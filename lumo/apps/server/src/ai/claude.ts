import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { generateLocal, seededRng, type OpenGrade, type Question } from '@lumo/core';
import { z } from 'zod';
import { buildQuestion, DRAFT_KIND, DRAFT_SCHEMAS } from './build.ts';
import type { AiProvider, DeckDraft, ExtractInput, GenerateInput, GradeOpenInput, TutorInput } from './provider.ts';
import { NeedsAiError } from './provider.ts';
import { checkFor, type Concept, type Locale, type SandboxData, type SandboxKind } from '@lumo/core';
import { conceptInputSchema } from '../quiz/schemas.ts';

// Models that accept the server-side refusal fallback ("default" routing).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

const FORMAT_GUIDE: Record<string, string> = {
  multiple_choice: 'One question, 4 options, exactly one correct. Distractors must be plausible and based on common misconceptions.',
  cause_effect: 'A "what happens if…" or "what caused…" scenario with 4 options, exactly one correct. Use a NEW scenario, not one copied from the notes.',
  multiple_select: '5 options, 2 or 3 correct. Wrong options are plausible misconceptions.',
  type_answer: 'Ask for a short answer (a term, name, date or value) the student must type. Do not reveal it in the prompt. List every acceptable answer (synonyms, singular/plural).',
  fill_blank: 'A sentence with 1-2 blanks written as ___ testing the most important words. Do not copy the notes word for word.',
  explain: 'Ask the student to explain the idea in their own words (why/how), not to recite a definition.',
  apply: 'Describe a NEW, concrete real-life situation the notes never mention, and ask the student to use the concept to explain or predict what happens.',
  compare: 'Ask the student to compare this concept with a related one: similarities and differences.',
  teach_back: 'You are Lumo, a curious younger student. Ask the learner to teach you the concept simply.',
  true_false_justify: 'A statement that is either true or a common misconception (false). The student must say true/false AND justify.',
  matching: '3-5 pairs to match (term ↔ meaning, cause ↔ effect, example ↔ concept). Use the concept and related concepts from the deck.',
  ordering: 'Steps of a process/sequence the student must put in order (give them in the correct order; the app shuffles).',
  categorize: '2-3 groups with 2-3 items each that the student sorts.',
  spot_mistake: 'A statement or worked solution split into parts with exactly ONE realistic mistake (a typical student error).',
  calculation: 'A word problem with NEW numbers in a realistic context. Give the numeric answer and a step-by-step solution.',
};

const BLOOM_GUIDE: Record<string, string> = {
  remember: 'recall (can they retrieve the fact?)',
  understand: 'understanding (can they explain it, recognise it reworded?)',
  apply: 'application (can they use it in a new situation?)',
  analyze: 'analysis (can they reason about why, compare, find errors?)',
};

const SYSTEM_GENERATE = `You write quiz questions for Lumo, a study app that helps students truly UNDERSTAND their school material instead of memorizing it.
Rules:
- Test the meaning, never the exact wording of the notes. Reword, use new examples, new numbers and new scenarios.
- Keep it accurate and at the level of the student's notes. Never invent facts that contradict the notes.
- Short, clear, friendly language suitable for students aged 10-18.
- Write everything in the requested language.
- The explanation is kind and explains WHY, in 1-2 sentences.`;

const SYSTEM_GRADE = `You grade a student's open answer for Lumo, a study app. Grade the MEANING, not the wording: accept synonyms, everyday language, spelling mistakes and partial phrasing. Give partial credit.
Return score from 0 to 1 (1 = every required key point is clearly there and nothing is wrong; a wrong statement lowers the score).
List which key points were matched and which are missing (copy the key point text).
feedback: 1-2 warm, encouraging sentences addressed to the student ("you"), in the requested language, saying what was good and what to add or fix. Never mock.`;

const gradeSchema = z.object({
  score: z.number(),
  matchedPoints: z.array(z.string()),
  missingPoints: z.array(z.string()),
  feedback: z.string(),
  followUp: z.string().describe('teach-back only: one curious follow-up question from a younger student; empty string otherwise'),
});

type UserContent = Anthropic.Beta.Messages.BetaMessageParam['content'];

export class ClaudeProvider implements AiProvider {
  readonly name = 'claude' as const;
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
    private gradingModel: string,
    private log: (msg: string, err?: unknown) => void,
    fetchImpl?: typeof fetch,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  }

  private async structured<S extends z.ZodType>(
    model: string,
    system: string,
    user: UserContent,
    schema: S,
    maxTokens = 4000,
    opts: { effort?: 'low' | 'medium' | 'high'; timeoutMs?: number } = {},
  ): Promise<z.infer<S> | null> {
    const fallback = FALLBACK_MODELS.has(model);
    const res = await this.client.beta.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { effort: opts.effort ?? 'low', format: zodOutputFormat(schema) },
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
    );
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      this.log(`claude stopped: ${res.stop_reason}`);
      return null;
    }
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try {
      const parsed = schema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async generateQuestion(i: GenerateInput): Promise<Question | null> {
    const kind = DRAFT_KIND[i.format];
    const local = () => generateLocal(i.concept, i.format, i.bloom, { deck: i.deck, language: i.language, rng: seededRng(i.seed) });
    if (!kind) return local();

    const related = i.deck
      .filter((c) => c.id !== i.concept.id)
      .slice(0, 12)
      .map((c) => `- ${c.term}: ${c.summary}`)
      .join('\n');
    const { id: _id, ...concept } = i.concept;
    const user = [
      `Language: ${i.language === 'fr' ? 'French' : 'English'}`,
      `Format: ${i.format} — ${FORMAT_GUIDE[i.format]}`,
      `Depth: ${BLOOM_GUIDE[i.bloom]}`,
      `Concept from the student's notes (JSON):\n${JSON.stringify(concept)}`,
      related ? `Other concepts in the same deck (for distractors / pairs):\n${related}` : '',
      i.avoidPrompts.length ? `Recently asked (write something clearly different):\n${i.avoidPrompts.map((p) => `- ${p}`).join('\n')}` : '',
      `Variation seed: ${i.seed % 1000} (use it to pick a different angle each time).`,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const draft = await this.structured(this.model, SYSTEM_GENERATE, user, DRAFT_SCHEMAS[kind]);
      const q = draft && buildQuestion(draft, { conceptId: i.concept.id, format: i.format, bloom: i.bloom, language: i.language, seed: i.seed });
      if (q) return q;
      this.log(`claude draft rejected for ${i.format}; using local generator`);
    } catch (err) {
      this.log('claude generateQuestion failed; using local generator', err);
    }
    return local();
  }

  async gradeOpen(i: GradeOpenInput): Promise<OpenGrade> {
    const user = [
      `Language for feedback: ${i.language === 'fr' ? 'French' : 'English'}`,
      `Question: ${i.question.prompt}`,
      i.question.format === 'true_false_justify' ? `Statement: ${i.question.statement} (it is ${i.question.isTrue ? 'TRUE' : 'FALSE'})` : '',
      `Key points (need at least ${i.need.minPoints}):\n${i.need.keyPoints.map((k) => `- ${k}`).join('\n')}`,
      i.previous ? `The student's first explanation:\n"""${i.previous}"""` : '',
      `Student answer:\n"""${i.need.text.slice(0, 4000)}"""`,
      i.wantFollowUp ? 'This is teach-back: also write followUp, a curious younger student’s question about the weakest or missing part.' : 'followUp must be an empty string.',
    ]
      .filter(Boolean)
      .join('\n\n');
    const r = await this.structured(this.gradingModel, SYSTEM_GRADE, user, gradeSchema, 1500);
    if (!r) throw new Error('grading returned no result');
    return {
      score: Math.min(1, Math.max(0, r.score)),
      matchedPoints: r.matchedPoints,
      missingPoints: r.missingPoints,
      feedback: r.feedback || undefined,
      followUp: i.wantFollowUp && r.followUp ? r.followUp : undefined,
    };
  }

  // ---------- notes → deck ----------

  async extractConcepts(i: ExtractInput): Promise<DeckDraft> {
    const content: Exclude<UserContent, string> = [];
    for (const m of i.media.slice(0, 20)) {
      if (m.kind === 'image') content.push({ type: 'image', source: { type: 'base64', media_type: m.mime as 'image/jpeg', data: m.data.toString('base64') } });
      else if (m.kind === 'pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: m.data.toString('base64') }, title: m.name || undefined });
      else content.push({ type: 'text', text: `Notes file "${m.name}":\n${m.data.toString('utf8').slice(0, 60_000)}` });
    }
    content.push({
      type: 'text',
      text: [
        `What the student said: """${i.instruction.slice(0, 2000) || '(nothing)'}"""`,
        `Their app language is ${i.language === 'fr' ? 'French' : 'English'}; write the deck in the language of the notes.`,
      ].join('\n'),
    });
    const r = await this.structured(this.model, SYSTEM_EXTRACT, content, extractSchema, 16000, { effort: 'medium', timeoutMs: 120_000 });
    if (!r) throw new Error('extraction returned no result');
    const concepts = r.concepts.flatMap((c) => {
      const parsed = conceptInputSchema.safeParse(fromLlmConcept(c));
      return parsed.success ? [parsed.data] : [];
    });
    if (concepts.length === 0) throw new NeedsAiError('nothing_found');
    return { title: r.title, subject: r.subject, language: r.language === 'fr' ? 'fr' : 'en', summary: r.summary, ignored: r.ignored, concepts };
  }

  async editDraft(draft: DeckDraft, instruction: string): Promise<DeckDraft | null> {
    const user = `Current deck draft (JSON):\n${JSON.stringify({ ...draft, concepts: draft.concepts.map(toLlmConcept) })}\n\nStudent's request: """${instruction.slice(0, 2000)}"""\n\nReturn the full updated draft. If the request is not about changing the deck, set changed=false and return it unchanged.`;
    const r = await this.structured(this.model, SYSTEM_EXTRACT, user, extractSchema.extend({ changed: z.boolean() }), 16000, { effort: 'medium', timeoutMs: 120_000 });
    if (!r || !r.changed) return null;
    const concepts = r.concepts.flatMap((c) => {
      const parsed = conceptInputSchema.safeParse(fromLlmConcept(c));
      return parsed.success ? [parsed.data] : [];
    });
    return concepts.length ? { title: r.title, subject: r.subject, language: draft.language, summary: r.summary, ignored: r.ignored, concepts } : null;
  }

  async tutorReply(i: TutorInput): Promise<string> {
    const deckInfo = i.deck ? `\n\nThe student's deck "${i.deck.title}":\n${i.deck.concepts.slice(0, 40).map((c) => `- ${c.term}: ${c.summary}`).join('\n')}` : '';
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 1500,
      system: SYSTEM_TUTOR + deckInfo,
      messages: i.history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
      output_config: { effort: 'low' },
      ...(FALLBACK_MODELS.has(this.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (res.stop_reason === 'refusal') return i.language === 'fr' ? 'Je ne peux pas aider avec ça, mais je peux t’aider à étudier !' : 'I can’t help with that, but I can help you study!';
    return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
  }

  // ---------- sandbox scripts ----------

  async sandboxScript(kind: SandboxKind, concepts: Concept[], title: string, language: Locale): Promise<SandboxData | null> {
    const schema = SCRIPT_SCHEMAS[kind as keyof typeof SCRIPT_SCHEMAS];
    if (!schema) return null;
    const user = [
      `Format: ${kind} — ${SCRIPT_GUIDE[kind as keyof typeof SCRIPT_GUIDE]}`,
      `Language: ${language === 'fr' ? 'French' : 'English'}`,
      `Topic: ${title}`,
      `Concepts (JSON):\n${JSON.stringify(concepts.slice(0, 8).map(({ id: _id, ...c }) => c))}`,
    ].join('\n\n');
    try {
      const r = await this.structured(this.model, SYSTEM_SCRIPT, user, schema, 8000, { effort: 'low', timeoutMs: 90_000 });
      return r ? toSandboxData(kind, r, concepts, language) : null;
    } catch (err) {
      this.log(`sandbox script failed for ${kind}`, err);
      return null;
    }
  }
}

// ---------- schemas & prompts for M3 / Sandbox ----------

const SYSTEM_EXTRACT = `You are Lumo, a study assistant. You read a student's notes (photos of handwritten or printed notes, textbook pages, slides, PDFs or text) and extract ONLY the most important knowledge for their exam.
Keep: key concepts, definitions, formulas, cause-and-effect relationships, processes/sequences, comparisons, dates, vocabulary, classifications.
Ignore: page numbers, admin info, teacher names, decorative text, repeated material, off-topic fluff. List what you ignored in "ignored" (short phrases).
For each concept:
- summary: one clear sentence in student-friendly words;
- keyPoints: 2-4 essential ideas; misconceptions: 1-3 realistic WRONG beliefs students often have (used for distractors); examples: concrete examples (from the notes or obviously correct everyday ones);
- steps only for processes (in order); causeEffects only when the notes give cause → effect; comparison only when two things are compared;
- categories when items are grouped; date only for historical/dated facts ('' otherwise);
- formula only for calculations: expression using the variable symbols with + - * / ^ ( ) sqrt(), and realistic min/max/step ranges so the app can create new numbers.
Respect what the student says (exam scope, chapters to skip or include). Do not invent facts that are not supported by the notes or basic correct knowledge. Usually 6-30 concepts; group them into a few topics.
Write in the language of the notes. Be accurate: these are minors studying for real exams.`;

const SYSTEM_TUTOR = `You are Lumo, a friendly firefly tutor in a study app for students aged 10-18.
- Help them UNDERSTAND: explain simply, use analogies and examples, check understanding with a short question.
- For homework, guide step by step with hints instead of just giving the final answer.
- Keep replies short (under 150 words), warm and encouraging. Use the student's language.
- Stay on studying and school topics. Never ask for personal information. If something is unsafe or inappropriate, kindly redirect to studying.`;

const SYSTEM_SCRIPT = `You write fun, accurate study content for Lumo, a study app for students aged 10-18. Every format must make the student THINK (questions to answer), not only watch or read. Use vivid examples and analogies, short sentences, and a friendly tone. Stay 100% faithful to the concepts given.`;

const llmCheck = z.object({ prompt: z.string(), options: z.array(z.string()), correctIndex: z.number().int(), explanation: z.string() });

const llmConcept = z.object({
  topic: z.string(),
  kind: z.enum(['definition', 'process', 'cause_effect', 'formula', 'comparison', 'date', 'vocabulary', 'classification', 'fact']),
  term: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  misconceptions: z.array(z.string()),
  examples: z.array(z.string()),
  synonyms: z.array(z.string()),
  steps: z.array(z.string()),
  causeEffects: z.array(z.object({ cause: z.string(), effect: z.string() })),
  comparison: z.object({ with: z.string(), similarities: z.array(z.string()), differences: z.array(z.string()) }).nullable(),
  categories: z.array(z.object({ name: z.string(), items: z.array(z.string()) })),
  date: z.string(),
  formula: z
    .object({
      expression: z.string(),
      resultSymbol: z.string(),
      resultName: z.string(),
      resultUnit: z.string(),
      variables: z.array(z.object({ symbol: z.string(), name: z.string(), unit: z.string(), min: z.number(), max: z.number(), step: z.number() })),
    })
    .nullable(),
});
type LlmConcept = z.infer<typeof llmConcept>;

const extractSchema = z.object({
  title: z.string(),
  subject: z.string(),
  language: z.enum(['en', 'fr']),
  summary: z.string().describe('2-3 sentences: "What I understood" — what the material covers and what the exam seems to focus on'),
  ignored: z.array(z.string()),
  concepts: z.array(llmConcept),
});

function fromLlmConcept(c: LlmConcept) {
  return {
    topic: c.topic,
    kind: c.kind,
    term: c.term,
    summary: c.summary,
    keyPoints: c.keyPoints.filter(Boolean),
    misconceptions: c.misconceptions.filter(Boolean),
    examples: c.examples.filter(Boolean),
    synonyms: c.synonyms.filter(Boolean),
    steps: c.steps.length >= 2 ? c.steps : undefined,
    causeEffects: c.causeEffects.length ? c.causeEffects : undefined,
    comparison: c.comparison ?? undefined,
    categories: c.categories.length ? c.categories : undefined,
    date: c.date || undefined,
    formula: c.formula
      ? {
          expression: c.formula.expression,
          result: { symbol: c.formula.resultSymbol, name: c.formula.resultName, unit: c.formula.resultUnit || undefined },
          variables: c.formula.variables.map((v) => ({ ...v, unit: v.unit || undefined, step: v.step > 0 ? v.step : undefined })),
        }
      : undefined,
  };
}

function toLlmConcept(c: DeckDraft['concepts'][number]): LlmConcept {
  return {
    topic: c.topic,
    kind: c.kind,
    term: c.term,
    summary: c.summary,
    keyPoints: c.keyPoints,
    misconceptions: c.misconceptions,
    examples: c.examples,
    synonyms: c.synonyms,
    steps: c.steps ?? [],
    causeEffects: c.causeEffects ?? [],
    comparison: c.comparison ?? null,
    categories: c.categories ?? [],
    date: c.date ?? '',
    formula: c.formula
      ? { expression: c.formula.expression, resultSymbol: c.formula.result.symbol, resultName: c.formula.result.name, resultUnit: c.formula.result.unit ?? '', variables: c.formula.variables.map((v) => ({ ...v, unit: v.unit ?? '', step: v.step ?? 1 })) }
      : null,
  };
}

const SCRIPT_SCHEMAS = {
  video: z.object({
    scenes: z.array(
      z.object({
        type: z.enum(['title', 'idea', 'points', 'example', 'check', 'recap']),
        heading: z.string(),
        text: z.string(),
        bullets: z.array(z.string()),
        emoji: z.string(),
        narration: z.string(),
        check: llmCheck.nullable(),
      }),
    ),
  }),
  podcast: z.object({
    lines: z.array(z.object({ host: z.number().int(), text: z.string() })),
    checks: z.array(z.object({ afterLine: z.number().int(), q: llmCheck })),
  }),
  story: z.object({ title: z.string(), chapters: z.array(z.object({ emoji: z.string(), text: z.string(), q: llmCheck })), ending: z.string() }),
  mnemonics: z.object({ items: z.array(z.object({ title: z.string(), list: z.array(z.string()), acronym: z.string(), sentence: z.string(), tip: z.string() })) }),
};

const SCRIPT_GUIDE = {
  video: 'An animated explainer video script, 8-16 scenes: title, then per idea an "idea" scene (term + one-line meaning), optional "points"/"example" scenes with an analogy, a "check" scene every 2 ideas with a multiple-choice question (pause and predict), and a final "recap". narration is what the narrator says aloud (1-3 sentences). One relevant emoji per scene.',
  podcast: 'A podcast dialogue between host 0 (Lumo, the explainer) and host 1 (Nova, the curious student who asks questions and voices common misconceptions). 18-35 lines. Add 3-4 quick-check questions placed after the line where the answer was explained (afterLine = index of that line).',
  story: 'A short adventure/mystery story (4-6 chapters) where the hero must use the concepts to progress. Each chapter ends with a question the reader answers to unlock the next chapter.',
  mnemonics: 'Memory tricks for lists/sequences/groups in the concepts: acronym of first letters, a funny memorable sentence whose words start with those letters (same order, one word per item), and a tip. 2-4 items.',
};

function validCheck(q: z.infer<typeof llmCheck>) {
  return q.options.length >= 2 && q.options.length <= 5 && !!q.options[q.correctIndex] && new Set(q.options).size === q.options.length;
}

function toSandboxData(kind: SandboxKind, r: unknown, concepts: Concept[], language: Locale): SandboxData | null {
  const rng = Math.random;
  const fallbackCheck = () => checkFor(concepts[Math.floor(rng() * concepts.length)]!, concepts, rng, language);
  switch (kind) {
    case 'video': {
      const v = r as z.infer<typeof SCRIPT_SCHEMAS.video>;
      if (v.scenes.length < 4) return null;
      return {
        kind,
        scenes: v.scenes.map((s) => ({
          type: s.type,
          heading: s.heading,
          text: s.text,
          bullets: s.bullets.length ? s.bullets : undefined,
          emoji: s.emoji || '💡',
          narration: s.narration,
          check: s.type === 'check' ? (s.check && validCheck(s.check) ? s.check : fallbackCheck()) : undefined,
        })),
      };
    }
    case 'podcast': {
      const p = r as z.infer<typeof SCRIPT_SCHEMAS.podcast>;
      if (p.lines.length < 6) return null;
      const lines = p.lines.map((l) => ({ host: (l.host === 1 ? 1 : 0) as 0 | 1, text: l.text }));
      const checks = p.checks.filter((c) => validCheck(c.q) && c.afterLine >= 0 && c.afterLine < lines.length);
      return { kind, hosts: ['Lumo', 'Nova'], lines, checks: checks.length ? checks : [{ afterLine: lines.length - 1, q: fallbackCheck() }] };
    }
    case 'story': {
      const s = r as z.infer<typeof SCRIPT_SCHEMAS.story>;
      if (s.chapters.length < 2) return null;
      return { kind, title: s.title, chapters: s.chapters.map((c) => ({ emoji: c.emoji || '📖', text: c.text, q: validCheck(c.q) ? c.q : fallbackCheck() })), ending: s.ending };
    }
    case 'mnemonics': {
      const m = r as z.infer<typeof SCRIPT_SCHEMAS.mnemonics>;
      const items = m.items.filter((i) => i.list.length >= 2 && i.acronym.length > 0);
      return items.length ? { kind, items } : null;
    }
    default:
      return null;
  }
}
