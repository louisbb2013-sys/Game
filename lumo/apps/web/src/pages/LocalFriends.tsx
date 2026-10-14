import { weekId } from '@lumo/core';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { FlameIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { useAuth } from '../lib/auth';
import { findProfiles, setFriends, useFriends, useNames, useOnlineNow, useProfiles, useTogether, type PublicProfile } from '../local/together';

/**
 * Browser-only build: add friends by typing their username (Enter), or tap Add next to someone who is
 * online right now. Friends compete on this week's XP and can be challenged to a Live game.
 */
export function LocalFriends() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const together = useTogether();
  const profiles = useProfiles();
  const friends = useFriends();
  const online = useOnlineNow();
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const avatars = useNames((profiles ?? []).map((p) => p.id));

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
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.username || avatars[id]?.name || t('together.someone');
  const board = (profiles ?? []).filter((p) => p.id === me || myFriends.has(p.id)).sort((a, b) => weekly(b) - weekly(a));
  const onlineNow = online.filter((id) => byId.has(id));
  const everyoneElse = (profiles ?? []).filter((p) => p.id !== me && !myFriends.has(p.id) && !online.includes(p.id));

  const add = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await setFriends([...myFriends, id]);
      setMsg({ ok: true, text: t('together.added', { name: nameOf(id) }) });
    } catch {
      setMsg({ ok: false, text: t('together.cantAdd') });
    }
    setBusy(false);
  };
  const remove = async (id: string) => {
    setBusy(true);
    await setFriends([...myFriends].filter((x) => x !== id)).catch(() => {});
    setBusy(false);
  };

  const addTyped = async (e: FormEvent) => {
    e.preventDefault();
    const name = typed.trim().replace(/^@/, '').toLowerCase();
    if (!name) return;
    let found = (profiles ?? []).find((p) => p.username?.toLowerCase() === name);
    // Someone who just joined may not be in the list yet: look once more, straight from the source.
    for (let i = 0; !found && i < 3; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1200));
      found = (await findProfiles()).find((p) => p.username?.toLowerCase() === name);
    }
    if (!found) return setMsg({ ok: false, text: t('together.notFound', { name: typed.trim() }) });
    if (found.id === me) return setMsg({ ok: false, text: t('friends.errors.cannot_add_self') });
    if (myFriends.has(found.id)) return setMsg({ ok: true, text: t('together.alreadyFriends', { name: found.username }) });
    setTyped('');
    void add(found.id);
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setMsg({ ok: true, text: t('live.copied') }),
      () => setMsg(null),
    );
  };

  const Person = ({ id, children, dot }: { id: string; children?: React.ReactNode; dot?: boolean }) => {
    const p = byId.get(id);
    return (
      <li className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 ring-1 ring-line">
        <span className="relative shrink-0">
          <img src={avatars[id]?.avatarUrl} alt="" className="size-10 rounded-full bg-surface-2" />
          {dot && <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-good ring-2 ring-surface" aria-label={t('together.online')} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-black">{nameOf(id)}</span>
          {p && (
            <span className="text-xs font-bold text-muted">
              {t('home.level', { level: p.level })} · 🔥 {p.streak}
            </span>
          )}
        </span>
        {children ??
          (myFriends.has(id) ? (
            <span className="text-sm font-black text-good">✓ {t('together.friend')}</span>
          ) : (
            <button disabled={busy} onClick={() => void add(id)} className="rounded-xl bg-brand px-3.5 py-1.5 text-sm font-black text-brand-ink disabled:opacity-50">
              + {t('friends.add')}
            </button>
          ))}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('friends.title')}</h1>

      <section className="space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-muted">{t('together.yourUsername')}</p>
            <p className="truncate text-xl font-black" data-testid="my-username">
              {user?.username}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => copy(user?.username ?? '')} className="rounded-xl bg-surface px-3 py-2 text-sm font-black ring-1 ring-line">
              {t('settings.shareCopy')}
            </button>
            <Link to="/me" className="rounded-xl bg-surface px-3 py-2 text-sm font-black ring-1 ring-line">
              {t('plan.edit')}
            </Link>
          </div>
        </div>
        <form onSubmit={(e) => void addTyped(e)} className="flex gap-2">
          <input
            id="friend-username"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t('together.typeUsername')}
            aria-label={t('together.typeUsername')}
            autoComplete="off"
            autoCapitalize="none"
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-3 py-2.5 font-bold outline-none focus:border-brand"
          />
          <button disabled={!typed.trim() || busy} className="rounded-xl bg-brand px-4 font-black text-brand-ink disabled:opacity-40">
            {t('friends.add')}
          </button>
        </form>
        {msg && (
          <p role="status" className={`text-sm font-bold ${msg.ok ? 'text-good' : 'text-bad'}`}>
            {msg.text}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-black">
          <span className="size-2.5 rounded-full bg-good" aria-hidden /> {t('together.onlineNow', { count: onlineNow.length })}
        </h2>
        {onlineNow.length === 0 ? (
          <p className="rounded-2xl bg-surface p-3 text-sm text-muted ring-1 ring-line">{t('together.nobodyOnline')}</p>
        ) : (
          <ul className="space-y-1.5">
            {onlineNow.map((id) => (
              <Person key={id} id={id} dot />
            ))}
          </ul>
        )}
      </section>

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
                <span className="relative shrink-0">
                  <img src={avatars[p.id]?.avatarUrl} alt="" className="size-8 rounded-full bg-surface-2" />
                  {online.includes(p.id) && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-good ring-2 ring-surface" aria-label={t('together.online')} />}
                </span>
                <span className="min-w-0 flex-1 truncate font-black">{p.id === me ? t('friends.you') : nameOf(p.id)}</span>
                <span className="flex items-center text-xs font-bold text-amber-glow">
                  <FlameIcon size={14} />
                  {p.streak}
                </span>
                <span className="font-black tabular-nums">{weekly(p)} XP</span>
                {p.id !== me && (
                  <button disabled={busy} onClick={() => void remove(p.id)} aria-label={t('friends.remove', { name: nameOf(p.id) })} className="px-1 text-muted hover:text-bad">
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

      {everyoneElse.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-black">👋 {t('together.peopleHere')}</h2>
          <ul className="space-y-1.5">
            {everyoneElse.map((p) => (
              <Person key={p.id} id={p.id} />
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-muted">{t('together.howToInvite')}</p>
    </div>
  );
}
