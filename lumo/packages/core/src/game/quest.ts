/**
 * Monster Quest (like Prodigy): before each question the learner picks a spell; a right answer casts
 * it, a wrong one lets the monster strike. Five monsters a run, each tougher; spells have cooldowns.
 */

export const QUEST_MONSTERS = [
  { id: 'slime', emoji: '🟢', hp: 60, attack: 10, coins: 10 },
  { id: 'goblin', emoji: '👺', hp: 90, attack: 12, coins: 15 },
  { id: 'golem', emoji: '🗿', hp: 130, attack: 15, coins: 25 },
  { id: 'wyvern', emoji: '🐲', hp: 180, attack: 18, coins: 35 },
  { id: 'shadow_king', emoji: '👹', hp: 260, attack: 24, coins: 60 },
] as const;

export type QuestAbility = 'strike' | 'fireball' | 'heal' | 'shield';
/** What each spell does when the answer is right, and how many turns it then rests. */
export const QUEST_ABILITIES: Record<QuestAbility, { damage: number; heal: number; cooldown: number; emoji: string }> = {
  strike: { damage: 25, heal: 0, cooldown: 0, emoji: '⚔️' },
  fireball: { damage: 50, heal: 0, cooldown: 2, emoji: '🔥' },
  heal: { damage: 0, heal: 35, cooldown: 3, emoji: '💚' },
  shield: { damage: 10, heal: 0, cooldown: 2, emoji: '🛡️' },
};
export const QUEST_HP = 100;

export interface QuestState {
  hp: number;
  maxHp: number;
  /** Which monster (index in QUEST_MONSTERS) and its health. */
  monster: number;
  monsterHp: number;
  /** Turns left before each spell can be cast again. */
  cooldowns: Record<QuestAbility, number>;
  /** The next monster hit is blocked. */
  shield: boolean;
  defeated: number;
}

export function newQuest(): QuestState {
  return { hp: QUEST_HP, maxHp: QUEST_HP, monster: 0, monsterHp: QUEST_MONSTERS[0].hp, cooldowns: { strike: 0, fireball: 0, heal: 0, shield: 0 }, shield: false, defeated: 0 };
}

export interface QuestTurn {
  state: QuestState;
  ability: QuestAbility;
  dealt: number;
  healed: number;
  taken: number;
  blocked: boolean;
  /** The monster beaten this turn (its index), with the coins it gave. */
  defeated: { monster: number; coins: number } | null;
  finished: 'won' | 'lost' | null;
}

/** One turn: the spell (a resting one becomes a strike), the answer, the monster's reply. */
export function questTurn(q: QuestState, wanted: QuestAbility, correct: boolean, combo = 0): QuestTurn {
  const ability: QuestAbility = q.cooldowns[wanted] > 0 || !QUEST_ABILITIES[wanted] ? 'strike' : wanted;
  const spell = QUEST_ABILITIES[ability];
  const cooldowns = Object.fromEntries((Object.keys(q.cooldowns) as QuestAbility[]).map((k) => [k, Math.max(0, q.cooldowns[k] - 1)])) as QuestState['cooldowns'];
  cooldowns[ability] = spell.cooldown;
  let { hp, monster, monsterHp, shield, defeated: count } = q;
  let dealt = 0;
  let healed = 0;
  let taken = 0;
  let blocked = false;
  let defeated: QuestTurn['defeated'] = null;
  if (correct) {
    // A streak makes spells hit harder (up to +50 %).
    dealt = Math.round(spell.damage * (1 + Math.min(5, combo) * 0.1));
    healed = Math.min(q.maxHp - hp, spell.heal);
    hp += healed;
    if (ability === 'shield') shield = true;
    monsterHp = Math.max(0, monsterHp - dealt);
    if (monsterHp === 0) {
      defeated = { monster, coins: QUEST_MONSTERS[monster]!.coins };
      count += 1;
      monster += 1;
      monsterHp = QUEST_MONSTERS[monster]?.hp ?? 0;
    }
  } else if (shield) {
    blocked = true;
    shield = false;
  } else {
    taken = QUEST_MONSTERS[monster]!.attack;
    hp = Math.max(0, hp - taken);
  }
  const finished = count >= QUEST_MONSTERS.length ? 'won' : hp === 0 ? 'lost' : null;
  return { state: { ...q, hp, monster, monsterHp, cooldowns, shield, defeated: count }, ability, dealt, healed, taken, blocked, defeated, finished };
}
