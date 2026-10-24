import { PET_BUFF, PET_SPECIES, petXpForLevel, RARITIES, STARTER_PETS, type PetBuffKind, type Rarity } from '@lumo/core';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Creature3D } from '../components/Pet3D';
import { EggArt, PetPortrait, RARITY_TONE } from '../components/Art';
import { CoinIcon } from '../components/icons';
import { useConfetti } from '../lib/confetti';
import { useGifts } from '../lib/gifts';
import { useRewards } from '../lib/rewards';
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
  /** On the team (website and Claude page). */
  active?: boolean;
  /** Its bonus (website and Claude page); `off` while it's too hungry to help. */
  buff?: { kind: PetBuffKind; value: number; off: boolean };
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

interface PetsData {
  pets: PetView[];
  /** What the team adds up to (website and Claude page). */
  buffs?: Record<PetBuffKind, number>;
  /** How many pets can be on the team (website and Claude page; the server version has one buddy). */
  maxActive?: number;
  egg?: { rarity: Rarity; progress: number; target: number };
}

export function Pets() {
  const { t } = useTranslation();
  const [data, setData] = useState<PetsData | null>(null);
  const [food, setFood] = useState(0);
  const [eggs, setEggs] = useState<{ id: string; qty: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starter, setStarter] = useState<string>(STARTER_PETS[0]!);
  const [name, setName] = useState('');
  const [coins, setCoins] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const showRewards = useRewards();
  const { creator, gifts } = useGifts();

  const load = useCallback(async () => {
    const [p, inv] = await Promise.all([api<PetsData>('/api/game/pets'), api<{ items: { id: string; qty: number }[]; coins: number }>('/api/game/inventory')]);
    setData(p);
    setCoins(inv.coins ?? 0);
    setFood(inv.items.find((i) => i.id === 'pet_food')?.qty ?? 0);
    setEggs(inv.items.filter((i) => i.id.startsWith('egg')));
  }, []);
  useEffect(() => void load(), [load]);
  // A gift from the creator just arrived: it's in the collection now.
  useEffect(() => {
    if (gifts.length) void load();
  }, [gifts.length, load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
    }
    await load();
  };

  if (!data) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;
  const pets = data.pets;

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
                <span className="text-xs font-bold text-muted">{t(`pets.buffKind.${PET_BUFF[id]}`)}</span>
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

  const teamMode = typeof data.maxActive === 'number';
  const max = data.maxActive ?? 1;
  const isActive = (p: PetView) => (teamMode ? !!p.active : p.equipped);
  const team = pets.filter(isActive);
  const bench = pets.filter((p) => !isActive(p));
  const owned = new Set(pets.map((p) => p.species));
  const missing = PET_SPECIES.filter((s) => !owned.has(s.id));
  const shown = pets.find((p) => p.id === open) ?? null;
  const buffs = data.buffs;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-black">{t('pets.collectionTitle')}</h1>
        <p className="text-sm font-bold text-muted">{t('pets.collection', { n: pets.length, total: PET_SPECIES.length })}</p>
        {buffs && (
          // What the whole team adds while you study.
          <ul className="flex flex-wrap gap-1.5" aria-label={t('pets.teamBonus')} data-testid="team-buffs">
            {(['xp', 'coins', 'heart', 'egg'] as const)
              .filter((k) => buffs[k] > 0)
              .map((k) => (
                <li key={k} className="rounded-full bg-amber-glow/15 px-3 py-1 text-sm font-black ring-1 ring-amber-glow/40">
                  {BUFF_ICON[k]} {buffLine(t, { kind: k, value: buffs[k] }, true)}
                </li>
              ))}
          </ul>
        )}
      </header>

      {data.egg && <StudyEgg egg={data.egg} />}

      {eggs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-black">{t('pets.eggs')}</h2>
          {eggs.map((e) => (
            <button
              key={e.id}
              onClick={() =>
                void run(async () => {
                  const r = await api<{ pet?: PetView; duplicate?: boolean; snacks?: number }>('/api/game/items/use', { method: 'POST', body: { itemId: e.id } });
                  // It hatches on screen (a pet you have already also gives snacks).
                  if (r.pet) showRewards({ xp: 0, levelUp: null, badges: [], questsCompleted: [], hatched: { species: r.pet.species, emoji: r.pet.emoji, rarity: r.pet.rarity, duplicate: !!r.duplicate, snacks: r.snacks } });
                  else play('finish');
                })
              }
              className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
              <EggArt rarity={e.id === 'egg_rare' ? 'rare' : 'common'} size={48} />
              <span className="flex-1 text-left font-black">
                {t(`items.${e.id}.name`)} ×{e.qty}
              </span>
              <span className="rounded-xl bg-brand px-3 py-1.5 font-black text-brand-ink">{t('shop.hatch')}</span>
            </button>
          ))}
        </section>
      )}

      <section className="space-y-2" aria-labelledby="team-title">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="team-title" className="text-lg font-black">
            {teamMode ? t('pets.activeTitle', { n: team.length, max }) : t('pets.buddyTitle')}
          </h2>
          {teamMode && <p className="text-xs font-bold text-muted">{t('pets.activeHint')}</p>}
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="team">
          {team.map((p) => (
            <li key={p.id}>
              <PetCard pet={p} active onOpen={() => setOpen(p.id)} />
            </li>
          ))}
          {teamMode &&
            Array.from({ length: Math.max(0, max - team.length) }, (_, i) => (
              <li key={`empty-${i}`} className="grid min-h-52 place-items-center rounded-3xl border-2 border-dashed border-line p-3 text-center text-sm font-bold text-muted">
                {bench.length ? t('pets.emptySlot') : t('pets.emptySlotHatch')}
              </li>
            ))}
        </ul>
      </section>

      {bench.length > 0 && (
        <section className="space-y-2" aria-labelledby="bench-title">
          <h2 id="bench-title" className="text-lg font-black">
            {t('pets.availableTitle', { n: bench.length })}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {bench.map((p) => (
              <li key={p.id}>
                <PetCard pet={p} onOpen={() => setOpen(p.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <section className="space-y-2" aria-labelledby="missing-title">
          <h2 id="missing-title" className="font-black text-muted">
            {t('pets.missingTitle', { n: missing.length })}
          </h2>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {missing.map((sp) => (
              <li key={sp.id} className="pet-locked flex flex-col items-center gap-1 rounded-2xl bg-surface p-2 text-center ring-1 ring-line" title={t(sp.rarity === 'lumo' ? 'pets.giftOnly' : 'pets.locked')}>
                <PetPortrait species={sp.id} rarity={sp.rarity} emoji={sp.emoji} size={52} still />
                <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black ${RARITY_TONE[sp.rarity]}`}>{t(`pets.rarity.${sp.rarity}`)}</span>
                <span className="sr-only">{t(sp.rarity === 'lumo' ? 'pets.giftOnly' : 'pets.locked')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {creator && <CreatorPanel />}
      {error && !shown && <p className="font-bold text-bad">{t(`pets.errors.${error}`, { defaultValue: t('signin.errors.network') })}</p>}

      {shown && (
        <PetSheet
          pet={shown}
          food={food}
          coins={coins}
          teamMode={teamMode}
          teamFull={team.length >= max}
          active={isActive(shown)}
          error={error}
          run={run}
          onClose={() => {
            setOpen(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

/** Only for the game's creator: give someone a Lumo-rarity pet by their Lumo name. */
function CreatorPanel() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [species, setSpecies] = useState('lumo_firefly');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const give = async (e: React.FormEvent) => {
    e.preventDefault();
    const who = username.trim();
    if (!who || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/game/gifts/give', { method: 'POST', body: { username: who, species } });
      setMsg({ ok: true, text: t('gifts.sent', { name: who }) });
      setUsername('');
      play('finish');
    } catch (err) {
      setMsg({ ok: false, text: t(`gifts.errors.${err instanceof ApiError ? err.code : 'network'}`, { defaultValue: t('signin.errors.network') }) });
    }
    setBusy(false);
  };
  return (
    <section className="pet-screen space-y-3 rounded-3xl bg-surface p-4 ring-2 ring-amber-glow" data-rarity="lumo" aria-labelledby="creator-title" data-testid="creator-panel">
      <h2 id="creator-title" className="font-black">
        👑 {t('gifts.creatorTitle')}
      </h2>
      <p className="text-sm text-muted">{t('gifts.creatorBody')}</p>
      <form onSubmit={(e) => void give(e)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('gifts.username')} aria-label={t('gifts.username')} maxLength={40} className="rounded-xl border-2 border-line bg-bg px-3 py-2 font-bold" />
        <select value={species} onChange={(e) => setSpecies(e.target.value)} aria-label={t('gifts.which')} className="rounded-xl border-2 border-line bg-bg px-3 py-2 font-bold">
          {PET_SPECIES.map((sp) => (
            <option key={sp.id} value={sp.id}>
              {sp.emoji} {t(`pets.species.${sp.id}`)}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy || !username.trim()} className="rarity-lumo rounded-xl px-4 py-2 font-black text-night disabled:opacity-50">
          🎁 {t('gifts.give')}
        </button>
      </form>
      {msg && (
        <p role="status" className={`text-sm font-bold ${msg.ok ? 'text-good' : 'text-bad'}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

const BUFF_ICON: Record<PetBuffKind, string> = { xp: '⚡', coins: '🪙', heart: '💖', egg: '🥚' };

/** "+7% chance to win a heart on a right answer" (or the short form for the team summary). */
function buffLine(t: TFunction, b: { kind: PetBuffKind; value: number }, short = false) {
  const key = `pets.buff${short ? 'Short' : ''}.${b.kind}`;
  return t(key, { pct: Math.round(b.value * 100), n: b.value, count: b.value });
}

/** One pet in the collection, like a trading card: name, picture, level badge, and its bonus. */
function PetCard({ pet, active = false, onOpen }: { pet: PetView; active?: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const name = pet.name || t(`pets.species.${pet.species}`);
  const buff = pet.buff ?? (pet.perk ? { kind: 'xp' as const, value: pet.perk, off: pet.mood === 'sad' } : null);
  return (
    <button type="button" onClick={onOpen} className="pet-card" data-rarity={pet.rarity} data-active={active} data-testid="pet-card" aria-label={`${name}, ${t(`pets.rarity.${pet.rarity}`)}, ${t('pets.level', { level: pet.level })}`}>
      <span className="w-full truncate px-1 text-lg leading-tight font-black">{name}</span>
      <span className="relative grid place-items-center">
        <PetPortrait species={pet.species} rarity={pet.rarity} emoji={pet.emoji} size={104} />
        <LevelShield level={pet.level} rarity={pet.rarity} className="absolute -right-2 bottom-1" />
      </span>
      {buff && <span className={`text-sm leading-snug font-bold ${buff.off ? 'text-bad' : ''}`}>{buff.off ? `😋 ${t('pets.tooHungry')}` : buffLine(t, buff)}</span>}
    </button>
  );
}

/** A little shield with the pet's level, in its rarity's colour (like Gizmo's). */
function LevelShield({ level, rarity, className = '' }: { level: number; rarity: Rarity; className?: string }) {
  return (
    <svg viewBox="0 0 32 36" className={`level-shield size-9 drop-shadow ${className}`} data-rarity={rarity} aria-hidden>
      <path d="M16 1 L30 6 V17 C30 26 23 32 16 35 C9 32 2 26 2 17 V6 Z" className="level-shield-bg" stroke="rgb(0 0 0 / 0.25)" strokeWidth="1.5" />
      <text x="16" y="23" textAnchor="middle" fontSize={level >= 10 ? 13 : 15} fontWeight="900" fill="#fff">
        {level}
      </text>
    </svg>
  );
}

/** The study egg: answering questions hatches it (and an egg pet on the team speeds it up). */
function StudyEgg({ egg }: { egg: { rarity: Rarity; progress: number; target: number } }) {
  const { t } = useTranslation();
  const left = Math.max(0, egg.target - egg.progress);
  return (
    <section className="flex items-center gap-4 rounded-3xl bg-surface p-4 ring-1 ring-line" aria-labelledby="egg-title" data-testid="study-egg">
      <span className="grid size-16 shrink-0 place-items-center rounded-full bg-surface-2">
        <EggArt rarity={egg.rarity} size={52} progress={egg.progress / egg.target} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="egg-title" className="font-black">
          {t('pets.studyEgg', { rarity: t(`pets.rarity.${egg.rarity}`) })}
        </h2>
        <p className="text-sm text-muted">{t('pets.studyEggBody', { count: left })}</p>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={egg.progress} aria-valuemin={0} aria-valuemax={egg.target} aria-label={t('egg.progress', { done: egg.progress, total: egg.target })}>
          <div className="h-full rounded-full bg-amber-glow transition-[width] duration-500" style={{ width: `${Math.min(100, (egg.progress / egg.target) * 100)}%` }} />
        </div>
      </div>
    </section>
  );
}

/** One pet up close: its 3D self, name, rarity, level, hunger, bonus; feed it, upgrade it, put it on the team. */
function PetSheet({
  pet,
  food,
  coins,
  teamMode,
  teamFull,
  active,
  error,
  run,
  onClose,
}: {
  pet: PetView;
  food: number;
  coins: number;
  teamMode: boolean;
  teamFull: boolean;
  active: boolean;
  error: string | null;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(pet.name);
  const [hearts, setHearts] = useState(false);
  const [upgraded, setUpgraded] = useState<Rarity | null>(null);
  useConfetti(!!upgraded);
  const need = petXpForLevel(pet.level);
  const buff = pet.buff;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    // The page underneath stays put, so there is only one thing to scroll.
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', onKey);
      document.body.style.overflow = was;
    };
  }, [onClose]);

  const title = pet.name || t(`pets.species.${pet.species}`);
  // The whole screen, one scroll: the pet big on one side, everything about it on the other.
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="pet-screen fixed inset-0 z-[70] overflow-y-auto bg-bg" data-rarity={pet.rarity} data-testid="pet-screen">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur">
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-xl font-black ring-1 ring-line">
          ←
        </button>
        <h2 className="min-w-0 flex-1 truncate text-xl font-black">{title}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${RARITY_TONE[pet.rarity]}`} data-testid="pet-rarity">
          {t(`pets.rarity.${pet.rarity}`)}
        </span>
      </header>
      <div className="mx-auto grid w-full max-w-5xl gap-5 p-4 pb-[max(env(safe-area-inset-bottom),2rem)] lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-8 lg:p-8">
      <section className="pet-stage relative flex flex-col items-center gap-2 rounded-3xl p-4 text-center lg:sticky lg:top-24">
        <div className="relative h-[36dvh] w-full max-w-sm lg:h-[52dvh]">
          <Creature3D species={pet.species} rarity={pet.rarity} className="absolute inset-0" label={title}>
            <span className="grid size-full place-items-center text-8xl">{pet.emoji}</span>
          </Creature3D>
          {hearts && <span className="combo-pop absolute top-4 left-1/2 -translate-x-1/2 text-5xl">💕</span>}
        </div>
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api(`/api/game/pets/${pet.id}`, { method: 'PATCH', body: { name } })).then(() => setRenaming(false));
            }}
            className="flex gap-2"
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={16} aria-label={t('pets.nameLabel')} className="rounded-xl border-2 border-line bg-bg px-3 py-1 font-black" />
            <button className="rounded-xl bg-brand px-3 font-black text-brand-ink">{t('profile.save')}</button>
          </form>
        ) : (
          <button onClick={() => (setName(pet.name), setRenaming(true))} className="text-2xl font-black" aria-label={`${pet.name || t(`pets.species.${pet.species}`)} — ${t('pets.rename')}`}>
            {pet.name || t(`pets.species.${pet.species}`)} ✏️
          </button>
        )}
        <p className="text-sm font-bold text-muted">
          {t(`pets.species.${pet.species}`)} · {t('pets.mood.' + pet.mood)}
        </p>
        <RarityLadder tier={pet.rarity} />
      </section>
      <section className="flex flex-col gap-3 text-center">
        {buff ? (
          <p className={`rounded-xl px-3 py-1.5 text-sm font-black ${buff.off ? 'bg-bad/10 text-bad' : 'bg-amber-glow/15'}`} data-testid="pet-buff">
            {BUFF_ICON[buff.kind]} {buff.off ? t('pets.tooHungryLong') : buffLine(t, buff)}
          </p>
        ) : (
          <p className="rounded-xl bg-amber-glow/15 px-3 py-1.5 text-sm font-bold">✨ {t('pets.perk', { pct: Math.round(pet.perk * 100) })}</p>
        )}
        {teamMode && (
          <div className="flex w-full gap-2">
            {active ? (
              <button type="button" onClick={() => void run(() => api(`/api/game/pets/${pet.id}`, { method: 'PATCH', body: { active: false } }))} className="flex-1 rounded-2xl bg-surface-2 py-2.5 font-black ring-1 ring-line" data-testid="pet-leave-team">
                {t('pets.leaveTeam')}
              </button>
            ) : (
              <button
                type="button"
                disabled={teamFull}
                onClick={() =>
                  void run(async () => {
                    await api(`/api/game/pets/${pet.id}`, { method: 'PATCH', body: { active: true } });
                    play('combo');
                  })
                }
                className="flex-1 rounded-2xl bg-brand py-2.5 font-black text-brand-ink disabled:opacity-40"
                data-testid="pet-join-team"
              >
                {t('pets.joinTeam')}
              </button>
            )}
            {active && !pet.equipped && (
              <button type="button" onClick={() => void run(() => api(`/api/game/pets/${pet.id}`, { method: 'PATCH', body: { equipped: true } }))} className="flex-1 rounded-2xl bg-surface-2 py-2.5 font-black ring-1 ring-line">
                {t('pets.makeBuddy')}
              </button>
            )}
          </div>
        )}
        {teamMode && !active && teamFull && <p className="text-xs font-bold text-muted">{t('pets.teamFull')}</p>}
        {!teamMode && !pet.equipped && (
          <button type="button" onClick={() => void run(() => api(`/api/game/pets/${pet.id}`, { method: 'PATCH', body: { equipped: true } }))} className="w-full rounded-2xl bg-surface-2 py-2.5 font-black ring-1 ring-line">
            {t('pets.equip')}
          </button>
        )}
        <div className="w-full space-y-2 text-left">
          <Meter label={t('pets.level', { level: pet.level })} value={pet.xp / need} detail={`${pet.xp} / ${need}`} color="bg-brand" />
          <Meter label={t('pets.fullness')} value={pet.fullness / 100} detail={`${pet.fullness}%`} color={pet.fullness < 35 ? 'bg-bad' : 'bg-good'} />
        </div>
        <UpgradeCard
          pet={pet}
          coins={coins}
          onUpgrade={() =>
            void run(async () => {
              const r = await api<{ pet: PetView }>(`/api/game/pets/${pet.id}/upgrade`, { method: 'POST' });
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
              await api('/api/game/items/use', { method: 'POST', body: { itemId: 'pet_food', petId: pet.id } });
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
        {error && <p className="font-bold text-bad">{t(`pets.errors.${error}`, { defaultValue: t('signin.errors.network') })}</p>}
        <p className="text-xs text-muted">{t('pets.tip')}</p>
      </section>
      </div>
    </div>
  );
}

/** Common → Rare → Epic → Legendary → Mythical, with where this pet is. */
function RarityLadder({ tier }: { tier: Rarity }) {
  const { t } = useTranslation();
  const at = RARITIES.indexOf(tier);
  return (
    <ol className="flex w-full flex-wrap items-center justify-center gap-1 text-[0.65rem] font-black" aria-label={t('pets.ladder')}>
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
  if (!up) return <p className="rounded-2xl bg-surface-2 px-3 py-2 text-sm font-black">{pet.rarity === 'lumo' ? `✨ ${t('pets.lumoTier')}` : `👑 ${t('pets.maxTier')}`}</p>;
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
