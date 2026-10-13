import { describe, expect, it } from 'vitest';
import { isMastered, masteryBand, masteryScore, newProgress, recordAttempt } from '../src';

describe('mastery', () => {
  it('repeating one format never yields mastery', () => {
    let p = newProgress();
    for (let i = 0; i < 20; i++) p = recordAttempt(p, 'multiple_choice', 'remember', 1);
    expect(isMastered(p)).toBe(false);
    expect(masteryScore(p)).toBeLessThan(1);
  });

  it('three formats across two bloom levels = mastered', () => {
    let p = newProgress();
    p = recordAttempt(p, 'multiple_choice', 'remember', 1);
    p = recordAttempt(p, 'type_answer', 'remember', 1);
    expect(p.bloom).toBe('understand');
    p = recordAttempt(p, 'explain', 'understand', 0.9);
    expect(isMastered(p)).toBe(true);
    expect(masteryBand(p)).toBe('mastered');
  });

  it('a wrong answer drops depth and removes mastery', () => {
    let p = newProgress();
    p = recordAttempt(p, 'multiple_choice', 'remember', 1);
    p = recordAttempt(p, 'type_answer', 'remember', 1);
    p = recordAttempt(p, 'explain', 'understand', 1);
    p = recordAttempt(p, 'apply', 'understand', 0.2);
    expect(isMastered(p)).toBe(false);
    expect(p.bloom).toBe('remember');
  });

  it('tracks recent formats most-recent first without duplicates', () => {
    let p = newProgress();
    for (const f of ['matching', 'ordering', 'matching', 'explain', 'apply', 'compare'] as const) p = recordAttempt(p, f, 'remember', 0);
    expect(p.recentFormats).toEqual(['compare', 'apply', 'explain', 'matching']);
    expect(masteryBand(p)).toBe('learning');
  });
});
