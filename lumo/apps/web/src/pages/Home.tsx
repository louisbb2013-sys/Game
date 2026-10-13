import { useTranslation } from 'react-i18next';
import { CameraIcon, CoinIcon, FlameIcon, HeartIcon } from '../components/icons';
import { Lumo, type LumoMood } from '../components/Lumo';
import { useAuth } from '../lib/auth';

export function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;

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
        <Lumo size={92} mood={mood} glow={Math.min(1, 0.4 + user.streak.days / 20)} />
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
        <div className="mt-2 h-3.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(user.level.ratio * 100)}>
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
        <Tile icon={<CoinIcon size={28} />} value={user.coins} label={t('stats.coins')} />
      </section>

      <section className="space-y-3">
        <ActionCard
          accent
          icon={<CameraIcon size={28} />}
          title={t('home.createTitle')}
          body={t('home.createBody')}
          soon={t('home.soon')}
        />
        <ActionCard icon={<span className="text-2xl">🔁</span>} title={t('home.reviewTitle')} body={t('home.reviewBody')} soon={t('home.soon')} />
      </section>

      <p className="text-center text-xs font-bold text-muted">
        {t('stats.league')}: {t(`leagues.${user.leagueTier}`)}
      </p>
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

function ActionCard({ icon, title, body, soon, accent }: { icon: React.ReactNode; title: string; body: string; soon: string; accent?: boolean }) {
  return (
    <div className={`flex items-center gap-4 rounded-3xl p-4 ring-1 ${accent ? 'bg-amber-glow/15 ring-amber-glow/40' : 'bg-surface ring-line'}`}>
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${accent ? 'bg-amber-glow text-night' : 'bg-surface-2'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-black">{title}</h2>
        <p className="text-sm text-muted">{body}</p>
      </div>
      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-extrabold text-muted">{soon}</span>
    </div>
  );
}
