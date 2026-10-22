import { LOCAL } from '../lib/api';
import { Suspense, type ComponentType } from 'react';
import { PageLoading } from './PageLoading';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { useOnline } from '../lib/offline';
import { BoltIcon, BookIcon, CoinIcon, FlameIcon, GearIcon, HeartIcon, HomeIcon, PawIcon, PlusIcon, ShopIcon, SparkIcon, TrophyIcon, UserIcon, UsersIcon } from './icons';
import { Lumo } from './Lumo';
import { LiveInvitePopup } from './LiveInvites';

type Tab = { to: string; label: string; icon: ComponentType<{ size?: number; className?: string }>; end?: boolean };

/**
 * The app frame. On a computer: a sidebar (with the big gold Create button) and pages that use the
 * whole width. On a phone: a slim top bar with your streak, hearts and coins, and a tab bar at the
 * bottom with Create in the middle.
 */
export function Layout() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { user, offline } = useAuth();
  const online = useOnline();
  if (!user) return null;
  // Forms and lists read best at a comfortable width; grids and dashboards use the whole screen.
  const narrow = /^\/(live|friends|me|settings|offline|groups|add|audio|exam)(\/|$)/.test(pathname);

  const side: Tab[] = [
    { to: '/', label: t('nav.home'), icon: HomeIcon, end: true },
    { to: '/learn', label: t('nav.learn'), icon: BookIcon },
    { to: '/live', label: t('nav.live'), icon: BoltIcon },
    { to: '/friends', label: t('nav.friends'), icon: UsersIcon },
    ...(LOCAL ? [] : [{ to: '/league', label: t('nav.league'), icon: TrophyIcon }]),
    { to: '/pets', label: t('nav.pets'), icon: PawIcon },
    { to: '/shop', label: t('nav.shop'), icon: ShopIcon },
    { to: '/sandbox', label: t('nav.sandbox'), icon: SparkIcon },
    { to: '/me', label: t('nav.profile'), icon: UserIcon },
  ];
  const bottom: Tab[] = [
    { to: '/', label: t('nav.home'), icon: HomeIcon, end: true },
    { to: '/learn', label: t('nav.learn'), icon: BookIcon },
    { to: '/live', label: t('nav.live'), icon: BoltIcon },
    { to: '/me', label: t('nav.profile'), icon: UserIcon },
  ];
  const stats = (
    <>
      <Stat label={t('stats.streak')} value={user.streak.days} icon={<FlameIcon size={18} />} dim={user.streak.status !== 'safe'} />
      <Stat label={t('stats.hearts')} value={user.hearts.current} icon={<HeartIcon size={18} className="text-heart" />} />
      <Stat label={t('stats.coins')} value={user.coins} icon={<CoinIcon size={18} />} />
    </>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <div className="aurora" aria-hidden />
      <div className="grain" aria-hidden />

      {/* Computer: sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-gold/15 bg-surface/55 px-4 py-6 backdrop-blur-xl lg:flex">
        <Link to="/" className="flex items-center gap-2 px-2" aria-label="Revio">
          <Lumo size={40} mood="happy" />
          <span className="font-display text-[1.9rem] leading-none font-black italic">
            revio<span className="text-gold">.</span>
          </span>
        </Link>
        <Link to="/chat" className="btn-gold flex items-center justify-center gap-2 rounded-2xl py-3 text-base font-black">
          <PlusIcon size={20} />
          {t('nav.create')}
        </Link>
        <nav aria-label="Main" className="-mx-1 flex-1 overflow-y-auto">
          <ul className="space-y-0.5">
            {side.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `side-link group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.95rem] font-bold transition-colors ${isActive ? 'is-active text-ink' : 'text-muted hover:bg-surface-2/70 hover:text-ink'}`
                  }
                >
                  <Icon size={21} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">{stats}</div>
          <Link to="/settings" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-muted hover:text-ink">
            <GearIcon size={18} />
            {t('settings.title')}
          </Link>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Phone: top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-bg/85 px-4 py-2 backdrop-blur lg:hidden">
          <Link to="/" className="font-display text-2xl font-black tracking-tight text-ink italic">
            revio<span className="text-gold">.</span>
          </Link>
          <div className="flex items-center gap-1.5">{stats}</div>
        </header>

        {!LOCAL && (offline || !online) && (
          <Link to="/offline" className="block bg-amber-glow px-4 py-1.5 text-center text-sm font-black text-night">
            📡 {t('offline.banner')}
          </Link>
        )}
        <main className="flex-1 px-4 pt-4 pb-28 sm:px-6 lg:px-10 lg:pt-9 lg:pb-14 xl:px-14">
          <Suspense fallback={<PageLoading />}>
            {/* Each page glides in (keyed by its address, so it plays on every page change). */}
            <div key={pathname} className={`page-in mx-auto w-full ${narrow ? 'max-w-3xl' : 'max-w-6xl'}`}>
              <Outlet />
            </div>
          </Suspense>
        </main>
        {LOCAL && <LiveInvitePopup />}

        {/* Phone: tab bar with Create in the middle */}
        <nav
          data-bottom-nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur lg:hidden"
        >
          <ul className="mx-auto grid max-w-xl grid-cols-5 items-end">
            {bottom.slice(0, 2).map((tab) => (
              <BottomTab key={tab.to} tab={tab} />
            ))}
            <li className="flex justify-center">
              <Link to="/chat" aria-label={t('nav.create')} className="btn-gold -mt-6 grid size-14 place-items-center rounded-full shadow-lg">
                <PlusIcon size={28} />
              </Link>
            </li>
            {bottom.slice(2).map((tab) => (
              <BottomTab key={tab.to} tab={tab} />
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function BottomTab({ tab: { to, label, icon: Icon, end } }: { tab: Tab }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) => `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[0.7rem] font-bold transition-colors ${isActive ? 'text-brand' : 'text-muted hover:text-ink'}`}
      >
        <Icon size={24} />
        {label}
      </NavLink>
    </li>
  );
}

function Stat({ label, value, icon, dim }: { label: string; value: number; icon: React.ReactNode; dim?: boolean }) {
  return (
    <span className={`flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-sm font-extrabold ring-1 ring-line ${dim ? 'opacity-60' : ''}`} title={label}>
      {icon}
      <span aria-label={`${label}: ${value}`}>{value}</span>
    </span>
  );
}
