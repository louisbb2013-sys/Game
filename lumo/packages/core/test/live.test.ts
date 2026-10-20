import { describe, expect, it } from 'vitest';
import {
  allAnswered, createLive, endLive, generateLocal, joinLive, LIVE_MAX_PLAYERS, liveRewards, livePoints, nextLive, openAnswersToJudge, perfectAnswer, publicView,
  ranking, revealLive, SAMPLE_DECKS, seededRng, setConnected, startLive, submitLive, timeIsUp, type Question, betLive, toLiveChoices,
} from '../src';

const deck = SAMPLE_DECKS.en.concepts.map((c, i) => ({ ...c, id: `c${i}` }));
const qs: Question[] = [
  generateLocal(deck[0]!, 'multiple_choice', 'remember', { deck, language: 'en', rng: seededRng(1) })!,
  generateLocal(deck[7]!, 'ordering', 'understand', { deck, language: 'en', rng: seededRng(2) })!,
  generateLocal(deck[5]!, 'explain', 'understand', { deck, language: 'en', rng: seededRng(3) })!,
];
const host = { id: 'h', name: 'Host', avatar: 'a' };
const T = 1_000_000;

describe('live game engine', () => {
  it('lobby → questions → reveal → podium with speed + accuracy scoring', () => {
    let s = createLive('ABC123', host, 'Cells', qs, T);
    expect(() => startLive(s, 'h', T)).toThrow('not_enough_players');
    s = joinLive(s, { id: 'p1', name: 'Ana', avatar: 'b' }, T);
    s = joinLive(s, { id: 'p2', name: 'Ben', avatar: 'c' }, T);
    expect(() => startLive(s, 'p1', T)).toThrow('not_host');
    s = startLive(s, 'h', T);
    expect(s.phase).toBe('question');

    // Public view never exposes the answer key during the question.
    const pv = JSON.stringify(publicView(s));
    expect(pv).not.toContain('correctId');
    expect(publicView(s).reveal).toBeNull();

    const q0 = s.questions[0]!;
    s = submitLive(s, 'p1', q0.id, perfectAnswer(q0), T + 2000); // fast & right
    s = submitLive(s, 'p2', q0.id, perfectAnswer(q0), T + 15000); // slow & right
    expect(() => submitLive(s, 'p2', q0.id, perfectAnswer(q0), T + 16000)).toThrow('already_answered');
    expect(allAnswered(s)).toBe(false); // host hasn't answered
    s = submitLive(s, 'h', q0.id, { kind: 'choice', optionId: 'nope' }, T + 3000); // wrong
    expect(allAnswered(s)).toBe(true);
    s = revealLive(s);
    expect(s.lastResults.p1!.points).toBeGreaterThan(s.lastResults.p2!.points);
    expect(s.lastResults.h!.points).toBe(0);
    expect(publicView(s).reveal!.correctAnswer).toBeTruthy();
    expect(ranking(s)[0]!.id).toBe('p1');

    s = nextLive(s, 'h', T + 30000);
    const q1 = s.questions[1]!;
    expect(() => submitLive(s, 'p1', q0.id, perfectAnswer(q0), T + 31000)).toThrow('stale_question');
    s = submitLive(s, 'p2', q1.id, perfectAnswer(q1), T + 31000);
    expect(timeIsUp(s, T + 30000 + s.durationMs)).toBe(true);
    s = revealLive(s); // p1 and host didn't answer: 0 points, streak reset
    expect(s.players.find((p) => p.id === 'p1')!.streak).toBe(0);
    expect(s.players.find((p) => p.id === 'p2')!.streak).toBe(2);
    expect(publicView(s).players.find((p) => p.id === 'p2')!.previousRank).toBe(2);

    // Open answers: the server can pass AI grades; otherwise the heuristic applies.
    s = nextLive(s, 'h', T + 60000);
    const q2 = s.questions[2]!;
    s = submitLive(s, 'p1', q2.id, { kind: 'text', text: 'blah' }, T + 61000);
    s = submitLive(s, 'p2', q2.id, perfectAnswer(q2), T + 62000);
    expect(openAnswersToJudge(s).map((x) => x.playerId).sort()).toEqual(['p1', 'p2']);
    s = revealLive(s, { p1: { score: 1, matchedPoints: [], missingPoints: [] } });
    expect(s.lastResults.p1!.correct).toBe(true);
    expect(s.lastResults.p2!.correct).toBe(true);
    s = nextLive(s, 'h', T + 90000);
    expect(s.phase).toBe('podium');
    expect(s.players.find((p) => p.id === 'p2')!.correctCount).toBe(3);
  });

  it('caps players, keeps reconnecting players, blocks late joins', () => {
    let s = createLive('X', host, 't', qs, T);
    for (let i = 1; i < LIVE_MAX_PLAYERS; i++) s = joinLive(s, { id: `p${i}`, name: `P${i}`, avatar: '' }, T);
    expect(() => joinLive(s, { id: 'late', name: 'L', avatar: '' }, T)).toThrow('full');
    s = setConnected(s, 'p1', false);
    s = joinLive(s, { id: 'p1', name: 'P1', avatar: '' }, T);
    expect(s.players.find((p) => p.id === 'p1')!.connected).toBe(true);
    s = startLive(s, 'h', T);
    expect(() => joinLive(s, { id: 'new', name: 'N', avatar: '' }, T)).toThrow('started');
  });

  it('the host can end a long game early, straight to the podium', () => {
    let s = createLive('ABC123', host, 'Cells', qs, T);
    s = joinLive(s, { id: 'p1', name: 'Ana', avatar: 'b' }, T);
    expect(() => endLive(s, 'h')).toThrow('wrong_phase'); // not before it starts
    s = startLive(s, 'h', T);
    s = submitLive(s, 'p1', s.questions[0]!.id, perfectAnswer(s.questions[0]!), T + 1000);
    s = revealLive(s);
    expect(() => endLive(s, 'p1')).toThrow('not_host');
    s = endLive(s, 'h');
    expect(s.phase).toBe('podium');
    expect(ranking(s)[0]!.id).toBe('p1');
  });

  it('points and rewards', () => {
    expect(livePoints(1, 0, 20000, 0)).toBe(1000);
    expect(livePoints(1, 20000, 20000, 0)).toBe(500);
    expect(livePoints(1, 0, 20000, 5)).toBe(1500);
    expect(livePoints(0.5, 0, 20000, 0)).toBe(500);
    expect(livePoints(0, 0, 20000, 3)).toBe(0);
    expect(liveRewards(1, 5, 4).xp).toBeGreaterThan(liveRewards(4, 5, 4).xp);
    expect(liveRewards(10, 20, 0).coins).toBeGreaterThan(0);
  });
});

