import { randomInt } from 'node:crypto';
import {
  addFreeze,
  addPetXp,
  advanceQuest,
  applyStats,
  BADGES,
  canRepair,
  currentFullness,
  dayKey,
  emptyStats,
  feedPet,
  hatch,
  ITEMS,
  leagueReward,
  levelFromXp,
  levelUpRewards,
  MAX_HEARTS,
  newBadges,
  nextTier,
  petMood,
  petXpPerk,
  questDef,
  questsFor,
  rankGroup,
  repairStreak,
  rollChest,
  seededRng,
  speciesOf,
  STARTER_PETS,
  streakStatus,
  validateUsername,
  weekEndsAt,
  weekId,
  XP_BOOST_BONUS,
  XP_BOOST_MS,
  zoneSizes,
  GROUP_SIZE,
  type ChestKind,
  type GameEvent,
  type ItemId,
  type LeagueTier,
  type PetSpeciesId,
  type PetState,
  type Stats,
  type StreakState,
} from '@lumo/core';
import type pg from 'pg';
import type { Db } from '../db/pool.ts';
import { QuizError } from '../quiz/service.ts';

type Q = pg.PoolClient | Db;

/** Crypto-seeded RNG for loot: unpredictable for players, still uses the shared tested rules. */
const lootRng = () => seededRng(randomInt(0, 2 ** 31));

export interface Rewards {
  xp: number;
  levelUp: { level: number; coins: number; chest?: ChestKind } | null;
  badges: string[];
  questsCompleted: string[];
}

export const emptyRewards = (): Rewards => ({ xp: 0, levelUp: null, badges: [], questsCompleted: [] });

interface PetRow {
  id: string;
  species: PetSpeciesId;
  name: string;
  level: number;
  xp: number;
  fullness: number;
  fed_at: Date;
  equipped: boolean;
}

const petState = (p: PetRow): PetState => ({ species: p.species, level: p.level, xp: p.xp, fullness: p.fullness, fedAt: p.fed_at.getTime() });

export class GameService {
  constructor(private db: Db) {}

  /** Run `fn` in a transaction (or reuse the caller's client). */
  async tx<T>(fn: (c: pg.PoolClient) => Promise<T>, client?: pg.PoolClient): Promise<T> {
    if (client) return fn(client);
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
  }

  // ------------------------------------------------------------------ XP & events

