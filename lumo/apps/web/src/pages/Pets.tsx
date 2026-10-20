import { PET_SPECIES, petXpForLevel, RARITIES, STARTER_PETS, type Rarity } from '@lumo/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Creature3D } from '../components/Pet3D';
import { EggArt, PetPortrait, RARITY_TONE } from '../components/Art';
import { CoinIcon } from '../components/icons';
import { useConfetti } from '../lib/confetti';
import { api, ApiError } from '../lib/api';
import { play } from '../lib/sound';

export interface PetView {
  id: string;
  species: string;
  emoji: string;
  rarity: Rarity;
  /** Its species' rarity (before any upgrade). */
  baseRarity?: Rarity;
  color: string;
  name: string;
  level: number;
  xp: number;
  fullness: number;
  mood: 'happy' | 'content' | 'hungry' | 'sad';
  perk: number;
  equipped: boolean;
  /** The next tier and what it takes, or null at the top (mythical). */
  upgrade?: { to: Rarity; coins: number; level: number } | null;
}

const MOOD_FACE = { happy: '😄', content: '🙂', hungry: '😋', sad: '😢' };
export function PetAvatar({ pet, size = 'lg', three = false }: { pet: Pick<PetView, 'emoji' | 'color' | 'mood' | 'rarity'> & { species?: string }; size?: 'sm' | 'lg'; three?: boolean }) {
  const big = size === 'lg';
  const face = <span className={pet.mood === 'sad' ? '' : pet.mood === 'happy' ? 'lumo-bounce' : 'lumo-float'}>{pet.emoji}</span>;
  // Small pets in lists are pictures (cheap); the big one is live 3D.
  if (!big && pet.species && !three)
    return (
      <span className={`relative grid size-14 shrink-0 place-items-center rounded-full rarity-ring-${pet.rarity}`} style={{ background: `${pet.color}26` }}>
        <PetPortrait species={pet.species} rarity={pet.rarity} emoji={pet.emoji} size={56} />
        <span className="absolute -right-1 -bottom-1 z-[1] rounded-full bg-surface text-base" aria-hidden>
          {MOOD_FACE[pet.mood]}
        </span>
      </span>
    );
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full rarity-ring-${pet.rarity} ${big ? 'size-32 text-7xl' : 'size-14 text-3xl'}`} style={{ background: `${pet.color}33` }}>
      {three && pet.species ? (
        // The pet in 3D, a little bigger than its circle so it can hop out of it.
        <Creature3D species={pet.species} rarity={pet.rarity} className={`absolute ${big ? '-inset-6' : '-inset-3'}`}>
          {face}
        </Creature3D>
      ) : (
        face
      )}
      <span className={`absolute -right-1 -bottom-1 z-[1] rounded-full bg-surface ${big ? 'p-1 text-2xl' : 'text-base'}`} aria-hidden>
        {MOOD_FACE[pet.mood]}
      </span>
    </span>
  );
}

export function Pets() {
  const { t } = useTranslation();
  const [pets, setPets] = useState<PetView[] | null>(null);
  const [food, setFood] = useState(0);
  const [eggs, setEggs] = useState<{ id: string; qty: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starter, setStarter] = useState<string>(STARTER_PETS[0]!);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [hearts, setHearts] = useState(false);
  const [coins, setCoins] = useState(0);
  const [upgraded, setUpgraded] = useState<Rarity | null>(null);
  useConfetti(!!upgraded);

  const load = useCallback(async () => {
    const [p, inv] = await Promise.all([api<{ pets: PetView[] }>('/api/game/pets'), api<{ items: { id: string; qty: number }[]; coins: number }>('/api/game/inventory')]);
    setPets(p.pets);
    setCoins(inv.coins ?? 0);
    setFood(inv.items.find((i) => i.id === 'pet_food')?.qty ?? 0);
    setEggs(inv.items.filter((i) => i.id.startsWith('egg')));
  }, []);
  useEffect(() => void load(), [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
    }
    await load();
  };

  if (!pets) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;

  if (pets.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-black">{t('pets.adoptTitle')}</h1>
        <p className="text-muted">{t('pets.adoptBody')}</p>
        <div className="grid grid-cols-3 gap-3" role="radiogroup">
          {STARTER_PETS.map((id) => {
            const s = PET_SPECIES.find((x) => x.id === id)!;
            return (
              <button key={id} role="radio" aria-checked={starter === id} onClick={() => setStarter(id)} className={`flex flex-col items-center gap-2 rounded-3xl p-3 ring-2 ${starter === id ? 'bg-brand/10 ring-brand' : 'bg-surface ring-line'}`}>
                <span className="text-5xl">{s.emoji}</span>
                <span className="text-sm font-black">{t(`pets.species.${id}`)}</span>
              </button>
            );
          })}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">{t('pets.nameLabel')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 font-bold outline-none focus:border-brand" />
        </label>
        {error && <p className="font-bold text-bad">{t(`pets.errors.${error}`, { defaultValue: t('signin.errors.network') })}</p>}
        <button disabled={!name.trim()} onClick={() => void run(() => api('/api/game/pets/adopt', { method: 'POST', body: { species: starter, name } }))} className="w-full rounded-2xl bg-brand py-3.5 text-lg font-black text-brand-ink disabled:opacity-40">
          {t('pets.adopt')}
        </button>
      </div>
    );
  }

  const main = pets.find((p) => p.equipped) ?? pets[0]!;
  const others = pets.filter((p) => p.id !== main.id);
  const need = petXpForLevel(main.level);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('pets.title')}</h1>
      <section className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl bg-surface p-5 text-center ring-1 ring-line">
        <PetAvatar pet={main} three />
        {hearts && <span className="combo-pop absolute top-6 text-4xl">💕</span>}
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api(`/api/game/pets/${main.id}`, { method: 'PATCH', body: { name } })).then(() => setRenaming(false));
            }}
            className="flex gap-2"
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={16} aria-label={t('pets.nameLabel')} className="rounded-xl border-2 border-line bg-bg px-3 py-1 font-black" />
            <button className="rounded-xl bg-brand px-3 font-black text-brand-ink">{t('profile.save')}</button>
          </form>
        ) : (
          <button onClick={() => (setName(main.name), setRenaming(true))} className="text-2xl font-black" aria-label={`${main.name || t(`pets.species.${main.species}`)} — ${t('pets.rename')}`}>
            {main.name || t(`pets.species.${main.species}`)} ✏️
          </button>
        )}
        <p className="flex flex-wrap items-center justify-center gap-1.5 text-sm font-bold text-muted">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${RARITY_TONE[main.rarity]}`} data-testid="pet-rarity">
            {t(`pets.rarity.${main.rarity}`)}
          </span>
          {t(`pets.species.${main.species}`)} · {t('pets.mood.' + main.mood)}
        </p>
        <RarityLadder tier={main.rarity} />
        <div className="w-full space-y-2 text-left">
          <Meter label={t('pets.level', { level: main.level })} value={main.xp / need} detail={`${main.xp} / ${need}`} color="bg-brand" />
          <Meter label={t('pets.fullness')} value={main.fullness / 100} detail={`${main.fullness}%`} color={main.fullness < 35 ? 'bg-bad' : 'bg-good'} />
        </div>
        <p className="rounded-xl bg-amber-glow/15 px-3 py-1.5 text-sm font-bold">✨ {t('pets.perk', { pct: Math.round(main.perk * 100) })}</p>
        <UpgradeCard
          pet={main}
          coins={coins}
          onUpgrade={() =>
            void run(async () => {
              const r = await api<{ pet: PetView }>(`/api/game/pets/${main.id}/upgrade`, { method: 'POST' });
              play('finish');
              setUpgraded(r.pet.rarity);
              setTimeout(() => setUpgraded(null), 3500);
            })
          }
        />
        {upgraded && (
          <p role="status" className="combo-pop rounded-2xl bg-brand/15 px-3 py-2 font-black">
            🎉 {t('pets.upgraded', { rarity: t(`pets.rarity.${upgraded}`) })}
          </p>
        )}
        <button
          disabled={food === 0}
          onClick={() =>
            void run(async () => {
              await api('/api/game/items/use', { method: 'POST', body: { itemId: 'pet_food', petId: main.id } });
              play('correct');
              setHearts(true);
              setTimeout(() => setHearts(false), 900);
            })
          }
          className="w-full rounded-2xl bg-good py-3 text-lg font-black text-white disabled:opacity-40"
        >
          🍎 {t('pets.feed', { count: food })}
        </button>
        {food === 0 && (
          <Link to="/shop" className="text-sm font-bold text-brand">
            {t('pets.getFood')}
          </Link>
        )}
        <p className="text-xs text-muted">{t('pets.tip')}</p>
      </section>
      {error && <p className="font-bold text-bad">{t(`pets.errors.${error}`, { defaultValue: t('signin.errors.network') })}</p>}

      {eggs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-black">{t('pets.eggs')}</h2>
          {eggs.map((e) => (
            <button key={e.id} onClick={() => void run(() => api('/api/game/items/use', { method: 'POST', body: { itemId: e.id } }).then(() => play('finish')))} className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
              <EggArt rarity={e.id === 'egg_rare' ? 'rare' : 'common'} size={48} />
              <span className="flex-1 text-left font-black">
                {t(`items.${e.id}.name`)} ×{e.qty}
              </span>
              <span className="rounded-xl bg-brand px-3 py-1.5 font-black text-brand-ink">{t('shop.hatch')}</span>
            </button>
          ))}
        </section>
      )}

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-black">{t('pets.collection', { n: pets.length, total: PET_SPECIES.length })}</h2>
          {others.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
              <PetAvatar pet={p} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-black">{p.name || t(`pets.species.${p.species}`)}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <span className={`rounded-full px-2 py-0.5 font-black ${RARITY_TONE[p.rarity]}`}>{t(`pets.rarity.${p.rarity}`)}</span>
                  {t('pets.level', { level: p.level })}
                </span>
              </span>
              <button onClick={() => void run(() => api(`/api/game/pets/${p.id}`, { method: 'PATCH', body: { equipped: true } }))} className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-black">
                {t('pets.equip')}
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** Common → Rare → Epic → Legendary → Mythical, with where this pet is. */
function RarityLadder({ tier }: { tier: Rarity }) {
  const { t } = useTranslation();
  const at = RARITIES.indexOf(tier);
  return (
    <ol className="flex w-full items-center justify-center gap-1 text-[0.65rem] font-black" aria-label={t('pets.ladder')}>
      {RARITIES.map((r, i) => (
        <li key={r} className={`rounded-full px-2 py-0.5 ${i <= at ? RARITY_TONE[r] : 'bg-surface-2 text-muted'} ${i === at ? 'scale-110 shadow' : ''}`} aria-current={i === at ? 'step' : undefined}>
          {t(`pets.rarity.${r}`)}
        </li>
      ))}
    </ol>
  );
}

/** Upgrade the pet one rarity up: it needs a level and coins (shown, with what's missing). */
function UpgradeCard({ pet, coins, onUpgrade }: { pet: PetView; coins: number; onUpgrade: () => void }) {
  const { t } = useTranslation();
  const up = pet.upgrade;
  if (!up) return <p className="rounded-2xl bg-surface-2 px-3 py-2 text-sm font-black">👑 {t('pets.maxTier')}</p>;
  const levelOk = pet.level >= up.level;
  const coinsOk = coins >= up.coins;
  return (
    <div className="w-full space-y-2 rounded-2xl bg-surface-2 p-3 text-left" data-testid="pet-upgrade">
      <p className="font-black">
        ⬆️ {t('pets.upgradeTo')} <span className={`rounded-full px-2 py-0.5 text-sm ${RARITY_TONE[up.to]}`}>{t(`pets.rarity.${up.to}`)}</span>
      </p>
      <ul className="flex flex-wrap gap-2 text-sm font-bold">
        <li className={levelOk ? 'text-good' : 'text-muted'}>
          {levelOk ? '✓' : '○'} {t('pets.needLevel', { level: up.level })}
        </li>
        <li className={`flex items-center gap-1 ${coinsOk ? 'text-good' : 'text-muted'}`}>
          {coinsOk ? '✓' : '○'} <CoinIcon size={16} /> {up.coins}
        </li>
      </ul>
      <button type="button" disabled={!levelOk || !coinsOk} onClick={onUpgrade} className="btn-gold w-full rounded-xl py-2.5 font-black disabled:opacity-40">
        {t('pets.upgrade')}
      </button>
      {!levelOk && <p className="text-xs text-muted">{t('pets.upgradeHint')}</p>}
    </div>
  );
}

function Meter({ label, value, detail, color }: { label: string; value: number; detail: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm font-bold">
        <span>{label}</span>
        <span className="text-muted">{detail}</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${Math.max(3, Math.min(1, value) * 100)}%` }} />
      </div>
    </div>
  );
}