describe('live: four choices and bets', () => {
  it('every question becomes four choices (A-D), wrong answers borrowed from the deck when needed', () => {
    const set: Question[] = [
      { id: 'q1', conceptId: 'c1', format: 'multiple_choice', bloom: 'remember', language: 'en', prompt: 'Powerhouse of the cell?', explanation: 'x', variantKey: 'v1', options: [{ id: 'a', text: 'Mitochondria' }, { id: 'b', text: 'Ribosome' }, { id: 'c', text: 'Nucleus' }], correctId: 'a', optionNotes: { b: 'makes proteins' } },
      { id: 'q2', conceptId: 'c2', format: 'type_answer', bloom: 'remember', language: 'en', prompt: 'Green pigment?', explanation: 'x', variantKey: 'v2', accepted: ['Chlorophyll', 'chlorophyl'] },
      { id: 'q3', conceptId: 'c3', format: 'fill_blank', bloom: 'remember', language: 'en', prompt: 'Complete:', explanation: 'x', variantKey: 'v3', text: 'Plants release ___.', blanks: [{ accepted: ['Oxygen'] }] },
      { id: 'q4', conceptId: 'c4', format: 'multiple_choice', bloom: 'remember', language: 'en', prompt: 'Stores DNA?', explanation: 'x', variantKey: 'v4', options: ['Nucleus', 'Vacuole', 'Cell wall', 'Golgi', 'Lysosome'].map((text, i) => ({ id: `o${i}`, text })), correctId: 'o0' },
      { id: 'q5', conceptId: 'c5', format: 'ordering', bloom: 'understand', language: 'en', prompt: 'Order', explanation: 'x', variantKey: 'v5', items: [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }], correctOrder: ['a', 'b'] },
    ];
    const out = toLiveChoices(set, seededRng(7));
    expect(out.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']); // the ordering one can't be a choice
    for (const q of out) {
      expect(q.format).toBe('multiple_choice');
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.text.toLowerCase())).size).toBe(4);
      expect(q.options.some((o) => o.id === q.correctId)).toBe(true);
    }
    expect(out[1]!.options.find((o) => o.id === out[1]!.correctId)!.text).toBe('Chlorophyll');
    expect(out[2]!.prompt).toContain('Plants release ___.');
    expect(out[0]!.optionNotes).toEqual({ b: 'makes proteins' }); // notes kept for options still there
  });

  it('a good bet wins its stake in XP, a bad one loses it', () => {
    let s = createLive('BET123', host, 'Cells', qs, T);
    s = joinLive(s, { id: 'p1', name: 'Ana', avatar: 'b' }, T);
    s = joinLive(s, { id: 'p2', name: 'Ben', avatar: 'c' }, T);
    s = startLive(s, 'h', T);
    const q0 = s.questions[0]!;
    s = betLive(s, 'p1', q0.id, { on: 'p2', right: true, stake: 25 });
    s = betLive(s, 'h', q0.id, { on: 'p2', right: false, stake: 10 });
    expect(() => betLive(s, 'p1', q0.id, { on: 'h', right: true, stake: 10 })).toThrow('already_bet');
    expect(() => betLive(s, 'p2', q0.id, { on: 'p2', right: true, stake: 10 })).toThrow('bad_bet'); // not on yourself
    expect(() => betLive(s, 'p2', q0.id, { on: 'h', right: true, stake: 999 })).toThrow('bad_bet');
    expect(publicView(s).bets).toHaveLength(2);
    s = submitLive(s, 'p2', q0.id, perfectAnswer(q0), T + 1000);
    s = revealLive(s);
    expect(s.betResults!.p1).toMatchObject({ won: true, delta: 25 });
    expect(s.betResults!.h).toMatchObject({ won: false, delta: -10 });
    const v = publicView(s);
    expect(v.players.find((p) => p.id === 'p1')!.betXp).toBe(25);
    expect(v.players.find((p) => p.id === 'h')!.betXp).toBe(-10);
    expect(v.reveal!.bets.p1!.won).toBe(true);
    s = nextLive(s, 'h', T + 5000);
    expect(s.bets).toEqual({}); // a fresh question, fresh bets
    expect(s.betTotals).toEqual({ p1: 25, h: -10 });
  });
});
