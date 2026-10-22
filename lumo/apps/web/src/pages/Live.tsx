import type { TFunction } from 'i18next';
import { BET_STAKES, durationFor, type Answer, type LiveBet } from '@lumo/core';
import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CoinIcon } from '../components/icons';
import { Avatar } from '../components/Avatar';
import { Lumo } from '../components/Lumo';
import { QrCode, shareOrCopy } from '../components/QrCode';
import { isReady, QuestionInput } from '../components/quiz/inputs';
import { ChoiceTiles } from '../components/play/answers';
import { api, LOCAL } from '../lib/api';
import { hostLocalGame, liveNow, REACTIONS, useLocalLiveRoom, useOpenGames, type LiveReaction } from '../local/liveLocal';
import { canAskClaude } from '../local/reader';
import { writeQuestions } from '../local/writer';
import { READY_TO_PLAY, WritingScreen } from '../components/play/Writing';
import { FRIENDS_ONLY, useFriends, useNames, useOnlineNow, useTogether } from '../local/together';
import { useAuth } from '../lib/auth';
import { useConfetti } from '../lib/confetti';
import { liveCall, useLiveRoom, type LivePublic } from '../lib/live';
import type { DeckListItem } from '../lib/quiz';
import { useRewards } from '../lib/rewards';
import { play, setMusicEnabled, setSoundEnabled, startMusic, stopMusic } from '../lib/sound';

/** Send a reaction (website and Claude page); absent in the server version. */
const ReactCtx = createContext<((e: string) => void) | null>(null);

const errText = (t: TFunction, code: string) => t(`live.errors.${code}`, { defaultValue: t('signin.errors.network') });

/** Live tab: join with a code, host a game from a deck, and shortcuts to friends and groups. */
/** How many questions a Live game can have. */
const LIVE_COUNTS = [5, 10, 20, 50, 100];

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
  const together = useTogether();

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

  const [writing, setWriting] = useState(false);
  const host = async (skipWriting = false) => {
    setBusy(true);
    setError(null);
    if (LOCAL) {
      try {
        // No test questions yet: Claude writes them first (everyone plays the good ones).
        if (!skipWriting && (await canAskClaude())) {
          const d = await api<{ bankSize?: number }>(`/api/decks/${deckId}`);
          if ((d.bankSize ?? 0) < READY_TO_PLAY) {
            void writeQuestions(deckId);
            setWriting(true);
            setBusy(false);
            return;
          }
        }
        navigate(`/live/${await hostLocalGame(deckId, count)}`);
      } catch (e) {
        setError((e as { code?: string }).code ?? 'network');
      }
      setBusy(false);
      return;
    }
    const r = await liveCall<{ code: string }>('live:create', { deckId, count });
    setBusy(false);
    if (r.ok) navigate(`/live/${r.code}`);
    else setError(r.error);
  };

  if (LOCAL && together === null) return <PlayTogetherHelp />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('live.title')}</h1>

      <form onSubmit={join} className="space-y-3 rounded-3xl royal p-5 text-white">
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

      {LOCAL && <OpenGames />}

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
              <div className="grid grid-cols-5 gap-2">
                {LIVE_COUNTS.map((n) => (
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
        {LOCAL ? (
          <Link to="/learn" className="rounded-3xl bg-surface p-4 text-center ring-1 ring-line">
            <span className="block text-3xl">📚</span>
            <span className="font-black">{t('together.sharedDecks')}</span>
          </Link>
        ) : (
          <Link to="/groups" className="rounded-3xl bg-surface p-4 text-center ring-1 ring-line">
            <span className="block text-3xl">👥</span>
            <span className="font-black">{t('groups.title')}</span>
          </Link>
        )}
      </div>
      {writing && (
        <WritingScreen
          deckId={deckId}
          bank={0}
          onClose={() => setWriting(false)}
          onPlay={() => {
            setWriting(false);
            void host(true);
          }}
          onBasic={() => {
            setWriting(false);
            void host(true);
          }}
        />
      )}
    </div>
  );
}

// The browser-only build runs games in the host's page (see local/liveLocal); the shape is the same.
const useRoom = LOCAL ? useLocalLiveRoom : useLiveRoom;

/** Shown in the browser-only build when the page can't share data (not opened in Claude, or not shared). */
function PlayTogetherHelp() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">{t('live.title')}</h1>
      <div className="flex items-start gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
        <Lumo size={56} mood="thinking" />
        <div className="space-y-2 text-sm">
          <p className="font-black">{t('together.helpTitle')}</p>
          <p>{t('together.helpBody')}</p>
        </div>
      </div>
    </div>
  );
}

