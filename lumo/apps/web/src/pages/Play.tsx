import { EGG_EMOJI, type Answer, type PublicQuestion, type Rarity } from '@lumo/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { EggRing } from '../components/Egg';
import { Lumo } from '../components/Lumo';
import { Creature3D } from '../components/Pet3D';
import { ChoiceTiles, MatchTap, MultiTiles, OrderTap, TypeIn } from '../components/play/answers';
import { ChestPick } from '../components/play/ChestPick';
import { FeedbackSheet } from '../components/play/Feedback';
import { RoundEnd } from '../components/play/RoundEnd';
import { isReady, QuestionInput } from '../components/quiz/inputs';
import { api, ApiError, LOCAL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { burst, flash, floatText, haptic, reduced, setHaptics, shake } from '../lib/fx';
import { rememberDeck, type AnswerResponse, type AnswerResult, type Mode, type PublicSession, type SessionSummary } from '../lib/quiz';
import { useRewards, type Rewards } from '../lib/rewards';
import { play, setSoundEnabled } from '../lib/sound';
import type { Handle } from '../three/stage';
import { canAskClaude } from '../local/reader';
import { explainAgain } from '../local/writer';

/**
 * The play screen: one question at a time, full screen, like a game. Multiple choice and true/false
 * answer with one tap on big colourful tiles; the explanation of WHY comes right after; missed ideas
 * come back later in the round; every 3 right answers earn a chest to pick. Modes: learn (default),
 * speed run (60 s against the clock), boss battle (hit the boss, keep your shields) and mock exam.
 */

type Phase = 'intro' | 'answering' | 'grading' | 'followup' | 'feedback' | 'summary';
interface Loaded {
  session: PublicSession;
  question: PublicQuestion | null;
}

/** Formats answered by a single tap: no "Check" button. */
const ONE_TAP = new Set(['multiple_choice', 'true_false', 'cause_effect']);
const BOSSES = ['ember_dragon', 'rock_dino', 'mystic_unicorn', 'cosmic_whale', 'bubble_octo'] as const;

export function Play() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const showRewards = useRewards();
  const [data, setData] = useState<Loaded | null>((location.state as Loaded | null) ?? null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Speed runs and boss battles open with their intro from the very first frame (no flash of the question).
  const [phase, setPhase] = useState<Phase>(() => {
    const s = (location.state as Loaded | null)?.session;
    return s && s.answered === 0 && (s.mode === 'speed' || s.mode === 'boss') ? 'intro' : 'answering';
  });
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [next, setNext] = useState<PublicQuestion | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [typedHint, setTypedHint] = useState<{ firstLetter: string; letters: number } | null>(null);
  const [chests, setChests] = useState(0);
  const [chestKey, setChestKey] = useState(0);
  const [showChest, setShowChest] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [egg, setEgg] = useState<Rewards['egg'] | null>(null);
  const [buddy, setBuddy] = useState<{ species: string; rarity: Rarity } | null>(null);
  const [bossDown, setBossDown] = useState(false);
  const [leftMs, setLeftMs] = useState<number | null>(null);
  const [lightLeft, setLightLeft] = useState<number | null>(null);
  const [endRewards, setEndRewards] = useState<Rewards | null>(null);
  // Teach-back (server version): Lumo asks a follow-up question before grading.
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [followText, setFollowText] = useState('');
  const startedAt = useRef(Date.now());
  const buddyRef = useRef<Handle | null>(null);
  const bossRef = useRef<HTMLDivElement>(null);
  const endsAt = useRef<number | null>(null);
  const ending = useRef(false);

  useEffect(() => setSoundEnabled(user?.settings.sound ?? true), [user?.settings.sound]);
  useEffect(() => setHaptics(user?.settings.haptics !== false), [user?.settings.haptics]);

  // Nothing pops up over the game mid-round: level-ups, badges and quests wait for the results screen
  // (or show on the deck page if you leave early). The egg fills, and hatches, right away.
  const held = useRef<Rewards | null>(null);
  const takeRewards = useCallback(
    (r: Rewards | undefined) => {
      if (!r) return;
      if (r.egg) setEgg(r.egg);
      if (r.hatched) showRewards({ xp: 0, levelUp: null, badges: [], questsCompleted: [], hatched: r.hatched });
      held.current = mergeRewards(held.current, { ...r, hatched: undefined });
    },
    [showRewards],
  );
  /** The round's end: everything held back goes on the results screen. */
  const endWith = useCallback(
    (r: Rewards) => {
      if (r.egg) setEgg(r.egg);
      if (r.hatched) showRewards({ xp: 0, levelUp: null, badges: [], questsCompleted: [], hatched: r.hatched });
      setEndRewards(mergeRewards(held.current, { ...r, hatched: undefined }));
      held.current = null;
    },
    [showRewards],
  );
  // After the round (chests opened on the results screen), rewards celebrate as usual.
  const celebrate = useCallback(
    (r: Rewards) => {
      if (r.egg) setEgg(r.egg);
      showRewards(r);
    },
    [showRewards],
  );
  useEffect(
    () => () => {
      if (held.current) showRewards(held.current);
    },
    [showRewards],
  );

  // Load (or reload) the round.
  useEffect(() => {
    if (data || !sessionId) return;
    api<Loaded & { followUp?: string }>(`/api/sessions/${sessionId}`).then((r) => {
      setData(r);
      if (r.followUp) {
        setFollowUp(r.followUp);
        setPhase('followup');
      }
    }, () => setError('load'));
  }, [data, sessionId]);

  // Claude can explain a question again on request (where it's available).
  const [ai, setAi] = useState(false);
  useEffect(() => {
    if (LOCAL) void canAskClaude().then(setAi);
  }, []);

  // Your pet comes along (learning rounds).
  useEffect(() => {
    if (!LOCAL) return;
    void api<{ pet: { species: string; rarity: Rarity } | null }>('/api/game/overview').then((o) => o.pet && setBuddy({ species: o.pet.species, rarity: o.pet.rarity }), () => {});
  }, []);

  // Home's "jump back in" offers the deck you played last.
  useEffect(() => {
    if (data?.session.deckId) rememberDeck(data.session.deckId);
  }, [data?.session.deckId]);

  const mode: Mode = data?.session.mode ?? 'practice';
  const q = data?.question ?? null;

  // Speed runs and boss battles open with an intro; a fresh question resets the per-question state.
  useEffect(() => {
    if (!data) return;
    if (data.session.answered === 0 && (mode === 'speed' || mode === 'boss') && phase === 'answering' && !endsAt.current) setPhase('intro');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.session.id]);
  useEffect(() => {
    startedAt.current = Date.now();
    setRemoved([]);
    setTypedHint(null);
    window.scrollTo(0, 0); // each question starts at the top, even after a long explanation
    if (q && data?.session.lightning) {
      setLightLeft(data.session.lightning);
      setBanner('lightning');
      play('lightning');
      setTimeout(() => setBanner((b) => (b === 'lightning' ? null : b)), 1600);
    } else setLightLeft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.id]);

  // Lightning question: a 10-second ring (no penalty when it runs out, just no bonus).
  useEffect(() => {
    if (lightLeft === null || phase !== 'answering') return;
    if (lightLeft <= 0) return;
    const id = setTimeout(() => setLightLeft((v) => (v === null ? null : Math.max(0, v - 100))), 100);
    return () => clearTimeout(id);
  }, [lightLeft, phase]);

  const finishRun = useCallback(async () => {
    if (!data || ending.current) return;
    ending.current = true;
    try {
      const res = await api<AnswerResponse & { rewards?: Rewards }>(`/api/sessions/${data.session.id}/end`, { method: 'POST' });
      if (res.rewards) endWith(res.rewards);
      if (res.summary) {
        setSummary(res.summary);
        setPhase('summary');
        void refresh();
      }
    } catch {
      ending.current = false;
    }
  }, [data, endWith, refresh]);

  // Speed run clock.
  useEffect(() => {
    if (mode !== 'speed' || phase === 'intro' || phase === 'summary' || endsAt.current === null) return;
    const id = setInterval(() => {
      const left = Math.max(0, endsAt.current! - Date.now());
      setLeftMs(left);
      if (left <= 5000 && left > 0 && Math.floor(left / 1000) !== Math.floor((left + 100) / 1000)) play('tick');
      if (left === 0) {
        clearInterval(id);
        void finishRun();
      }
    }, 100);
    return () => clearInterval(id);
  }, [mode, phase, finishRun]);

  const startRun = useCallback(async () => {
    if (!data) return;
    if (mode === 'speed') {
      const r = await api<{ session: PublicSession }>(`/api/sessions/${data.session.id}/go`, { method: 'POST' }).catch(() => null);
      endsAt.current = Date.now() + (r?.session.timeLimitMs ?? data.session.timeLimitMs ?? 60_000);
      setLeftMs(endsAt.current - Date.now());
    }
    startedAt.current = Date.now();
    setPhase('answering');
  }, [data, mode]);

  const advance = useCallback(() => {
    if (summary || !next) {
      setPhase('summary');
      play('finish');
      void refresh();
      return;
    }
    setData((d) => (d ? { ...d, question: next } : d));
    setAnswer(null);
    setResult(null);
    setNext(null);
    setFollowUp(null);
    setFollowText('');
    setPhase('answering');
    play('whoosh');
  }, [summary, next, refresh]);

  /** After the feedback: a chest to pick first if one was earned, then the next question. */
  const proceed = useCallback(() => {
    if (chests > 0 && !summary) {
      setShowChest(true);
      return;
    }
    advance();
  }, [chests, summary, advance]);

  const effects = useCallback(
    (r: AnswerResult) => {
      const target = document.querySelector('.tile[data-state="right"]') ?? document.querySelector('[data-answer-area]');
      if (r.correct) {
        play('correct', r.combo);
        haptic(18);
        flash('good');
        burst(target, { count: r.combo >= 5 ? 30 : 18 });
        if (mode === 'speed' && r.points) floatText(`+${r.points}`, target, { color: '#fde047' });
        else if (r.xp > 0) floatText(`+${r.xp} XP`, target);
        buddyRef.current?.jump(r.combo >= 3 ? 1.1 : 0.8);
        buddyRef.current?.burst(r.combo >= 3 ? 36 : 18);
        if ([3, 5, 10, 15, 20].includes(r.combo)) {
          setBanner(`combo:${r.combo}`);
          play('combo', r.combo);
          setTimeout(() => setBanner((b) => (b?.startsWith('combo') ? null : b)), 1300);
        }
      } else {
        play('wrong');
        haptic([30, 50, 30]);
        flash('bad');
        shake(document.querySelector('.tile[data-state="wrong"]'));
      }
      if (mode === 'boss') {
        if (r.damage) {
          shake(bossRef.current, 'boss-hit');
          const crit = r.combo >= 3;
          play(crit ? 'crit' : 'hit');
          floatText(crit ? `💥 -${r.damage}` : `-${r.damage}`, bossRef.current, { color: crit ? '#fde047' : '#fca5a5', size: crit ? 34 : 28 });
          burst(bossRef.current, { count: crit ? 30 : 16, colors: ['#f87171', '#fde047', '#ffffff'] });
        }
        if (r.shield === 'lost') setTimeout(() => play('shield'), 150);
        if (r.shield === 'mended') setTimeout(() => play('heal'), 250);
      }
    },
    [mode],
  );

  const submit = useCallback(
    async (override?: Answer) => {
      const a = override ?? answer;
      if (!data?.question || !a || (phase !== 'answering' && phase !== 'followup')) return;
      if (!override && !isReady(data.question, a)) return;
      if (phase !== 'followup') setAnswer(a);
      setPhase('grading');
      setError(null);
      try {
        const res = await api<AnswerResponse & { rewards?: Rewards }>(`/api/sessions/${data.session.id}/answer`, {
          method: 'POST',
          body: { questionId: data.question.id, answer: a, timeMs: Date.now() - startedAt.current },
        });
        if (ending.current) return; // the speed run's clock ran out while this answer was on its way
        if (res.summary && res.rewards) endWith(res.rewards);
        else takeRewards(res.rewards);
        if (res.followUp) {
          setFollowUp(res.followUp);
          setPhase('followup');
          return;
        }
        if (!res.result) {
          // The speed run's time was already up.
          if (res.summary) {
            setSummary(res.summary);
            setPhase('summary');
            void refresh();
          }
          return;
        }
        if (mode === 'exam') {
          // Mock exam: no feedback until the end, like a real test.
          if (res.summary || !res.next) {
            navigate(`/exam/${data.session.id}`, { replace: true });
            return;
          }
          setData({ session: res.session, question: res.next });
          setAnswer(null);
          setPhase('answering');
          return;
        }
        setResult(res.result);
        setNext(res.next);
        setSummary(res.summary);
        setData((d) => (d ? { ...d, session: res.session } : d));
        if (res.result.chest) setChests((c) => c + 1);
        setPhase('feedback');
        requestAnimationFrame(() => effects(res.result!));
        if (mode === 'boss' && res.summary?.endedReason === 'boss_defeated') {
          setBossDown(true);
          setTimeout(() => play('win'), 300);
        }
      } catch (e) {
        if (ending.current) return;
        if (e instanceof ApiError && e.code === 'time_up') {
          navigate(`/exam/${data.session.id}`, { replace: true });
          return;
        }
        setError(e instanceof ApiError ? e.code : 'network');
        setPhase(followUp ? 'followup' : 'answering');
      }
    },
    [answer, data, phase, mode, takeRewards, endWith, navigate, effects, refresh, followUp],
  );

  // Speed run: no explanation panel, straight to the next question. Boss: a right answer moves on by itself.
  useEffect(() => {
    if (phase !== 'feedback' || !result) return;
    if (mode === 'speed') {
      const id = setTimeout(advance, result.correct ? 380 : 900);
      return () => clearTimeout(id);
    }
    if (mode === 'boss' && result.correct) {
      const id = setTimeout(proceed, summary ? 1300 : 1000);
      return () => clearTimeout(id);
    }
  }, [phase, result, mode, advance, proceed, summary]);

  const askHint = async () => {
    if (!data || phase !== 'answering') return;
    try {
      const r = await api<{ removeOptionId?: string; firstLetter?: string; letters?: number; coins: number }>(`/api/sessions/${data.session.id}/hint`, { method: 'POST' });
      play('reveal');
      if (r.removeOptionId) setRemoved((x) => [...x, r.removeOptionId!]);
      if (r.firstLetter) setTypedHint({ firstLetter: r.firstLetter, letters: r.letters ?? 1 });
      setData((d) => (d ? { ...d, session: { ...d.session, coins: r.coins } } : d));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
    }
  };

  const report = () => {
    if (data) void api(`/api/sessions/${data.session.id}/report`, { method: 'POST', body: { reason: 'learner' } }).catch(() => {});
  };

  const restart = async (m: Mode) => {
    if (!data) return;
    try {
      const res = await api<Loaded>(`/api/decks/${data.session.deckId}/sessions`, { method: 'POST', body: { mode: m, length: m === 'review' || m === 'wrong_only' ? 8 : 10 } });
      setData(res);
      setAnswer(null);
      setResult(null);
      setNext(null);
      setSummary(null);
      setChests(0);
      setEndRewards(null);
      setBossDown(false);
      setEgg(null);
      endsAt.current = null;
      ending.current = false;
      setLeftMs(null);
      setPhase(m === 'speed' || m === 'boss' ? 'intro' : 'answering');
      navigate(`/quiz/${res.session.id}`, { replace: true, state: res });
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
    }
  };

  const chosenText = useMemo(() => (answer?.kind === 'choice' ? (q?.options?.find((o) => o.id === answer.optionId)?.text ?? null) : null), [answer, q]);

  if (error === 'load') {
    return (
      <Shell mode="practice">
        <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 text-center">
          <Lumo mood="sad" size={100} />
          <p className="font-bold">{t('quiz.loadError')}</p>
          <Link to="/learn" className="font-black text-amber-200">
            {t('common.back')}
          </Link>
        </div>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell mode="practice">
        <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 text-center">
          <Lumo mood="thinking" size={100} />
          <p className="font-bold text-white/80">{t('quiz.preparing')}</p>
        </div>
      </Shell>
    );
  }

  if (phase === 'summary' && summary) {
    return (
      <>
        <RoundEnd summary={summary} rewards={endRewards} deckId={data.session.deckId} onAgain={() => void restart(mode)} onMode={(m) => void restart(m)} onChests={() => setShowChest(true)} />
        {showChest && (
          <ChestPick
            key={chestKey}
            sessionId={data.session.id}
            onRewards={celebrate}
            onDone={(left) => {
              setSummary((sm) => (sm ? { ...sm, chestsLeft: left } : sm));
              if (left > 0) setChestKey((k) => k + 1);
              else setShowChest(false);
            }}
          />
        )}
      </>
    );
  }

  const s = data.session;
  const reveal = phase === 'feedback' && result ? result : null;
  const locked = phase !== 'answering';
  // Moving on by itself after a right answer is for people who don't ask for reduced motion.
  const autoNext = (mode === 'practice' || mode === 'review' || mode === 'wrong_only') && !reduced();
  const oneTap = q ? ONE_TAP.has(q.format) && mode !== 'exam' : false;
  const hintable = q && phase === 'answering' && mode !== 'speed' && mode !== 'exam' && (q.format === 'multiple_choice' || q.format === 'cause_effect' || (q.format === 'type_answer' && !typedHint));
  const bossSpecies = BOSSES[Math.abs([...s.deckId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % BOSSES.length]!;

  return (
    <Shell mode={mode}>
      {/* HUD */}
      <div className="flex items-center gap-3 pt-1">
        <button onClick={() => navigate(`/decks/${s.deckId}`)} aria-label={t('quiz.exit')} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-2xl font-black text-white/80 hover:bg-white/20">
          ×
        </button>
        {mode === 'speed' ? (
          <SpeedBar leftMs={leftMs ?? s.timeLimitMs ?? 60_000} total={s.timeLimitMs ?? 60_000} points={s.points ?? 0} best={s.best ?? 0} />
        ) : mode === 'boss' && s.boss ? (
          <Shields n={s.boss.shields} />
        ) : (
          <Progress answered={s.answered} total={s.total} />
        )}
        {mode !== 'exam' && mode !== 'speed' && <Combo n={s.combo} />}
        {mode === 'exam' && s.endsAt && <ExamClock endsAt={s.endsAt} sessionId={s.id} />}
        {egg && mode === 'practice' && (
          <Link to="/pets" aria-label={t('egg.progress', { done: egg.progress, total: egg.target })} title={t('egg.progress', { done: egg.progress, total: egg.target })}>
            <EggRing egg={{ ...egg, emoji: EGG_EMOJI[egg.rarity] }} size={38} />
          </Link>
        )}
      </div>

      {mode === 'boss' && s.boss && (
        <div className="mt-3 flex items-center gap-3 rounded-3xl bg-black/25 p-2 pr-4 ring-1 ring-white/10">
          <div ref={bossRef} className={`size-24 shrink-0 ${bossDown ? 'boss-dead' : 'boss-idle'}`}>
            <Creature3D species={bossSpecies} rarity="legendary" className="size-full" label={t('play.boss.name', { name: t(`pets.species.${bossSpecies}`) })}>
              <span className="text-6xl">👾</span>
            </Creature3D>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black tracking-wide text-rose-200 uppercase">{t('play.boss.name', { name: t(`pets.species.${bossSpecies}`) })}</p>
            <div className="mt-1 h-4 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/15" role="progressbar" aria-label={t('play.boss.hp')} aria-valuenow={s.boss.hp} aria-valuemin={0} aria-valuemax={s.boss.max}>
              <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-[width] duration-500" style={{ width: `${(s.boss.hp / s.boss.max) * 100}%` }} />
            </div>
            <p className="mt-0.5 text-right text-xs font-black text-white/70 tabular-nums">
              {s.boss.hp} / {s.boss.max}
            </p>
          </div>
        </div>
      )}

      {banner && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center" aria-live="polite">
          <div className={`combo-pop rounded-full px-5 py-2 text-xl font-black shadow-xl ${banner === 'lightning' ? 'bg-yellow-300 text-night' : 'combo-hot'}`}>
            {banner === 'lightning' ? `⚡ ${t('play.lightning')}` : t('quiz.comboFlash', { n: Number(banner.split(':')[1]) })}
          </div>
        </div>
      )}

      {q && (
        <section className="card-in mt-4 flex flex-1 flex-col" key={q.id} data-format={q.format}>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black tracking-wide text-white/90 uppercase">{askLabel(q, t)}</span>
            {s.retry && <span className="rounded-full bg-amber-300/90 px-2.5 py-1 text-xs font-black text-night">🔁 {t('play.again')}</span>}
            {lightLeft !== null && lightLeft > 0 && phase === 'answering' && <Ring left={lightLeft} total={s.lightning ?? 10_000} />}
            <span className="flex-1" />
            {hintable && (
              <button type="button" onClick={() => void askHint()} disabled={(s.coins ?? 0) < 5} className="rounded-full bg-amber-300/90 px-3 py-1 text-xs font-black text-night disabled:opacity-40" aria-label={t('play.hintCost', { n: 5 })}>
                💡 {t('play.hint')} · 5🪙
              </button>
            )}
          </div>

          {q.context && (
            <figure className="doc mb-3 max-h-[34dvh] overflow-y-auto p-4">
              <figcaption className="mb-1 text-xs font-black tracking-wide text-amber-700 uppercase">📄 {t('play.document')}</figcaption>
              <p className="leading-relaxed whitespace-pre-line">{q.context}</p>
            </figure>
          )}

          <div className="relative mb-4">
            <h1 className={`pr-14 leading-snug font-black whitespace-pre-line ${q.prompt.length < 70 ? 'text-[1.7rem]' : q.prompt.length < 150 ? 'text-xl' : 'text-lg'}`}>{q.prompt}</h1>
            {buddy && mode !== 'boss' && (
              <div className="absolute -top-3 right-0 size-16" aria-hidden>
                <Creature3D ref={buddyRef} species={buddy.species} rarity={buddy.rarity} className="size-full">
                  <Lumo size={44} mood={reveal ? (reveal.correct ? 'cheer' : 'sad') : 'happy'} />
                </Creature3D>
              </div>
            )}
          </div>

          <div data-answer-area className="pb-40">
            {q.format === 'multiple_choice' || q.format === 'true_false' || q.format === 'cause_effect' ? (
              <ChoiceTiles
                q={q}
                chosen={answer?.kind === 'choice' ? answer.optionId : null}
                reveal={reveal}
                removed={removed}
                locked={locked}
                // In a mock exam you pick, can change your mind, then press Next (like on paper).
                onPick={(id) => (mode === 'exam' ? setAnswer({ kind: 'choice', optionId: id }) : void submit({ kind: 'choice', optionId: id }))}
              />
            ) : q.format === 'multiple_select' ? (
              <MultiTiles q={q} value={answer} onChange={setAnswer} reveal={reveal} />
            ) : q.format === 'type_answer' ? (
              <TypeIn value={answer} onChange={setAnswer} onSubmit={() => void submit()} reveal={reveal} hint={typedHint} />
            ) : q.format === 'ordering' ? (
              <OrderTap q={q} value={answer} onChange={setAnswer} reveal={reveal} />
            ) : q.format === 'matching' ? (
              <MatchTap q={q} value={answer} onChange={setAnswer} reveal={reveal} />
            ) : (
              <fieldset disabled={locked} className="min-w-0">
                <QuestionInput q={q} value={answer} onChange={setAnswer} onSubmit={() => void submit()} reveal={reveal} />
              </fieldset>
            )}
            {followUp && (phase === 'followup' || phase === 'grading') && (
              <div className="pop-in mt-4 space-y-2">
                <div className="flex items-start gap-3">
                  <Lumo size={48} mood="thinking" />
                  <p className="flex-1 rounded-2xl rounded-tl-sm bg-amber-300/20 p-3 font-bold ring-1 ring-amber-300/50">{followUp}</p>
                </div>
                <textarea
                  autoFocus
                  rows={3}
                  value={followText}
                  onChange={(e) => setFollowText(e.target.value)}
                  aria-label={t('quiz.followUpLabel')}
                  className="w-full resize-none rounded-2xl border-2 border-line bg-surface px-4 py-3 outline-none focus:border-brand"
                />
              </div>
            )}
            {error && error !== 'load' && (
              <p role="alert" className="mt-3 rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-bold text-rose-100">
                {t(`quiz.errors.${error}`, { defaultValue: t(`play.errors.${error}`, { defaultValue: t('signin.errors.network') }) })}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Check button for answers that aren't a single tap */}
      {q && (!oneTap || phase === 'followup') && (phase === 'answering' || phase === 'grading' || phase === 'followup') && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <button
            onClick={() => (phase === 'followup' ? void submit({ kind: 'text', text: followText }) : void submit())}
            disabled={phase === 'grading' || (phase === 'followup' ? !followText.trim() : !isReady(q, answer))}
            className="w-full rounded-2xl bg-white py-4 text-lg font-black text-night shadow-[0_6px_0_0_rgb(0_0_0/0.35)] transition active:translate-y-1 active:shadow-none disabled:bg-white/30 disabled:text-white/70 disabled:shadow-none"
          >
            {phase === 'grading' ? (q.format === 'explain' || q.format === 'apply' || q.format === 'compare' || q.format === 'teach_back' ? t('play.grading') : t('quiz.checking')) : phase === 'followup' ? t('quiz.reply') : mode === 'exam' ? t('exam.next') : t('quiz.check')}
          </button>
        </div>
      )}

      {phase === 'feedback' && result && mode !== 'speed' && !(mode === 'boss' && result.correct) && (
        <FeedbackSheet
          key={`sheet-${q?.id}`}
          result={result}
          chosenText={chosenText}
          onContinue={proceed}
          onReport={report}
          onExplain={
            ai && q
              ? () =>
                  explainAgain({
                    language: s.language ?? q.language,
                    context: q.context,
                    prompt: q.prompt,
                    options: q.options?.map((o) => o.text),
                    correct: result.correctAnswer,
                    given: chosenText ?? (answer?.kind === 'text' ? answer.text : undefined),
                    correctNow: result.correct,
                    explanation: result.explanation,
                  })
              : undefined
          }
          last={!next}
          auto={autoNext}
        />
      )}
      {phase === 'feedback' && result && mode === 'boss' && result.correct && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <p className="combo-pop max-w-md rounded-2xl bg-green-500 px-4 py-3 text-center font-black text-night shadow-xl">
            ⚔️ {t('play.boss.hit', { n: result.damage ?? 0 })}
            {result.shield === 'mended' ? ` · 🛡️ ${t('play.boss.mended')}` : ''}
          </p>
        </div>
      )}

      {phase === 'intro' && <Intro mode={mode} onGo={() => void startRun()} bossName={t(`pets.species.${bossSpecies}`)} bossSpecies={bossSpecies} />}

      {showChest && (
        <ChestPick
          key={chestKey}
          sessionId={s.id}
          onRewards={takeRewards}
          onDone={(left) => {
            setChests(left);
            if (left > 0) setChestKey((k) => k + 1);
            else {
              setShowChest(false);
              advance();
            }
          }}
        />
      )}
    </Shell>
  );
}

/** Rewards held back during a round, added up. */
function mergeRewards(a: Rewards | null, b: Rewards): Rewards {
  if (!a) return b;
  return {
    xp: a.xp + b.xp,
    levelUp: a.levelUp && b.levelUp ? { level: b.levelUp.level, coins: a.levelUp.coins + b.levelUp.coins, chest: b.levelUp.chest ?? a.levelUp.chest } : (b.levelUp ?? a.levelUp),
    badges: [...new Set([...a.badges, ...b.badges])],
    questsCompleted: [...new Set([...a.questsCompleted, ...b.questsCompleted])],
    hatched: b.hatched ?? a.hatched,
    chest: b.chest ?? a.chest,
    egg: b.egg ?? a.egg,
  };
}

function Shell({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  return (
    <div className="arena relative" data-mode={mode} data-theme="dark">
      <div className="arena-stars" aria-hidden />
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-3">{children}</div>
    </div>
  );
}

function askLabel(q: PublicQuestion, t: (k: string) => string): string {
  switch (q.format) {
    case 'true_false':
      return t('play.ask.tf');
    case 'multiple_choice':
    case 'cause_effect':
      return t('play.ask.mcq');
    case 'multiple_select':
      return t('play.ask.multi');
    case 'type_answer':
      return t('play.ask.typed');
    case 'ordering':
      return t('play.ask.order');
    case 'matching':
      return t('play.ask.match');
    case 'categorize':
      return t('play.ask.sort');
    case 'explain':
    case 'apply':
    case 'compare':
    case 'teach_back':
      return t('play.ask.written');
    case 'calculation':
      return t('play.ask.calc');
    default:
      return t(`formats.${q.format}`);
  }
}

function Progress({ answered, total }: { answered: number; total: number }) {
  const { t } = useTranslation();
  const p = total ? Math.min(1, answered / total) : 0;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label={t('play.progress')} aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="bar-tip h-full rounded-full bg-gradient-to-r from-emerald-400 via-lime-300 to-yellow-300 transition-[width] duration-500" style={{ width: `${Math.max(5, p * 100)}%` }} />
      </div>
    </div>
  );
}

function SpeedBar({ leftMs, total, points, best }: { leftMs: number; total: number; points: number; best: number }) {
  const { t } = useTranslation();
  const p = Math.max(0, Math.min(1, leftMs / total));
  const color = p > 0.5 ? 'from-emerald-400 to-lime-300' : p > 0.2 ? 'from-yellow-300 to-amber-400' : 'from-rose-500 to-orange-400';
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="h-4 overflow-hidden rounded-full bg-white/15" role="timer" aria-label={t('play.timeLeft', { s: Math.ceil(leftMs / 1000) })}>
          <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${p * 100}%` }} />
        </div>
        <p className="mt-0.5 text-xs font-black text-white/70 tabular-nums">
          ⏱ {Math.ceil(leftMs / 1000)}s {best > 0 && `· ${t('play.bestScore', { n: best })}`}
        </p>
      </div>
      <span key={points} className="bump shrink-0 rounded-2xl bg-white/15 px-3 py-1 text-xl font-black text-amber-300 tabular-nums" aria-label={t('play.points', { n: points })}>
        {points}
      </span>
    </div>
  );
}

function Shields({ n }: { n: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center gap-1" aria-label={t('play.boss.shields', { count: n })}>
      {[0, 1, 2].map((i) => (
        <span key={`${i}-${i < n}`} className={`text-2xl ${i < n ? 'shield-crack' : 'opacity-25 grayscale'}`}>
          🛡️
        </span>
      ))}
    </div>
  );
}

function Combo({ n }: { n: number }) {
  const { t } = useTranslation();
  if (n < 2) return <span className="w-12" />;
  return (
    <span key={n} className={`bump flex shrink-0 items-center gap-0.5 rounded-full px-2.5 py-1 text-sm font-black ${n >= 5 ? 'combo-hot' : 'bg-white/15'}`} aria-label={t('quiz.combo', { n })}>
      🔥×{n}
    </span>
  );
}

function Ring({ left, total }: { left: number; total: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <span className="flex items-center gap-1 rounded-full bg-yellow-300 px-2 py-0.5 text-xs font-black text-night" role="timer" aria-label={`${Math.ceil(left / 1000)}s`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="-rotate-90">
        <circle cx="13" cy="13" r={r} fill="none" strokeWidth="4" stroke="rgb(30 27 75 / 0.2)" />
        <circle cx="13" cy="13" r={r} fill="none" strokeWidth="4" stroke="#1e1b4b" strokeDasharray={c} strokeDashoffset={c * (1 - left / total)} strokeLinecap="round" />
      </svg>
      ⚡×2
    </span>
  );
}

/** 3-2-1-GO before a speed run; the boss walks in before a battle. */
function Intro({ mode, onGo, bossName, bossSpecies }: { mode: Mode; onGo: () => void; bossName: string; bossSpecies: string }) {
  const { t } = useTranslation();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      play('go');
      const id = setTimeout(onGo, 450);
      return () => clearTimeout(id);
    }
    play('tick');
    haptic(10);
    const id = setTimeout(() => setCount(count - 1), 650);
    return () => clearTimeout(id);
  }, [count, onGo]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-night/85 p-6 text-center backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={mode === 'boss' ? t('play.boss.title') : t('play.modes.speed')}>
      {count !== null ? (
        <span key={count} className="count-pop text-8xl font-black text-amber-300 drop-shadow-[0_6px_0_rgb(0_0_0/0.4)]">
          {count === 0 ? t('play.go') : count}
        </span>
      ) : (
        <div className="pop-in max-w-sm">
          {mode === 'boss' ? (
            <div className="boss-idle mx-auto size-36">
              <Creature3D species={bossSpecies} rarity="legendary" className="size-full" label={bossName}>
                <span className="text-7xl">👾</span>
              </Creature3D>
            </div>
          ) : (
            <p className="text-6xl">⚡</p>
          )}
          <h2 className="mt-2 text-3xl font-black">{mode === 'boss' ? t('play.boss.title') : t('play.modes.speed')}</h2>
          <p className="mt-2 font-bold text-white/85">{mode === 'boss' ? t('play.boss.rules', { name: bossName }) : t('play.speedRules')}</p>
          <button
            type="button"
            autoFocus
            onClick={() => (mode === 'speed' ? setCount(3) : (play('go'), onGo()))}
            className="breathe mt-6 w-full rounded-2xl bg-gradient-to-r from-amber-300 to-yellow-400 px-8 py-4 text-xl font-black text-night"
          >
            {mode === 'boss' ? `⚔️ ${t('play.boss.fight')}` : `▶ ${t('play.go')}`}
          </button>
        </div>
      )}
    </div>
  );
}

/** Mock exam countdown; at zero the paper is handed in. Also lets you hand in early. */
function ExamClock({ endsAt, sessionId }: { endsAt: number; sessionId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const handedIn = useRef(false);
  const [sure, setSure] = useState(false);
  const left = Math.max(0, endsAt - now);
  const handIn = useCallback(async () => {
    if (handedIn.current) return;
    handedIn.current = true;
    await api(`/api/sessions/${sessionId}/hand-in`, { method: 'POST' }).catch(() => {});
    navigate(`/exam/${sessionId}`, { replace: true });
  }, [navigate, sessionId]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (left === 0) void handIn();
  }, [left, handIn]);
  const m = Math.floor(left / 60_000);
  const sec = Math.floor((left % 60_000) / 1000);
  return (
    <span className="ml-auto flex items-center gap-2">
      <span className={`rounded-full px-2.5 py-0.5 font-black tabular-nums ${left < 60_000 ? 'bg-rose-600 text-white' : 'bg-white/15'}`} role="timer" aria-label={t('exam.timeLeft')}>
        ⏱ {m}:{String(sec).padStart(2, '0')}
      </span>
      {/* Two taps instead of a browser dialog (dialogs are blocked in some places the app runs). */}
      <button onClick={() => (sure ? void handIn() : setSure(true))} onBlur={() => setSure(false)} className={`rounded-full px-2.5 py-0.5 text-sm font-black ring-1 ${sure ? 'bg-rose-600 text-white ring-rose-600' : 'bg-white/10 ring-white/30'}`}>
        {sure ? t('exam.handInSure') : t('exam.handIn')}
      </button>
    </span>
  );
}
