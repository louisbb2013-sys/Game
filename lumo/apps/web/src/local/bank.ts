import type { OpenGrade, OpenGradeNeed, Locale, Question } from '@lumo/core';
import { getSample, withTimeout } from './reader';

/**
 * Written answers graded by Claude against the question's rubric (its key points), the way a
 * teacher would. Claude writes the questions themselves in local/writer.ts.
 */

type Sample = NonNullable<Awaited<ReturnType<typeof getSample>>>;

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
