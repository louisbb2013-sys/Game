import { canRepair, dayKey, type StreakState } from '@lumo/core';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { TodayPlans } from '../components/TodayPlans';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { CameraIcon, CoinIcon, FlameIcon, HeartIcon, TextIcon, UploadIcon } from '../components/icons';
import { DeckCard } from '../components/DeckCard';
import { loadSession } from '../netlify/cloud';
import { Lumo, type LumoMood } from '../components/Lumo';
import { DailyGift, GradeChip } from '../components/Grade';
import { api, ApiError, LOCAL, NETLIFY } from '../lib/api';
import { EggRing, type EggState } from '../components/Egg';
import { Creature3D } from '../components/Pet3D';
import { useAuth } from '../lib/auth';
import { play } from '../lib/sound';
import { lastDeckId, type DeckListItem } from '../lib/quiz';
import { PetAvatar, type PetView } from './Pets';
import { ChestArt } from '../components/Art';
import { MemoryCard } from './Memory';

interface Quest {
  id: string;
  period: 'daily' | 'weekly';
  metric: string;
  progress: number;
  target: number;
  claimed: boolean;
  reward: { coins: number; chest?: string };
}
interface Overview {
  quests: Quest[];
  chests: number;
  boostUntil: string | null;
  pet: PetView | null;
  hasPets: boolean;
  /** Website: the study egg that hatches as you answer questions. */
  egg?: EggState;
}

function EggCard({ egg }: { egg: EggState }) {
  const { t } = useTranslation();
  const left = Math.max(0, egg.target - egg.progress);
  return (
    <Link to="/learn" className="panel flex items-center gap-4 p-4">
      <EggRing egg={egg} size={76} three />
      <div className="min-w-0 flex-1">
        <h2 className="font-black">{t('egg.title', { rarity: t(`pets.rarity.${egg.rarity}`) })}</h2>
        <p className="text-sm">{t('egg.left', { count: left })}</p>
      </div>
      <span className="text-2xl text-muted">›</span>
    </Link>
  );
}

