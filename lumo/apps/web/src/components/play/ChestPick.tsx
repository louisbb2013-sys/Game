import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { api } from '../../lib/api';
import { burst, haptic } from '../../lib/fx';
import { play } from '../../lib/sound';
import type { Rewards } from '../../lib/rewards';

type Loot = { kind: 'coins' | 'xp' | 'egg'; amount: number } | { kind: 'item'; item: string; amount: number };
interface Picked {
  options: Loot[];
  chosen: number;
  got: Loot;
  rewards: Rewards;
  chests: number;
}

const CHESTS = ['🎁', '🧰', '💼'];

const ITEM_EMOJI: Record<string, string> = { streak_freeze: '🧊', xp_boost: '🚀', pet_food: '🍎', heart_refill: '💗' };

function lootLabel(l: Loot, t: TFunction) {
  if (l.kind === 'item') return { emoji: ITEM_EMOJI[l.item] ?? '🎉', text: t(`items.${l.item}.name`) };
  if (l.kind === 'coins') return { emoji: '🪙', text: `+${l.amount}` };
  if (l.kind === 'xp') return { emoji: '⚡', text: `+${l.amount} XP` };
  return { emoji: '🥚', text: t('play.loot.egg', { count: l.amount }) };
}

/** Blooket-style: three chests, pick one. It always holds something good, and you see what the others had. */
export function ChestPick({ sessionId, onDone, onRewards }: { sessionId: string; onDone: (left: number) => void; onRewards: (r: Rewards) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<number | null>(null);
  const [res, setRes] = useState<Picked | null>(null);
  const [failed, setFailed] = useState(false);

  const open = async (i: number, el: HTMLElement) => {
    if (busy !== null || res) return;
    setBusy(i);
    play('tap');
    haptic(20);
    try {
      const r = await api<Picked>(`/api/sessions/${sessionId}/pick`, { method: 'POST', body: { choice: i } });
      setTimeout(() => {
        setRes(r);
        play('chest');
        haptic([15, 40, 15]);
        burst(el, { count: 26, colors: ['#facc15', '#fde68a', '#f472b6', '#38bdf8'] });
      }, 450);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-night/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('play.chestTitle')}>
      <div className="pop-in lacquer lux-frame w-full max-w-sm rounded-3xl p-5 text-center shadow-2xl">
        <p className="text-sm font-black tracking-widest text-amber-200 uppercase">{t('play.chestEarned')}</p>
        <h2 className="text-2xl font-black">{res ? t('play.chestYouGot') : t('play.chestTitle')}</h2>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => {
            const mine = res?.chosen === i;
            const loot = res ? lootLabel(res.options[i]!, t) : null;
            return (
              <button
                key={i}
                type="button"
                disabled={busy !== null || !!res}
                onClick={(e) => void open(i, e.currentTarget)}
                aria-label={t('play.chestN', { n: i + 1 })}
                className={`flex aspect-[3/4] flex-col items-center justify-center rounded-2xl p-2 transition ${res ? (mine ? 'btn-gold ring-2 ring-white' : 'bg-white/10 opacity-60') : 'bg-white/10 ring-1 ring-[#e8c468]/40 hover:bg-white/20'}`}
              >
                {loot ? (
                  <span className={mine ? 'chest-open' : ''}>
                    <span className="block text-4xl">{loot.emoji}</span>
                    <span className="mt-1 block text-sm leading-tight font-black">{loot.text}</span>
                  </span>
                ) : (
                  <span className={`text-5xl ${busy === i ? 'shake' : 'chest-bob'}`} style={{ ['--d' as string]: `${i * 0.25}s` }}>
                    {CHESTS[i]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {failed && <p className="mt-3 text-sm font-bold text-rose-200">{t('signin.errors.network')}</p>}
        {(res || failed) && (
          <button
            type="button"
            autoFocus
            onClick={() => {
              // What the chest gave (a hatching egg, a level-up) celebrates once the chest is closed, not on top of it.
              if (res) onRewards(res.rewards);
              onDone(res?.chests ?? 0);
            }}
            className="btn-gold mt-5 w-full rounded-2xl py-3.5 text-lg font-black"
          >
            {res && res.chests > 0 ? t('play.chestNext', { count: res.chests }) : t('quiz.continue')}
          </button>
        )}
      </div>
    </div>
  );
}
