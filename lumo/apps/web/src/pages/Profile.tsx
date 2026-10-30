import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { accountCode, loadSession } from '../netlify/cloud';
import { Link } from 'react-router';
import { GearIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { GradeChip } from '../components/Grade';
import { api, ApiError, LOCAL, NETLIFY } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Profile() {
  const { t, i18n } = useTranslation();
  const { user, update, logout } = useAuth();
  const [name, setName] = useState(user?.username ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!user) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await update({ username: name.trim() });
      setMsg({ ok: true, text: t('profile.saved') });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network';
      setMsg({ ok: false, text: t(`profile.errors.${code}`, { defaultValue: t('signin.errors.network') }) });
    }
  };

  const joined = new Date(user.createdAt).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">{t('profile.title')}</h1>
        <Link to="/settings" className="flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-sm font-extrabold ring-1 ring-line">
          <GearIcon size={18} />
          {t('profile.settings')}
        </Link>
      </div>
      {LOCAL && (
        <Link to="/memory" className="flex items-center gap-3 rounded-3xl bg-surface p-4 font-black ring-1 ring-line hover:ring-brand">
          <span className="text-2xl" aria-hidden>
            🧠
          </span>
          <span className="flex-1">{t('memory.title')}</span>
          <span aria-hidden>›</span>
        </Link>
      )}

      <section className="flex flex-col items-center rounded-3xl bg-surface p-5 text-center ring-1 ring-line">
        <div className="grid size-28 place-items-center rounded-full bg-night">
          <Lumo size={96} />
        </div>
        <p className="mt-3 text-xl font-black">{user.username}</p>
        <p className="text-sm text-muted">
          {t('home.level', { level: user.level.level })} · {user.xp} XP · {t(`leagues.${user.leagueTier}`)}
        </p>
        {user.grade && <GradeChip grade={user.grade} />}
        <p className="text-xs text-muted">{t('profile.joined', { date: joined })}</p>
      </section>

      <form onSubmit={save} className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <label htmlFor="username" className="block text-sm font-bold">
          {t('profile.username')}
        </label>
        <div className="flex gap-2">
          <input
            id="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-3 py-2 font-bold outline-none focus:border-brand"
          />
          <button className="rounded-xl bg-brand px-4 font-black text-brand-ink disabled:opacity-50" disabled={name.trim() === user.username}>
            {t('profile.save')}
          </button>
        </div>
        <p className="text-xs text-muted">{t('profile.usernameHint')}</p>
        {msg && (
          <p role="status" className={`text-sm font-bold ${msg.ok ? 'text-good' : 'text-bad'}`}>
            {msg.text}
          </p>
        )}
      </form>

      <BadgesSection />

      {!LOCAL && (
      <div className="grid grid-cols-2 gap-3">
        <Link to="/friends" className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
          👋 {t('friends.title')}
        </Link>
        <Link to="/groups" className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
          👥 {t('groups.title')}
        </Link>
        <Link to="/pets" className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
          🐾 {t('pets.title')}
        </Link>
        <Link to="/shop" className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
          🛍️ {t('shop.title')}
        </Link>
      </div>
      )}

      {LOCAL && (
        <div className="grid grid-cols-3 gap-3">
          <Link to="/friends" className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
            👋 {t('friends.title')}
          </Link>
          <Link to="/pets" className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
            🐾 {t('pets.title')}
          </Link>
          <Link to="/shop" className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
            🛍️ {t('shop.title')}
          </Link>
        </div>
      )}

      {NETLIFY ? (
        <NetlifyAccount />
      ) : LOCAL ? (
        <p className="text-center text-xs text-muted">{t('local.savedHere')}</p>
      ) : (
        <button onClick={() => void logout()} className="w-full rounded-2xl py-3 font-extrabold text-bad ring-1 ring-line">
          {t('profile.logout')}
        </button>
      )}
    </div>
  );
}

interface BadgeData {
  stats: { correct: number; mastered: number; bestStreak: number; sessions: number; sandboxKinds: string[] };
  badges: { id: string; emoji: string; earnedAt: string | null }[];
}

function BadgesSection() {
  const { t } = useTranslation();
  const [data, setData] = useState<BadgeData | null>(null);
  useEffect(() => {
    api<BadgeData>('/api/game/badges').then(setData, () => {});
  }, []);
  if (!data) return null;
  const earned = data.badges.filter((b) => b.earnedAt).length;
  const stats = [
    { label: t('profile.statCorrect'), value: data.stats.correct },
    { label: t('profile.statMastered'), value: data.stats.mastered },
    { label: t('profile.statBestStreak'), value: data.stats.bestStreak },
    { label: t('profile.statFormats'), value: data.stats.sandboxKinds.length },
  ];
  return (
    <section className="space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-line" aria-labelledby="badges-title">
      <div className="grid grid-cols-4 gap-2 text-center">
        {stats.map((x) => (
          <div key={x.label}>
            <p className="text-xl font-black">{x.value}</p>
            <p className="text-[0.65rem] leading-tight font-bold text-muted">{x.label}</p>
          </div>
        ))}
      </div>
      <h2 id="badges-title" className="font-black">
        🏅 {t('profile.badges', { n: earned, total: data.badges.length })}
      </h2>
      <ul className="grid grid-cols-4 gap-2">
        {data.badges.map((b) => (
          <li key={b.id} className={`flex flex-col items-center gap-1 rounded-2xl p-2 text-center ${b.earnedAt ? 'bg-amber-glow/15' : 'bg-surface-2 text-muted'}`} title={t(`badges.${b.id}.desc`)}>
            <span className={`text-3xl ${b.earnedAt ? '' : 'opacity-40 grayscale'}`}>{b.emoji}</span>
            <span className="text-[0.62rem] leading-tight font-bold">{t(`badges.${b.id}.name`)}</span>
            <span className="sr-only">{b.earnedAt ? t('profile.earned') : t('profile.locked')} — {t(`badges.${b.id}.desc`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Standalone site: which account this is, and signing out (or making an account, for a guest). */
function NetlifyAccount() {
  const { t } = useTranslation();
  const [s] = useState(() => loadSession());
  const out = async () => {
    const { signOut } = await import('../netlify/Gate');
    signOut();
  };
  return (
    <div className="space-y-2 text-center">
      <p className="text-xs text-muted">{s ? (s.kind === 'g' ? (s.hint ? t('gate.signedInGoogleAs', { hint: s.hint }) : t('gate.signedInGoogle')) : t('gate.signedInAs', { name: s.name })) : t('local.savedHere')}</p>
      {s && (
        // The same code on two devices means the same account (a different one means another sign-in).
        <div className="text-xs text-muted">
          <p className="font-black" data-testid="account-code">
            {t('gate.accountCode', { code: accountCode(s.uid) })}
          </p>
          <p>{t('gate.accountCodeHint')}</p>
        </div>
      )}
      <button onClick={() => void out()} className={`w-full rounded-2xl py-3 font-extrabold ring-1 ring-line ${s ? 'text-bad' : 'text-brand'}`}>
        {s ? t('gate.signOut') : t('gate.makeAccount')}
      </button>
    </div>
  );
}