/** One tap from Home back into the game: your last deck, with Play, a speed run or the boss. */
function JumpIn({ decks }: { decks: DeckListItem[] | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const last = lastDeckId();
  const deck = decks?.find((d) => d.id === last) ?? decks?.[0] ?? null;
  if (!deck) return null;
  const go = (mode: 'practice' | 'speed' | 'boss') => navigate(`/decks/${deck.id}`, { state: { autoplay: mode } });
  return (
    <section aria-labelledby="jump-title" className="lacquer lux-frame relative overflow-hidden rounded-[1.75rem] p-5 shadow-lg sm:p-6">
      <div className="sm:flex sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-[#f2d58a] italic">{t('home.jumpIn')}</p>
          <h2 id="jump-title" className="mt-0.5 truncate text-[1.7rem] leading-tight font-black">
            {deck.title}
          </h2>
          <p className="text-sm font-bold text-[#f7f1e3]/80">
            {t('learn.mastered', { done: deck.masteredCount, total: deck.conceptCount })}
            {deck.dueCount > 0 && ` · ${t('learn.due', { count: deck.dueCount })}`}
          </p>
        </div>
        <div className="mt-3 flex gap-2 sm:mt-0 sm:w-80 sm:shrink-0">
          <button type="button" onClick={() => go('practice')} className="btn-gold breathe flex-1 rounded-2xl py-3.5 text-lg font-black">
            ▶ {t('hub.play')}
          </button>
          <button type="button" onClick={() => go('speed')} aria-label={t('play.modes.speed')} title={t('play.modes.speed')} className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-2xl ring-1 ring-[#e8c468]/45 active:scale-95">
            ⚡
          </button>
          <button type="button" onClick={() => go('boss')} aria-label={t('play.boss.title')} title={t('play.boss.title')} className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-2xl ring-1 ring-[#e8c468]/45 active:scale-95">
            🐉
          </button>
        </div>
      </div>
    </section>
  );
}

/** Gizmo-style: the first thing on Home is "what do you want to study?" */
function QuickCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const go = (state: { text?: string; source?: 'file' | 'notes' | 'topic'; files?: File[] }) => navigate('/chat', { state });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) go({ text: text.trim() });
    else document.getElementById('home-create')?.focus();
  };
  const chip = 'flex items-center gap-2 rounded-full bg-white/8 px-3.5 py-2 text-sm font-bold text-white/90 ring-1 ring-white/15 transition hover:bg-white/15 hover:ring-[#e8c468]/50';
  return (
    <section aria-labelledby="create-ask" className="lacquer lux-frame relative overflow-hidden rounded-[1.75rem] p-5 shadow-xl sm:p-7">
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-[#e8c468]/15 blur-3xl" />
      <h2 id="create-ask" className="font-display relative text-2xl leading-tight font-black sm:text-[2rem]">
        {t('home.createAsk')}
      </h2>
      <p className="relative mt-1 text-sm text-white/75 sm:text-base">{t('home.createHint')}</p>
      <form onSubmit={submit} className="relative mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          id="home-create"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          enterKeyHint="go"
          aria-label={t('home.createAsk')}
          placeholder={t('home.createPlaceholder')}
          className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-black/25 px-4 py-3.5 text-base font-bold text-white outline-none placeholder:text-white/45 focus:border-gold"
        />
        <button className="btn-gold shrink-0 rounded-2xl px-6 py-3.5 text-base font-black">
          ✨ {t('home.generate')}
        </button>
      </form>
      <div className="relative mt-3 flex flex-wrap gap-2">
        {/* Straight to the camera (on a phone) or the file picker: the deck starts building as soon as a photo is chosen. */}
        <label className="btn-gold flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-black">
          <CameraIcon size={17} />
          {t('home.takePhoto')}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.length && go({ files: Array.from(e.target.files) })} />
        </label>
        <label className={`${chip} cursor-pointer`}>
          <UploadIcon size={17} />
          {t('home.fromFile')}
          <input type="file" multiple accept="image/*,application/pdf,.txt,.md,text/plain" className="sr-only" onChange={(e) => e.target.files?.length && go({ files: Array.from(e.target.files) })} />
        </label>
        <button type="button" onClick={() => go({ source: 'notes' })} className={chip}>
          <TextIcon size={17} />
          {t('home.fromNotes')}
        </button>
      </div>
    </section>
  );
}

