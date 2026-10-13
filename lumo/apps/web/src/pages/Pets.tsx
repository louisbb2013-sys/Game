import { PET_SPECIES, petXpForLevel, STARTER_PETS } from '@lumo/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api, ApiError } from '../lib/api';
import { play } from '../lib/sound';

export interface PetView {
  id: string;
  species: string;
  emoji: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  color: string;
  name: string;
  level: number;
  xp: number;
  fullness: number;
  mood: 'happy' | 'content' | 'hungry' | 'sad';
  perk: number;
  equipped: boolean;
}

const MOOD_FACE = { happy: '😄', content: '🙂', hungry: '😋', sad: '😢' };
const RARITY_RING = { common: 'ring-slate-300', rare: 'ring-sky-400', epic: 'ring-fuchsia-400', legendary: 'ring-amber-400' };

export function PetAvatar({ pet, size = 'lg' }: { pet: Pick<PetView, 'emoji' | 'color' | 'mood' | 'rarity'>; size?: 'sm' | 'lg' }) {
  const big = size === 'lg';
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full ring-4 ${RARITY_RING[pet.rarity]} ${big ? 'size-32 text-7xl' : 'size-14 text-3xl'}`} style={{ background: `${pet.color}33` }}>
      <span className={pet.mood === 'sad' ? '' : pet.mood === 'happy' ? 'lumo-bounce' : 'lumo-float'}>{pet.emoji}</span>
      <span className={`absolute -right-1 -bottom-1 rounded-full bg-surface ${big ? 'p-1 text-2xl' : 'text-base'}`} aria-hidden>
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

  const load = useCallback(async () => {
    const [p, inv] = await Promise.all([api<{ pets: PetView[] }>('/api/game/pets'), api<{ items: { id: string; qty: number }[] }>('/api/game/inventory')]);
    setPets(p.pets);
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
        <PetAvatar pet={main} />
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
        <p className="text-sm font-bold text-muted">
          {t(`pets.species.${main.species}`)} · {t(`pets.rarity.${main.rarity}`)} · {t('pets.mood.' + main.mood)}
        </p>
        <div className="w-full space-y-2 text-left">
          <Meter label={t('pets.level', { level: main.level })} value={main.xp / need} detail={`${main.xp} / ${need}`} color="bg-brand" />
          <Meter label={t('pets.fullness')} value={main.fullness / 100} detail={`${main.fullness}%`} color={main.fullness < 35 ? 'bg-bad' : 'bg-good'} />
        </div>
        <p className="rounded-xl bg-amber-glow/15 px-3 py-1.5 text-sm font-bold">✨ {t('pets.perk', { pct: Math.round(main.perk * 100) })}</p>
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
              <span className="text-3xl">{e.id === 'egg_rare' ? '🪺' : '🥚'}</span>
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
                <span className="block text-xs text-muted">
                  {t(`pets.rarity.${p.rarity}`)} · {t('pets.level', { level: p.level })}
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
