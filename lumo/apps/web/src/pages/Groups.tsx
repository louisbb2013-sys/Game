import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { FlameIcon } from '../components/icons';
import { Avatar } from '../components/Avatar';
import { Lumo } from '../components/Lumo';
import { QrCode, shareOrCopy } from '../components/QrCode';
import { api, ApiError } from '../lib/api';
import type { DeckListItem } from '../lib/quiz';
import type { Person } from './Friends';

interface GroupItem {
  id: string;
  name: string;
  memberCount: number;
}
interface GroupData {
  id: string;
  name: string;
  inviteCode: string;
  isOwner: boolean;
  members: (Person & { me: boolean; rank: number })[];
  decks: { id: string; title: string; subject: string; addedBy: string; conceptCount: number }[];
  daily: { deck: { id: string; title: string } | null; results: { username: string; correct: number; answered: number; me: boolean }[] };
}

const errorText = (t: TFunction, e: unknown) =>
  t(`groups.errors.${e instanceof ApiError ? e.code : 'network'}`, { defaultValue: t('signin.errors.network') });

export function Groups() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupItem[] | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ groups: GroupItem[] }>('/api/groups').then((r) => setGroups(r.groups), () => setGroups([]));
  }, []);

  const run = async (fn: () => Promise<{ id: string }>) => {
    setError(null);
    try {
      const { id } = await fn();
      navigate(`/groups/${id}`);
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  const create = (e: FormEvent) => (e.preventDefault(), void run(() => api('/api/groups', { method: 'POST', body: { name } })));
  const join = (e: FormEvent) => (e.preventDefault(), void run(() => api('/api/groups/join', { method: 'POST', body: { code } })));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('groups.title')}</h1>
      <p className="text-sm text-muted">{t('groups.intro')}</p>
      {groups === null ? (
        <p className="font-bold text-muted">{t('common.loading')}</p>
      ) : (
        groups.length > 0 && (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link to={`/groups/${g.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3.5 ring-1 ring-line">
                  <span className="text-3xl">👥</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black">{g.name}</span>
                    <span className="text-xs font-bold text-muted">{t('groups.members', { count: g.memberCount })}</span>
                  </span>
                  <span className="text-2xl text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
      <form onSubmit={create} className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <label htmlFor="group-name" className="block font-black">
          {t('groups.create')}
        </label>
        <div className="flex gap-2">
          <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t('groups.namePlaceholder')} className="min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-3 py-2 font-bold outline-none focus:border-brand" />
          <button disabled={name.trim().length < 2} className="rounded-xl bg-brand px-4 font-black text-brand-ink disabled:opacity-40">
            {t('groups.createBtn')}
          </button>
        </div>
      </form>
      <form onSubmit={join} className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <label htmlFor="group-code" className="block font-black">
          {t('groups.join')}
        </label>
        <div className="flex gap-2">
          <input id="group-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={8} placeholder="ABC123" autoComplete="off" className="min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-3 py-2 font-mono font-black tracking-widest outline-none focus:border-brand" />
          <button disabled={code.length < 4} className="rounded-xl bg-brand px-4 font-black text-brand-ink disabled:opacity-40">
            {t('groups.joinBtn')}
          </button>
        </div>
      </form>
      {error && <p className="font-bold text-bad">{error}</p>}
    </div>
  );
}

export function Group() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [g, setG] = useState<GroupData | null>(null);
  const [myDecks, setMyDecks] = useState<DeckListItem[]>([]);
  const [shareId, setShareId] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      setG(await api<GroupData>(`/api/groups/${id}`));
    } catch {
      setMissing(true);
    }
  }, [id]);
  useEffect(() => {
    void load();
    api<{ decks: DeckListItem[] }>('/api/decks').then((r) => setMyDecks(r.decks), () => {});
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: errorText(t, e) });
    }
    await load();
  };

  if (missing)
    return (
      <div className="flex flex-col items-center gap-3 pt-12 text-center">
        <Lumo size={100} mood="sad" />
        <p className="font-black">{t('groups.errors.group_not_found')}</p>
        <Link to="/groups" className="font-black text-brand">
          {t('groups.title')}
        </Link>
      </div>
    );
  if (!g) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;

  const link = `${location.origin}/groups/join/${g.inviteCode}`;
  const shareable = myDecks.filter((d) => !g.decks.some((x) => x.id === d.id));
  const myDaily = g.daily.results.find((r) => r.me);

  const playDaily = async () => {
    try {
      const res = await api<{ session: { id: string } }>(`/api/groups/${g.id}/daily`, { method: 'POST' });
      navigate(`/quiz/${res.session.id}`, { state: res });
    } catch (e) {
      setMsg({ ok: false, text: errorText(t, e) });
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-2xl font-black">{g.name}</h1>
        <button onClick={() => setShowInvite((v) => !v)} aria-expanded={showInvite} className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-sm font-black text-brand-ink">
          ➕ {t('groups.invite')}
        </button>
      </header>
      {showInvite && (
        <section className="flex flex-col items-center gap-2 rounded-3xl bg-surface p-4 text-center ring-1 ring-line">
          <p className="text-sm font-bold text-muted">{t('groups.inviteCode')}</p>
          <p className="font-mono text-3xl font-black tracking-[0.2em]" data-testid="group-code">
            {g.inviteCode}
          </p>
          <QrCode value={link} label={t('groups.qrLabel')} size={140} />
          <button onClick={() => void shareOrCopy(link, g.name).then((r) => r !== 'failed' && setMsg({ ok: true, text: t(`live.${r}`) }))} className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-black">
            🔗 {t('groups.shareLink')}
          </button>
        </section>
      )}
      {msg && (
        <p role="status" className={`text-sm font-bold ${msg.ok ? 'text-good' : 'text-bad'}`}>
          {msg.text}
        </p>
      )}

      <section className="space-y-3 rounded-3xl bg-gradient-to-br from-amber-glow/25 to-brand/15 p-4 ring-1 ring-amber-glow/40">
        <h2 className="font-black">📅 {t('groups.daily')}</h2>
        {g.daily.deck ? (
          <>
            <p className="text-sm">{t('groups.dailyBody', { deck: g.daily.deck.title })}</p>
            {myDaily ? (
              <p className="font-black text-good">✅ {t('groups.dailyDone', { correct: myDaily.correct, answered: myDaily.answered })}</p>
            ) : (
              <button onClick={() => void playDaily()} className="w-full rounded-2xl bg-brand py-3 font-black text-brand-ink">
                {t('groups.playDaily')}
              </button>
            )}
            {g.daily.results.length > 0 && (
              <ol className="space-y-1 text-sm">
                {g.daily.results.map((r, i) => (
                  <li key={r.username} className={`flex justify-between rounded-xl px-2 py-1 ${r.me ? 'bg-brand/10 font-black' : ''}`}>
                    <span>
                      {i + 1}. {r.username}
                    </span>
                    <span className="font-bold">
                      {r.correct}/{r.answered}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">{t('groups.dailyNeedsDeck')}</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-black">{t('groups.decks')}</h2>
        {g.decks.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
            <Link to={`/decks/${d.id}`} className="min-w-0 flex-1">
              <span className="block truncate font-black">{d.title}</span>
              <span className="text-xs font-bold text-muted">{t('groups.addedBy', { name: d.addedBy, count: d.conceptCount })}</span>
            </Link>
            <Link to={`/live?deck=${d.id}`} className="rounded-xl bg-surface-2 px-2.5 py-1.5 text-sm font-black" aria-label={t('groups.hostLive', { deck: d.title })}>
              ⚡ Live
            </Link>
          </div>
        ))}
        {shareable.length > 0 && (
          <div className="flex gap-2">
            <select value={shareId} onChange={(e) => setShareId(e.target.value)} aria-label={t('groups.shareDeck')} className="min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-2 py-2 font-bold">
              <option value="">{t('groups.shareDeck')}</option>
              {shareable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            <button disabled={!shareId} onClick={() => void act(() => api(`/api/groups/${g.id}/decks`, { method: 'POST', body: { deckId: shareId } })).then(() => setShareId(''))} className="rounded-xl bg-brand px-4 font-black text-brand-ink disabled:opacity-40">
              {t('groups.share')}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-black">🏆 {t('groups.board')}</h2>
        <ol className="space-y-1.5">
          {g.members.map((m) => (
            <li key={m.id} className={`flex items-center gap-2 rounded-2xl p-2.5 ring-1 ${m.me ? 'bg-brand/10 ring-brand' : 'bg-surface ring-line'}`}>
              <span className="w-6 text-center font-black">{m.rank}</span>
              <Avatar name={m.username} avatar={m.avatar} size={28} />
              <span className="min-w-0 flex-1 truncate font-black">{m.username}</span>
              <span className={`flex items-center text-xs font-bold ${m.studiedToday ? 'text-amber-glow' : 'text-muted'}`}>
                <FlameIcon size={14} />
                {m.streak}
              </span>
              <span className="font-black tabular-nums">{m.weeklyXp} XP</span>
            </li>
          ))}
        </ol>
      </section>

      <button
        onClick={() => confirm(t('groups.leaveConfirm')) && void act(() => api(`/api/groups/${g.id}/leave`, { method: 'POST' })).then(() => navigate('/groups'))}
        className="w-full rounded-2xl py-3 font-extrabold text-bad ring-1 ring-line"
      >
        {t('groups.leave')}
      </button>
    </div>
  );
}

/** /groups/join/:code — opened from an invite link or QR code. */
export function JoinGroup() {
  const { code = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api<{ id: string }>('/api/groups/join', { method: 'POST', body: { code } }).then(
      (r) => navigate(`/groups/${r.id}`, { replace: true }),
      (e) => setError(errorText(t, e)),
    );
  }, [code, navigate, t]);
  return (
    <div className="flex flex-col items-center gap-3 pt-12 text-center">
      <Lumo size={100} mood={error ? 'sad' : 'thinking'} />
      <p className="font-black">{error ?? t('common.loading')}</p>
      {error && (
        <Link to="/groups" className="font-black text-brand">
          {t('groups.title')}
        </Link>
      )}
    </div>
  );
}
