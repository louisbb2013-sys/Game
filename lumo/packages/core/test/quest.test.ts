import { describe, expect, it } from 'vitest';
import { newQuest, QUEST_MONSTERS, questTurn } from '../src/game/quest';

describe('Monster Quest', () => {
  it('a right answer casts the spell; a resting spell becomes a strike', () => {
    const a = questTurn(newQuest(), 'fireball', true);
    expect(a.ability).toBe('fireball');
    expect(a.dealt).toBe(50);
    expect(a.state.monsterHp).toBe(QUEST_MONSTERS[0].hp - 50);
    expect(a.state.cooldowns.fireball).toBe(2);
    const b = questTurn(a.state, 'fireball', true);
    expect(b.ability).toBe('strike');
    expect(b.defeated?.coins).toBe(QUEST_MONSTERS[0].coins);
    expect(b.state.monster).toBe(1);
  });

  it('a miss lets the monster hit, unless a shield blocks it', () => {
    const hit = questTurn(newQuest(), 'strike', false);
    expect(hit.taken).toBe(QUEST_MONSTERS[0].attack);
    const shielded = questTurn(newQuest(), 'shield', true).state;
    const blocked = questTurn(shielded, 'strike', false);
    expect(blocked.blocked).toBe(true);
    expect(blocked.state.hp).toBe(100);
  });

  it('ends won after the last monster, lost at 0 health', () => {
    let q = newQuest();
    let end: string | null = null;
    for (let i = 0; i < 200 && !end; i++) end = questTurn(q, 'strike', true, 5).finished ?? ((q = questTurn(q, 'strike', true, 5).state), null);
    expect(end).toBe('won');
    q = newQuest();
    let lost: string | null = null;
    for (let i = 0; i < 20 && !lost; i++) {
      const r = questTurn(q, 'strike', false);
      q = r.state;
      lost = r.finished;
    }
    expect(lost).toBe('lost');
  });
});
