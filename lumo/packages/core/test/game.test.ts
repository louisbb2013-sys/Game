import { describe, expect, it } from 'vitest';
import {
  addPetXp, advanceQuest, applyStats, BADGES, currentFullness, emptyStats, feedPet, hatch, ITEMS, newBadges, PET_SPECIES, petMood, petXpPerk,
  questsFor, rollChest, seededRng, HOUR_MS, type GameEvent, petTier, upgradeBlocker, upgradePet, RARITIES, PET_UPGRADES,
  MAX_ACTIVE_PETS, petBuff, teamBuffs, type PetState, rollEggRarity, speciesOf,
} from '../src';

describe('chests', () => {
  it('better chests give more, and every chest gives something', () => {
    const avg = (k: 'common' | 'rare' | 'epic') => {
      let coins = 0, items = 0;
      for (let s = 0; s < 500; s++) { const l = rollChest(k, seededRng(s)); coins += l.coins; items += l.items.reduce((a, i) => a + 1, 0); expect(l.coins).toBeGreaterThan(0); expect(l.items.length).toBeGreaterThan(0); }
      return { coins: coins / 500, items: items / 500 };
    };
    const c = avg('common'), r = avg('rare'), e = avg('epic');
    expect(r.coins).toBeGreaterThan(c.coins);
    expect(e.coins).toBeGreaterThan(r.coins);
    expect(e.items).toBeGreaterThanOrEqual(r.items);
    for (let s = 0; s < 200; s++) for (const i of rollChest('epic', seededRng(s)).items) expect(ITEMS[i.id]).toBeTruthy();
  });

  it('eggs hatch real species, rare eggs never give commons', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 2000; s++) {
      const sp = hatch('egg_rare', seededRng(s));
      expect(PET_SPECIES.find((p) => p.id === sp)!.rarity).not.toBe('common');
      seen.add(hatch('egg_common', seededRng(s)));
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});

describe('pets', () => {
  const T = 1_000_000_000;
  const pet = { species: 'comet_fox' as const, level: 1, xp: 0, fullness: 100, fedAt: T };
  it('get hungry over time and feeding helps', () => {
    expect(currentFullness(pet, T + 50 * HOUR_MS)).toBe(50);
    const fed = feedPet({ ...pet, fullness: 10 }, T);
    expect(fed.fullness).toBe(45);
    expect(fed.xp).toBe(10);
  });
  it('level up and react to streak and hunger', () => {
    const p = addPetXp(pet, 1000);
    expect(p.level).toBeGreaterThan(5);
    expect(petMood(pet, T, 'safe')).toBe('happy');
    expect(petMood(pet, T, 'broken')).toBe('sad');
    expect(petMood({ ...pet, fullness: 20 }, T, 'safe')).toBe('hungry');
    expect(petXpPerk(pet, 'happy')).toBeCloseTo(0.04);
    expect(petXpPerk(pet, 'sad')).toBe(0);
    expect(petXpPerk({ ...pet, species: 'ember_dragon', level: 50 }, 'happy')).toBeCloseTo(0.18);
    expect(petXpPerk({ ...pet, species: 'ember_dragon', level: 50, tier: 'mythical' }, 'happy')).toBe(0.2); // the cap
  });
});

describe('quests and badges', () => {
  it('daily quests are stable per learner/day, varied across learners, one per metric', () => {
    const a = questsFor('u1', '2026-10-13', 'daily');
    expect(questsFor('u1', '2026-10-13', 'daily')).toEqual(a);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((q) => q.metric)).size).toBe(3);
    const variety = new Set(Array.from({ length: 30 }, (_, i) => questsFor(`u${i}`, '2026-10-13', 'daily').map((q) => q.id).join()));
    expect(variety.size).toBeGreaterThan(5);
    expect(questsFor('u1', '2026-W42', 'weekly')).toHaveLength(2);
  });

  it('events advance quests and stats, and unlock badges once', () => {
    expect(advanceQuest('correct_answers', 3, { type: 'answer', correct: true, combo: 1 })).toBe(4);
    expect(advanceQuest('correct_answers', 3, { type: 'answer', correct: false, combo: 0 })).toBe(3);
    expect(advanceQuest('combo', 4, { type: 'answer', correct: true, combo: 3 })).toBe(4);
    expect(advanceQuest('xp', 10, { type: 'xp', amount: 25 })).toBe(35);
    expect(advanceQuest('sessions', 0, { type: 'session_done', perfect: false, answered: 1 })).toBe(0);

    let s = emptyStats();
    const before = s;
    const events: GameEvent[] = [{ type: 'session_done', perfect: true, answered: 10 }, { type: 'deck_created' }, { type: 'streak', days: 7 }, { type: 'league', tier: 'gold' }];
    for (const e of events) s = applyStats(s, e);
    expect(newBadges(before, s).sort()).toEqual(['deck_maker', 'first_steps', 'gold_league', 'streak_7']);
    expect(newBadges(s, applyStats(s, { type: 'deck_created' }))).toEqual([]);
    for (const k of ['a', 'b', 'c', 'd', 'e', 'e']) s = applyStats(s, { type: 'sandbox_done', kind: k, score: 1 });
    expect(s.sandboxKinds).toHaveLength(5);
    expect(BADGES.find((b) => b.id === 'explorer')!.earned(s)).toBe(true);
    expect(applyStats(s, { type: 'league', tier: 'bronze' }).bestTier).toBe('gold');
  });
});