  /**
   * The single place XP is granted: ledger, total, weekly league score, pet growth,
   * level-up rewards, stats, badges and quests. Always server-side.
   */
  async award(c: pg.PoolClient, userId: string, input: { xp?: number; reason?: string; events?: GameEvent[] }, now = Date.now()): Promise<Rewards> {
    const xp = Math.max(0, Math.round(input.xp ?? 0));
    const u = (await c.query<{ xp: number; stats: Partial<Stats>; league_tier: LeagueTier; timezone: string }>('SELECT xp, stats, league_tier, timezone FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
    if (!u) throw new QuizError(404, 'user_not_found');
    const rewards = emptyRewards();
    rewards.xp = xp;
    const events: GameEvent[] = [...(input.events ?? [])];

    if (xp > 0) {
      const week = weekId(now);
      await c.query('INSERT INTO xp_events (user_id, amount, reason, week_id) VALUES ($1, $2, $3, $4)', [userId, xp, input.reason ?? 'xp', week]);
      await c.query('UPDATE users SET xp = xp + $2 WHERE id = $1', [userId, xp]);
      const groupId = await this.joinLeague(c, userId, u.league_tier, week);
      await c.query('UPDATE league_members SET weekly_xp = weekly_xp + $3, last_xp_at = now() WHERE group_id = $1 AND user_id = $2', [groupId, userId, xp]);
      // The equipped pet grows a little with every study session.
      const pet = (await c.query<PetRow>('SELECT * FROM pets WHERE user_id = $1 AND equipped FOR UPDATE', [userId])).rows[0];
      if (pet) {
        const grown = addPetXp(petState(pet), xp * 0.2);
        await c.query('UPDATE pets SET level = $2, xp = $3 WHERE id = $1', [pet.id, grown.level, grown.xp]);
      }
      events.push({ type: 'xp', amount: xp });
      const before = levelFromXp(u.xp);
      const after = levelFromXp(u.xp + xp);
      for (let level = before + 1; level <= after; level++) {
        const r = levelUpRewards(level);
        await c.query('UPDATE users SET coins = coins + $2 WHERE id = $1', [userId, r.coins]);
        if (r.chest) await this.giveChest(c, userId, r.chest, `level_${level}`);
        rewards.levelUp = { level, coins: r.coins, chest: r.chest };
        events.push({ type: 'level', level });
      }
    }

    // Stats & badges
    const statsBefore: Stats = { ...emptyStats(), ...u.stats };
    const statsAfter = events.reduce(applyStats, statsBefore);
    for (const b of newBadges(statsBefore, statsAfter)) {
      const r = await c.query('INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, b]);
      if (r.rowCount) rewards.badges.push(b);
    }
    await c.query('UPDATE users SET stats = $2 WHERE id = $1', [userId, JSON.stringify(statsAfter)]);

    // Quests
    rewards.questsCompleted = await this.advanceQuests(c, userId, u.timezone, events, now);
    return rewards;
  }

  /** Same as award(), in its own transaction. */
  awardNow(userId: string, input: { xp?: number; reason?: string; events?: GameEvent[] }) {
    return this.tx((c) => this.award(c, userId, input));
  }

  /** XP multiplier from an active boost and the equipped pet (capped by the core rules). */
  async boostFor(userId: string, now = Date.now()): Promise<number> {
    const { rows } = await this.db.query<{ boost_until: Date | null; streak: StreakState; timezone: string }>('SELECT boost_until, streak, timezone FROM users WHERE id = $1', [userId]);
    const u = rows[0];
    if (!u) return 0;
    let boost = u.boost_until && u.boost_until.getTime() > now ? XP_BOOST_BONUS : 0;
    const pet = (await this.db.query<PetRow>('SELECT * FROM pets WHERE user_id = $1 AND equipped', [userId])).rows[0];
    if (pet) boost += petXpPerk(petState(pet), petMood(petState(pet), now, streakStatus(u.streak, dayKey(now, u.timezone))));
    return boost;
  }

  // ------------------------------------------------------------------ quests

  private periods(tz: string, now: number) {
    return { daily: dayKey(now, tz), weekly: weekId(now) };
  }

  private async ensureQuests(c: Q, userId: string, tz: string, now: number) {
    const p = this.periods(tz, now);
    for (const [period, key] of [['daily', p.daily], ['weekly', p.weekly]] as const) {
      for (const q of questsFor(userId, key, period)) {
        await c.query('INSERT INTO user_quests (user_id, quest_id, period_key, target) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [userId, q.id, key, q.target]);
      }
    }
    return p;
  }

  private async advanceQuests(c: pg.PoolClient, userId: string, tz: string, events: GameEvent[], now: number): Promise<string[]> {
    const p = await this.ensureQuests(c, userId, tz, now);
    const { rows } = await c.query<{ quest_id: string; period_key: string; progress: number; target: number }>(
      'SELECT quest_id, period_key, progress, target FROM user_quests WHERE user_id = $1 AND period_key = ANY($2) FOR UPDATE',
      [userId, [p.daily, p.weekly]],
    );
    const done: string[] = [];
    for (const r of rows) {
      const def = questDef(r.quest_id);
      if (!def) continue;
      const next = Math.min(r.target, events.reduce((acc, e) => advanceQuest(def.metric, acc, e), r.progress));
      if (next !== r.progress) {
        await c.query('UPDATE user_quests SET progress = $4 WHERE user_id = $1 AND quest_id = $2 AND period_key = $3', [userId, r.quest_id, r.period_key, next]);
        if (r.progress < r.target && next >= r.target) done.push(r.quest_id);
      }
    }
    return done;
  }

  async quests(userId: string) {
    const u = (await this.db.query<{ timezone: string }>('SELECT timezone FROM users WHERE id = $1', [userId])).rows[0]!;
    const p = await this.ensureQuests(this.db, userId, u.timezone, Date.now());
    const { rows } = await this.db.query<{ quest_id: string; period_key: string; progress: number; target: number; claimed: boolean }>(
      'SELECT quest_id, period_key, progress, target, claimed FROM user_quests WHERE user_id = $1 AND period_key = ANY($2)',
      [userId, [p.daily, p.weekly]],
    );
    return rows.map((r) => ({
      id: r.quest_id,
      period: r.period_key === p.daily ? ('daily' as const) : ('weekly' as const),
      metric: questDef(r.quest_id)?.metric,
      progress: r.progress,
      target: r.target,
      claimed: r.claimed,
      reward: questDef(r.quest_id)?.reward,
    }));
  }

  async claimQuest(userId: string, questId: string) {
    return this.tx(async (c) => {
      const u = (await c.query<{ timezone: string }>('SELECT timezone FROM users WHERE id = $1', [userId])).rows[0]!;
      const p = this.periods(u.timezone, Date.now());
      const q = (
        await c.query<{ period_key: string; progress: number; target: number; claimed: boolean }>(
          'SELECT period_key, progress, target, claimed FROM user_quests WHERE user_id = $1 AND quest_id = $2 AND period_key = ANY($3) FOR UPDATE',
          [userId, questId, [p.daily, p.weekly]],
        )
      ).rows[0];
      const def = questDef(questId);
      if (!q || !def) throw new QuizError(404, 'quest_not_found');
      if (q.claimed) throw new QuizError(409, 'already_claimed');
      if (q.progress < q.target) throw new QuizError(409, 'not_done');
      await c.query('UPDATE user_quests SET claimed = true WHERE user_id = $1 AND quest_id = $2 AND period_key = $3', [userId, questId, q.period_key]);
      await c.query('UPDATE users SET coins = coins + $2 WHERE id = $1', [userId, def.reward.coins]);
      if (def.reward.chest) await this.giveChest(c, userId, def.reward.chest, `quest_${questId}`);
      return def.reward;
    });
  }

  // ------------------------------------------------------------------ badges

  async badges(userId: string) {
    const { rows } = await this.db.query<{ badge_id: string; earned_at: Date }>('SELECT badge_id, earned_at FROM user_badges WHERE user_id = $1', [userId]);
    const earned = new Map(rows.map((r) => [r.badge_id, r.earned_at.toISOString()]));
    const stats = (await this.db.query<{ stats: Partial<Stats> }>('SELECT stats FROM users WHERE id = $1', [userId])).rows[0]?.stats ?? {};
    return { stats: { ...emptyStats(), ...stats }, badges: BADGES.map((b) => ({ id: b.id, emoji: b.emoji, earnedAt: earned.get(b.id) ?? null })) };
  }

  // ------------------------------------------------------------------ inventory, shop, chests

  async addItem(c: Q, userId: string, item: ItemId, qty: number) {
    await c.query('INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, $2, $3) ON CONFLICT (user_id, item_id) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty', [userId, item, qty]);
  }

  private async takeItem(c: pg.PoolClient, userId: string, item: ItemId) {
    const r = await c.query('UPDATE inventory SET qty = qty - 1 WHERE user_id = $1 AND item_id = $2 AND qty > 0', [userId, item]);
    if (!r.rowCount) throw new QuizError(409, 'not_enough_items');
  }

  async giveChest(c: Q, userId: string, kind: ChestKind, source: string) {
    await c.query('INSERT INTO chests (user_id, kind, source) VALUES ($1, $2, $3)', [userId, kind, source]);
  }

  async inventory(userId: string) {
    const items = (await this.db.query<{ item_id: ItemId; qty: number }>('SELECT item_id, qty FROM inventory WHERE user_id = $1 AND qty > 0 ORDER BY item_id', [userId])).rows;
    const chests = (await this.db.query<{ id: string; kind: ChestKind; source: string; created_at: Date }>('SELECT id, kind, source, created_at FROM chests WHERE user_id = $1 AND opened_at IS NULL ORDER BY created_at', [userId])).rows;
    const u = (await this.db.query<{ boost_until: Date | null; theme: string; coins: number }>('SELECT boost_until, theme, coins FROM users WHERE id = $1', [userId])).rows[0]!;
    return {
      coins: u.coins,
      items: items.map((i) => ({ id: i.item_id, qty: i.qty, emoji: ITEMS[i.item_id]?.emoji })),
      chests: chests.map((c) => ({ id: c.id, kind: c.kind, source: c.source })),
      boostUntil: u.boost_until && u.boost_until.getTime() > Date.now() ? u.boost_until.toISOString() : null,
      theme: u.theme,
    };
  }

  async buy(userId: string, itemId: ItemId) {
    const def = ITEMS[itemId];
    if (!def || def.price === null) throw new QuizError(404, 'not_for_sale');
    return this.tx(async (c) => {
      if (def.kind === 'cosmetic') {
        const owned = (await c.query('SELECT 1 FROM inventory WHERE user_id = $1 AND item_id = $2 AND qty > 0', [userId, itemId])).rowCount;
        if (owned) throw new QuizError(409, 'already_owned');
      }
      const paid = await c.query('UPDATE users SET coins = coins - $2 WHERE id = $1 AND coins >= $2 RETURNING coins', [userId, def.price]);
      if (!paid.rowCount) throw new QuizError(402, 'not_enough_coins');
      if (def.kind === 'chest') await this.giveChest(c, userId, 'common', 'shop');
      else await this.addItem(c, userId, itemId, 1);
      return { coins: (paid.rows[0] as { coins: number }).coins };
    });
  }

  async openChest(userId: string, chestId: string) {
    return this.tx(async (c) => {
      const chest = (await c.query<{ kind: ChestKind; opened_at: Date | null }>('SELECT kind, opened_at FROM chests WHERE id = $1 AND user_id = $2 FOR UPDATE', [chestId, userId])).rows[0];
      if (!chest) throw new QuizError(404, 'chest_not_found');
      if (chest.opened_at) throw new QuizError(409, 'already_opened');
      const loot = rollChest(chest.kind, lootRng());
      await c.query('UPDATE chests SET opened_at = now(), contents = $2 WHERE id = $1', [chestId, JSON.stringify(loot)]);
      await c.query('UPDATE users SET coins = coins + $2 WHERE id = $1', [userId, loot.coins]);
      for (const i of loot.items) await this.addItem(c, userId, i.id, i.qty);
      const rewards = await this.award(c, userId, { events: [{ type: 'chest_opened' }] });
      return { kind: chest.kind, loot, badges: rewards.badges };
    });
  }

  /** Use a consumable. Pet food needs a pet; eggs hatch a new pet. */
  async use(userId: string, itemId: ItemId, petId?: string) {
    return this.tx(async (c) => {
      const now = Date.now();
      const def = ITEMS[itemId];
      if (!def) throw new QuizError(404, 'unknown_item');
      if (def.kind === 'cosmetic') {
        const owned = (await c.query('SELECT 1 FROM inventory WHERE user_id = $1 AND item_id = $2 AND qty > 0', [userId, itemId])).rowCount;
        if (!owned) throw new QuizError(409, 'not_enough_items');
        await c.query('UPDATE users SET theme = $2 WHERE id = $1', [userId, itemId]);
        return { theme: itemId };
      }
      await this.takeItem(c, userId, itemId);
      switch (itemId) {
        case 'streak_freeze': {
          const u = (await c.query<{ streak: StreakState }>('SELECT streak FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]!;
          if (u.streak.freezes >= 3) throw new QuizError(409, 'max_freezes');
          await c.query('UPDATE users SET streak = $2 WHERE id = $1', [userId, JSON.stringify(addFreeze(u.streak))]);
          return { ok: true };
        }
        case 'heart_refill': {
          await c.query('UPDATE users SET hearts = $2, hearts_updated_at = now() WHERE id = $1', [userId, MAX_HEARTS]);
          return { ok: true };
        }
        case 'xp_boost': {
          const r = await c.query<{ boost_until: Date }>(
            "UPDATE users SET boost_until = greatest(coalesce(boost_until, now()), now()) + ($2 || ' milliseconds')::interval WHERE id = $1 RETURNING boost_until",
            [userId, String(XP_BOOST_MS)],
          );
          return { boostUntil: r.rows[0]!.boost_until.toISOString() };
        }
        case 'pet_food': {
          const pet = (await c.query<PetRow>('SELECT * FROM pets WHERE id = $1 AND user_id = $2 FOR UPDATE', [petId ?? '', userId])).rows[0];
          if (!pet) throw new QuizError(404, 'pet_not_found');
          const fed = feedPet(petState(pet), now);
          await c.query('UPDATE pets SET fullness = $2, fed_at = $3, level = $4, xp = $5 WHERE id = $1', [pet.id, fed.fullness, new Date(fed.fedAt), fed.level, fed.xp]);
          await this.award(c, userId, { events: [{ type: 'pet_fed' }] });
          return { pet: await this.petView(c, pet.id, userId) };
        }
        case 'egg_common':
        case 'egg_rare': {
          const species = hatch(itemId, lootRng());
          const pet = await this.createPet(c, userId, species);
          return { pet: await this.petView(c, pet, userId) };
        }
        default:
          throw new QuizError(400, 'cannot_use');
      }
    });
  }

  async repairStreak(userId: string) {
    const PRICE = 150;
    return this.tx(async (c) => {
      const u = (await c.query<{ streak: StreakState; timezone: string; coins: number }>('SELECT streak, timezone, coins FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]!;
      const today = dayKey(Date.now(), u.timezone);
      if (!canRepair(u.streak, today)) throw new QuizError(409, 'cannot_repair');
      if (u.coins < PRICE) throw new QuizError(402, 'not_enough_coins');
      const streak = repairStreak(u.streak, today);
      await c.query('UPDATE users SET streak = $2, coins = coins - $3 WHERE id = $1', [userId, JSON.stringify(streak), PRICE]);
      await this.award(c, userId, { events: [{ type: 'streak', days: streak.days }] });
      return { days: streak.days };
    });
  }

  // ------------------------------------------------------------------ pets

  private async createPet(c: Q, userId: string, species: PetSpeciesId): Promise<string> {
    const hasEquipped = (await c.query('SELECT 1 FROM pets WHERE user_id = $1 AND equipped', [userId])).rowCount;
    const { rows } = await c.query<{ id: string }>('INSERT INTO pets (user_id, species, name, equipped) VALUES ($1, $2, $3, $4) RETURNING id', [userId, species, '', !hasEquipped]);
    return rows[0]!.id;
  }

  private async petView(c: Q, petId: string, userId: string) {
    const p = (await c.query<PetRow>('SELECT * FROM pets WHERE id = $1 AND user_id = $2', [petId, userId])).rows[0]!;
    const u = (await c.query<{ streak: StreakState; timezone: string }>('SELECT streak, timezone FROM users WHERE id = $1', [userId])).rows[0]!;
    const now = Date.now();
    const st = petState(p);
    const mood = petMood(st, now, streakStatus(u.streak, dayKey(now, u.timezone)));
    const s = speciesOf(p.species)!;
    return { id: p.id, species: p.species, emoji: s.emoji, rarity: s.rarity, color: s.color, name: p.name, level: p.level, xp: p.xp, fullness: currentFullness(st, now), mood, perk: petXpPerk(st, mood), equipped: p.equipped };
  }

  async pets(userId: string) {
    const ids = (await this.db.query<{ id: string }>('SELECT id FROM pets WHERE user_id = $1 ORDER BY equipped DESC, created_at', [userId])).rows;
    return Promise.all(ids.map((r) => this.petView(this.db, r.id, userId)));
  }

  async adoptStarter(userId: string, species: PetSpeciesId, name: string) {
    if (!STARTER_PETS.includes(species)) throw new QuizError(400, 'not_a_starter');
    const clean = checkPetName(name);
    return this.tx(async (c) => {
      const has = (await c.query('SELECT 1 FROM pets WHERE user_id = $1', [userId])).rowCount;
      if (has) throw new QuizError(409, 'already_has_pet');
      const id = await this.createPet(c, userId, species);
      await c.query('UPDATE pets SET name = $2 WHERE id = $1', [id, clean]);
      return this.petView(c, id, userId);
    });
  }

  async updatePet(userId: string, petId: string, patch: { name?: string; equipped?: boolean }) {
    return this.tx(async (c) => {
      const p = (await c.query('SELECT 1 FROM pets WHERE id = $1 AND user_id = $2 FOR UPDATE', [petId, userId])).rowCount;
      if (!p) throw new QuizError(404, 'pet_not_found');
      if (patch.name !== undefined) await c.query('UPDATE pets SET name = $2 WHERE id = $1', [petId, checkPetName(patch.name)]);
      if (patch.equipped) {
        await c.query('UPDATE pets SET equipped = false WHERE user_id = $1', [userId]);
        await c.query('UPDATE pets SET equipped = true WHERE id = $1', [petId]);
      }
      return this.petView(c, petId, userId);
    });
  }

  // ------------------------------------------------------------------ leagues

  /** Put the learner in this week's group for their tier (groups fill up to 30). */
  async joinLeague(c: Q, userId: string, tier: LeagueTier, week: string): Promise<string> {
    const existing = (await c.query<{ group_id: string }>('SELECT group_id FROM league_members WHERE user_id = $1 AND week_id = $2', [userId, week])).rows[0];
    if (existing) return existing.group_id;
    // Serialize group assignment per (week, tier) so groups never overfill.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`league:${week}:${tier}`]);
    const open = (
      await c.query<{ id: string }>(
        `SELECT g.id FROM league_groups g LEFT JOIN league_members m ON m.group_id = g.id
         WHERE g.week_id = $1 AND g.tier = $2 AND NOT g.settled GROUP BY g.id HAVING count(m.user_id) < $3 ORDER BY g.created_at LIMIT 1`,
        [week, tier, GROUP_SIZE],
      )
    ).rows[0];
    const groupId = open?.id ?? (await c.query<{ id: string }>('INSERT INTO league_groups (week_id, tier) VALUES ($1, $2) RETURNING id', [week, tier])).rows[0]!.id;
    await c.query('INSERT INTO league_members (group_id, user_id, week_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [groupId, userId, week]);
    return groupId;
  }

  /** End-of-week: rank every finished group, move learners up/down, hand out rewards. Idempotent. */
  async settleLeagues(now = Date.now()): Promise<number> {
    const current = weekId(now);
    const groups = (await this.db.query<{ id: string; tier: LeagueTier }>('SELECT id, tier FROM league_groups WHERE NOT settled AND week_id < $1', [current])).rows;
    for (const g of groups) {
      await this.tx(async (c) => {
        const locked = (await c.query<{ settled: boolean }>('SELECT settled FROM league_groups WHERE id = $1 FOR UPDATE', [g.id])).rows[0];
        if (!locked || locked.settled) return;
        const members = (await c.query<{ user_id: string; weekly_xp: number; last_xp_at: Date }>('SELECT user_id, weekly_xp, last_xp_at FROM league_members WHERE group_id = $1', [g.id])).rows;
        const ranked = rankGroup(
          members.map((m) => ({ userId: m.user_id, weeklyXp: m.weekly_xp, lastXpAt: m.last_xp_at.getTime() })),
          g.tier,
        );
        for (const r of ranked) {
          const tier = nextTier(g.tier, r.zone);
          await c.query('UPDATE league_members SET final_rank = $3, outcome = $4 WHERE group_id = $1 AND user_id = $2', [g.id, r.userId, r.rank, r.zone]);
          await c.query('UPDATE users SET league_tier = $2 WHERE id = $1 AND league_tier = $3', [r.userId, tier, g.tier]);
          if (r.weeklyXp > 0) {
            const reward = leagueReward(r.rank);
            await c.query('UPDATE users SET coins = coins + $2 WHERE id = $1', [r.userId, reward.coins]);
            if (reward.chest) await this.giveChest(c, r.userId, reward.chest, 'league');
          }
          await this.award(c, r.userId, { events: [{ type: 'league', tier }] });
        }
        await c.query('UPDATE league_groups SET settled = true WHERE id = $1', [g.id]);
      });
    }
    return groups.length;
  }

  async league(userId: string, now = Date.now()) {
    const u = (await this.db.query<{ league_tier: LeagueTier }>('SELECT league_tier FROM users WHERE id = $1', [userId])).rows[0]!;
    const week = weekId(now);
    const mine = (await this.db.query<{ group_id: string }>('SELECT group_id FROM league_members WHERE user_id = $1 AND week_id = $2', [userId, week])).rows[0];
    let members: { userId: string; username: string; avatar: string; weeklyXp: number; rank: number; zone: string; me: boolean }[] = [];
    let zones = zoneSizes(1, u.league_tier);
    if (mine) {
      const rows = (
        await this.db.query<{ user_id: string; username: string; avatar: string; weekly_xp: number; last_xp_at: Date }>(
          'SELECT m.user_id, u.username, u.avatar, m.weekly_xp, m.last_xp_at FROM league_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = $1',
          [mine.group_id],
        )
      ).rows;
      const ranked = rankGroup(
        rows.map((r) => ({ userId: r.user_id, weeklyXp: r.weekly_xp, lastXpAt: r.last_xp_at.getTime() })),
        u.league_tier,
      );
      const byId = new Map(rows.map((r) => [r.user_id, r]));
      members = ranked.map((r) => ({ userId: r.userId, username: byId.get(r.userId)!.username, avatar: byId.get(r.userId)!.avatar, weeklyXp: r.weeklyXp, rank: r.rank, zone: r.zone, me: r.userId === userId }));
      zones = zoneSizes(ranked.length, u.league_tier);
    }
    // Last week's result, shown once.
    const last = (
      await this.db.query<{ group_id: string; final_rank: number; outcome: string; tier: LeagueTier; week_id: string }>(
        `SELECT m.group_id, m.final_rank, m.outcome, g.tier, m.week_id FROM league_members m JOIN league_groups g ON g.id = m.group_id
         WHERE m.user_id = $1 AND g.settled AND NOT m.seen ORDER BY m.week_id DESC LIMIT 1`,
        [userId],
      )
    ).rows[0];
    if (last) await this.db.query('UPDATE league_members SET seen = true WHERE group_id = $1 AND user_id = $2', [last.group_id, userId]);
    return {
      tier: u.league_tier,
      week,
      endsAt: new Date(weekEndsAt(now)).toISOString(),
      zones,
      members: members.map(({ userId: _u, ...m }) => m),
      lastResult: last ? { rank: last.final_rank, outcome: last.outcome, fromTier: last.tier, toTier: nextTier(last.tier, last.outcome as 'promoted' | 'stayed' | 'demoted') } : null,
    };
  }

  /** Weekly global top 50 (usernames only, never emails or real names). */
  async globalBoard(userId: string, now = Date.now()) {
    const week = weekId(now);
    const rows = (
      await this.db.query<{ username: string; avatar: string; xp: number; league_tier: string; me: boolean }>(
        `SELECT u.username, u.avatar, u.league_tier, sum(e.amount)::int AS xp, (u.id = $2) AS me
         FROM xp_events e JOIN users u ON u.id = e.user_id WHERE e.week_id = $1
         GROUP BY u.id ORDER BY xp DESC, u.username LIMIT 50`,
        [week, userId],
      )
    ).rows;
    return rows.map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar, tier: r.league_tier, weeklyXp: r.xp, me: r.me }));
  }

  /** Everything the home screen needs in one call. */
  async overview(userId: string) {
    const [quests, inv, pets] = await Promise.all([this.quests(userId), this.inventory(userId), this.pets(userId)]);
    return { quests, chests: inv.chests.length, boostUntil: inv.boostUntil, pet: pets.find((p) => p.equipped) ?? null, hasPets: pets.length > 0 };
  }
}

function checkPetName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 1 || n.length > 16 || !/^[\p{L}\p{N} '-]+$/u.test(n)) throw new QuizError(400, 'bad_pet_name');
  const problem = validateUsername(n.replace(/[^A-Za-z0-9]/g, '') || 'pet');
  if (problem === 'blocked') throw new QuizError(400, 'bad_pet_name');
  return n;
}
