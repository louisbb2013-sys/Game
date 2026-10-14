import { canRepair, dayKey, type StreakState } from '@lumo/core';
import { useCallback, useEffect, useState } from 'react';
import { TodayPlans } from '../components/TodayPlans';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CameraIcon, CoinIcon, FlameIcon, HeartIcon } from '../components/icons';
import { Lumo, type LumoMood } from '../components/Lumo';
import { api, ApiError, LOCAL } from '../lib/api';
import { EggRing, type EggState } from '../components/Egg';
import { Creature3D } from '../components/Pet3D';
import { useAuth } from '../lib/auth';
import { play } from '../lib/sound';
import { PetAvatar, type PetView } from './Pets';

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
    <Link to="/learn" className="flex items-center gap-4 rounded-3xl bg-gradient-to-r from-amber-glow/20 to-fuchsia-400/10 p-4 ring-1 ring-amber-glow/60">
      <EggRing egg={egg} size={76} three />
      <div className="min-w-0 flex-1">
        <h2 className="font-black">{t('egg.title', { rarity: t(`pets.rarity.${egg.rarity}`) })}</h2>
        <p className="text-sm">{t('egg.left', { count: left })}</p>
      </div>
      <span className="text-2xl text-muted">›</span>
    </Link>
  );
}

export function Home() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<Overview>('/api/game/overview').then(setOv, () => {}), []);
  useEffect(() => void load(), [load]);
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

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-4 rounded-3xl bg-night p-4 text-white shadow-lg">
        {ov?.pet ? (
          <Link to="/pets" aria-label={t('pets.title')} className="-my-4 -ml-3 block size-[118px] shrink-0">
            <Creature3D species={ov.pet.species} rarity={ov.pet.rarity} className="size-full">
              <Lumo size={92} mood={mood} glow={Math.min(1, 0.4 + user.streak.days / 20)} />
            </Creature3D>
          </Link>
        ) : (
          <Lumo size={92} mood={mood} glow={Math.min(1, 0.4 + user.streak.days / 20)} />
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-black">{t(greetingKey, { name: user.username })}</h1>
          <p className="mt-1 text-sm text-indigo-100">{streakMsg}</p>
        </div>
      </section>

      <section aria-label={t('home.level', { level: user.level.level })} className="rounded-3xl bg-surface p-4 ring-1 ring-line">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-black">{t('home.level', { level: user.level.level })}</span>
          <span className="text-sm font-bold text-muted">{t('home.xpToNext', { current: user.level.current, needed: user.level.needed })}</span>
        </div>
        <div className="mt-2 h-3.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={t('home.levelProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(user.level.ratio * 100)}>
          <div className="h-full rounded-full bg-gradient-to-r from-amber-glow to-amber-300 transition-[width] duration-700" style={{ width: `${Math.max(3, user.level.ratio * 100)}%` }} />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Tile icon={<FlameIcon size={28} />} value={user.streak.days} label={t('stats.streak')} />
        <Tile
          icon={<HeartIcon size={28} className="text-heart" />}
          value={user.hearts.current}
          label={minutesToHeart ? t('stats.nextHeart', { minutes: minutesToHeart }) : t('stats.full')}
        />
        <Link to="/shop">
          <Tile icon={<CoinIcon size={28} />} value={user.coins} label={t('stats.coins')} />
        </Link>
      </section>

      {(user.streak.freezes > 0 || repairable) && (
        <section className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 text-sm font-bold ring-1 ring-line">
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

      <TodayPlans />

      {ov && ov.chests > 0 && (
        <Link to="/shop?tab=mine" className="flex items-center gap-3 rounded-3xl bg-gradient-to-r from-amber-glow/30 to-amber-glow/10 p-4 ring-1 ring-amber-glow">
          <span className="lumo-bounce text-4xl">🎁</span>
          <span className="flex-1 font-black">{t('home.chestsWaiting', { count: ov.chests })}</span>
          <span className="text-2xl">›</span>
        </Link>
      )}

      {ov?.egg && <EggCard egg={ov.egg} />}

      {ov && (
        <section className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line" aria-labelledby="quests-title">
          <h2 id="quests-title" className="font-black">
            📜 {t('home.quests')}
          </h2>
          {(['daily', 'weekly'] as const).map((period) => (
            <div key={period} className="space-y-2">
              <p className="text-xs font-black tracking-wide text-muted uppercase">{t(`home.${period}`)}</p>
              {ov.quests
                .filter((q) => q.period === period)
                .map((q) => {
                  const done = q.progress >= q.target;
                  return (
                    <div key={q.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold ${q.claimed ? 'text-muted line-through' : ''}`}>{t(`quests.${q.metric}`, { count: q.target })}</p>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
                          <div className={`h-full rounded-full ${done ? 'bg-good' : 'bg-amber-glow'}`} style={{ width: `${Math.max(4, (q.progress / q.target) * 100)}%` }} />
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
        <Link to="/pets" className="flex items-center gap-4 rounded-3xl bg-surface p-4 ring-1 ring-line">
          {ov.pet ? <PetAvatar pet={ov.pet} size="sm" three /> : <span className="grid size-14 place-items-center rounded-full bg-surface-2 text-3xl">🥚</span>}
          <div className="min-w-0 flex-1">
            <h2 className="font-black">{ov.pet ? ov.pet.name || t(`pets.species.${ov.pet.species}`) : t('home.adoptPet')}</h2>
            <p className="text-sm text-muted">{ov.pet ? t(`pets.moodLine.${ov.pet.mood}`) : t('home.adoptPetBody')}</p>
          </div>
          <span className="text-2xl text-muted">›</span>
        </Link>
      )}

      <section className="space-y-3">
        <Link to="/chat" className="block">
          <ActionCard accent icon={<CameraIcon size={28} />} title={t('home.createTitle')} body={t(LOCAL ? 'local.createBody' : 'home.createBody')} />
        </Link>
        <Link to="/sandbox" className="block">
          <ActionCard icon={<span className="text-2xl">🎨</span>} title={t('home.sandboxTitle')} body={t('home.sandboxBody')} />
        </Link>
        <Link to="/learn" className="block">
          <ActionCard icon={<span className="text-2xl">📚</span>} title={t('home.reviewTitle')} body={t('home.reviewBody')} />
        </Link>
      </section>

      {!LOCAL && (
        <Link to="/league" className="block text-center text-xs font-bold text-muted">
          {t('stats.league')}: {t(`leagues.${user.leagueTier}`)} ›
        </Link>
      )}
    </div>
  );
}

function Tile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface p-3 text-center ring-1 ring-line">
      {icon}
      <span className="mt-1 text-2xl font-black">{value}</span>
      <span className="text-[0.7rem] leading-tight font-bold text-muted">{label}</span>
    </div>
  );
}

function ActionCard({ icon, title, body, soon, accent }: { icon: React.ReactNode; title: string; body: string; soon?: string; accent?: boolean }) {
  return (
    <div className={`flex items-center gap-4 rounded-3xl p-4 ring-1 ${accent ? 'bg-amber-glow/15 ring-amber-glow/40' : 'bg-surface ring-line'}`}>
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${accent ? 'bg-amber-glow text-night' : 'bg-surface-2'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-black">{title}</h2>
        <p className="text-sm text-muted">{body}</p>
      </div>
      {soon ? <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-extrabold text-muted">{soon}</span> : <span className="shrink-0 text-2xl text-muted">›</span>}
    </div>
  );
}
