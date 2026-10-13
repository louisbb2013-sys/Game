import { dayKey, weekId, DAY_MS } from '@lumo/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, setupTestApp } from './helpers.ts';

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
afterAll(async () => { await t.close(); });

async function login(name: string) {
  const res = await t.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name } });
  const cookie = cookieFrom(res);
  return { cookie, id: res.json().user.id as string };
}
const get = (url: string, cookie: string) => t.app.inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, cookie: string, payload?: object) => t.app.inject({ method: 'POST', url, headers: { cookie }, payload });
const coins = async (id: string) => (await t.db.query('SELECT coins FROM users WHERE id = $1', [id])).rows[0].coins as number;
const setCoins = (id: string, n: number) => t.db.query('UPDATE users SET coins = $2 WHERE id = $1', [id, n]);

describe('shop, inventory and items', () => {
  it('buys with coins only, uses items, cosmetics once', async () => {
    const u = await login('shopper');
    expect((await post('/api/game/shop/buy', u.cookie, { itemId: 'streak_freeze' })).json().error).toBe('not_enough_coins');
    await setCoins(u.id, 1000);
    expect((await post('/api/game/shop/buy', u.cookie, { itemId: 'streak_freeze' })).statusCode).toBe(200);
    expect(await coins(u.id)).toBe(940);
    expect((await post('/api/game/shop/buy', u.cookie, { itemId: 'theme_galaxy' })).json().error).toBe('not_for_sale');
    expect((await post('/api/game/items/use', u.cookie, { itemId: 'streak_freeze' })).statusCode).toBe(200);
    const me = (await get('/api/me', u.cookie)).json().user;
    expect(me.streak.freezes).toBe(1);
    expect((await post('/api/game/items/use', u.cookie, { itemId: 'streak_freeze' })).json().error).toBe('not_enough_items');

    await post('/api/game/shop/buy', u.cookie, { itemId: 'theme_ocean' });
    expect((await post('/api/game/shop/buy', u.cookie, { itemId: 'theme_ocean' })).json().error).toBe('already_owned');
    expect((await post('/api/game/items/use', u.cookie, { itemId: 'theme_ocean' })).json().theme).toBe('theme_ocean');

    await post('/api/game/shop/buy', u.cookie, { itemId: 'xp_boost' });
    const boost = (await post('/api/game/items/use', u.cookie, { itemId: 'xp_boost' })).json();
    expect(new Date(boost.boostUntil).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(await t.ctx.game.boostFor(u.id)).toBeGreaterThanOrEqual(0.5);

    await t.db.query('UPDATE users SET hearts = 0 WHERE id = $1', [u.id]);
    await post('/api/game/shop/buy', u.cookie, { itemId: 'heart_refill' });
    await post('/api/game/items/use', u.cookie, { itemId: 'heart_refill' });
    expect((await get('/api/me', u.cookie)).json().user.hearts.current).toBe(5);
  });

  it('cannot be raced into negative coins', async () => {
    const u = await login('racer');
    await setCoins(u.id, 60);
    const results = await Promise.all(Array.from({ length: 5 }, () => post('/api/game/shop/buy', u.cookie, { itemId: 'streak_freeze' })));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(await coins(u.id)).toBe(0);
  });
});

describe('chests', () => {
  it('opens once, gives coins and items, only for the owner', async () => {
    const u = await login('opener');
    await t.ctx.game.giveChest(t.db, u.id, 'epic', 'test');
    const inv = (await get('/api/game/inventory', u.cookie)).json();
    expect(inv.chests).toHaveLength(1);
    const other = await login('thief');
    expect((await post(`/api/game/chests/${inv.chests[0].id}/open`, other.cookie)).statusCode).toBe(404);
    const opened = (await post(`/api/game/chests/${inv.chests[0].id}/open`, u.cookie)).json();
    expect(opened.loot.coins).toBeGreaterThanOrEqual(100);
    expect(await coins(u.id)).toBe(opened.loot.coins);
    expect((await post(`/api/game/chests/${inv.chests[0].id}/open`, u.cookie)).json().error).toBe('already_opened');
    const after = (await get('/api/game/inventory', u.cookie)).json();
    expect(after.items.reduce((n: number, i: { qty: number }) => n + i.qty, 0)).toBeGreaterThan(0);
  });
});

describe('pets', () => {
  it('adopt a starter, name safely, feed, hatch eggs, equip', async () => {
    const u = await login('petlover');
    expect((await post('/api/game/pets/adopt', u.cookie, { species: 'ember_dragon', name: 'Rex' })).json().error).toBe('not_a_starter');
    expect((await post('/api/game/pets/adopt', u.cookie, { species: 'moss_turtle', name: 'sh1t' })).json().error).toBe('bad_pet_name');
    const pet = (await post('/api/game/pets/adopt', u.cookie, { species: 'moss_turtle', name: 'Shelly' })).json();
    expect(pet).toMatchObject({ name: 'Shelly', equipped: true, level: 1, mood: 'content' });
    expect((await post('/api/game/pets/adopt', u.cookie, { species: 'pixel_owl', name: 'Hoot' })).json().error).toBe('already_has_pet');

    expect((await post('/api/game/items/use', u.cookie, { itemId: 'pet_food', petId: pet.id })).json().error).toBe('not_enough_items');
    await setCoins(u.id, 1000);
    await post('/api/game/shop/buy', u.cookie, { itemId: 'pet_food' });
    const fed = (await post('/api/game/items/use', u.cookie, { itemId: 'pet_food', petId: pet.id })).json();
    expect(fed.pet.xp).toBe(15);

    await post('/api/game/shop/buy', u.cookie, { itemId: 'egg_rare' });
    const hatched = (await post('/api/game/items/use', u.cookie, { itemId: 'egg_rare' })).json().pet;
    expect(hatched.rarity).not.toBe('common');
    expect(hatched.equipped).toBe(false);
    const eq = (await t.app.inject({ method: 'PATCH', url: `/api/game/pets/${hatched.id}`, headers: { cookie: u.cookie }, payload: { equipped: true, name: 'Sparky' } })).json();
    expect(eq).toMatchObject({ equipped: true, name: 'Sparky' });
    const pets = (await get('/api/game/pets', u.cookie)).json().pets;
    expect(pets.filter((p: { equipped: boolean }) => p.equipped)).toHaveLength(1);
    // The equipped pet grows when its owner earns XP.
    await t.ctx.game.awardNow(u.id, { xp: 200 });
    const grown = (await get('/api/game/pets', u.cookie)).json().pets.find((p: { id: string }) => p.id === hatched.id);
    expect(grown.level * 1000 + grown.xp).toBeGreaterThan(1000);
  });
});

describe('XP, levels, quests and badges', () => {
  it('level-ups give coins and chests; quests track and can be claimed once', async () => {
    const u = await login('climber');
    const r = await t.ctx.game.awardNow(u.id, { xp: 600, events: [{ type: 'answer', correct: true, combo: 5 }] });
    expect(r.levelUp!.level).toBeGreaterThanOrEqual(5);
    const inv = (await get('/api/game/inventory', u.cookie)).json();
    expect(inv.chests.length).toBeGreaterThanOrEqual(2);
    expect(await coins(u.id)).toBeGreaterThan(100);

    const quests = (await get('/api/game/quests', u.cookie)).json().quests;
    expect(quests.filter((q: { period: string }) => q.period === 'daily')).toHaveLength(3);
    expect(quests.filter((q: { period: string }) => q.period === 'weekly')).toHaveLength(2);
    const xpQuest = quests.find((q: { metric: string }) => q.metric === 'xp');
    const notDone = quests.find((q: { progress: number; target: number }) => q.progress < q.target);
    if (notDone) expect((await post(`/api/game/quests/${notDone.id}/claim`, u.cookie)).json().error).toBe('not_done');
    if (xpQuest) {
      expect(xpQuest.progress).toBe(xpQuest.target); // 600 XP completes any XP quest
      const before = await coins(u.id);
      expect((await post(`/api/game/quests/${xpQuest.id}/claim`, u.cookie)).statusCode).toBe(200);
      expect(await coins(u.id)).toBe(before + xpQuest.reward.coins);
      expect((await post(`/api/game/quests/${xpQuest.id}/claim`, u.cookie)).json().error).toBe('already_claimed');
    }
    const badges = (await get('/api/game/badges', u.cookie)).json();
    expect(badges.badges.length).toBeGreaterThan(10);
    expect(badges.stats.level).toBeGreaterThanOrEqual(5);
  });

  it('streak repair costs coins and only within the window', async () => {
    const u = await login('repairer');
    const today = dayKey(Date.now(), 'UTC');
    expect((await post('/api/game/streak/repair', u.cookie)).json().error).toBe('cannot_repair');
    await t.db.query('UPDATE users SET streak = $2, coins = 200 WHERE id = $1', [u.id, JSON.stringify({ days: 1, lastDay: today, freezes: 0, lost: { days: 12, on: today } })]);
    expect((await post('/api/game/streak/repair', u.cookie)).json().days).toBe(13);
    expect(await coins(u.id)).toBe(50);
  });
});

describe('leagues', () => {
  it('groups of max 30, weekly ranking, promotion/demotion and rewards at week end', async () => {
    const lastWeek = Date.now() - 7 * DAY_MS;
    const users = [];
    for (let i = 0; i < 31; i++) users.push(await login(`league${i}`));
    // 31 players in Silver earn different XP last week.
    await t.db.query("UPDATE users SET league_tier = 'silver' WHERE id = ANY($1::uuid[])", [users.map((u) => u.id)]);
    for (const [i, u] of users.entries()) await t.ctx.game.tx((c) => t.ctx.game.award(c, u.id, { xp: (i + 1) * 10 }, lastWeek));
    const groups = await t.db.query('SELECT group_id, count(*)::int AS n FROM league_members WHERE week_id = $1 GROUP BY group_id', [weekId(lastWeek)]);
    expect(groups.rows.map((g) => g.n).sort()).toEqual([1, 30]);

    expect(await t.ctx.game.settleLeagues()).toBe(2);
    expect(await t.ctx.game.settleLeagues()).toBe(0); // idempotent
    const tiers = await t.db.query('SELECT id, league_tier FROM users WHERE id = ANY($1::uuid[])', [users.map((u) => u.id)]);
    const tierOf = new Map(tiers.rows.map((r) => [r.id, r.league_tier]));
    // In the full group of 30 (users 0..29), the top 7 go up and the bottom 5 go down.
    const big = users.slice(0, 30);
    expect(big.slice(-7).every((u) => tierOf.get(u.id) === 'gold')).toBe(true);
    expect(big.slice(0, 5).every((u) => tierOf.get(u.id) === 'bronze')).toBe(true);
    expect(tierOf.get(big[15]!.id)).toBe('silver');

    const top = big.at(-1)!;
    const view = (await get('/api/game/league', top.cookie)).json();
    expect(view.lastResult).toMatchObject({ rank: 1, outcome: 'promoted', toTier: 'gold' });
    expect((await get('/api/game/league', top.cookie)).json().lastResult).toBeNull(); // shown once
    expect((await get('/api/game/inventory', top.cookie)).json().chests.some((c: { source: string }) => c.source === 'league')).toBe(true);
    expect((await get('/api/game/badges', top.cookie)).json().badges.find((b: { id: string }) => b.id === 'gold_league').earnedAt).toBeTruthy();
  });

  it('this week: league table and global board show usernames only', async () => {
    const a = await login('weeklya');
    const b = await login('weeklyb');
    await t.ctx.game.awardNow(a.id, { xp: 50 });
    await t.ctx.game.awardNow(b.id, { xp: 80 });
    const view = (await get('/api/game/league', a.cookie)).json();
    expect(view.members.length).toBeGreaterThanOrEqual(2);
    expect(view.members.find((m: { me: boolean }) => m.me).weeklyXp).toBe(50);
    expect(JSON.stringify(view)).not.toMatch(/@|email/);
    const board = (await get('/api/game/leaderboard/global', a.cookie)).json().rows;
    expect(board[0].weeklyXp).toBeGreaterThanOrEqual(80);
    expect(JSON.stringify(board)).not.toMatch(/@|email|userId/);
  });
});