/** Games friends are hosting right now (browser-only build). */
function OpenGames() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const games = useOpenGames();
  const names = useNames((games ?? []).map((g) => g.hostId));
  if (!games || games.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-black">🎮 {t('together.openGames')}</h2>
      {games.map((g) => (
        <button key={g.code} onClick={() => navigate(`/live/${g.code}`)} className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left ring-1 ring-line">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-black">{g.title}</span>
            <span className="text-xs font-bold text-muted">{t('together.hostedBy', { name: names[g.hostId]?.name || t('together.someone'), count: g.players })}</span>
          </span>
          <span className="rounded-xl bg-brand px-3 py-1.5 text-sm font-black text-brand-ink">{t('live.join')}</span>
        </button>
      ))}
    </section>
  );
}

/** A game room: lobby → questions → reveal → podium. */
export function LiveRoom() {
  const { code = '' } = useParams();
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const room = useRoom(code.toUpperCase());
  const showRewards = useRewards();
  const shown = useRef(false);
  // What I tapped on each question, to show it on the answer screen.
  const picks = useRef<Record<string, string>>({});
  const bet = (room as { bet?: BetFn }).bet; // the server version has no bets

  useEffect(() => setSoundEnabled(user?.settings.sound ?? true), [user?.settings.sound]);
  useEffect(() => setMusicEnabled(user?.settings.music ?? true), [user?.settings.music]);
  // Game music while questions are on; quiet in the lobby and on the podium.
  const phase = room.state?.phase;
  useEffect(() => {
    if (phase === 'question' || phase === 'reveal') startMusic('speed');
    else stopMusic();
  }, [phase]);
  useEffect(() => () => stopMusic(), []);
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
  // Reactions (website and Claude page): anyone can send one; it floats up on every screen.
  const fun = room as { react?: (e: string) => void; reactions?: LiveReaction[]; reactionDone?: (key: string) => void };

  return (
    <ReactCtx.Provider value={fun.react ?? null}>
    <div className="space-y-4">
      {!room.connected && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">{t('live.reconnecting')}</p>}
      {s.phase === 'lobby' && <Lobby s={s} isHost={isHost} send={room.send} />}
      {s.phase === 'question' && <QuestionView s={s} me={room.me} answer={room.answer} bet={bet} onPick={(qid, id) => (picks.current[qid] = id)} />}
      {s.phase === 'reveal' && <RevealView s={s} me={room.me} isHost={isHost} send={room.send} picked={s.question ? picks.current[s.question.id] : undefined} />}
      {s.phase === 'podium' && <Podium s={s} me={room.me} reward={room.reward} />}
      {fun.reactions && fun.reactionDone && <FloatingReactions list={fun.reactions} players={s.players} me={room.me} done={fun.reactionDone} />}
    </div>
    </ReactCtx.Provider>
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
      <section className="flex flex-col items-center gap-3 rounded-3xl royal p-5 text-center text-white">
        <p className="text-sm font-bold opacity-80">{s.title}</p>
        <p className="text-sm font-bold">{t('live.gameCode')}</p>
        <p className="font-mono text-5xl font-black tracking-[0.2em]" data-testid="live-code">
          {s.code}
        </p>
        {LOCAL ? (
          <p className="text-sm font-bold opacity-90">{t('together.joinHint')}</p>
        ) : (
          <>
            <QrCode value={link} label={t('live.qrLabel', { code: s.code })} size={150} />
            <button
              onClick={() => void shareOrCopy(link, s.title).then((r) => setMsg(r === 'failed' ? null : t(`live.${r}`)))}
              className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-black"
            >
              🔗 {t('live.shareLink')}
            </button>
          </>
        )}
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
      <ReactionBar />
      {isHost && LOCAL && <InviteFriends s={s} send={send} />}
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

/** Host, website/Claude page: invite friends in one tap; they get a pop-up and join without a code. */
function InviteFriends({ s, send }: { s: LivePublic; send: Send }) {
  const { t } = useTranslation();
  const friends = useFriends();
  const online = new Set(useOnlineNow());
  const ids = (friends ?? []).filter((id) => !s.players.some((p) => p.id === id));
  const names = useNames(ids);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  if (!FRIENDS_ONLY && ids.length === 0) return null;
  const sorted = ids.slice().sort((a, b) => Number(online.has(b)) - Number(online.has(a)));
  const invite = (list: string[]) => {
    void send('live:invite', { ids: list });
    setInvited((x) => new Set([...x, ...list]));
    play('tap');
  };
  return (
    <section className="space-y-2 rounded-3xl bg-surface p-4 ring-1 ring-line" aria-labelledby="invite-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="invite-title" className="font-black">
          📨 {t('live.inviteTitle')}
        </h2>
        {sorted.some((id) => online.has(id) && !invited.has(id)) && (
          <button type="button" onClick={() => invite(sorted.filter((id) => online.has(id)))} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-black text-brand-ink">
            {t('live.inviteAllOnline')}
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">
          {t('live.noFriendsToInvite')}{' '}
          <Link to="/friends" className="font-black text-brand">
            {t('friends.title')}
          </Link>
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((id) => (
            <li key={id} className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2">
              <Avatar name={names[id]?.name || '?'} avatar="firefly-amber" size={30} />
              <span className="min-w-0 flex-1 truncate font-black">{names[id]?.name || t('together.someone')}</span>
              {online.has(id) && <span className="text-xs font-black text-good">● {t('together.online')}</span>}
              <button
                type="button"
                disabled={invited.has(id)}
                onClick={() => invite([id])}
                className="rounded-xl bg-brand px-3 py-1.5 text-sm font-black text-brand-ink disabled:bg-good/20 disabled:text-good"
                data-testid={`invite-${id}`}
              >
                {invited.has(id) ? `✓ ${t('live.invited')}` : t('live.invite')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t('live.inviteHint')}</p>
    </section>
  );
}

/** "Now" on the game's clock, ticking: everyone's screen counts down to the same moments. */
function useGameNow(s: LivePublic, ms = 100) {
  // The website and Claude page share one clock; the server version corrects for this device's clock.
  const offset = useRef(0);
  useEffect(() => {
    if (!LOCAL) offset.current = s.serverNow - Date.now();
  }, [s.serverNow]);
  const read = () => (LOCAL ? liveNow() : Date.now() + offset.current);
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setNow(read()), ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return now;
}

function useCountdown(s: LivePublic) {
  const now = useGameNow(s);
  const total = s.question ? durationFor(s.question.format) : 1;
  const left = s.endsAt ? Math.max(0, s.endsAt - now) : 0;
  return { left, fraction: Math.min(1, left / total), now };
}

type BetFn = (questionId: string, b: LiveBet) => Promise<{ ok: boolean; error?: string }>;

function QuestionView({ s, me, answer, bet, onPick }: { s: LivePublic; me: string; answer: (questionId: string, a: Answer) => Promise<{ ok: boolean; error?: string }>; bet?: BetFn; onPick: (questionId: string, optionId: string) => void }) {
  const { t } = useTranslation();
  const q = s.question!;
  const [value, setValue] = useState<Answer | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { left, fraction, now } = useCountdown(s);
  const meAnswered = sent || !!s.players.find((p) => p.id === me)?.answered;
  const oneTap = q.format === 'multiple_choice' || q.format === 'true_false' || q.format === 'cause_effect';
  const secsLeft = Math.ceil(left / 1000);
  // The last seconds tick (everyone hears them at the same time).
  useEffect(() => {
    if (secsLeft > 0 && secsLeft <= 5 && (!s.startsAt || now >= s.startsAt)) play('tick');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secsLeft]);
  const online = s.players.filter((p) => p.connected);
  const everyone = online.length > 0 && online.every((p) => p.answered);
  const started = !s.startsAt || now >= s.startsAt;
  useEffect(() => {
    if (started && s.startsAt) play('go'); // the question appears for everyone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  useEffect(() => {
    setValue(null);
    setSent(false);
    setError(null);
  }, [q.id]);

  const submit = async (override?: Answer) => {
    const v = override ?? value;
    if (!v || meAnswered) return;
    setSent(true);
    const r = await answer(q.id, v);
    if (!r.ok && r.error !== 'already_answered') {
      setSent(false);
      setError(r.error ?? 'network');
    } else play('correct');
  };

  const secs = secsLeft;
  // A 3-2-1 first: the question appears on every screen at the same moment.
  if (s.startsAt && now < s.startsAt) return <GetReady s={s} msLeft={s.startsAt - now} />;
  return (
    <section key={q.id} className="pb-28" data-format={q.format}>
      <PlayersStrip s={s} me={me} />
      {(left === 0 || everyone) && (
        <p className="time-up pop-in mb-3 rounded-2xl px-4 py-2.5 text-center text-lg font-black text-white" role="status" data-testid="live-time-up">
          {left === 0 ? `⏰ ${t('live.timeUp')}` : `🙌 ${t('live.everyoneAnswered')}`}
        </p>
      )}
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
      {q.context && (
        <figure className="doc mb-3 max-h-[30dvh] overflow-y-auto p-3.5">
          <figcaption className="mb-1 text-xs font-black tracking-wide text-amber-700 uppercase">📄 {t('play.document')}</figcaption>
          <p className="leading-relaxed whitespace-pre-line">{q.context}</p>
        </figure>
      )}
      <h1 className="pop-in mb-5 rounded-2xl bg-surface p-3.5 text-lg leading-snug font-extrabold whitespace-pre-line ring-1 ring-line">{q.prompt}</h1>
      {oneTap ? (
        // Like Kahoot: tap a colour and it's your answer.
        <ChoiceTiles
          q={q}
          chosen={value?.kind === 'choice' ? value.optionId : null}
          reveal={null}
          removed={[]}
          locked={meAnswered || left === 0}
          onPick={(id) => {
            const a: Answer = { kind: 'choice', optionId: id };
            setValue(a);
            onPick(q.id, id);
            void submit(a);
          }}
        />
      ) : (
        <fieldset disabled={meAnswered || left === 0} className="min-w-0">
          <QuestionInput q={q} value={value} onChange={setValue} onSubmit={() => void submit()} reveal={null} />
        </fieldset>
      )}
      {error && <p className="mt-3 font-bold text-bad">{errText(t, error)}</p>}
      {meAnswered && (
        <div className="mt-4">
          <ReactionBar />
        </div>
      )}
      {bet && left > 0 && <BetPanel s={s} me={me} bet={bet} />}
      <div className={`fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t border-line bg-bg/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur lg:max-w-3xl ${oneTap && !meAnswered ? 'hidden' : ''}`}>
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

/** Bet XP that another player gets this question right or wrong (a good call wins it, a bad one loses it). */
function BetPanel({ s, me, bet }: { s: LivePublic; me: string; bet: BetFn }) {
  const { t } = useTranslation();
  const q = s.question!;
  const others = s.players.filter((p) => p.id !== me && p.connected);
  const mineNow = s.bets.find((b) => b.by === me);
  const onMe = s.bets.filter((b) => b.on === me);
  const [on, setOn] = useState(others[0]?.id ?? '');
  const [stake, setStake] = useState<number>(BET_STAKES[0]);
  const [sent, setSent] = useState<LiveBet | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSent(null);
    setError(null);
  }, [q.id]);
  if (others.length === 0) return null;
  const placed = mineNow ?? sent;
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? '?';
  const place = async (right: boolean) => {
    const b = { on: on || others[0]!.id, right, stake };
    setSent(b);
    const r = await bet(q.id, b);
    if (!r.ok) {
      setSent(null);
      setError(r.error ?? 'network');
    } else play('tap');
  };
  return (
    <section className="mt-4 space-y-2 rounded-3xl bg-surface p-3.5 ring-1 ring-amber-glow/40" aria-labelledby="bet-title" data-testid="bet-panel">
      <h2 id="bet-title" className="font-black">
        🎲 {t('live.betTitle')}
      </h2>
      {placed ? (
        <p className="rounded-2xl bg-amber-glow/15 px-3 py-2 font-black" role="status">
          {t(placed.right ? 'live.betPlacedRight' : 'live.betPlacedWrong', { name: name(placed.on), xp: placed.stake })}
        </p>
      ) : (
        <>
          {others.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('live.betOn')}>
              {others.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={on === p.id} onClick={() => setOn(p.id)} className={`rounded-full px-3 py-1 text-sm font-black ring-1 ${on === p.id ? 'bg-brand text-brand-ink ring-brand' : 'bg-surface-2 ring-line'}`}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t('live.betStake')}>
            {BET_STAKES.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={stake === n} onClick={() => setStake(n)} className={`flex-1 rounded-xl py-1.5 text-sm font-black ring-1 ${stake === n ? 'bg-amber-glow text-night ring-amber-glow' : 'bg-surface-2 ring-line'}`}>
                {n} XP
              </button>
            ))}
          </div>
          <p className="text-sm font-bold text-muted">{t('live.betQuestion', { name: name(on || others[0]!.id) })}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void place(true)} className="rounded-2xl bg-good py-3 font-black text-night">
              ✓ {t('live.betRight')}
            </button>
            <button type="button" onClick={() => void place(false)} className="rounded-2xl bg-bad py-3 font-black text-white">
              ✗ {t('live.betWrong')}
            </button>
          </div>
        </>
      )}
      {onMe.length > 0 && <p className="text-xs font-bold text-muted">{t('live.betsOnYou', { count: onMe.length })}</p>}
      {error && <p className="text-sm font-bold text-bad">{errText(t, error)}</p>}
    </section>
  );
}

function RevealView(props: { s: LivePublic; me: string; isHost: boolean; send: Send; picked?: string }) {
  const now = useGameNow(props.s);
  // "And the answer is…": every screen shows the answer at the same moment.
  if (props.s.revealAt && now < props.s.revealAt) return <Suspense s={props.s} />;
  return <RevealResults {...props} />;
}

function RevealResults({ s, me, isHost, send, picked }: { s: LivePublic; me: string; isHost: boolean; send: Send; picked?: string }) {
  const { t } = useTranslation();
  const r = s.reveal!;
  const mine = r.results[me];
  const myBet = r.bets?.[me];
  useEffect(() => play(mine?.correct ? 'correct' : 'wrong'), [mine?.correct, s.index]);
  const ranked = s.players.slice().sort((a, b) => a.rank - b.rank);
  const last = s.index + 1 >= s.total;
  const [confirmEnd, setConfirmEnd] = useState(false); // ending early takes two taps
  const q = s.question;
  const verdict = mine?.correct ? 'right' : mine && mine.score > 0 ? 'partly' : !s.players.find((p) => p.id === me)?.answered && !mine?.points && !picked ? 'none' : 'wrong';

  return (
    <section className="space-y-4 pb-28">
      {/* Like Gizmo: one big, unmistakable answer. */}
      <div
        className={`verdict pop-in flex items-center gap-4 rounded-3xl p-5 text-white ${verdict === 'right' ? 'verdict-right' : verdict === 'partly' ? 'verdict-partly' : 'verdict-wrong'}`}
        role="status"
        data-testid="live-verdict"
        data-verdict={verdict}
      >
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-white/25 text-4xl font-black" aria-hidden>
          {verdict === 'right' ? '✓' : verdict === 'partly' ? '½' : '✗'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-3xl leading-none font-black">{verdict === 'right' ? t('live.correct') : verdict === 'partly' ? t('live.partly') : verdict === 'none' ? t('live.noAnswer') : t('live.wrong')}</p>
          <p className="mt-1 font-black">+{mine?.points ?? 0} {t('live.points')}</p>
          {mine && mine.streak >= 2 && <p className="text-sm font-bold">🔥 {t('live.streak', { n: mine.streak })}</p>}
        </div>
      </div>
      <ReactionBar />
      {q?.options ? (
        <ChoiceTiles q={q} chosen={picked ?? null} reveal={{ correct: !!mine?.correct, correctAnswer: r.correctAnswer }} removed={[]} locked onPick={() => {}} />
      ) : (
        <div className="rounded-2xl bg-surface p-3.5 ring-1 ring-line">
          <p className="text-xs font-black text-muted uppercase">{t('live.answerWas')}</p>
          <p className="font-black whitespace-pre-line">{r.correctAnswer}</p>
        </div>
      )}
      {r.explanation && <p className="rounded-2xl bg-surface p-3 text-sm ring-1 ring-line">💡 {r.explanation}</p>}
      <WhoGotIt s={s} me={me} />
      {myBet && (
        <p className={`rounded-2xl px-3 py-2 font-black ${myBet.won ? 'bg-good/15 text-good' : 'bg-bad/10 text-bad'}`} role="status">
          🎲 {t(myBet.won ? 'live.betWon' : 'live.betLost', { xp: Math.abs(myBet.delta), name: s.players.find((p) => p.id === myBet.on)?.name ?? '?' })}
        </p>
      )}
      <Board players={ranked.slice(0, 5)} me={me} showMoves gained={Object.fromEntries(Object.entries(r.results).map(([id, x]) => [id, x.points]))} />
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t border-line bg-bg/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur lg:max-w-3xl">
        {isHost ? (
          <div className="flex gap-2">
            {!last && (
              <button
                onClick={() => (confirmEnd ? void send('live:end') : setConfirmEnd(true))}
                className={`shrink-0 rounded-2xl px-4 py-4 font-black ring-2 ${confirmEnd ? 'bg-bad text-white ring-bad' : 'bg-surface ring-line'}`}
              >
                {confirmEnd ? t('live.endSure') : t('live.endGame')}
              </button>
            )}
            <button onClick={() => void send('live:next')} className="min-w-0 flex-1 rounded-2xl bg-brand py-4 text-lg font-black text-brand-ink">
              {last ? t('live.showPodium') : t('live.next')}
            </button>
          </div>
        ) : (
          <p className="py-3 text-center font-black text-muted">{t('live.waitingNext')}</p>
        )}
      </div>
    </section>
  );
}

/** Everyone's result on this question: who got it (and their points), who missed, who didn't answer. */
function WhoGotIt({ s, me }: { s: LivePublic; me: string }) {
  const { t } = useTranslation();
  const results = s.reveal!.results;
  const list = s.players
    .map((p) => ({ p, r: results[p.id], none: !p.answered, partly: !results[p.id]?.correct && (results[p.id]?.score ?? 0) > 0 }))
    .sort((a, b) => Number(!!b.r?.correct) - Number(!!a.r?.correct) || (b.r?.points ?? 0) - (a.r?.points ?? 0) || Number(a.none) - Number(b.none));
  const right = list.filter((x) => x.r?.correct).length;
  return (
    <section className="rounded-2xl bg-surface p-3 ring-1 ring-line" aria-labelledby="who-title" data-testid="who-got-it">
      <h2 id="who-title" className="mb-2 text-sm font-black">
        {t('live.whoGotIt', { n: right, total: list.length })}
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {list.map(({ p, r, none, partly }) => (
          <li
            key={p.id}
            className={`rounded-full px-3 py-1 text-sm font-black ring-1 ${r?.correct ? 'bg-good/20 text-good ring-good/50' : partly ? 'bg-amber-glow/20 ring-amber-glow/50' : none ? 'bg-surface-2 text-muted ring-line' : 'bg-bad/15 text-bad ring-bad/40'}`}
            data-result={r?.correct ? 'right' : partly ? 'partly' : none ? 'none' : 'wrong'}
          >
            <span aria-hidden>{r?.correct ? '✓' : partly ? '½' : none ? '–' : '✗'}</span> {p.name}
            {p.id === me ? ` (${t('live.you')})` : ''}
            {(r?.correct || partly) && r!.points > 0 ? ` +${r!.points}` : ''}
            <span className="sr-only">{r?.correct ? t('live.correct') : partly ? t('live.partly') : none ? t('live.noAnswer') : t('live.wrong')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Board({ players, me, showMoves, gained }: { players: LivePublic['players']; me: string; showMoves?: boolean; gained?: Record<string, number> }) {
  const { t } = useTranslation();
  return (
    <ol className="space-y-1.5" aria-label={t('live.leaderboard')}>
      {players.map((p) => {
        const moved = showMoves && p.previousRank ? p.previousRank - p.rank : 0;
        const plus = gained?.[p.id] ?? 0;
        return (
          // Rows slide from their old place to the new one, and scores count up.
          <li
            key={p.id}
            className={`board-row flex items-center gap-2 rounded-2xl p-2.5 ring-1 ${p.id === me ? 'bg-brand/10 ring-brand' : 'bg-surface ring-line'}`}
            style={{ ['--from' as string]: `${moved * 112}%` }}
            data-moved={moved !== 0 ? 'true' : undefined}
          >
            <span className="w-6 text-center font-black">{p.rank}</span>
            <Avatar name={p.name} avatar={p.avatar} size={28} />
            <span className="min-w-0 flex-1 truncate font-black">
              {p.name}
              {p.streak >= 2 && <span className="ml-1.5 text-sm text-amber-glow" title={t('live.streak', { n: p.streak })}>🔥{p.streak}</span>}
            </span>
            {moved > 0 && <span className="text-xs font-black text-good">▲{moved}</span>}
            {moved < 0 && <span className="text-xs font-black text-bad">▼{-moved}</span>}
            {plus > 0 && <span className="pop-in text-xs font-black text-good">+{plus}</span>}
            <CountUp to={p.score} from={p.score - plus} />
          </li>
        );
      })}
    </ol>
  );
}

/** A score that counts up to its new value. */
function CountUp({ to, from }: { to: number; from: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return setV(to);
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setV(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  return <span className="w-14 text-right font-black tabular-nums">{v}</span>;
}

/** Before each question: its number and a big 3-2-1, the same on every screen. */
function GetReady({ s, msLeft }: { s: LivePublic; msLeft: number }) {
  const { t } = useTranslation();
  const n = Math.ceil(msLeft / 1000);
  useEffect(() => play(n <= 0 ? 'go' : 'tick'), [n]);
  return (
    <section className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center" data-testid="live-get-ready" aria-live="polite">
      <p className="text-sm font-black tracking-wide text-muted">{t('live.questionOf', { n: s.index + 1, total: s.total })}</p>
      {s.question && <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-black">{t(`formats.${s.question.format}`)}</span>}
      <p key={n} className="count-pop font-display text-gold text-9xl font-black tabular-nums" aria-label={t('live.getReadyIn', { n })}>
        {Math.max(1, n)}
      </p>
      <p className="text-xl font-black">{t('live.getReady')}</p>
      <PlayersStrip s={s} me="" quiet />
    </section>
  );
}

/** Everyone in the game; a check pops on each player as they answer. */
function PlayersStrip({ s, me, quiet = false }: { s: LivePublic; me: string; quiet?: boolean }) {
  const { t } = useTranslation();
  const players = s.players.filter((p) => p.connected);
  const done = players.filter((p) => p.answered).length;
  const before = useRef(done);
  useEffect(() => {
    // Someone else just answered: a little pop.
    if (!quiet && done > before.current) play('tap');
    before.current = done;
  }, [done, quiet]);
  return (
    <section className="mb-3 rounded-2xl bg-surface p-2.5 ring-1 ring-line" aria-label={t('live.answeredCount', { n: done, total: players.length })} data-testid="players-strip">
      {!quiet && (
        <p className="mb-1.5 text-xs font-black text-muted" aria-live="polite">
          {t('live.answeredCount', { n: done, total: players.length })}
        </p>
      )}
      <ul className="flex gap-2 overflow-x-auto pb-0.5">
        {players.map((p) => (
          <li key={p.id} className="flex w-14 shrink-0 flex-col items-center gap-0.5" data-answered={p.answered ? 'true' : 'false'}>
            <span className={`relative rounded-full ${p.answered && !quiet ? 'ring-2 ring-good' : ''}`}>
              <Avatar name={p.name} avatar={p.avatar} size={36} />
              {p.answered && !quiet && (
                <span key="done" className="combo-pop absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-good text-xs font-black text-night">
                  ✓
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-[0.68rem] font-bold">
              {p.id === me ? t('live.you') : p.name}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "And the answer is…": a short drumroll, then every screen shows the answer together. */
function Suspense({ s }: { s: LivePublic }) {
  const { t } = useTranslation();
  useEffect(() => play('whoosh'), []);
  return (
    <section className="flex min-h-[55dvh] flex-col items-center justify-center gap-5 text-center" data-testid="live-suspense" role="status">
      {s.question && <p className="max-w-md text-lg font-bold text-muted">{s.question.prompt}</p>}
      <p className="font-display text-3xl font-black">{t('live.andTheAnswer')}</p>
      <span className="drumroll flex items-end gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ animationDelay: `${i * 0.09}s` }} />
        ))}
      </span>
    </section>
  );
}

/** Quick reactions: tap one and it floats up on everyone's screen. */
function ReactionBar() {
  const { t } = useTranslation();
  const onReact = useContext(ReactCtx);
  const last = useRef(0);
  if (!onReact) return null;
  return (
    <div className="mx-auto flex w-fit gap-1 rounded-full bg-surface p-1 ring-1 ring-line" role="group" aria-label={t('live.react')} data-testid="reaction-bar">
      {REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => {
            if (Date.now() - last.current < 600) return; // no spamming
            last.current = Date.now();
            onReact(e);
          }}
          className="grid size-9 place-items-center rounded-full text-xl hover:bg-surface-2 active:scale-90"
          aria-label={t('live.reactWith', { e })}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

function FloatingReactions({ list, players, me, done }: { list: LiveReaction[]; players: LivePublic['players']; me: string; done: (key: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {list.map((r) => {
        const x = 8 + ([...r.key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 70);
        const who = r.by === me ? t('live.you') : (players.find((p) => p.id === r.by)?.name ?? '');
        return (
          <span key={r.key} className="float-react absolute bottom-24 flex flex-col items-center" style={{ left: `${x}%` }} onAnimationEnd={() => done(r.key)} data-testid="floating-reaction">
            <span className="text-5xl">{r.e}</span>
            <span className="rounded-full bg-night/70 px-2 text-xs font-black text-white">{who}</span>
          </span>
        );
      })}
    </div>
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
        <div className="flex flex-wrap items-center justify-center gap-4 rounded-3xl bg-surface p-4 text-lg font-black ring-1 ring-line" role="status">
          <span>{t('live.yourRank', { n: reward.rank })}</span>
          <span className="text-brand">+{reward.xp} XP</span>
          <span className="flex items-center gap-1">
            <CoinIcon size={22} />+{reward.coins}
          </span>
          {!!reward.betXp && (
            <span className={reward.betXp > 0 ? 'text-good' : 'text-bad'}>
              🎲 {reward.betXp > 0 ? '+' : '−'}
              {Math.abs(reward.betXp)} XP
            </span>
          )}
        </div>
      ) : (
        <p className="text-center font-bold text-muted">{t('common.loading')}</p>
      )}
      <Board players={ranked} me={me} />
      <div className="grid grid-cols-2 gap-3">
        <Link to="/" className="block rounded-2xl bg-surface py-4 text-center text-lg font-black ring-1 ring-line">
          ✓ {t('play.end.finish')}
        </Link>
        <Link to="/live" className="block rounded-2xl bg-brand py-4 text-center text-lg font-black text-brand-ink">
          {t('live.playAgain')}
        </Link>
      </div>
    </section>
  );
}
