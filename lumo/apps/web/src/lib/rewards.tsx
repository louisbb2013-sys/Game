import { BADGES } from '@lumo/core';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { play } from './sound';

export interface Rewards {
  xp: number;
  levelUp: { level: number; coins: number; chest?: string } | null;
  badges: string[];
  questsCompleted: string[];
}

interface Toast {
  id: number;
  emoji: string;
  title: string;
  body?: string;
  link?: string;
}

const Ctx = createContext<(r: Rewards | null | undefined) => void>(() => {});

/** Celebration pop-ups for level-ups, badges and finished quests. */
export function RewardsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback(
    (r: Rewards | null | undefined) => {
      if (!r) return;
      const next: Toast[] = [];
      if (r.levelUp) {
        next.push({
          id: Math.random(),
          emoji: '🚀',
          title: t('rewards.levelUp', { level: r.levelUp.level }),
          body: t(r.levelUp.chest ? 'rewards.levelUpChest' : 'rewards.levelUpCoins', { coins: r.levelUp.coins, chest: t(`chests.${r.levelUp.chest}`) }),
          link: r.levelUp.chest ? '/shop?tab=mine' : undefined,
        });
      }
      for (const b of r.badges) {
        next.push({ id: Math.random(), emoji: BADGES.find((x) => x.id === b)?.emoji ?? '🏅', title: t('rewards.badge'), body: t(`badges.${b}.name`), link: '/me' });
      }
      if (r.questsCompleted.length) {
        next.push({ id: Math.random(), emoji: '📜', title: t('rewards.quest', { count: r.questsCompleted.length }), body: t('rewards.questClaim'), link: '/' });
      }
      if (!next.length) return;
      play('combo');
      setToasts((x) => [...x, ...next]);
      for (const n of next) setTimeout(() => setToasts((x) => x.filter((y) => y.id !== n.id)), 5000);
    },
    [t],
  );

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] mx-auto flex max-w-md flex-col gap-2 px-3" aria-live="polite">
        {toasts.map((x) => {
          const inner = (
            <>
              <span className="text-3xl">{x.emoji}</span>
              <span className="min-w-0">
                <span className="block font-black">{x.title}</span>
                {x.body && <span className="block text-sm text-indigo-100">{x.body}</span>}
              </span>
            </>
          );
          const cls = 'pointer-events-auto combo-pop flex items-center gap-3 rounded-2xl bg-night p-3 text-white shadow-2xl ring-2 ring-amber-glow';
          return x.link ? (
            <Link key={x.id} to={x.link} className={cls} onClick={() => setToasts((y) => y.filter((z) => z.id !== x.id))}>
              {inner}
            </Link>
          ) : (
            <div key={x.id} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useRewards = () => useContext(Ctx);

export const TIER_STYLE: Record<string, { emoji: string; color: string }> = {
  bronze: { emoji: '🥉', color: '#B45309' },
  silver: { emoji: '🥈', color: '#64748B' },
  gold: { emoji: '🥇', color: '#CA8A04' },
  sapphire: { emoji: '🔷', color: '#2563EB' },
  ruby: { emoji: '♦️', color: '#DC2626' },
  emerald: { emoji: '💚', color: '#059669' },
  amethyst: { emoji: '💜', color: '#7C3AED' },
  diamond: { emoji: '💎', color: '#0EA5E9' },
};
