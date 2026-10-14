import { weekId } from '@lumo/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { FlameIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { setFriends, useFriends, useNames, useProfiles, useTogether, type PublicProfile } from '../local/together';

/**
 * Browser-only build: friends are people this Lumo page is shared with. Add them, see their streaks
 * and compete on this week's XP.
 */
export function LocalFriends() {
  const { t } = useTranslation();
  const together = useTogether();
  const profiles = useProfiles();
  const friends = useFriends();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const names = useNames((profiles ?? []).map((p) => p.id));

  if (together === undefined) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;
  if (together === null)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-black">{t('friends.title')}</h1>
        <div className="flex items-start gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
          <Lumo size={56} mood="thinking" />
          <div className="space-y-2 text-sm">
            <p className="font-black">{t('together.helpTitle')}</p>
            <p>{t('together.helpBody')}</p>
          </div>
        </div>
      </div>
    );

  const me = together.me;
  const week = weekId(Date.now());
  const weekly = (p: PublicProfile) => (p.weekId === week ? p.weeklyXp : 0);
  const myFriends = new Set(friends ?? []);
  const nameOf = (id: string) => names[id]?.name || t('together.someone');
  const board = (profiles ?? []).filter((p) => p.id === me || myFriends.has(p.id)).sort((a, b) => weekly(b) - weekly(a));
  const others = (profiles ?? []).filter((p) => p.id !== me && !myFriends.has(p.id) && nameOf(p.id).toLowerCase().includes(filter.trim().toLowerCase()));

  const change = async (ids: string[]) => {
    setBusy(true);
    await setFriends(ids).catch(() => {});
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('friends.title')}</h1>
      <p className="text-sm text-muted">{t('together.friendsIntro')}</p>

      <section className="space-y-2">
        <h2 className="font-black">🏆 {t('together.thisWeek')}</h2>
        {board.length <= 1 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <Lumo size={48} mood="happy" />
            <p className="text-sm text-muted">{t('together.noFriendsYet')}</p>
          </div>
        ) : (
          <ol className="space-y-1.5">
            {board.map((p, i) => (
              <li key={p.id} className={`flex items-center gap-2 rounded-2xl p-2.5 ring-1 ${p.id === me ? 'bg-brand/10 ring-brand' : 'bg-surface ring-line'}`}>
                <span className="w-6 text-center font-black">{i + 1}</span>
                <img src={names[p.id]?.avatarUrl} alt="" className="size-8 rounded-full" />
                <span className="min-w-0 flex-1 truncate font-black">{p.id === me ? t('friends.you') : nameOf(p.id)}</span>
                <span className="flex items-center text-xs font-bold text-amber-glow">
                  <FlameIcon size={14} />
                  {p.streak}
                </span>
                <span className="text-xs font-bold text-muted">{t('home.level', { level: p.level })}</span>
                <span className="font-black tabular-nums">{weekly(p)} XP</span>
                {p.id !== me && (
                  <button disabled={busy} onClick={() => void change([...myFriends].filter((x) => x !== p.id))} aria-label={t('friends.remove', { name: nameOf(p.id) })} className="px-1 text-muted hover:text-bad">
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        <Link to="/live" className="block rounded-2xl bg-gradient-to-r from-indigo-700 to-violet-600 p-3.5 text-center font-black text-white">
          ⚡ {t('together.challenge')}
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="font-black">👋 {t('together.peopleHere')}</h2>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('together.searchName')} aria-label={t('together.searchName')} className="w-full rounded-xl border-2 border-line bg-surface px-3 py-2 font-bold outline-none focus:border-brand" />
        {profiles === null ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : others.length === 0 ? (
          <p className="rounded-2xl bg-surface p-3 text-sm text-muted ring-1 ring-line">{t('together.nobodyElse')}</p>
        ) : (
          <ul className="space-y-1.5">
            {others.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 ring-1 ring-line">
                <img src={names[p.id]?.avatarUrl} alt="" className="size-9 rounded-full" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-black">{nameOf(p.id)}</span>
                  <span className="text-xs font-bold text-muted">
                    {t('home.level', { level: p.level })} · 🔥 {p.streak}
                  </span>
                </span>
                <button disabled={busy} onClick={() => void change([...myFriends, p.id])} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-black text-brand-ink disabled:opacity-50">
                  {t('friends.add')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">{t('together.howToInvite')}</p>
      </section>
    </div>
  );
}
