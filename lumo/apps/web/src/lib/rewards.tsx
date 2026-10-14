import { BADGES } from '@lumo/core';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useConfetti } from './confetti';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { play } from './sound';

export interface Rewards {
  xp: number;
  levelUp: { level: number; coins: number; chest?: string } | null;
  badges: string[];
  questsCompleted: string[];
  /** Website: a pet hatched from the study egg. */
  hatched?: { species: string; emoji: string; rarity: string; duplicate: boolean };
  /** Website: a chest earned for finishing a round. */
  chest?: string;
  /** Website: the study egg after this answer. */
  egg?: { rarity: 'common' | 'rare' | 'epic' | 'legendary'; progress: number; target: number };
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
  const [hatch, setHatch] = useState<NonNullable<Rewards['hatched']> | null>(null);

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
      if (r.hatched) setHatch(r.hatched);
      if (r.chest) next.push({ id: Math.random(), emoji: r.chest === 'rare' ? '💼' : '🎁', title: t('rewards.chest', { chest: t(`chests.${r.chest}`) }), body: t('rewards.chestOpen'), link: '/shop?tab=mine' });
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
      {hatch && <HatchCelebration pet={hatch} onClose={() => setHatch(null)} />}
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

/** Full-screen moment when the study egg hatches: the egg shakes, cracks, and a pet pops out. */
function HatchCelebration({ pet, onClose }: { pet: NonNullable<Rewards['hatched']>; onClose: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    play('tap');
    const a = setTimeout(() => {
      setOpen(true);
      play('finish');
    }, 1500);
    return () => clearTimeout(a);
  }, []);
  useConfetti(open);
  const name = t(`pets.species.${pet.species}`);
  return (
    <div role="dialog" aria-modal="true" aria-label={t('egg.hatched')} className="fixed inset-0 z-[80] grid place-items-center bg-night/80 p-6 backdrop-blur-sm" onClick={() => open && onClose()}>
      <div className="relative w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-2xl ring-2 ring-amber-glow">
        <div className="relative mx-auto grid size-44 place-items-center">
          {open && <span className="hatch-rays absolute inset-0" aria-hidden />}
          {open ? <span className="hatch-pop relative text-8xl">{pet.emoji}</span> : <span className="egg-shake text-8xl">🥚</span>}
        </div>
        {open ? (
          <>
            <p className="mt-2 text-sm font-black tracking-wide text-amber-glow uppercase">{t(`pets.rarity.${pet.rarity}`)}</p>
            <h2 className="text-2xl font-black">{pet.duplicate ? t('egg.duplicate', { name }) : t('egg.newPet', { name })}</h2>
            <p className="mt-1 text-sm text-muted">{pet.duplicate ? t('egg.duplicateBody') : t('egg.newPetBody')}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link to="/pets" onClick={onClose} className="rounded-2xl bg-surface-2 py-3 font-black">
                {t('egg.seePets')}
              </Link>
              <button autoFocus onClick={onClose} className="rounded-2xl bg-brand py-3 font-black text-brand-ink">
                {t('egg.keepGoing')}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-4 text-lg font-black">{t('egg.hatching')}</p>
        )}
      </div>
    </div>
  );
}
