import { ASCENDED_BOOST, BOOST_LEVELS, CUSTOM_MAX_KINDS, CUSTOM_POINT_COST, customPoints, PET_SPECIES, RARITIES, type PetBuffKind, type Rarity } from '@lumo/core';
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { play } from '../lib/sound';
import { PetPortrait, RARITY_TONE } from './Art';
import { CoinIcon } from './icons';

/**
 * The bigger pet features: the boost a pet picks at level 50 (full power at 100), and designing a pet of
 * your own within Lumo's rules (its rarity sets the price and how many points its bonuses can use).
 */

const KINDS: PetBuffKind[] = ['xp', 'coins', 'egg', 'heart'];
const ICON: Record<PetBuffKind, string> = { xp: '⚡', coins: '🪙', egg: '🥚', heart: '💖' };

/** "+1000 % XP", "+100 coins an answer"… */
export function boostText(t: TFunction, kind: PetBuffKind, value: number) {
  return t(`petx.boostLine.${kind}`, { pct: Math.round(value * 100), n: value });
}

/** Level 50: pick the boost (half power); level 100: full power. Below 50, what's waiting. */
export function BoostPicker({ pet, onPick }: { pet: { level: number; boost?: PetBuffKind | null; canBoost?: boolean }; onPick: (k: PetBuffKind) => void }) {
  const { t } = useTranslation();
  const full = pet.level >= BOOST_LEVELS.full;
  if (!pet.canBoost) {
    return (
      <div className="rounded-2xl bg-surface-2 p-3 text-left" data-testid="boost-locked">
        <p className="font-black">🔒 {t('petx.boostLockedTitle')}</p>
        <p className="text-sm text-muted">{t('petx.boostLocked', { level: BOOST_LEVELS.half, now: pet.level })}</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl p-[2px] rarity-divine" data-testid="boost-picker">
      <div className="rounded-[14px] bg-surface p-3 text-left">
        <p className="font-black">🌟 {full ? t('petx.boostFull') : t('petx.boostHalf')}</p>
        <p className="text-xs text-muted">{full ? t('petx.boostFullBody') : t('petx.boostHalfBody', { level: BOOST_LEVELS.full })}</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('petx.boostPick')}>
          {KINDS.map((k) => {
            const on = pet.boost === k;
            const v = ASCENDED_BOOST[k] * (full ? 1 : 0.5);
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => onPick(k)} className={`rounded-xl px-2 py-2 text-sm font-black ring-2 ${on ? 'bg-brand/15 ring-brand' : 'ring-line'}`}>
                {ICON[k]} {boostText(t, k, v)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface Rules {
  prices: Partial<Record<Rarity, number>>;
  points: Partial<Record<Rarity, number>>;
  coins: number;
}

/** Design a pet: its look, name, rarity and up to two bonuses; Lumo checks the rules as you go. */
export function CustomPetMaker({ onClose, onMade }: { onClose: () => void; onMade: (pet: { species: string; emoji: string; rarity: Rarity }) => void }) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<Rules | null>(null);
  const [body, setBody] = useState('comet_fox');
  const [name, setName] = useState('');
  const [rarity, setRarity] = useState<Rarity>('rare');
  const [buffs, setBuffs] = useState<Partial<Record<PetBuffKind, number>>>({ xp: 0.05 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<Rules>('/api/game/pets/custom').then(setRules, () => setError('network'));
  }, []);
  if (!rules) return null;
  const budget = rules.points[rarity] ?? 0;
  const used = customPoints(buffs);
  const chosen = KINDS.filter((k) => (buffs[k] ?? 0) > 0);
  const price = rules.prices[rarity] ?? 0;
  // A step of each bonus: 1 % (2 % for eggs), or one coin.
  const step = (k: PetBuffKind) => (k === 'coins' ? 1 : k === 'egg' ? 0.02 : 0.01);
  const change = (k: PetBuffKind, dir: 1 | -1) => {
    const next = Math.max(0, Math.round(((buffs[k] ?? 0) + dir * step(k)) * 100) / 100);
    const b = { ...buffs, [k]: next };
    if (!next) delete b[k];
    setBuffs(b);
  };
  const canAdd = (k: PetBuffKind) => (chosen.includes(k) || chosen.length < CUSTOM_MAX_KINDS) && used + step(k) * CUSTOM_POINT_COST[k] <= budget + 1e-9;
  const problem = chosen.length === 0 ? 'no_bonus' : used > budget + 1e-9 ? 'too_many_points' : !name.trim() ? 'name' : rules.coins < price ? 'not_enough_coins' : null;
  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ pet: { species: string; emoji: string; rarity: Rarity } }>('/api/game/pets/custom', { method: 'POST', body: { body, name, rarity, buffs } });
      play('finish');
      onMade(r.pet);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
    }
    setBusy(false);
  };
  const species = PET_SPECIES.filter((s) => s.rarity !== 'lumo');
  const sp = species.find((s) => s.id === body)!;
  return (
    <div role="dialog" aria-modal="true" aria-label={t('petx.makerTitle')} className="fixed inset-0 z-[70] overflow-y-auto bg-bg" data-testid="pet-maker">
      <div className="mx-auto max-w-lg space-y-4 p-4 pb-10">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="grid size-11 place-items-center rounded-full bg-surface-2 text-xl font-black ring-1 ring-line">
            ←
          </button>
          <h2 className="text-2xl font-black">🧪 {t('petx.makerTitle')}</h2>
        </div>
        <p className="text-sm text-muted">{t('petx.makerBody')}</p>
        <div className="flex items-center gap-3 rounded-3xl bg-surface p-3 ring-1 ring-line">
          <PetPortrait species={sp.id} rarity={rarity} emoji={sp.emoji} size={88} />
          <div className="min-w-0 flex-1 space-y-1">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder={t('petx.name')} aria-label={t('petx.name')} className="w-full rounded-xl border-2 border-line bg-bg px-3 py-2 font-black" />
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-black ${RARITY_TONE[rarity]}`}>{t(`pets.rarity.${rarity}`)}</span>
          </div>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-bold">{t('petx.look')}</legend>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {species.map((s) => (
              <button key={s.id} type="button" aria-pressed={body === s.id} aria-label={t(`pets.species.${s.id}`)} onClick={() => setBody(s.id)} className={`shrink-0 rounded-2xl p-1 ring-2 ${body === s.id ? 'ring-brand' : 'ring-transparent'}`}>
                <PetPortrait species={s.id} rarity={rarity} emoji={s.emoji} size={48} still />
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-bold">{t('petx.rarity')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {RARITIES.filter((r) => rules.prices[r]).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rarity === r}
                onClick={() => {
                  setRarity(r);
                  // Keep the bonuses within the new budget.
                  if (customPoints(buffs) > (rules.points[r] ?? 0)) setBuffs({});
                }}
                className={`rounded-full px-3 py-1 text-xs font-black ring-2 ${rarity === r ? `${RARITY_TONE[r]} ring-brand` : 'ring-line'}`}
              >
                {t(`pets.rarity.${r}`)} · {rules.prices[r]}🪙
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">{t('petx.bonuses', { max: CUSTOM_MAX_KINDS })}</legend>
          <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={used} aria-valuemax={budget} aria-label={t('petx.points')}>
            <div className={`h-full rounded-full ${used > budget ? 'bg-bad' : 'bg-brand'}`} style={{ width: `${Math.min(100, (used / Math.max(1, budget)) * 100)}%` }} />
          </div>
          <p className="text-xs font-bold text-muted" data-testid="pet-points">
            {t('petx.pointsUsed', { used, budget })}
          </p>
          {KINDS.map((k) => (
            <div key={k} className="flex items-center gap-2 rounded-2xl bg-surface p-2 ring-1 ring-line">
              <span className="text-xl">{ICON[k]}</span>
              <span className="min-w-0 flex-1 text-sm font-black">{buffs[k] ? boostText(t, k, buffs[k]!) : t(`petx.kind.${k}`)}</span>
              <button type="button" onClick={() => change(k, -1)} disabled={!buffs[k]} aria-label={t('petx.less', { kind: t(`petx.kind.${k}`) })} className="grid size-9 place-items-center rounded-xl bg-surface-2 font-black disabled:opacity-30">
                −
              </button>
              <button type="button" onClick={() => change(k, 1)} disabled={!canAdd(k)} aria-label={t('petx.more', { kind: t(`petx.kind.${k}`) })} className="grid size-9 place-items-center rounded-xl bg-brand font-black text-brand-ink disabled:opacity-30">
                +
              </button>
            </div>
          ))}
          <p className="flex items-start gap-2 rounded-2xl bg-amber-glow/15 p-2.5 text-xs font-bold">
            <span aria-hidden>✨</span> {t('petx.rules', { max: CUSTOM_MAX_KINDS })}
          </p>
        </fieldset>
        {(error || problem) && (
          <p role="status" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
            {t(`petx.problems.${error ?? problem}`, { defaultValue: t('signin.errors.network') })}
          </p>
        )}
        <button type="button" disabled={!!problem || busy} onClick={() => void make()} className="btn-gold flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-lg font-black disabled:opacity-50" data-testid="pet-make">
          🧪 {t('petx.make')} · <CoinIcon size={18} /> {price}
        </button>
      </div>
    </div>
  );
}
