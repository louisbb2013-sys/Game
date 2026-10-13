import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { GearIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { ApiError } from '../lib/api';
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

      <section className="flex flex-col items-center rounded-3xl bg-surface p-5 text-center ring-1 ring-line">
        <div className="grid size-28 place-items-center rounded-full bg-night">
          <Lumo size={96} />
        </div>
        <p className="mt-3 text-xl font-black">{user.username}</p>
        <p className="text-sm text-muted">
          {t('home.level', { level: user.level.level })} · {user.xp} XP · {t(`leagues.${user.leagueTier}`)}
        </p>
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

      <button onClick={() => void logout()} className="w-full rounded-2xl py-3 font-extrabold text-bad ring-1 ring-line">
        {t('profile.logout')}
      </button>
    </div>
  );
}
