import { DAILY_GIFTS, GRADES } from '@lumo/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { play } from '../lib/sound';
import { burst } from '../lib/fx';

/** The learner's grade (Grade 4 → Special Grade) and how far the next one is. */
export function GradeChip({ grade }: { grade: { id: string; emoji: string; index: number; next: { id: string; level: number } | null } }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start" data-testid="grade">
      <span className={`grade-chip grade-${grade.index} rounded-full px-3 py-1 text-sm font-black`}>
        {grade.emoji} {t(`grades.names.${grade.id}`)}
      </span>
      <span className="text-xs font-bold text-muted">{grade.next ? t('grades.next', { grade: t(`grades.names.${grade.next.id}`), level: grade.next.level }) : t('grades.top')}</span>
      {/* The ladder, so the goal is always visible. */}
      <span className="flex gap-0.5" aria-hidden>
        {GRADES.map((g, i) => (
          <span key={g.id} className={`size-2 rounded-full ${i <= grade.index ? 'bg-amber-glow' : 'bg-surface-2'}`} />
        ))}
      </span>
    </div>
  );
}

interface Daily {
  day: number;
  available: boolean;
  streak: number;
}

/** A gift a day, better each day in a row (a week round). */
export function DailyGift() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [d, setD] = useState<Daily | null>(null);
  const [got, setGot] = useState<string | null>(null);
  useEffect(() => {
    void api<Daily>('/api/game/daily').then(setD, () => {});
  }, []);
  if (!d) return null;
  const label = (i: number) => {
    const g = DAILY_GIFTS[i]! as { coins?: number; item?: string; qty?: number; chest?: string };
    return g.coins ? `🪙 ${g.coins}` : g.chest ? '🎁' : g.item === 'pet_food' ? `🍎 ×${g.qty}` : g.item === 'xp_boost' ? '⚡' : '🪺';
  };
  const claim = async (e: React.MouseEvent) => {
    const r = await api<Daily & { got: { coins?: number; item?: string; qty?: number; chest?: string } }>('/api/game/daily/claim', { method: 'POST' }).catch(() => null);
    if (!r) return;
    play('chest');
    burst(e.currentTarget as Element, { count: 24 });
    setD(r);
    const g = r.got;
    setGot(g.coins ? t('daily.gotCoins', { n: g.coins }) : g.chest ? t('daily.gotChest') : t(`daily.got.${g.item}`, { n: g.qty }));
    void refresh();
  };
  return (
    <section className="panel space-y-2 p-4" data-testid="daily-gift">
      <div className="flex items-center justify-between">
        <h2 className="font-black">🎁 {t('daily.title')}</h2>
        <span className="text-xs font-bold text-muted">{t('daily.streak', { count: d.streak })}</span>
      </div>
      <ol className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-black">
        {DAILY_GIFTS.map((_, i) => {
          const done = d.available ? i < d.day : i <= d.day;
          const today = d.available && i === d.day;
          return (
            <li key={i} className={`rounded-lg px-0.5 py-1.5 ${today ? 'bg-amber-glow text-night breathe' : done ? 'bg-good/20 text-good' : 'bg-surface-2 text-muted'}`}>
              <span className="block">{t('daily.day', { n: i + 1 })}</span>
              <span className="block text-xs">{done ? '✓' : label(i)}</span>
            </li>
          );
        })}
      </ol>
      {d.available ? (
        <button type="button" onClick={(e) => void claim(e)} className="btn-gold w-full rounded-2xl py-2.5 font-black" data-testid="daily-claim">
          {t('daily.claim')}
        </button>
      ) : (
        <p className="text-center text-xs font-bold text-muted" role="status">
          {got ?? t('daily.comeBack')}
        </p>
      )}
    </section>
  );
}
