import { describe, expect, it } from 'vitest';
import {
  applyAnswer,
  chooseFormat,
  evaluate,
  FORMATS,
  generateLocal,
  grade,
  gradeKeyPoints,
  matchesAccepted,
  newProgress,
  newSession,
  perfectAnswer as perfect,
  orderingScore,
  pickConcepts,
  publicQuestion,
  recordAttempt,
  SAMPLE_DECKS,
  seededRng,
  supportsFormat,
  type Answer,
  type Concept,
  type Question,
} from '../src';

const deckOf = (lang: 'en' | 'fr'): Concept[] => SAMPLE_DECKS[lang].concepts.map((c, i) => ({ ...c, id: `${lang}${i}` }));

function wrong(q: Question): Answer {
  switch (q.format) {
    case 'multiple_choice':
    case 'cause_effect':
      return { kind: 'choice', optionId: q.options.find((o) => o.id !== q.correctId)!.id };
    case 'multiple_select':
      return { kind: 'multi', optionIds: q.options.filter((o) => !q.correctIds.includes(o.id)).map((o) => o.id) };
    case 'true_false_justify':
      return { kind: 'tf', value: !q.isTrue, justification: q.keyPoints.join('. ') };
    case 'ordering':
      return { kind: 'order', order: q.correctOrder.slice().reverse() };
    case 'calculation':
      return { kind: 'number', value: q.answer * 3 + 1 };
    case 'matching': {
      const l = Object.keys(q.pairs);
      const r = l.map((k) => q.pairs[k]!);
      return { kind: 'pairs', pairs: Object.fromEntries(l.map((k, i) => [k, r[(i + 1) % r.length]!])) };
    }
    case 'spot_mistake':
      return { kind: 'mistake', segmentId: q.segments.find((s) => s.id !== q.wrongId)!.id, correction: 'banana' };
    case 'fill_blank':
      return { kind: 'blanks', values: q.blanks.map(() => 'banana') };
    case 'categorize':
    case 'label_diagram': {
      const keys = Object.keys(q.mapping);
      const vals = [...new Set(Object.values(q.mapping))];
      return { kind: 'pairs', pairs: Object.fromEntries(keys.map((k) => [k, vals.find((v) => v !== q.mapping[k])!])) };
    }
    default:
      return { kind: 'text', text: 'I am not sure, maybe something about bananas.' };
  }
}

describe.each(['en', 'fr'] as const)('generator + grader on the %s sample deck', (lang) => {
  const deck = deckOf(lang);

  it('covers almost every format, and every generated question grades perfect=1, wrong<0.8', () => {
    const covered = new Set<string>();
    for (const c of deck) {
      for (const f of FORMATS) {
        if (!supportsFormat(c, f, deck)) continue;
        for (const seed of [1, 2, 3, 4, 5]) {
          const q = generateLocal(c, f, 'understand', { deck, language: lang, rng: seededRng(seed * 977 + c.id.length) });
          if (!q) continue;
          covered.add(f);
          const ok = grade(q, perfect(q));
          expect(ok.score, `${c.term} ${f} perfect`).toBe(1);
          expect(ok.correct).toBe(true);
          const bad = grade(q, wrong(q));
          expect(bad.score, `${c.term} ${f} wrong`).toBeLessThan(0.8);
          expect(bad.correct).toBe(false);
          expect(q.prompt.length).toBeGreaterThan(5);
          expect(q.explanation.length).toBeGreaterThan(5);
        }
      }
    }
    // label_diagram needs a diagram image, which the sample decks don't have.
    expect([...covered].sort()).toEqual(FORMATS.filter((f) => f !== 'label_diagram').slice().sort());
  });

  it('never leaks the answer key to the client', () => {
    const rng = seededRng(7);
    for (const c of deck) {
      for (const f of FORMATS) {
        const q = generateLocal(c, f, 'apply', { deck, language: lang, rng });
        if (!q) continue;
        const json = JSON.stringify(publicQuestion(q));
        for (const key of ['correctId', 'correctIds', 'accepted', 'keyPoints', 'modelAnswer', 'isTrue', 'pairs', 'correctOrder', 'mapping', 'wrongId', 'correction', 'answer', 'explanation', 'variantKey']) {
          expect(json).not.toContain(`"${key}"`);
        }
      }
    }
  });

  it('produces many different variants of the same concept and format', () => {
    const c = deck.find((x) => x.causeEffects && x.causeEffects.length > 1) ?? deck[0]!;
    const keys = new Set<string>();
    for (let s = 0; s < 30; s++) {
      const q = generateLocal(c, 'multiple_choice', 'understand', { deck, language: lang, rng: seededRng(s) });
      if (q) keys.add(q.variantKey);
    }
    expect(keys.size).toBeGreaterThan(5);
  });

  it('typed prompts never reveal the term they ask for', () => {
    for (const c of deck) {
      for (let s = 0; s < 10; s++) {
        const q = generateLocal(c, 'type_answer', 'remember', { deck, language: lang, rng: seededRng(s) });
        if (q && !q.prompt.includes('“') && !q.prompt.includes('«')) continue;
        if (q) expect(q.prompt.toLowerCase()).not.toMatch(new RegExp(`\\b${c.term.toLowerCase()}\\b`));
      }
    }
  });
});

