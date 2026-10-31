import { useTranslation } from 'react-i18next';
import { CoinIcon } from '../icons';

/**
 * Think first: the choices stay hidden while you work out the answer in your head. Then bet coins on
 * it (right doubles the bet, wrong loses it) or just show the choices.
 */

export const BETS = [10, 20, 30];
export const BET_FORMATS = new Set(['multiple_choice', 'true_false', 'cause_effect']);
const KEY = 'lumo.thinkFirst';

export function thinkFirstOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}
export function setThinkFirst(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* no storage: it stays on for this visit */
  }
}

export function ThinkFirst({ coins, onReveal, onOff }: { coins: number; onReveal: (bet: number) => void; onOff: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="pop-in rounded-3xl bg-black/25 p-4 text-center ring-1 ring-white/10" data-testid="think-first">
      <p className="text-lg font-black">🤔 {t('bet.think')}</p>
      <p className="mt-0.5 text-sm font-bold text-white/75">{t('bet.body')}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {BETS.map((n) => (
          <button key={n} type="button" disabled={coins < n} onClick={() => onReveal(n)} className="btn-gold flex items-center justify-center gap-1 rounded-2xl py-3 font-black disabled:opacity-40" aria-label={t('bet.betLabel', { n })}>
            🎲 {n} <CoinIcon size={16} />
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onReveal(0)} className="mt-2 w-full rounded-2xl bg-white/15 py-3 font-black ring-1 ring-white/25" data-testid="show-choices">
        👀 {t('bet.show')}
      </button>
      <button type="button" onClick={onOff} className="mt-2 text-xs font-bold text-white/60 underline">
        {t('bet.off')}
      </button>
    </div>
  );
}
