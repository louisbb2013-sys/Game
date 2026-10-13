import { describe, expect, it } from 'vitest';
import {
  allAnswered, createLive, generateLocal, joinLive, LIVE_MAX_PLAYERS, liveRewards, livePoints, nextLive, openAnswersToJudge, perfectAnswer, publicView,
  ranking, revealLive, SAMPLE_DECKS, seededRng, setConnected, startLive, submitLive, timeIsUp, type Question,
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
