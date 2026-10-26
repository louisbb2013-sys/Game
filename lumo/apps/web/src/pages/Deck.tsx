import { MAX_HEARTS, type Rarity } from '@lumo/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { HeartIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { Creature3D } from '../components/Pet3D';
import { READY_TO_PLAY, useWriting, WritingScreen } from '../components/play/Writing';
import { ShareDeckToggle } from '../components/SharedDecks';
import { translateDeck } from '../local/translate';
import { StudyPlan } from '../components/StudyPlan';
import { api, ApiError, LOCAL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { offlineDeck, saveDeckOffline } from '../lib/offline';
import type { MasteryItem, Mode } from '../lib/quiz';
import { deckColors, tilt } from '../lib/tilt';
import { canAskClaude } from '../local/reader';
import { writeQuestions } from '../local/writer';

interface DeckData {
  deck: { id: string; title: string; subject: string; language: string; mine: boolean };
  concepts: (MasteryItem & { facts?: number; factsKnown?: number })[];
  /** Website: how many test questions Claude has written for the deck. */
  bankSize?: number;
  best?: { speed?: number; bossWins?: number };
  /** Facts in the notes, how many have a question, the whole-deck round's length, and a round left halfway. */
  facts?: number;
  factsCovered?: number;
  roundSize?: number;
  resume?: { id: string; answered: number; total: number } | null;
}

/** A quick round's length. */
const QUICK = 15;

const BAND_STYLE: Record<MasteryItem['band'], string> = {
  new: 'bg-surface ring-line text-muted',
  learning: 'bg-indigo-100 ring-indigo-300 text-indigo-900 dark:bg-indigo-950 dark:ring-indigo-700 dark:text-indigo-100',
  familiar: 'bg-brand/20 ring-brand text-ink',
  mastered: 'bg-amber-glow/30 ring-amber-glow text-ink',
};

/** Is Claude already allowed here (so writing can start without asking)? */
async function claudeAllowed(): Promise<boolean> {
  const use = (window as unknown as { claude?: { use?: (n: string) => Promise<{ state?: (n: string) => Promise<string> } | null> } }).claude?.use;
  if (!use) return false;
  const p = await use('permissions').catch(() => null);
  if (!p?.state) return true;
  return (await p.state('sample').catch(() => 'prompt')) === 'granted';
}

/** A deck written in the other language: one tap turns it (ideas and questions) into the app's language. */
function TranslateDeck({ deckId, from, onDone }: { deckId: string; from: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const to = i18n.language === 'fr' ? 'fr' : 'en';
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (from === to) return null;
  const go = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await translateDeck(deckId, to);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-brand/40" data-testid="translate-deck">
      <span className="text-2xl" aria-hidden>
        🌐
      </span>
      <p className="min-w-0 flex-1 text-sm font-bold" role="status">
        {failed ? t('deck.translateFailed') : busy ? t('deck.translatingBody') : t('deck.otherLanguage', { lang: t(`langs.${from === 'fr' ? 'fr' : 'en'}`) })}
      </p>
      <button type="button" disabled={busy} onClick={() => void go()} className="shrink-0 rounded-xl bg-brand px-3 py-2 text-sm font-black text-brand-ink disabled:opacity-60">
        {busy ? t('deck.translating') : t('deck.translate', { lang: t(`langs.${to}`) })}
      </button>
    </div>
  );
}

/** A deck is a game hub: one big Play button, game modes, and the map of what you master. */
export function Deck() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<DeckData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<Mode | 'quick' | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // null until we know whether Claude can be asked here (the website); false on the server app.
  const [ai, setAi] = useState<boolean | null>(LOCAL ? null : false);
  const [writingOpen, setWritingOpen] = useState<Mode | 'quick' | null>(null);
  const [pet, setPet] = useState<{ species: string; rarity: Rarity } | null>(null);
  const writing = useWriting(id);

  const load = () => api<DeckData>(`/api/decks/${id}`).then(setData, () => setError('deck_not_found'));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // Keep the question count fresh while Claude writes.
  useEffect(() => {
    if (writing) setData((d) => (d ? { ...d, bankSize: Math.max(d.bankSize ?? 0, writing.bank) } : d));
  }, [writing]);
  useEffect(() => {
    if (!LOCAL) return;
    void canAskClaude().then(setAi);
    void api<{ pet: { species: string; rarity: Rarity } | null }>('/api/game/overview').then((o) => setPet(o.pet), () => {});
  }, []);
  // A deck without questions yet: Claude starts writing on its own when it's already allowed here.
  useEffect(() => {
    if (!LOCAL || !id || !data || (data.bankSize ?? 0) > 0 || writing) return;
    void claudeAllowed().then((ok) => {
      if (ok) void writeQuestions(id);
    });
  }, [data, id, writing]);

  const bank = Math.max(data?.bankSize ?? 0, writing?.bank ?? 0);
  const needsWriting = LOCAL && !!ai && bank < READY_TO_PLAY;

  const start = async (mode: Mode | 'quick') => {
    if (starting) return;
    // No questions yet: Claude writes them first (this tap is what lets it ask for permission).
    if (needsWriting) {
      void writeQuestions(id!);
      setWritingOpen(mode);
      return;
    }
    setStarting(mode);
    setError(null);
    setHint(null);
    try {
      // Play is the whole deck (one question per fact of the notes); "quick" is a short round of what needs it most.
      const body =
        mode === 'practice'
          ? { mode, full: true, length: 10 }
          : mode === 'quick'
            ? { mode: 'practice', length: QUICK }
            : { mode, length: mode === 'review' || mode === 'wrong_only' ? 10 : mode === 'exam' ? Math.min(30, Math.max(8, data?.concepts.length ?? 10)) : mode === 'challenge' ? 12 : 10 };
      const res = await api<{ session: { id: string } }>(`/api/decks/${id}/sessions`, { method: 'POST', body });
      navigate(`/quiz/${res.session.id}`, { state: res });
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
      setStarting(null);
    }
  };

  // Home's "jump back in" opens the deck straight into a round.
  const location = useLocation();
  const autoplay = useRef((location.state as { autoplay?: Mode } | null)?.autoplay ?? null);
  // Back from adding new notes: say what was added (Claude is writing their questions).
  const [added] = useState(() => (location.state as { added?: { ideas: number; facts: number } } | null)?.added ?? null);
  useEffect(() => {
    if (!data || ai === null || !autoplay.current) return;
    const m = autoplay.current;
    autoplay.current = null;
    navigate(location.pathname, { replace: true, state: null }); // coming back here doesn't start another round
    // A whole-deck round left halfway picks up where it stopped.
    if (m === 'practice' && data.resume && LOCAL) navigate(`/quiz/${data.resume.id}`);
    else void start(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ai]);

  const [offlineState, setOfflineState] = useState<'idle' | 'saving' | 'saved' | 'failed'>(() => (id && offlineDeck(id) ? 'saved' : 'idle'));
  const saveOffline = async () => {
    setOfflineState('saving');
    try {
      setOfflineState((await saveDeckOffline(id!)) ? 'saved' : 'failed');
    } catch {
      setOfflineState('failed');
    }
  };

  const remove = async () => {
    await api(`/api/decks/${id}`, { method: 'DELETE' });
    navigate('/learn');
  };

  if (error === 'deck_not_found') {
    return (
      <div className="flex flex-col items-center gap-3 pt-16 text-center">
        <Lumo mood="sad" size={100} />
        <p className="font-bold">{t('deck.notFound')}</p>
        <Link to="/learn" className="font-black text-brand">
          {t('common.back')}
        </Link>
      </div>
    );
  }
  if (!data) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;

  const topics = [...new Set(data.concepts.map((c) => c.topic))];
  const mastered = data.concepts.filter((c) => c.band === 'mastered').length;
  const due = data.concepts.filter((c) => c.due).length;
  const wrong = data.concepts.filter((c) => c.band === 'learning').length;
  const studied = data.concepts.some((c) => c.band !== 'new');
  const pct = data.concepts.length ? Math.round((data.concepts.reduce((s, c) => s + c.score, 0) / data.concepts.length) * 100) : 0;
  const isWriting = writing?.status === 'writing';

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="min-w-0 space-y-4">
      <Link to="/learn" className="inline-block rounded-full bg-surface px-3 py-1 text-sm font-extrabold ring-1 ring-line">
        ← {t('common.back')}
      </Link>

      {/* Hero */}
      <header className="holo lux-frame rise-in rounded-3xl p-5 text-white shadow-xl sm:p-6" style={{ background: deckColors(data.deck.title) }} {...tilt}>
        <div className="flex items-center gap-4">
          <MasteryRing pct={pct}>
            {pet ? (
              <Creature3D species={pet.species} rarity={pet.rarity} className="size-16">
                <Lumo size={48} mood={pct >= 80 ? 'cheer' : 'happy'} />
              </Creature3D>
            ) : (
              <Lumo size={52} mood={pct >= 80 ? 'cheer' : 'happy'} />
            )}
          </MasteryRing>
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-black break-words drop-shadow sm:text-3xl">{data.deck.title}</h1>
            <p className="text-sm font-bold opacity-90">{data.deck.subject}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
          <span className="rounded-full bg-black/20 px-2.5 py-1">🧠 {t('hub.ideas', { count: data.concepts.length })}</span>
          {!!data.facts && <span className="rounded-full bg-black/20 px-2.5 py-1">🧩 {t('hub.facts', { count: data.facts })}</span>}
          {LOCAL && (ai || bank > 0) && (
            <span className="rounded-full bg-black/20 px-2.5 py-1" aria-live="polite">
              {isWriting ? `✍️ ${t('hub.writing', { count: bank })}` : `📝 ${t('hub.questions', { count: bank })}`}
            </span>
          )}
          <span className="rounded-full bg-black/20 px-2.5 py-1">⭐ {t('learn.mastered', { done: mastered, total: data.concepts.length })}</span>
        </div>
      </header>

      {LOCAL && ai && data.deck.mine && !isWriting && <TranslateDeck deckId={data.deck.id} from={data.deck.language} onDone={() => void load()} />}

      {LOCAL && !ai && bank === 0 && (
        <p className="rounded-2xl bg-amber-glow/15 px-3 py-2 text-sm font-bold ring-1 ring-amber-glow/40">{t('hub.noClaude')}</p>
      )}

      {added && (
        <p className="pop-in rounded-2xl bg-good/15 px-3 py-2 text-sm font-black ring-1 ring-good/40" role="status" data-testid="notes-added">
          ➕ {t('addNotes.added', { ideas: added.ideas, facts: added.facts })}
        </p>
      )}

      {/* Play: the whole deck, one question per fact of the notes */}
      {data.resume && LOCAL && (
        <button
          type="button"
          onClick={() => navigate(`/quiz/${data.resume!.id}`)}
          className="flex w-full items-center gap-3 rounded-3xl bg-surface px-4 py-3 text-left ring-2 ring-amber-glow/60"
          data-testid="resume-round"
        >
          <span className="text-2xl" aria-hidden>
            ↩️
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block font-black">{t('hub.resume')}</span>
            <span className="block text-xs font-bold text-muted">{t('hub.resumeBody', { n: data.resume.answered, total: data.resume.total })}</span>
          </span>
          <span className="h-2 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span className="block h-full rounded-full bg-amber-glow" style={{ width: `${Math.round((data.resume.answered / Math.max(1, data.resume.total)) * 100)}%` }} />
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => void start('practice')}
        disabled={!!starting}
        className="btn-gold breathe flex w-full items-center justify-center gap-3 rounded-3xl py-5 text-2xl font-black disabled:opacity-60"
        data-testid="play-all"
      >
        <span className="text-3xl" aria-hidden>
          {starting === 'practice' ? '⏳' : '▶'}
        </span>
        <span className="text-left leading-tight">
          <span className="font-display">{t('hub.play')}</span>
          <span className="block text-sm font-bold opacity-80">
            {needsWriting ? t('hub.playWrite') : LOCAL && data.roundSize ? t('hub.playAll', { count: data.roundSize, minutes: Math.max(1, Math.round((data.roundSize * 18) / 60)) }) : t('hub.playBody')}
          </span>
        </span>
      </button>
      {/* A short round only where the whole deck is clearly longer. */}
      {LOCAL && (data.roundSize ?? 0) > QUICK + 5 && (
        <button type="button" onClick={() => void start('quick')} disabled={!!starting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-surface py-3 font-black ring-1 ring-line hover:ring-brand disabled:opacity-60" data-testid="play-quick">
          <span aria-hidden>{starting === 'quick' ? '⏳' : '⏱️'}</span> {t('hub.quick', { count: QUICK })}
        </button>
      )}
      {(error || hint) && error !== 'deck_not_found' && (
        <p role="alert" className={`rounded-xl px-3 py-2 text-sm font-bold ${error ? 'bg-bad/10 text-bad' : 'bg-brand/10'}`}>
          {error ? t(`quiz.errors.${error}`, { defaultValue: t('signin.errors.network') }) : hint}
        </p>
      )}

      {/* Game modes */}
      {LOCAL ? (
        <section className="grid grid-cols-2 gap-3" aria-label={t('hub.modes')}>
          <ModeTile tone="from-amber-600 to-orange-900" icon="⚡" title={t('play.modes.speed')} body={data.best?.speed ? t('play.bestScore', { n: data.best.speed }) : t('hub.speedBody')} onClick={() => void start('speed')} busy={starting === 'speed'} />
          <ModeTile tone="from-rose-800 to-fuchsia-950" icon="🐉" title={t('play.modes.boss')} body={data.best?.bossWins ? t('hub.bossWins', { count: data.best.bossWins }) : t('hub.bossBody')} onClick={() => void start('boss')} busy={starting === 'boss'} />
          <ModeTile tone="from-blue-700 to-indigo-950" icon="🃏" title={t('play.modes.cards')} body={t('hub.cardsBody')} onClick={() => navigate(`/cards/${id}`)} />
          {wrong > 0 ? (
            <ModeTile tone="from-emerald-700 to-teal-950" icon="🎯" title={t('deck.fix')} body={t('deck.fixBody', { count: wrong })} onClick={() => void start('wrong_only')} busy={starting === 'wrong_only'} />
          ) : (
            <ModeTile
              tone="from-emerald-700 to-teal-950"
              icon="🔁"
              title={t('deck.review')}
              body={due ? t('deck.reviewDue', { count: due }) : studied ? t('deck.reviewBody') : t('deck.needPractice')}
              onClick={() => (studied ? void start('review') : setHint(t('deck.needPractice')))}
              busy={starting === 'review'}
            />
          )}
          <ChallengeTile onClick={() => void start('challenge')} busy={starting === 'challenge'} />
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-3">
          <ModeTile tone="from-emerald-700 to-teal-950" icon="🔁" title={t('deck.review')} body={due ? t('deck.reviewDue', { count: due }) : t('deck.reviewBody')} onClick={() => void start('review')} busy={starting === 'review'} />
          <ModeTile tone="from-rose-800 to-fuchsia-950" icon="🎯" title={t('deck.fix')} body={t('deck.fixBody', { count: wrong })} onClick={() => void start('wrong_only')} busy={starting === 'wrong_only'} />
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => void start('exam')} disabled={!!starting} className="rounded-2xl bg-surface p-3 text-left ring-1 ring-line hover:ring-brand">
          <span className="block font-black">📝 {t('deck.exam')}</span>
          <span className="block text-xs text-muted">{t('deck.examBody', { count: Math.min(30, Math.max(8, data.concepts.length)) })}</span>
        </button>
        <Link to={`/live?deck=${data.deck.id}`} className="rounded-2xl royal p-3 text-white">
          <span className="block font-black">👥 {t('deck.live')}</span>
          <span className="block text-xs opacity-85">{t('deck.liveBody')}</span>
        </Link>
        {LOCAL && (
          <Link to={`/decks/${data.deck.id}/questions`} className="rounded-2xl bg-surface p-3 ring-1 ring-line hover:ring-brand" data-testid="all-questions">
            <span className="block font-black">📋 {t('questions.open')}</span>
            <span className="block text-xs text-muted">{t('questions.openBody', { count: bank })}</span>
          </Link>
        )}
        {LOCAL && data.deck.mine && (
          <Link to={`/chat?add=${data.deck.id}`} className="rounded-2xl bg-surface p-3 ring-1 ring-line hover:ring-brand" data-testid="add-notes">
            <span className="block font-black">➕ {t('addNotes.open')}</span>
            <span className="block text-xs text-muted">{t('addNotes.openBody')}</span>
          </Link>
        )}
        <Link to={`/audio/${data.deck.id}`} className="rounded-2xl bg-surface p-3 ring-1 ring-line">
          <span className="block font-black">🎧 {t('deck.audio')}</span>
          <span className="block text-xs text-muted">{t('deck.audioBody')}</span>
        </Link>
        {LOCAL && ai ? (
          <button type="button" onClick={() => void writeQuestions(id!, { more: true })} disabled={isWriting} className="rounded-2xl bg-surface p-3 text-left ring-1 ring-line hover:ring-brand disabled:opacity-60">
            <span className="block font-black">✨ {t('hub.more')}</span>
            <span className="block text-xs text-muted">{isWriting ? t('hub.writing', { count: bank }) : t('hub.moreBody')}</span>
          </button>
        ) : !LOCAL ? (
          <button onClick={() => void saveOffline()} disabled={offlineState === 'saving'} className="rounded-2xl bg-surface p-3 text-left ring-1 ring-line disabled:opacity-60">
            <span className="block font-black">{offlineState === 'saved' ? '✅' : '📥'} {offlineState === 'saved' ? t('deck.offlineSaved') : t('deck.offline')}</span>
            <span className="block text-xs text-muted">{offlineState === 'failed' ? t('deck.offlineFailed') : t('deck.offlineBody')}</span>
          </button>
        ) : null}
      </section>
      {writing?.status === 'error' && writing.error !== 'cancelled' && bank > 0 && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold text-muted">{t(`write.errors.${writing.error}`, { defaultValue: t('write.errors.upstream_error') })}</p>}

      </div>
      <div className="mt-4 min-w-0 space-y-4 lg:sticky lg:top-8 lg:mt-12">
      {LOCAL && <ShareDeckToggle deckId={data.deck.id} />}

      <StudyPlan deckId={data.deck.id} />

      <section aria-labelledby="map-title" className="panel p-4 sm:p-5">
        <h2 id="map-title" className="font-black">
          {t('deck.masteryMap')}
        </h2>
        <div className="mt-1 mb-3 flex flex-wrap gap-2 text-[0.7rem] font-bold">
          {(['new', 'learning', 'familiar', 'mastered'] as const).map((b) => (
            <span key={b} className={`rounded-full px-2 py-0.5 ring-1 ${BAND_STYLE[b]}`}>
              {t(`mastery.${b}`)}
            </span>
          ))}
        </div>
        <div className="space-y-4">
          {topics.map((topic) => {
            const items = data.concepts.filter((c) => c.topic === topic);
            const avg = items.reduce((s, c) => s + c.score, 0) / items.length;
            return (
              <div key={topic}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-black">{topic}</h3>
                  <span className="text-xs font-bold text-muted">{Math.round(avg * 100)}%</span>
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {items.map((c) => (
                    <li key={c.id} className={`rounded-xl px-2.5 py-1.5 text-sm font-bold ring-1 ${BAND_STYLE[c.band]}`} title={t('deck.formatsPassed', { count: c.formatsPassed })}>
                      {c.band === 'mastered' && '★ '}
                      {c.term}
                      {(c.facts ?? 0) > 1 && (
                        <span className="ml-1 text-[0.7rem] opacity-70" title={t('deck.factsKnown', { n: c.factsKnown ?? 0, total: c.facts })}>
                          {c.factsKnown ?? 0}/{c.facts}
                        </span>
                      )}
                      {c.due && <span className="ml-1 text-amber-glow">●</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">{t('deck.masteryRule')}</p>
      </section>

      {data.deck.mine && (
        <div className="text-center">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-sm font-bold text-muted">
              {t('deck.delete')}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-3 text-sm font-bold">
              <span>{t('deck.deleteConfirm')}</span>
              <button onClick={() => void remove()} className="rounded-lg bg-bad px-3 py-1 text-white">
                {t('deck.deleteYes')}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-muted">
                {t('settings.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      </div>
      {writingOpen && (
        <WritingScreen
          deckId={id!}
          bank={bank}
          onClose={() => setWritingOpen(null)}
          onPlay={() => {
            const m = writingOpen;
            setWritingOpen(null);
            void load().then(() => start(m));
          }}
          onBasic={() => {
            const m = writingOpen;
            setWritingOpen(null);
            setAi(false);
            void (async () => {
              setStarting(m);
              try {
                const res = await api<{ session: { id: string } }>(`/api/decks/${id}/sessions`, { method: 'POST', body: { mode: m === 'speed' || m === 'boss' || m === 'quick' ? 'practice' : m, length: 10 } });
                navigate(`/quiz/${res.session.id}`, { state: res });
              } catch (e) {
                setError(e instanceof ApiError ? e.code : 'network');
                setStarting(null);
              }
            })();
          }}
        />
      )}
    </div>
  );
}

function MasteryRing({ pct, children }: { pct: number; children: React.ReactNode }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-24 shrink-0 place-items-center" role="img" aria-label={`${pct}%`}>
      <svg viewBox="0 0 88 88" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="44" cy="44" r={r} fill="rgb(0 0 0 / 0.2)" stroke="rgb(255 255 255 / 0.25)" strokeWidth="7" />
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e8c468" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      {children}
      <span className="absolute -bottom-1 rounded-full bg-night px-2 text-xs font-black text-[#f2d58a] ring-1 ring-[#e8c468]/60">{pct}%</span>
    </div>
  );
}

/** Challenge: a normal round, but each miss costs one of your hearts (they come back with time). */
function ChallengeTile({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const n = user?.hearts.current ?? MAX_HEARTS;
  const minutes = user?.hearts.nextRefillAt ? Math.max(1, Math.ceil((user.hearts.nextRefillAt - Date.now()) / 60_000)) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid="challenge-tile"
      className="holo lux-frame rise-in col-span-2 flex items-center gap-3 rounded-3xl bg-gradient-to-br from-red-600 to-rose-950 p-3.5 text-left text-white shadow-lg active:scale-[0.98] disabled:opacity-60"
      {...tilt}
    >
      <span className="text-3xl" aria-hidden>
        {busy ? '⏳' : '❤️'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display block text-lg leading-tight font-black">{t('play.modes.challenge')}</span>
        <span className="block text-xs font-bold opacity-90">{n > 0 ? t('hub.challengeBody') : minutes ? t('hub.challengeEmpty', { minutes }) : t('hub.challengeBody')}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="flex gap-0.5" role="img" aria-label={t('play.heartsLeft', { count: n })}>
          {Array.from({ length: MAX_HEARTS }, (_, i) => (
            <HeartIcon key={i} size={18} className={i < n ? 'text-heart drop-shadow' : 'text-black/35'} />
          ))}
        </span>
        {n < MAX_HEARTS && minutes && <span className="text-[0.68rem] font-bold opacity-80">{t('stats.nextHeart', { minutes })}</span>}
      </span>
    </button>
  );
}

function ModeTile({ tone, icon, title, body, onClick, busy }: { tone: string; icon: string; title: string; body: string; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className={`holo lux-frame rise-in flex min-h-28 flex-col justify-between rounded-3xl bg-gradient-to-br ${tone} p-3.5 text-left text-white shadow-lg active:scale-[0.98] disabled:opacity-60`} {...tilt}>
      <span className="text-3xl" aria-hidden>
        {busy ? '⏳' : icon}
      </span>
      <span>
        <span className="font-display block text-lg leading-tight font-black">{title}</span>
        <span className="block text-xs font-bold opacity-90">{body}</span>
      </span>
    </button>
  );
}
