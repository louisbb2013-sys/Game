import { describe, expect, it } from 'vitest';
import { generateUsername, seededRng, validateUsername } from '../src';

describe('usernames', () => {
  it('generated names are always valid', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 2000; i++) expect(validateUsername(generateUsername(rng))).toBeNull();
  });

  it('rejects unsafe names', () => {
    expect(validateUsername('ab')).toBe('length');
    expect(validateUsername('hi there')).toBe('characters');
    expect(validateUsername('sh1tlord')).toBe('blocked');
    expect(validateUsername('Lea2011')).toBe('personal_info');
    expect(validateUsername('call5145551234')).toBe('personal_info');
    expect(validateUsername('SkillfulOtter')).toBeNull();
  });
});