describe('planner: anti-memorization', () => {
  const deck = deckOf('en');

  it('never asks a concept in the same format twice in a row, and mastery needs several formats', () => {
    const rng = seededRng(99);
    const progress = new Map(deck.map((c) => [c.id, newProgress()]));
    const lastFormat = new Map<string, string>();
    let mastered = 0;
    for (let i = 0; i < 200; i++) {
      const c = deck[i % deck.length]!;
      const p = progress.get(c.id)!;
      const choice = chooseFormat(c, deck, p, rng)!;
      expect(choice.format).not.toBe(lastFormat.get(c.id));
      lastFormat.set(c.id, choice.format);
      const next = recordAttempt(p, choice.format, choice.bloom, 1);
      progress.set(c.id, next);
      if (next.formatsPassed.length >= 3) mastered++;
    }
    expect(mastered).toBeGreaterThan(0);
    // Depth increases as the learner succeeds.
    expect([...progress.values()].some((p) => p.bloom === 'apply' || p.bloom === 'analyze')).toBe(true);
  });

  it('prioritises due and wrong concepts, interleaves topics', () => {
    const now = Date.UTC(2026, 9, 13);
    const states = new Map([
      [deck[3]!.id, { conceptId: deck[3]!.id, progress: { ...newProgress(), lastCorrect: false }, srs: { stability: 1, difficulty: 5, due: now - 1000, reps: 2, lapses: 1, lastReview: now - 86400000 } }],
    ]);
    const ids = pickConcepts(deck, states, 6, 'practice', now, seededRng(1));
    expect(ids).toHaveLength(6);
    expect(ids.slice(0, 2)).toContain(deck[3]!.id);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    const wrongOnly = pickConcepts(deck, states, 3, 'wrong_only', now, seededRng(1));
    expect(new Set(wrongOnly)).toEqual(new Set([deck[3]!.id]));
  });
});

describe('session', () => {
  it('schedules a retry two questions later, at most twice per concept', () => {
    let s = newSession('practice', ['a', 'b', 'c', 'd']);
    let o = applyAnswer(s, { conceptId: 'a', format: 'multiple_choice', bloom: 'remember', score: 0, variantKey: 'k' }, 0);
    expect(o.retryScheduled).toBe(true);
    expect(o.state.queue).toEqual(['b', 'c', 'a', 'd']);
    expect(o.state.total).toBe(5);
    s = o.state;
    o = applyAnswer(s, { conceptId: 'b', format: 'matching', bloom: 'remember', score: 1, variantKey: 'k' }, 10);
    expect(o.combo).toBe(1);
    s = applyAnswer(o.state, { conceptId: 'c', format: 'matching', bloom: 'remember', score: 1, variantKey: 'k' }, 10).state;
    o = applyAnswer(s, { conceptId: 'a', format: 'explain', bloom: 'remember', score: 0.2, variantKey: 'k2' }, 0);
    expect(o.firstTry).toBe(false);
    expect(o.state.retries.a).toBe(2);
    o = applyAnswer({ ...o.state, queue: ['a'] }, { conceptId: 'a', format: 'apply', bloom: 'remember', score: 0, variantKey: 'k3' }, 0);
    expect(o.retryScheduled).toBe(false);
    expect(o.state.bestCombo).toBe(2);
  });

  it('exam mode never inserts retries', () => {
    const o = applyAnswer(newSession('exam', ['a', 'b']), { conceptId: 'a', format: 'apply', bloom: 'apply', score: 0, variantKey: 'k' }, 0);
    expect(o.retryScheduled).toBe(false);
  });
});

describe('text and grading helpers', () => {
  it('accepts typos, accents, articles and plurals but not different words', () => {
    expect(matchesAccepted('the mitochondira', ['mitochondria'])).toBe(true);
    expect(matchesAccepted('Photosynthese', ['photosynthèse'])).toBe(true);
    expect(matchesAccepted('les stomates', ['stomate'])).toBe(true);
    expect(matchesAccepted('nucleus', ['ribosome'])).toBe(false);
    expect(matchesAccepted('cell', ['wall'])).toBe(false);
    expect(matchesAccepted('', ['x'])).toBe(false);
  });

  it('key-point heuristic gives credit for meaning-bearing words', () => {
    const kp = ['Particles move from high to low concentration', 'Diffusion is passive and needs no energy'];
    expect(gradeKeyPoints('Particles spread from where the concentration is high to where it is low, and it needs no energy because it is passive.', kp).score).toBe(1);
    expect(gradeKeyPoints('It is when things happen.', kp).score).toBe(0);
  });

  it('evaluates formulas safely', () => {
    expect(evaluate('I / A', { I: 8, A: 0.02 })).toBeCloseTo(400);
    expect(evaluate('2 + 3 * 4 ^ 2', {})).toBe(50);
    expect(evaluate('-(a - b) * sqrt(16)', { a: 1, b: 3 })).toBe(8);
    expect(() => evaluate('process.exit()', {})).toThrow();
    expect(() => evaluate('a +', { a: 1 })).toThrow();
  });

  it('ordering gives partial credit, full credit only when exact', () => {
    expect(orderingScore(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(1);
    const nearly = orderingScore(['a', 'b', 'c', 'd'], ['a', 'c', 'b', 'd']);
    expect(nearly).toBeGreaterThan(0.3);
    expect(nearly).toBeLessThan(0.8);
    expect(orderingScore(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(0);
  });

  it('rejects mismatched answer kinds', () => {
    const deck = deckOf('en');
    const q = generateLocal(deck[0]!, 'multiple_choice', 'remember', { deck, language: 'en', rng: seededRng(3) })!;
    expect(grade(q, { kind: 'text', text: 'nucleus' }).score).toBe(0);
  });
});
