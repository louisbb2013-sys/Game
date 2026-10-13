import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../lib/auth';
import { BoltIcon, BookIcon, CoinIcon, FlameIcon, HeartIcon, HomeIcon, SparkIcon, TrophyIcon, UserIcon } from './icons';

export function Layout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;

  const tabs = [
    { to: '/', label: t('nav.home'), icon: HomeIcon, end: true },
    { to: '/learn', label: t('nav.learn'), icon: BookIcon },
    { to: '/sandbox', label: t('nav.sandbox'), icon: SparkIcon },
    { to: '/live', label: t('nav.live'), icon: BoltIcon },
    { to: '/league', label: t('nav.league'), icon: TrophyIcon },
    { to: '/me', label: t('nav.profile'), icon: UserIcon },
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur">
        <span className="text-xl font-black tracking-tight text-ink">
          lumo<span className="text-amber-glow">.</span>
        </span>
        <div className="flex items-center gap-1.5">
          <Stat label={t('stats.streak')} value={user.streak.days} icon={<FlameIcon size={20} />} dim={user.streak.status !== 'safe'} />
          <Stat label={t('stats.hearts')} value={user.hearts.current} icon={<HeartIcon size={20} className="text-heart" />} />
          <Stat label={t('stats.coins')} value={user.coins} icon={<CoinIcon size={20} />} />
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-28">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-xl border-t border-line bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 backdrop-blur"
      >
        <ul className="grid grid-cols-6">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[0.7rem] font-bold transition-colors ${
                    isActive ? 'text-brand' : 'text-muted hover:text-ink'
                  }`
                }
              >
                <Icon size={24} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function Stat({ label, value, icon, dim }: { label: string; value: number; icon: React.ReactNode; dim?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-sm font-extrabold shadow-sm ring-1 ring-line ${dim ? 'opacity-60' : ''}`}
      title={label}
    >
      {icon}
      <span aria-label={`${label}: ${value}`}>{value}</span>
    </span>
  );
}
