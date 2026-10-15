import { LOCAL } from '../lib/api';
import { Suspense } from 'react';
import { PageLoading } from './PageLoading';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/offline';
import { BoltIcon, BookIcon, CoinIcon, FlameIcon, HeartIcon, HomeIcon, SparkIcon, TrophyIcon, UserIcon } from './icons';

export function Layout() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { user, offline } = useAuth();
  const online = useOnline();
  if (!user) return null;

  const allTabs = [
    { to: '/', label: t('nav.home'), icon: HomeIcon, end: true },
    { to: '/learn', label: t('nav.learn'), icon: BookIcon },
    { to: '/sandbox', label: t('nav.sandbox'), icon: SparkIcon },
    { to: '/live', label: t('nav.live'), icon: BoltIcon },
    { to: '/league', label: t('nav.league'), icon: TrophyIcon },
    { to: '/me', label: t('nav.profile'), icon: UserIcon },
  ];
  // The browser-only build has no leagues (they need a server); Live runs between friends' pages.
  const tabs = LOCAL ? allTabs.filter((x) => x.to !== '/league') : allTabs;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <div className="aurora" aria-hidden />
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur">
        <span className="font-display text-2xl font-black tracking-tight text-ink italic">
          lumo<span className="text-[#c9973a]">.</span>
        </span>
        <div className="flex items-center gap-1.5">
          <Stat label={t('stats.streak')} value={user.streak.days} icon={<FlameIcon size={20} />} dim={user.streak.status !== 'safe'} />
          <Stat label={t('stats.hearts')} value={user.hearts.current} icon={<HeartIcon size={20} className="text-heart" />} />
          <Stat label={t('stats.coins')} value={user.coins} icon={<CoinIcon size={20} />} />
        </div>
      </header>

      {!LOCAL && (offline || !online) && (
        <Link to="/offline" className="block bg-amber-glow px-4 py-1.5 text-center text-sm font-black text-night">
          📡 {t('offline.banner')}
        </Link>
      )}
      <main className="flex-1 px-4 pt-4 pb-28">
        <Suspense fallback={<PageLoading />}>
          {/* Each page glides in (keyed by its address, so it plays on every page change). */}
          <div key={pathname} className="page-in">
            <Outlet />
          </div>
        </Suspense>
      </main>

      <nav
        data-bottom-nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-xl border-t border-line bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 backdrop-blur"
      >
        <ul className={`grid ${tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
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