describe('pet tiers', () => {
  it('pets climb common → rare → … → galaxial with level and coins; Lumo is only ever a gift', () => {
    let p = { species: 'moss_turtle' as const, level: 1, xp: 0, fullness: 80, fedAt: 0 };
    expect(petTier(p)).toBe('common');
    expect(upgradeBlocker(p, 10_000)).toBe('level_too_low');
    p = { ...p, level: 4 };
    expect(upgradeBlocker(p, 150)).toBe('not_enough_coins');
    expect(upgradeBlocker(p, 200)).toBeNull();
    const up = upgradePet(p);
    expect(petTier(up)).toBe('rare');
    // Mythical → Exotic → Galaxial by upgrades; nothing goes past Galaxial.
    expect(petTier(upgradePet({ ...up, tier: 'mythical' }))).toBe('exotic');
    expect(petTier(upgradePet({ ...up, tier: 'exotic' }))).toBe('galaxial');
    const top = { ...up, level: 50, tier: 'galaxial' as const };
    expect(upgradeBlocker(top, 1e9)).toBe('max_tier');
    expect(upgradeBlocker({ ...top, tier: 'lumo' }, 1e9)).toBe('max_tier');
    expect(petXpPerk(top, 'happy')).toBeGreaterThan(petXpPerk({ ...top, tier: 'common' }, 'happy'));
    expect(RARITIES).toEqual(['common', 'rare', 'epic', 'legendary', 'mythical', 'exotic', 'galaxial', 'lumo']);
    expect(PET_UPGRADES.galaxial).toBeNull();
    // No egg ever gives a Lumo pet.
    for (let s = 0; s < 3000; s++) expect(rollEggRarity(seededRng(s))).not.toBe('lumo');
    for (let s = 0; s < 3000; s++) expect(speciesOf(hatch('egg_rare', seededRng(s)))!.rarity).not.toBe('lumo');
    expect(PET_SPECIES.find((x) => x.rarity === 'lumo')?.id).toBe('lumo_firefly');
  });
});

describe('pet team bonuses (like Gizmo)', () => {
  const pet = (species: string, level = 1, extra: Partial<PetState> = {}): PetState => ({ species: species as PetState['species'], level, xp: 0, fullness: 100, fedAt: 0, ...extra });

  it('gives every pet one bonus that grows with rarity and level', () => {
    expect(petBuff(pet('moss_turtle'))).toEqual({ kind: 'heart', value: 0.05 });
    expect(petBuff(pet('moss_turtle', 3))).toEqual({ kind: 'heart', value: 0.07 });
    expect(petBuff(pet('moss_turtle', 3, { tier: 'rare' }))).toEqual({ kind: 'heart', value: 0.1 });
    expect(petBuff(pet('pixel_owl', 5))).toEqual({ kind: 'xp', value: 0.06 });
    expect(petBuff(pet('acorn_squirrel', 9))).toEqual({ kind: 'coins', value: 1 });
    expect(petBuff(pet('acorn_squirrel', 10))).toEqual({ kind: 'coins', value: 2 });
    expect(petBuff(pet('cloud_sheep'))).toEqual({ kind: 'egg', value: 0.1 });
    // Every species has a bonus.
    for (const s of PET_SPECIES) expect(['xp', 'coins', 'heart', 'egg']).toContain(petBuff(pet(s.id)).kind);
  });

  it('adds up the 4 active pets, skips hungry ones, and caps each bonus', () => {
    const team = [pet('moss_turtle', 3), pet('crystal_cat', 2), pet('pixel_owl'), pet('acorn_squirrel'), pet('ember_dragon')];
    expect(MAX_ACTIVE_PETS).toBe(4);
    expect(teamBuffs(team, 0)).toEqual({ heart: 0.07 + 0.09, xp: 0.04, coins: 1, egg: 0 }); // the 5th pet isn't on the team
    expect(teamBuffs([pet('moss_turtle', 3, { fullness: 0 })], 0).heart).toBe(0); // too hungry to help
    const xpTeam = Array.from({ length: 4 }, () => pet('galaxy_dragon', 50));
    expect(teamBuffs(xpTeam, 0).xp).toBe(0.4);
  });
});
