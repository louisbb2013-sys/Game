import type { TFunction } from 'i18next';
import { durationFor, type Answer } from '@lumo/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CoinIcon } from '../components/icons';
import { Avatar } from '../components/Avatar';
import { Lumo } from '../components/Lumo';
import { QrCode, shareOrCopy } from '../components/QrCode';
import { isReady, QuestionInput } from '../components/quiz/inputs';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useConfetti } from '../lib/confetti';
import { liveCall, useLiveRoom, type LivePublic } from '../lib/live';
import type { DeckListItem } from '../lib/quiz';
import { useRewards } from '../lib/rewards';
import { play, setSoundEnabled } from '../lib/sound';

const errText = (t: TFunction, code: string) => t(`live.errors.${code}`, { defaultValue: t('signin.errors.network') });

/** Live tab: join with a code, host a game from a deck, and shortcuts to friends and groups. */
export function LiveHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState('');
  const [decks, setDecks] = useState<DeckListItem[] | null>(null);
  const [deckId, setDeckId] = useState(params.get('deck') ?? '');
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ decks: DeckListItem[] }>('/api/decks').then(
      (r) => {
        setDecks(r.decks);
        setDeckId((d) => d || r.decks[0]?.id || '');
      },
      () => setDecks([]),
    );
  }, []);

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length >= 4) navigate(`/live/${c}`);
  };

  const host = async () => {
    setBusy(true);
    setError(null);
    const r = await liveCall<{ code: string }>('live:create', { deckId, count });
    setBusy(false);
    if (r.ok) navigate(`/live/${r.code}`);
    else setError(r.error);
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('live.title')}</h1>

      <form onSubmit={join} className="space-y-3 rounded-3xl bg-gradient-to-br from-indigo-700 to-violet-600 p-5 text-white">
        <h2 className="text-lg font-black">{t('live.joinTitle')}</h2>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={8}
            placeholder="ABC123"
            aria-label={t('live.codeLabel')}
            autoCapitalize="characters"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-center text-2xl font-black tracking-[0.3em] text-night outline-none placeholder:text-slate-300"
          />
          <button disabled={code.length < 4} className="rounded-2xl bg-amber-glow px-5 font-black text-night disabled:opacity-50">
            {t('live.join')}
          </button>
        </div>
      </form>

      <section className="space-y-3 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 className="text-lg font-black">{t('live.hostTitle')}</h2>
        <p className="text-sm text-muted">{t('live.hostBody')}</p>
        {decks === null ? (
          <p className="font-bold text-muted">{t('common.loading')}</p>
        ) : decks.length === 0 && !deckId ? (
          <Link to="/learn" className="block rounded-2xl bg-surface-2 p-3 text-center font-black">
            {t('live.needDeck')}
          </Link>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-bold">{t('live.deck')}</span>
              <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="w-full rounded-2xl border-2 border-line bg-bg px-3 py-3 font-bold">
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
                {deckId && !decks.some((d) => d.id === deckId) && <option value={deckId}>{t('live.sharedDeck')}</option>}
              </select>
            </label>
            <fieldset>
              <legend className="mb-1 text-sm font-bold">{t('live.questions')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 15].map((n) => (
                  <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)} className={`rounded-xl py-2 font-black ring-2 ${count === n ? 'bg-brand/10 ring-brand' : 'ring-line'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </fieldset>
            {error && <p className="font-bold text-bad">{errText(t, error)}</p>}
            <button onClick={() => void host()} disabled={busy || !deckId} className="w-full rounded-2xl bg-brand py-3.5 text-lg font-black text-brand-ink disabled:opacity-50">
              {busy ? t('live.creating') : `⚡ ${t('live.host')}`}
            </button>
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/friends" className="rounded-3xl bg-surface p-4 text-center ring-1 ring-line">
          <span className="block text-3xl">👋</span>
          <span className="font-black">{t('friends.title')}</span>
        </Link>
        <Link to="/groups" className="rounded-3xl bg-surface p-4 text-center ring-1 ring-line">
          <span className="block text-3xl">👥</span>
          <span className="font-black">{t('groups.title')}</span>
        </Link>
      </div>
    </div>
  );
}

/** A game room: lobby → questions → reveal → podium. */
export function LiveRoom() {
  const { code = '' } = useParams();
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const room = useLiveRoom(code.toUpperCase());
  const showRewards = useRewards();
  const shown = useRef(false);

  useEffect(() => setSoundEnabled(user?.settings.sound ?? true), [user?.settings.sound]);
  useEffect(() => {
    if (!room.reward || shown.current) return;
    shown.current = true;
    showRewards(room.reward.rewards);
    void refresh();
  }, [room.reward, showRewards, refresh]);

  if (room.status === 'error' || room.status === 'closed' || room.status === 'kicked') {
    const msg = room.status === 'error' ? errText(t, room.error ?? 'network') : t(`live.${room.status}`);
    return (
      <div className="flex flex-col items-center gap-4 pt-12 text-center">
        <Lumo size={110} mood="sad" />
        <p className="text-lg font-black">{msg}</p>
        <Link to="/live" className="rounded-2xl bg-brand px-6 py-3 font-black text-brand-ink">
          {t('live.back')}
        </Link>
      </div>
    );
  }
  const s = room.state;
  if (!s || !room.me) return <p className="pt-10 text-center font-bold text-muted">{t('live.connecting')}</p>;
  const isHost = s.hostId === room.me;

  return (
    <div className="space-y-4">
      {!room.connected && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">{t('live.reconnecting')}</p>}
      {s.phase === 'lobby' && <Lobby s={s} isHost={isHost} send={room.send} />}
      {s.phase === 'question' && <QuestionView s={s} me={room.me} answer={room.answer} />}
      {s.phase === 'reveal' && <RevealView s={s} me={room.me} isHost={isHost} send={room.send} />}
      {s.phase === 'podium' && <Podium s={s} me={room.me} reward={room.reward} />}
    </div>
  );
}

type Send = ReturnType<typeof useLiveRoom>['send'];

function Lobby({ s, isHost, send }: { s: LivePublic; isHost: boolean; send: Send }) {
  const { t } = useTranslation();
  const [msg, setMsg] = useState<string | null>(null);
  const link = `${location.origin}/live/${s.code}`;
  const online = s.players.filter((p) => p.connected);

  const start = async () => {
    const r = await send('live:start');
    if (!r.ok) setMsg(errText(t, r.error));
  };

  return (
    <>
      <section className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-indigo-700 to-violet-600 p-5 text-center text-white">
        <p className="text-sm font-bold opacity-80">{s.title}</p>
        <p className="text-sm font-bold">{t('live.gameCode')}</p>
        <p className="font-mono text-5xl font-black tracking-[0.2em]" data-testid="live-code">
          {s.code}
        </p>
        <QrCode value={link} label={t('live.qrLabel', { code: s.code })} size={150} />
        <button
          onClick={() => void shareOrCopy(link, s.title).then((r) => setMsg(r === 'failed' ? null : t(`live.${r}`)))}
          className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-black"
        >
          🔗 {t('live.shareLink')}
        </button>
      </section>
      <section>
        <h2 className="mb-2 font-black">{t('live.players', { n: online.length })}</h2>
        <ul className="grid grid-cols-2 gap-2">
          {s.players.map((p) => (
            <li key={p.id} className={`pop-in flex items-center gap-2 rounded-2xl bg-surface p-2.5 ring-1 ring-line ${p.connected ? '' : 'opacity-50'}`}>
              <Avatar name={p.name} avatar={p.avatar} size={32} />
              <span className="min-w-0 flex-1 truncate font-black">{p.name}</span>
              {p.id === s.hostId ? (
                <span className="text-xs font-black text-brand">{t('live.hostTag')}</span>
              ) : (
                isHost && (
                  <button onClick={() => void send('live:kick', { playerId: p.id })} aria-label={t('live.kick', { name: p.name })} className="px-1 text-muted hover:text-bad">
                    ✕
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      </section>
      {msg && <p role="status" className="text-center font-bold text-muted">{msg}</p>}
      {isHost ? (
        <button onClick={() => void start()} disabled={online.length < 2} className="w-full rounded-2xl bg-brand py-4 text-lg font-black text-brand-ink disabled:opacity-40">
          {online.length < 2 ? t('live.waitingPlayers') : t('live.start', { n: online.length })}
        </button>
      ) : (
        <div className="flex items-center justify-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <Lumo size={48} mood="happy" />
          <p className="font-black">{t('live.waitingHost')}</p>
        </div>
      )}
    </>
  );
}

function useCountdown(s: LivePublic) {
  // Correct for the difference between this device's clock and the server's.
  const offset = useRef(0);
  useEffect(() => {
    offset.current = s.serverNow - Date.now();
  }, [s.serverNow]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  const total = s.question ? durationFor(s.question.format) : 1;
  const left = s.endsAt ? Math.max(0, s.endsAt - (now + offset.current)) : 0;
  return { left, fraction: left / total };
}

function QuestionView({ s, me, answer }: { s: LivePublic; me: string; answer: (questionId: string, a: Answer) => Promise<{ ok: boolean; error?: string }> }) {
  const { t } = useTranslation();
  const q = s.question!;
  const [value, setValue] = useState<Answer | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { left, fraction } = useCountdown(s);
  const meAnswered = sent || !!s.players.find((p) => p.id === me)?.answered;

  useEffect(() => {
    setValue(null);
    setSent(false);
    setError(null);
  }, [q.id]);

  const submit = async () => {
    if (!value || meAnswered) return;
    setSent(true);
    const r = await answer(q.id, value);
    if (!r.ok && r.error !== 'already_answered') {
      setSent(false);
      setError(r.error ?? 'network');
    } else play('correct');
  };

  const secs = Math.ceil(left / 1000);
  return (
    <section key={q.id} className="pb-28" data-format={q.format}>
      <div className="mb-3 flex items-center justify-between text-sm font-black">
        <span>{t('live.questionOf', { n: s.index + 1, total: s.total })}</span>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">{t(`formats.${q.format}`)}</span>
        <span className={`tabular-nums ${secs <= 5 ? 'text-bad' : ''}`} aria-live="off">
          ⏱ {secs}s
        </span>
      </div>
      <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={t('live.timeLeft')} aria-valuenow={secs}>
        <div className={`h-full rounded-full transition-[width] duration-200 ${fraction < 0.25 ? 'bg-bad' : 'bg-amber-glow'}`} style={{ width: `${fraction * 100}%` }} />
      </div>
      <h1 className="pop-in mb-5 rounded-2xl bg-surface p-3.5 text-lg leading-snug font-extrabold whitespace-pre-line ring-1 ring-line">{q.prompt}</h1>
      <fieldset disabled={meAnswered || left === 0} className="min-w-0">
        <QuestionInput q={q} value={value} onChange={setValue} onSubmit={() => void submit()} reveal={null} />
      </fieldset>
      {error && <p className="mt-3 font-bold text-bad">{errText(t, error)}</p>}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t border-line bg-bg/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur">
        {meAnswered ? (
          <p className="py-3 text-center font-black" role="status">
            ✅ {t('live.locked', { n: s.answeredCount, total: s.players.filter((p) => p.connected).length })}
          </p>
        ) : (
          <button onClick={() => void submit()} disabled={!isReady(q, value) || left === 0} className="w-full rounded-2xl bg-brand py-4 text-lg font-black text-brand-ink disabled:opacity-40">
            {t('live.lockIn')}
          </button>
        )}
      </div>
    </section>
  );
}

function RevealView({ s, me, isHost, send }: { s: LivePublic; me: string; isHost: boolean; send: Send }) {
  const { t } = useTranslation();
  const r = s.reveal!;
  const mine = r.results[me];
  useEffect(() => play(mine?.correct ? 'correct' : 'wrong'), [mine?.correct, s.index]);
  const ranked = s.players.slice().sort((a, b) => a.rank - b.rank);
  const last = s.index + 1 >= s.total;

  return (
    <section className="space-y-4 pb-28">
      <div className={`pop-in flex items-center gap-3 rounded-3xl p-4 ${mine?.correct ? 'bg-good/15 ring-2 ring-good' : 'bg-bad/10 ring-2 ring-bad/50'}`}>
        <Lumo size={60} mood={mine?.correct ? 'happy' : 'sad'} />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-black">{mine?.correct ? t('live.correct') : mine && mine.score > 0 ? t('live.partly') : t('live.wrong')}</p>
          <p className="font-black text-brand">+{mine?.points ?? 0}</p>
          {mine && mine.streak >= 2 && <p className="text-sm font-bold">🔥 {t('live.streak', { n: mine.streak })}</p>}
        </div>
      </div>
      <div className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
        <p className="text-xs font-black text-muted uppercase">{t('live.answerWas')}</p>
        <p className="font-black whitespace-pre-line">{r.correctAnswer}</p>
        {r.explanation && <p className="mt-1 text-sm text-muted">{r.explanation}</p>}
      </div>
      <Board players={ranked.slice(0, 5)} me={me} showMoves />
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t border-line bg-bg/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur">
        {isHost ? (
          <button onClick={() => void send('live:next')} className="w-full rounded-2xl bg-brand py-4 text-lg font-black text-brand-ink">
            {last ? t('live.showPodium') : t('live.next')}
          </button>
        ) : (
          <p className="py-3 text-center font-black text-muted">{t('live.waitingNext')}</p>
        )}
      </div>
    </section>
  );
}

function Board({ players, me, showMoves }: { players: LivePublic['players']; me: string; showMoves?: boolean }) {
  const { t } = useTranslation();
  return (
    <ol className="space-y-1.5" aria-label={t('live.leaderboard')}>
      {players.map((p) => {
        const moved = showMoves && p.previousRank ? p.previousRank - p.rank : 0;
        return (
          <li key={p.id} className={`flex items-center gap-2 rounded-2xl p-2.5 ring-1 ${p.id === me ? 'bg-brand/10 ring-brand' : 'bg-surface ring-line'}`}>
            <span className="w-6 text-center font-black">{p.rank}</span>
            <Avatar name={p.name} avatar={p.avatar} size={28} />
            <span className="min-w-0 flex-1 truncate font-black">{p.name}</span>
            {moved > 0 && <span className="text-xs font-black text-good">▲{moved}</span>}
            <span className="font-black tabular-nums">{p.score}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Podium({ s, me, reward }: { s: LivePublic; me: string; reward: ReturnType<typeof useLiveRoom>['reward'] }) {
  const { t } = useTranslation();
  const ranked = s.players.slice().sort((a, b) => a.rank - b.rank);
  const myRank = ranked.find((p) => p.id === me)?.rank ?? 0;
  useConfetti(true);
  useEffect(() => play('finish'), []);
  const top = [ranked[1], ranked[0], ranked[2]];
  const heights = ['h-20', 'h-28', 'h-14'];
  const medals = ['🥈', '🥇', '🥉'];

  return (
    <section className="space-y-5">
      <h1 className="text-center text-2xl font-black">{myRank === 1 ? t('live.youWon') : t('live.podiumTitle')}</h1>
      <div className="flex items-end justify-center gap-2" aria-label={t('live.podiumTitle')}>
        {top.map((p, i) =>
          p ? (
            <div key={p.id} className="pop-in flex w-24 flex-col items-center gap-1" style={{ animationDelay: `${[0.3, 0.6, 0][i]}s` }}>
              <Avatar name={p.name} avatar={p.avatar} size={44} />
              <span className="w-full truncate text-center text-sm font-black">{p.name}</span>
              <span className="text-xs font-bold text-muted">{p.score}</span>
              <div className={`grid w-full place-items-start justify-center rounded-t-2xl pt-1 text-3xl ${heights[i]} ${i === 1 ? 'bg-amber-glow' : 'bg-brand/30'}`}>{medals[i]}</div>
            </div>
          ) : (
            <div key={i} className="w-24" />
          ),
        )}
      </div>
      {reward ? (
        <div className="flex items-center justify-center gap-4 rounded-3xl bg-surface p-4 text-lg font-black ring-1 ring-line" role="status">
          <span>{t('live.yourRank', { n: reward.rank })}</span>
          <span className="text-brand">+{reward.xp} XP</span>
          <span className="flex items-center gap-1">
            <CoinIcon size={22} />+{reward.coins}
          </span>
        </div>
      ) : (
        <p className="text-center font-bold text-muted">{t('common.loading')}</p>
      )}
      <Board players={ranked} me={me} />
      <Link to="/live" className="block w-full rounded-2xl bg-brand py-4 text-center text-lg font-black text-brand-ink">
        {t('live.playAgain')}
      </Link>
    </section>
  );
}
