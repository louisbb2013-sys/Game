import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { generateLocal, seededRng, type OpenGrade, type Question } from '@lumo/core';
import { z } from 'zod';
import { buildQuestion, DRAFT_KIND, DRAFT_SCHEMAS } from './build.ts';
import type { AiProvider, GenerateInput, GradeOpenInput } from './provider.ts';

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

  private async structured<S extends z.ZodType>(model: string, system: string, user: string, schema: S, maxTokens = 4000): Promise<z.infer<S> | null> {
    const fallback = FALLBACK_MODELS.has(model);
    const res = await this.client.beta.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low', format: zodOutputFormat(schema) },
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
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
}
