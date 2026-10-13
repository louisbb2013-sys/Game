import type { Answer, Question } from './question';

/** The full-marks answer built from a question's answer key (server-side / tests only). */
export function perfectAnswer(q: Question): Answer {
  switch (q.format) {
    case 'multiple_choice':
    case 'cause_effect':
      return { kind: 'choice', optionId: q.correctId };
    case 'multiple_select':
      return { kind: 'multi', optionIds: q.correctIds };
    case 'type_answer':
      return { kind: 'text', text: q.accepted[0]! };
    case 'fill_blank':
      return { kind: 'blanks', values: q.blanks.map((b) => b.accepted[0]!) };
    case 'true_false_justify':
      return { kind: 'tf', value: q.isTrue, justification: q.keyPoints.join('. ') };
    case 'matching':
      return { kind: 'pairs', pairs: q.pairs };
    case 'categorize':
    case 'label_diagram':
      return { kind: 'pairs', pairs: q.mapping };
    case 'ordering':
      return { kind: 'order', order: q.correctOrder };
    case 'spot_mistake':
      return { kind: 'mistake', segmentId: q.wrongId, correction: q.correction[0]! };
    case 'calculation':
      return { kind: 'number', value: q.answer };
    default:
      return { kind: 'text', text: q.modelAnswer };
  }
}

