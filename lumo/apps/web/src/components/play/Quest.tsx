import { QUEST_ABILITIES, QUEST_MONSTERS, type QuestAbility, type QuestState } from '@lumo/core';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Monster Quest (like Prodigy): pick a spell, answer to cast it. The monster, both health bars and the
 * four simple spells (strike, fireball, heal, shield) with the turns each one still rests.
 */

const SPELLS: QuestAbility[] = ['strike', 'fireball', 'heal', 'shield'];

export const QuestArena = forwardRef<HTMLDivElement, { quest: QuestState; spell: QuestAbility; onSpell: (a: QuestAbility) => void; locked: boolean; down: boolean; heroRef?: React.Ref<HTMLDivElement> }>(function QuestArena({ quest, spell, onSpell, locked, down, heroRef }, monsterRef) {
  const { t } = useTranslation();
  const m = QUEST_MONSTERS[Math.min(quest.monster, QUEST_MONSTERS.length - 1)]!;
  const monsterHp = quest.monster >= QUEST_MONSTERS.length ? 0 : quest.monsterHp;
  return (
    <div className="mt-3 space-y-2" data-testid="quest-arena">
      <div className="flex items-center gap-3 rounded-3xl bg-black/25 p-2 pr-4 ring-1 ring-white/10">
        <div ref={monsterRef} className={`grid size-20 shrink-0 place-items-center text-6xl ${down ? 'boss-dead' : 'boss-idle'}`} aria-hidden>
          {m.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black tracking-wide text-rose-200 uppercase">
            {t(`quest.monsters.${m.id}`)} <span className="text-white/60">· {t('quest.wave', { n: Math.min(quest.monster + 1, QUEST_MONSTERS.length), total: QUEST_MONSTERS.length })}</span>
          </p>
          <Bar now={monsterHp} max={m.hp} label={t('quest.monsterHp')} tone="from-rose-500 to-orange-400" />
        </div>
      </div>
      <div ref={heroRef} className="flex items-center gap-2 rounded-2xl bg-black/20 px-3 py-1.5 ring-1 ring-white/10">
        <span aria-hidden>🧙</span>
        <div className="min-w-0 flex-1">
          <Bar now={quest.hp} max={quest.maxHp} label={t('quest.yourHp')} tone="from-emerald-400 to-lime-300" />
        </div>
        {quest.shield && <span title={t('quest.shieldUp')} aria-label={t('quest.shieldUp')}>🛡️</span>}
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t('quest.pick')} data-testid="quest-spells">
        {SPELLS.map((a) => {
          const rest = quest.cooldowns[a] ?? 0;
          const on = spell === a;
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={locked || rest > 0}
              onClick={() => onSpell(a)}
              className={`relative rounded-2xl px-1 py-1.5 text-center text-xs font-black ring-2 transition disabled:opacity-40 ${on ? 'bg-amber-300 text-night ring-amber-200' : 'bg-white/10 text-white ring-white/15'}`}
            >
              <span className="block text-xl" aria-hidden>
                {QUEST_ABILITIES[a].emoji}
              </span>
              {t(`quest.spells.${a}`)}
              {rest > 0 && <span className="absolute -top-1.5 -right-1 rounded-full bg-night px-1.5 text-[10px] text-white ring-1 ring-white/30">{rest}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-center text-[11px] font-bold text-white/70">{t(`quest.spellHelp.${spell}`, { n: QUEST_ABILITIES[spell].damage || QUEST_ABILITIES[spell].heal })}</p>
    </div>
  );
});

function Bar({ now, max, label, tone }: { now: number; max: number; label: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/15" role="progressbar" aria-label={label} aria-valuenow={now} aria-valuemin={0} aria-valuemax={max}>
        <div className={`h-full rounded-full bg-gradient-to-r ${tone} transition-[width] duration-500`} style={{ width: `${Math.max(0, Math.min(100, (now / Math.max(1, max)) * 100))}%` }} />
      </div>
      <span className="w-16 text-right text-xs font-black text-white/75 tabular-nums">
        {now}/{max}
      </span>
    </div>
  );
}