function YourDecks({ decks }: { decks: DeckListItem[] | null }) {
  const { t } = useTranslation();
  if (!decks || decks.length === 0) return null;
  return (
    <section aria-labelledby="your-decks" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="your-decks" className="text-2xl font-black">
          {t('home.yourDecks')}
        </h2>
        <Link to="/learn" className="text-sm font-black text-accent hover:underline">
          {t('home.seeAll')}
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {decks.slice(0, 6).map((d, i) => (
          <li key={d.id}>
            <DeckCard deck={d} index={i} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Explore() {
  const { t } = useTranslation();
  const items = [
    { to: '/live', icon: '⚡', title: t('home.liveTitle'), body: t('home.liveBody') },
    { to: '/sandbox', icon: '🎨', title: t('home.sandboxTitle'), body: t('home.sandboxBody') },
    { to: '/friends', icon: '🤝', title: t('home.friendsTitle'), body: t('home.friendsBody') },
  ];
  return (
    <section aria-labelledby="explore" className="space-y-3">
      <h2 id="explore" className="text-2xl font-black">
        {t('home.explore')}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((x) => (
          <li key={x.to}>
            <Link to={x.to} className="panel flex h-full items-start gap-3 p-4 transition hover:-translate-y-0.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl">{x.icon}</span>
              <span className="min-w-0">
                <span className="block font-black">{x.title}</span>
                <span className="block text-sm text-muted">{x.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Standalone site, trying without an account: say what an account adds. */
function GuestNote() {
  const { t } = useTranslation();
  if (!NETLIFY || loadSession()) return null;
  return (
    <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm">
        <span className="font-black">{t('home.guestTitle')}</span> {t('home.guestBody')}
      </p>
      <button type="button" onClick={() => void import('../netlify/Gate').then((m) => m.signOut())} className="btn-gold shrink-0 rounded-xl px-4 py-2 text-sm font-black">
        {t('gate.makeAccount')}
      </button>
    </div>
  );
}

export function Home() {
  const { t, i18n } = useTranslation();
  const { user, refresh } = useAuth();
  const [ov, setOv] = useState<Overview | null>(null);
  const [decks, setDecks] = useState<DeckListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<Overview>('/api/game/overview').then(setOv, () => {}), []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    api<{ decks: DeckListItem[] }>('/api/decks').then((r) => setDecks(r.decks), () => setDecks([]));
  }, []);
  if (!user) return null;

  const claim = async (q: Quest) => {
    setErr(null);
    try {
      await api(`/api/game/quests/${q.id}/claim`, { method: 'POST' });
      play('finish');
    } catch (e) {
      setErr(e instanceof ApiError ? e.code : 'network');
    }
    await load();
    void refresh();
  };
  const repair = async () => {
    setErr(null);
    try {
      await api('/api/game/streak/repair', { method: 'POST' });
      play('finish');
    } catch (e) {
      setErr(e instanceof ApiError ? e.code : 'network');
    }
    void refresh();
  };
  const repairable = canRepair(user.streak as unknown as StreakState, dayKey(Date.now(), user.timezone));

  const hour = new Date().getHours();
  const greetingKey = hour < 12 ? 'home.greeting_morning' : hour < 18 ? 'home.greeting_afternoon' : 'home.greeting_evening';
  const status = user.streak.status;
  const mood: LumoMood = status === 'safe' ? 'cheer' : status === 'broken' ? 'sad' : status === 'at_risk' ? 'thinking' : 'happy';
  const streakMsg = {
    none: t('home.streakNone'),
    safe: t('home.streakSafe'),
    at_risk: t('home.streakAtRisk', { count: user.streak.days }),
    broken: t('home.streakBroken'),
  }[status];
  const minutesToHeart = user.hearts.nextRefillAt ? Math.max(1, Math.ceil((user.hearts.nextRefillAt - Date.now()) / 60_000)) : null;
  const today = new Date().toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-6">
        <header className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-sm first-letter:uppercase">{today}</p>
            <h1 className="mt-0.5 text-[1.9rem] leading-tight font-black sm:text-4xl lg:text-[2.6rem]">{t(greetingKey, { name: user.username })}</h1>
            <p className="mt-1 text-muted">{streakMsg}</p>
          </div>
          {ov?.pet ? (
            <Link to="/pets" aria-label={t('pets.title')} className="block size-[104px] shrink-0 sm:size-[128px]">
              <Creature3D species={ov.pet.species} rarity={ov.pet.rarity} className="size-full">
                <Lumo size={92} mood={mood} glow={Math.min(1, 0.4 + user.streak.days / 20)} />
              </Creature3D>
            </Link>
          ) : (
            <Lumo size={92} mood={mood} glow={Math.min(1, 0.4 + user.streak.days / 20)} />
          )}
        </header>

        <GuestNote />
        <QuickCreate />
        <JumpIn decks={decks} />
        <YourDecks decks={decks} />
        <TodayPlans />
        <Explore />
      </div>

      <aside className="mt-6 space-y-4 lg:sticky lg:top-8 lg:mt-0">
        <section aria-label={t('home.level', { level: user.level.level })} className="panel p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-black">{t('home.level', { level: user.level.level })}</span>
            <span className="text-sm font-bold text-muted">{t('home.xpToNext', { current: user.level.current, needed: user.level.needed })}</span>
          </div>
          {user.grade && <GradeChip grade={user.grade} />}
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={t('home.levelProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(user.level.ratio * 100)}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#c9973a] to-[#f6e2a0] transition-[width] duration-700" style={{ width: `${Math.max(3, user.level.ratio * 100)}%` }} />
          </div>
        </section>

        {LOCAL && <DailyGift />}

        <section className="grid grid-cols-3 gap-3">
          <Tile icon={<FlameIcon size={26} />} value={user.streak.days} label={t('stats.streak')} />
          <Tile icon={<HeartIcon size={26} className="text-heart" />} value={user.hearts.current} label={minutesToHeart ? t('stats.nextHeart', { minutes: minutesToHeart }) : t('stats.full')} />
          <Link to="/shop">
            <Tile icon={<CoinIcon size={26} />} value={user.coins} label={t('stats.coins')} />
          </Link>
        </section>

        {(user.streak.freezes > 0 || repairable) && (
          <section className="panel flex flex-wrap items-center gap-2 p-3 text-sm font-bold">
            {user.streak.freezes > 0 && <span>🧊 {t('home.freezes', { count: user.streak.freezes })}</span>}
            {repairable && (
              <button onClick={() => void repair()} className="ml-auto rounded-xl bg-amber-glow px-3 py-1.5 font-black text-night">
                🔧 {t('home.repairStreak', { days: (user.streak as unknown as StreakState).lost?.days ?? 0 })}
              </button>
            )}
          </section>
        )}
        {user.boostUntil && <p className="rounded-2xl bg-amber-glow/20 px-3 py-2 text-sm font-bold">⚡ {t('home.boostOn')}</p>}
        {err && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">{t(`shop.errors.${err}`, { defaultValue: t('signin.errors.network') })}</p>}

        {ov && ov.chests > 0 && (
          <Link to="/shop?tab=mine" className="flex items-center gap-3 rounded-3xl bg-gradient-to-r from-amber-glow/30 to-amber-glow/10 p-4 ring-1 ring-amber-glow">
            <ChestArt kind="common" size={56} />
            <span className="flex-1 font-black">{t('home.chestsWaiting', { count: ov.chests })}</span>
            <span className="text-2xl">›</span>
          </Link>
        )}

        {ov?.egg && <EggCard egg={ov.egg} />}
        {LOCAL && <MemoryCard />}

        {ov && (
          <section className="panel space-y-2 p-4" aria-labelledby="quests-title">
            <h2 id="quests-title" className="font-black">
              📜 {t('home.quests')}
            </h2>
            {(['daily', 'weekly'] as const).map((period) => (
              <div key={period} className="space-y-2">
                <p className="eyebrow text-xs">{t(`home.${period}`)}</p>
                {ov.quests
                  .filter((q) => q.period === period)
                  .map((q) => {
                    const done = q.progress >= q.target;
                    return (
                      <div key={q.id} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold ${q.claimed ? 'text-muted line-through' : ''}`}>{t(`quests.${q.metric}`, { count: q.target })}</p>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                            <div className={`h-full rounded-full ${done ? 'bg-good' : 'bg-gradient-to-r from-[#c9973a] to-[#f6e2a0]'}`} style={{ width: `${Math.max(4, (q.progress / q.target) * 100)}%` }} />
                          </div>
                        </div>
                        {done && !q.claimed ? (
                          <button onClick={() => void claim(q)} className="combo-pop shrink-0 rounded-xl bg-good px-3 py-1.5 text-sm font-black text-white">
                            {t('home.claim')}
                          </button>
                        ) : (
                          <span className="flex shrink-0 items-center gap-0.5 text-xs font-black text-muted">
                            {q.claimed ? '✓' : (
                              <>
                                <CoinIcon size={14} />
                                {q.reward.coins}
                                {q.reward.chest && ' 🎁'}
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
          </section>
        )}

        {ov && (
          <Link to="/pets" className="panel flex items-center gap-4 p-4">
            {ov.pet ? <PetAvatar pet={ov.pet} size="sm" three /> : <span className="grid size-14 place-items-center rounded-full bg-surface-2 text-3xl">🥚</span>}
            <div className="min-w-0 flex-1">
              <h2 className="font-black">{ov.pet ? ov.pet.name || t(`pets.species.${ov.pet.species}`) : t('home.adoptPet')}</h2>
              <p className="text-sm text-muted">{ov.pet ? t(`pets.moodLine.${ov.pet.mood}`) : t('home.adoptPetBody')}</p>
            </div>
            <span className="text-2xl text-muted">›</span>
          </Link>
        )}

        {!LOCAL && (
          <Link to="/league" className="block text-center text-xs font-bold text-muted">
            {t('stats.league')}: {t(`leagues.${user.leagueTier}`)} ›
          </Link>
        )}
      </aside>
    </div>
  );
}

function Tile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="panel flex flex-col items-center p-3 text-center">
      {icon}
      <span className="font-display mt-1 text-2xl font-black">{value}</span>
      <span className="text-[0.7rem] leading-tight font-bold text-muted">{label}</span>
    </div>
  );
}
