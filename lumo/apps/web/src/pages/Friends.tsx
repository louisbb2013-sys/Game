import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { FlameIcon } from '../components/icons';
import { Avatar } from '../components/Avatar';
import { Lumo } from '../components/Lumo';
import { QrCode, shareOrCopy } from '../components/QrCode';
import { api, ApiError } from '../lib/api';
import { TIER_STYLE } from '../lib/rewards';

export interface Person {
  id: string;
  username: string;
  avatar: string;
  level: { level: number };
  streak: number;
  studiedToday: boolean;
  leagueTier: string;
  weeklyXp: number;
  lastActive: string;
}
interface FriendsData {
  code: string;
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
}
type BoardRow = Person & { me: boolean; rank: number };

export function Friends() {
  const { t } = useTranslation();
  const [data, setData] = useState<FriendsData | null>(null);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    const [f, b] = await Promise.all([api<FriendsData>('/api/friends'), api<{ rows: BoardRow[] }>('/api/friends/leaderboard')]);
    setData(f);
    setBoard(b.rows);
  }, []);
  useEffect(() => void load(), [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: t(`friends.errors.${e instanceof ApiError ? e.code : 'network'}`, { defaultValue: t('signin.errors.network') }) });
    }
    await load();
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const username = name.trim();
    if (!username) return;
    void act(async () => {
      const r = await api<{ status: string }>('/api/friends/request', { method: 'POST', body: { username } });
      setName('');
      setMsg({ ok: true, text: t(r.status === 'friends' ? 'friends.nowFriends' : 'friends.requested', { name: username }) });
    });
  };

  if (!data) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;
  const link = `${location.origin}/add/${data.code}`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('friends.title')}</h1>

      <section className="space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <form onSubmit={add} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder={t('friends.usernamePlaceholder')} aria-label={t('friends.addByName')} autoComplete="off" className="min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-3 py-2 font-bold outline-none focus:border-brand" />
          <button disabled={!name.trim()} className="rounded-xl bg-brand px-4 font-black text-brand-ink disabled:opacity-40">
            {t('friends.add')}
          </button>
        </form>
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3">
          <div>
            <p className="text-xs font-bold text-muted">{t('friends.myCode')}</p>
            <p className="font-mono text-xl font-black tracking-widest" data-testid="friend-code">
              {data.code}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowQr((v) => !v)} className="rounded-xl bg-surface px-3 py-2 text-sm font-black ring-1 ring-line" aria-expanded={showQr}>
              {t('friends.qr')}
            </button>
            <button onClick={() => void shareOrCopy(link, 'Lumo').then((r) => r !== 'failed' && setMsg({ ok: true, text: t(`live.${r}`) }))} className="rounded-xl bg-surface px-3 py-2 text-sm font-black ring-1 ring-line">
              🔗 {t('friends.shareLink')}
            </button>
          </div>
        </div>
        {showQr && (
          <div className="flex flex-col items-center gap-1">
            <QrCode value={link} label={t('friends.qrLabel')} />
            <p className="text-xs text-muted">{t('friends.qrHint')}</p>
          </div>
        )}
        {msg && (
          <p role="status" className={`text-sm font-bold ${msg.ok ? 'text-good' : 'text-bad'}`}>
            {msg.text}
          </p>
        )}
      </section>

      {data.incoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-black">{t('friends.incoming')}</h2>
          {data.incoming.map((p) => (
            <PersonRow key={p.id} p={p}>
              <button onClick={() => void act(() => api(`/api/friends/${p.id}/respond`, { method: 'POST', body: { accept: true } }), t('friends.nowFriends', { name: p.username }))} className="rounded-xl bg-good px-3 py-1.5 text-sm font-black text-white">
                {t('friends.accept')}
              </button>
              <button onClick={() => void act(() => api(`/api/friends/${p.id}/respond`, { method: 'POST', body: { accept: false } }))} aria-label={t('friends.decline', { name: p.username })} className="px-2 text-muted">
                ✕
              </button>
            </PersonRow>
          ))}
        </section>
      )}

      {board.length > 1 && (
        <section className="space-y-2">
          <h2 className="font-black">🏆 {t('friends.board')}</h2>
          <ol className="space-y-1.5">
            {board.map((r) => (
              <li key={r.id} className={`flex items-center gap-2 rounded-2xl p-2.5 ring-1 ${r.me ? 'bg-brand/10 ring-brand' : 'bg-surface ring-line'}`}>
                <span className="w-6 text-center font-black">{r.rank}</span>
                <Avatar name={r.username} avatar={r.avatar} size={28} />
                <span className="min-w-0 flex-1 truncate font-black">{r.me ? t('friends.you') : r.username}</span>
                <span className="font-black tabular-nums">{r.weeklyXp} XP</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-black">{t('friends.list', { n: data.friends.length })}</h2>
        {data.friends.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <Lumo size={56} mood="thinking" />
            <p className="text-sm text-muted">{t('friends.empty')}</p>
          </div>
        ) : (
          data.friends.map((p) => (
            <PersonRow key={p.id} p={p} detail>
              <button onClick={() => confirm(t('friends.removeConfirm', { name: p.username })) && void act(() => api(`/api/friends/${p.id}`, { method: 'DELETE' }))} aria-label={t('friends.remove', { name: p.username })} className="px-2 text-muted hover:text-bad">
                ✕
              </button>
            </PersonRow>
          ))
        )}
        {data.outgoing.length > 0 && <p className="text-xs text-muted">{t('friends.pending', { names: data.outgoing.map((p) => p.username).join(', ') })}</p>}
      </section>
    </div>
  );
}

function PersonRow({ p, detail, children }: { p: Person; detail?: boolean; children?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
      <Avatar name={p.username} avatar={p.avatar} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-black">{p.username}</span>
        <span className="flex items-center gap-2 text-xs font-bold text-muted">
          {t('home.level', { level: p.level.level })}
          {detail && (
            <>
              <span className={`flex items-center ${p.studiedToday ? 'text-amber-glow' : ''}`} title={t('stats.streak')}>
                <FlameIcon size={14} />
                {p.streak}
              </span>
              <span>
                {TIER_STYLE[p.leagueTier]?.emoji} {p.studiedToday ? t('friends.studiedToday') : t('friends.lastActive', { date: p.lastActive })}
              </span>
            </>
          )}
        </span>
      </span>
      {children}
    </div>
  );
}

/** /add/:code — opened from a friend's link or QR code. */
export function AddFriend() {
  const { code = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [text, setText] = useState('');
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api<{ status: string }>('/api/friends/request', { method: 'POST', body: { code } }).then(
      (r) => {
        setState('done');
        setText(t(r.status === 'friends' ? 'friends.linkFriends' : 'friends.linkRequested'));
      },
      (e) => {
        setState('error');
        setText(t(`friends.errors.${e instanceof ApiError ? e.code : 'network'}`, { defaultValue: t('signin.errors.network') }));
      },
    );
  }, [code, t]);

  return (
    <div className="flex flex-col items-center gap-4 pt-12 text-center">
      <Lumo size={110} mood={state === 'error' ? 'sad' : state === 'done' ? 'cheer' : 'thinking'} />
      <p className="text-lg font-black" role="status">
        {state === 'working' ? t('common.loading') : text}
      </p>
      {state !== 'working' && (
        <button onClick={() => navigate('/friends')} className="rounded-2xl bg-brand px-6 py-3 font-black text-brand-ink">
          {t('friends.title')}
        </button>
      )}
      <Link to="/" className="text-sm font-bold text-muted">
        {t('nav.home')}
      </Link>
    </div>
  );
}
