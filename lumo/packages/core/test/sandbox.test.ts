import { describe, expect, it } from 'vitest';
import { generateSandbox, grade, parseSandboxRequest, perfectAnswer, SAMPLE_DECKS, SANDBOX_KINDS, sandboxSupports, seededRng, type Concept, type SandboxData } from '../src';

const deckOf = (lang: 'en' | 'fr'): Concept[] => SAMPLE_DECKS[lang].concepts.map((c, i) => ({ ...c, id: `${lang}${i}` }));

describe.each(['en', 'fr'] as const)('sandbox generators (%s)', (lang) => {
  const deck = deckOf(lang);

  it('every format generates valid content for the sample deck', () => {
    for (const kind of SANDBOX_KINDS) {
      expect(sandboxSupports(kind, deck), kind).toBe(true);
      for (const seed of [1, 2, 3]) {
        const a = generateSandbox(kind, { deck, title: 'Test', language: lang, rng: seededRng(seed) });
        expect(a, `${kind} seed ${seed}`).not.toBeNull();
        expect(a!.data.kind).toBe(kind);
        validate(a!.data);
      }
    }
  });
});

function validate(d: SandboxData) {
  const checkOk = (q: { options: string[]; correctIndex: number }) => {
    expect(q.options.length).toBeGreaterThanOrEqual(2);
    expect(q.options[q.correctIndex]).toBeTruthy();
    expect(new Set(q.options).size).toBe(q.options.length);
  };
  switch (d.kind) {
    case 'video':
      expect(d.scenes.length).toBeGreaterThan(4);
      expect(d.scenes.some((s) => s.check)).toBe(true);
      d.scenes.forEach((s) => s.check && checkOk(s.check));
      break;
    case 'podcast':
      expect(d.lines.length).toBeGreaterThan(6);
      expect(d.checks.length).toBeGreaterThan(0);
      d.checks.forEach((c) => { expect(c.afterLine).toBeLessThan(d.lines.length); checkOk(c.q); });
      break;
    case 'story':
      d.chapters.forEach((c) => checkOk(c.q));
      break;
    case 'crossword': {
      expect(d.entries.length).toBeGreaterThanOrEqual(3);
      // Every crossing letter must agree, and every word must fit in the grid.
      const cells = new Map<string, string>();
      for (const e of d.entries) {
        for (let i = 0; i < e.answer.length; i++) {
          const r = e.row + (e.dir === 'down' ? i : 0);
          const c = e.col + (e.dir === 'across' ? i : 0);
          expect(r).toBeLessThan(d.height);
          expect(c).toBeLessThan(d.width);
          const k = `${r},${c}`;
          if (cells.has(k)) expect(cells.get(k)).toBe(e.answer[i]);
          cells.set(k, e.answer[i]!);
        }
        expect(e.clue.toUpperCase()).not.toContain(e.display.toUpperCase());
      }
      break;
    }
    case 'word_search': {
      const lines = [...d.grid, ...d.grid[0]!.split('').map((_, c) => d.grid.map((r) => r[c]).join(''))];
      const diag: string[] = [];
      const n = d.size;
      for (let k = -n; k < 2 * n; k++) {
        let a = '', b = '';
        for (let r = 0; r < n; r++) { a += d.grid[r]![k + r] ?? ''; b += d.grid[r]![k - r] ?? ''; }
        diag.push(a, b);
      }
      const all = [...lines, ...diag].flatMap((l) => [l, [...l].reverse().join('')]).join('|');
      for (const w of d.words) expect(all, w.word).toContain(w.word);
      expect(d.grid.every((r) => r.length === d.size)).toBe(true);
      break;
    }
    case 'scramble':
      d.items.forEach((i) => expect([...i.scrambled].sort().join('')).toBe([...i.answer].sort().join('')));
      break;
    case 'quiz_show':
      for (const cat of d.categories) for (const cell of cat.cells) expect(grade(cell.q, perfectAnswer(cell.q)).score).toBe(1);
      break;
    case 'escape_room':
      expect(d.code).toBe(d.rooms.map((r) => r.digit).join(''));
      for (const r of d.rooms) expect(grade(r.q, perfectAnswer(r.q)).score).toBe(1);
      break;
    case 'speed_round':
      expect(d.items.some((i) => i.isTrue) && d.items.some((i) => !i.isTrue)).toBe(true);
      break;
    case 'two_truths':
      d.rounds.forEach((r) => { expect(r.statements).toHaveLength(3); expect(r.statements[r.lieIndex]).toBeTruthy(); });
      break;
    case 'mnemonics':
      d.items.forEach((i) => { expect(i.acronym).toHaveLength(i.list.length); expect(i.sentence.split(' ')).toHaveLength(i.list.length); });
      break;
    case 'timeline':
      expect(d.events.length).toBeGreaterThanOrEqual(3);
      break;
    default:
      expect(JSON.stringify(d).length).toBeGreaterThan(50);
  }
}

describe('sandbox requests', () => {
  const deck = deckOf('en');
  it('understands what the learner asks for, in English and French', () => {
    expect(parseSandboxRequest('make me a crossword about osmosis', deck)).toEqual({ kind: 'crossword', focus: [deck.find((c) => c.term === 'osmosis')!.id] });
    expect(parseSandboxRequest('Can you make a video explaining mitosis?', deck).kind).toBe('video');
    expect(parseSandboxRequest('je veux des mots croisés', deck).kind).toBe('crossword');
    expect(parseSandboxRequest('une fiche de révision svp').kind).toBe('cheat_sheet');
    expect(parseSandboxRequest('lets play an escape room').kind).toBe('escape_room');
    expect(parseSandboxRequest('two truths and a lie').kind).toBe('two_truths');
    expect(parseSandboxRequest('hello there').kind).toBeNull();
  });
});
