import { weekId } from '@lumo/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { FlameIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SharedDecks } from '../components/SharedDecks';
import { answerFriendRequest, findProfiles, FRIENDS_ONLY, sendFriendRequest, setFriends, useFriendRequests, useFriends, useNames, useOnlineNow, useProfiles, useReadOnly, useTogether, type PublicProfile } from '../local/together';

/** A new friend pays a few coins (enough for 2 snacks), once per friend; 0 if it already did. */
async function friendCoins(id: string): Promise<number> {
  try {
    return (await api<{ coins: number }>('/api/local/friend-reward', { method: 'POST', body: { friendId: id } })).coins;
  } catch {
    return 0;
  }
}

/**
 * Browser-only build: add friends by typing their username (Enter), or tap Add next to someone who is
 * online right now. Friends compete on this week's XP and can be challenged to a Live game.
 */
export function LocalFriends() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const together = useTogether();
  const profiles = useProfiles();
  const friends = useFriends();
  const online = useOnlineNow();
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The ranking: XP this week, or all the XP ever earned (remembered on this device).
  const [range, setRange] = useState<'week' | 'all'>(() => {
    try {
      return localStorage.getItem('lumo.board') === 'all' ? 'all' : 'week';
    } catch {
      return 'week';
    }
  });
  const pickRange = (r: 'week' | 'all') => {
    setRange(r);
    try {
      localStorage.setItem('lumo.board', r);
    } catch {
      /* fine: it's just not remembered */
    }
  };
  const requests = useFriendRequests();
  // A request from someone I already added is just cleared.
  useEffect(() => {
    for (const r of requests) if (friends?.includes(r.id)) void answerFriendRequest(r.id, false, friends);
  }, [requests, friends]);
  const avatars = useNames((profiles ?? []).map((p) => p.id));
  const readOnly = useReadOnly();

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
  const score = (p: PublicProfile) => (range === 'all' ? (p.xp ?? 0) : weekly(p));
  const board = (profiles ?? []).filter((p) => p.id === me || myFriends.has(p.id)).sort((a, b) => score(b) - score(a));
  // On the website only friends show up (see FRIENDS_ONLY); inside a Claude page, everyone it's shared with.
  const onlineNow = online.filter((id) => byId.has(id) && (!FRIENDS_ONLY || myFriends.has(id)));
  const everyoneElse = FRIENDS_ONLY ? [] : (profiles ?? []).filter((p) => p.id !== me && !myFriends.has(p.id) && !online.includes(p.id));

  const add = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await setFriends([...myFriends, id]);
      // On the website they get a request, so they can add me back with one tap.
      void sendFriendRequest(id, user?.username ?? '');
      const coins = await friendCoins(id);
      if (coins) void refresh();
      setMsg({ ok: true, text: t(FRIENDS_ONLY ? 'together.addedSite' : 'together.added', { name: nameOf(id) }) + (coins ? ` ${t('together.friendCoins', { n: coins })}` : '') });
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

  // Requests from people I haven't added yet (one I already added is just cleared).
  const pending = requests.filter((r) => !myFriends.has(r.id));
  const answer = async (id: string, accept: boolean, name: string) => {
    setBusy(true);
    await answerFriendRequest(id, accept, [...myFriends]).catch(() => {});
    const coins = accept ? await friendCoins(id) : 0;
    if (coins) void refresh();
    if (accept) setMsg({ ok: true, text: t('together.added', { name: byId.get(id)?.username || name || t('together.someone') }) + (coins ? ` ${t('together.friendCoins', { n: coins })}` : '') });
    setBusy(false);
  };
  const invite = FRIENDS_ONLY && user ? `${location.origin}/add/${encodeURIComponent(user.username)}` : null;
  const shareInvite = async () => {
    if (!invite) return;
    const text = t('together.inviteText', { name: user?.username });
    if (navigator.share) await navigator.share({ title: 'Lumo', text, url: invite }).catch(() => {});
    else copy(invite);
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
      <h1 className="text-3xl font-black">{t('friends.title')}</h1>

      {readOnly && (
        <div role="note" className="flex items-start gap-3 rounded-3xl bg-amber-glow/15 p-4 ring-1 ring-amber-glow/60">
          <Lumo size={48} mood="thinking" />
          <div className="space-y-1.5 text-sm">
            <p className="font-black">{t('together.readOnlyTitle')}</p>
            <p>{t('together.readOnlyBody')}</p>
          </div>
        </div>
      )}

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
        {invite && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="min-w-0 flex-1 text-sm text-muted">{t('together.inviteBody')}</span>
            <button type="button" onClick={() => void shareInvite()} className="btn-gold rounded-xl px-4 py-2 text-sm font-black">
              🔗 {t('together.inviteButton')}
            </button>
          </div>
        )}
      </section>

      {pending.length > 0 && (
        <section aria-labelledby="requests-title" className="space-y-2">
          <h2 id="requests-title" className="font-black">
            🔔 {t('together.requests', { count: pending.length })}
          </h2>
          <ul className="space-y-1.5">
            {pending.map((r) => (
              <li key={r.id} className="panel flex items-center gap-3 p-2.5">
                {avatars[r.id]?.avatarUrl ? (
                  <img src={avatars[r.id]!.avatarUrl} alt="" className="size-10 rounded-full bg-surface-2" />
                ) : (
                  <span aria-hidden className="grid size-10 place-items-center rounded-full bg-surface-2 font-black">
                    {(r.name || '?')[0]!.toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-black">{byId.get(r.id)?.username || r.name || t('together.someone')}</span>
                  <span className="text-xs font-bold text-muted">{t('together.addedYou')}</span>
                </span>
                <button disabled={busy} onClick={() => void answer(r.id, true, r.name)} className="rounded-xl bg-brand px-3.5 py-1.5 text-sm font-black text-brand-ink disabled:opacity-50">
                  {t('together.accept')}
                </button>
                <button disabled={busy} onClick={() => void answer(r.id, false, r.name)} aria-label={t('together.decline', { name: r.name })} className="px-1.5 text-muted hover:text-bad">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-black">
          <span className="size-2.5 rounded-full bg-good" aria-hidden /> {t('together.onlineNow', { count: onlineNow.length })}
        </h2>
        {onlineNow.length === 0 ? (
          <p className="rounded-2xl bg-surface p-3 text-sm text-muted ring-1 ring-line">{t(FRIENDS_ONLY ? 'together.noFriendsOnline' : 'together.nobodyOnline')}</p>
        ) : (
          <ul className="space-y-1.5">
            {onlineNow.map((id) => (
              <Person key={id} id={id} dot />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-black">🏆 {t('together.leaderboard')}</h2>
          <div role="radiogroup" aria-label={t('together.leaderboard')} className="flex rounded-full bg-surface-2 p-1 text-sm font-black ring-1 ring-line" data-testid="board-range">
            {(['week', 'all'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={range === r}
                onClick={() => pickRange(r)}
                className={`rounded-full px-3 py-1 ${range === r ? 'bg-brand text-brand-ink' : 'text-muted'}`}
              >
                {t(r === 'week' ? 'together.thisWeek' : 'together.allTime')}
              </button>
            ))}
          </div>
        </div>
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
                <span className="font-black tabular-nums">{score(p).toLocaleString()} XP</span>
                {p.id !== me && (
                  <button disabled={busy} onClick={() => void remove(p.id)} aria-label={t('friends.remove', { name: nameOf(p.id) })} className="px-1 text-muted hover:text-bad">
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
        <Link to="/live" className="block rounded-2xl royal p-3.5 text-center font-black text-white">
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
      {FRIENDS_ONLY && <SharedDecks />}
      <p className="text-xs text-muted">{t(FRIENDS_ONLY ? 'together.howToInviteSite' : 'together.howToInvite')}</p>
    </div>
  );
}

/** An invite link (/add/<name>): add that friend right away, and send them a request back. */
export function LocalAddFriend() {
  const { t } = useTranslation();
  const { code } = useParams();
  const name = decodeURIComponent(code ?? '').trim();
  const { user, refresh } = useAuth();
  const together = useTogether();
  const friends = useFriends();
  const [state, setState] = useState<'working' | 'done' | 'self' | 'missing' | 'error'>('working');
  const [coins, setCoins] = useState(0);
  const ran = useRef(false);
  useEffect(() => {
    if (!together || friends === null || ran.current) return;
    ran.current = true;
    void (async () => {
      let found: PublicProfile | undefined;
      // Someone who just joined may take a moment to show up.
      for (let i = 0; !found && i < 4; i++) {
        if (i) await new Promise((r) => setTimeout(r, 1200));
        found = (await findProfiles()).find((p) => p.username?.toLowerCase() === name.toLowerCase());
      }
      if (!found) return setState('missing');
      if (found.id === together.me) return setState('self');
      if (!friends.includes(found.id)) {
        await setFriends([...friends, found.id]);
        void sendFriendRequest(found.id, user?.username ?? '');
        const got = await friendCoins(found.id);
        if (got) {
          setCoins(got);
          void refresh();
        }
      }
      setState('done');
    })().catch(() => setState('error'));
  }, [together, friends, name, user, refresh]);

  const guest = together === null;
  const text = guest
    ? t('home.guestBody')
    : state === 'working'
      ? t('together.inviteTitle')
      : state === 'done'
        ? t('together.inviteDone', { name }) + (coins ? ` ${t('together.friendCoins', { n: coins })}` : '')
        : state === 'self'
          ? t('together.inviteSelf')
          : state === 'missing'
            ? t('together.inviteNotFound', { name })
            : t('together.cantAdd');
  return (
    <div className="panel mx-auto mt-6 flex max-w-md flex-col items-center gap-4 p-8 text-center" role="status">
      <Lumo size={96} mood={state === 'done' ? 'cheer' : state === 'working' && !guest ? 'thinking' : 'happy'} />
      <p className="text-lg font-black">{text}</p>
      {guest ? (
        <button type="button" onClick={() => void import('../netlify/Gate').then((m) => m.signOut())} className="btn-gold rounded-2xl px-5 py-3 font-black">
          {t('gate.makeAccount')}
        </button>
      ) : (
        state !== 'working' && (
          <Link to="/friends" className="btn-gold rounded-2xl px-5 py-3 font-black">
            {t('friends.title')}
          </Link>
        )
      )}
    </div>
  );
}
