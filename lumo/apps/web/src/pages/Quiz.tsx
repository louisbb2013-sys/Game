import type { Answer, PublicQuestion } from '@lumo/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { CoinIcon, FlameIcon, HeartIcon } from '../components/icons';
import { Lumo, type LumoMood } from '../components/Lumo';
import { isReady, QuestionInput } from '../components/quiz/inputs';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AnswerResponse, AnswerResult, PublicSession, SessionSummary } from '../lib/quiz';
import { play, setSoundEnabled } from '../lib/sound';

type Phase = 'answering' | 'grading' | 'followup' | 'feedback' | 'summary';

interface Loaded {
  session: PublicSession;
  question: PublicQuestion | null;
}

export function Quiz() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [data, setData] = useState<Loaded | null>((location.state as Loaded | null) ?? null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [phase, setPhase] = useState<Phase>('answering');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [followText, setFollowText] = useState('');
  const [next, setNext] = useState<PublicQuestion | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comboFlash, setComboFlash] = useState<number | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => setSoundEnabled(user?.settings.sound ?? true), [user?.settings.sound]);

  useEffect(() => {
    if (data || !sessionId) return;
    api<Loaded>(`/api/sessions/${sessionId}`).then(setData, () => setError('load'));
  }, [data, sessionId]);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [data?.question?.id]);

  const submit = useCallback(
    async (override?: Answer) => {
      const a = override ?? answer;
      if (!data?.question || !a || phase === 'grading') return;
      if (!override && !isReady(data.question, a)) return;
      setPhase('grading');
      setError(null);
      try {
        const res = await api<AnswerResponse>(`/api/sessions/${data.session.id}/answer`, {
          method: 'POST',
          body: { questionId: data.question.id, answer: a, timeMs: Date.now() - startedAt.current },
        });
        if (res.followUp) {
          setFollowUp(res.followUp);
          setPhase('followup');
          return;
        }
        setResult(res.result);
        setNext(res.next);
        setSummary(res.summary);
        setData((d) => (d ? { ...d, session: res.session } : d));
        play(res.result.correct ? 'correct' : 'wrong');
        if (res.result.correct && [3, 5, 10].includes(res.result.combo)) {
          setComboFlash(res.result.combo);
          play('combo');
          setTimeout(() => setComboFlash(null), 1400);
        }
        setPhase('feedback');
      } catch (e) {
        setError(e instanceof ApiError ? e.code : 'network');
        setPhase(followUp ? 'followup' : 'answering');
      }
    },
    [answer, data, phase, followUp],
  );

  const proceed = () => {
    if (summary || !next) {
      setPhase('summary');
      play('finish');
      void refresh();
      return;
    }
    setData((d) => (d ? { ...d, question: next } : d));
    setAnswer(null);
    setResult(null);
    setFollowUp(null);
    setFollowText('');
    setNext(null);
    setPhase('answering');
  };

  if (error === 'load') {
    return (
      <Centered>
        <Lumo mood="sad" size={100} />
        <p className="font-bold">{t('quiz.loadError')}</p>
        <Link to="/learn" className="font-black text-brand">
          {t('common.back')}
        </Link>
      </Centered>
    );
  }
  if (!data) {
    return (
      <Centered>
        <Lumo mood="thinking" size={100} />
        <p className="font-bold text-muted">{t('quiz.preparing')}</p>
      </Centered>
    );
  }
  if (phase === 'summary' && summary) return <Summary summary={summary} deckId={data.session.deckId} />;

  const q = data.question;
  const s = data.session;
  const progress = s.total ? Math.min(1, s.answered / s.total) : 0;
  const mood: LumoMood = phase === 'feedback' ? (result?.correct ? 'cheer' : 'sad') : phase === 'grading' ? 'thinking' : 'happy';

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-3 pb-40">
      {/* top bar: exit, progress, hearts/combo */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/decks/${s.deckId}`)} aria-label={t('quiz.exit')} className="grid size-9 place-items-center rounded-full text-2xl font-black text-muted hover:bg-surface">
          ×
        </button>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-indigo-400 transition-[width] duration-500" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
        {s.mode === 'challenge' && (
          <span className="flex items-center gap-1 font-black text-heart" aria-label={`${t('stats.hearts')}: ${s.hearts}`}>
            <HeartIcon size={22} /> {s.hearts}
          </span>
        )}
        <ComboBadge combo={s.combo} />
      </div>

      {comboFlash && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center" aria-live="polite">
          <div className="combo-pop rounded-full bg-amber-glow px-5 py-2 text-xl font-black text-night shadow-xl">{t('quiz.comboFlash', { n: comboFlash })}</div>
        </div>
      )}

      {q && (
        <section className="mt-5 flex-1" key={q.id}>
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-extrabold text-muted">{t(`formats.${q.format}`)}</span>
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-extrabold text-brand">{t(`bloom.${q.bloom}`)}</span>
          </div>
          <div className="mb-5 flex items-start gap-3">
            <Lumo size={56} mood={mood} />
            <h1 className="pop-in min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-surface p-3.5 text-lg leading-snug font-extrabold whitespace-pre-line ring-1 ring-line">{q.prompt}</h1>
          </div>

          <fieldset disabled={phase !== 'answering'} className="min-w-0">
            <QuestionInput q={q} value={answer} onChange={setAnswer} onSubmit={() => void submit()} reveal={phase === 'feedback' && result ? result : null} />
          </fieldset>

          {(phase === 'followup' || (phase === 'grading' && followUp)) && followUp && (
            <div className="pop-in mt-4 space-y-2">
              <div className="flex items-start gap-3">
                <Lumo size={48} mood="thinking" />
                <p className="flex-1 rounded-2xl rounded-tl-sm bg-amber-glow/15 p-3 font-bold ring-1 ring-amber-glow/40">{followUp}</p>
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
            <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
              {t(`quiz.errors.${error}`, { defaultValue: t('signin.errors.network') })}
            </p>
          )}
        </section>
      )}

      {/* bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl">
        {phase === 'feedback' && result ? (
          <Feedback result={result} onContinue={proceed} last={!next} />
        ) : (
          <div className="border-t border-line bg-bg/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur">
            <button
              onClick={() => (phase === 'followup' ? void submit({ kind: 'text', text: followText }) : void submit())}
              disabled={phase === 'grading' || (phase === 'followup' ? !followText.trim() : !q || !isReady(q, answer))}
              className="w-full rounded-2xl bg-brand py-4 text-lg font-black text-brand-ink shadow-[0_4px_0_0_rgb(0_0_0/0.18)] transition active:translate-y-0.5 active:shadow-none disabled:opacity-40"
            >
              {phase === 'grading' ? t('quiz.checking') : phase === 'followup' ? t('quiz.reply') : t('quiz.check')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ComboBadge({ combo }: { combo: number }) {
  const { t } = useTranslation();
  if (combo < 2) return <span className="w-10" />;
  const hot = combo >= 5;
  return (
    <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sm font-black ${hot ? 'bg-amber-glow text-night' : 'bg-surface-2'}`} aria-label={t('quiz.combo', { n: combo })} title={t('quiz.combo', { n: combo })}>
      <FlameIcon size={18} className={hot ? 'flame' : ''} />×{combo}
    </span>
  );
}

function Feedback({ result, onContinue, last }: { result: AnswerResult; onContinue: () => void; last: boolean }) {
  const { t } = useTranslation();
  const good = result.correct;
  const partial = !good && result.score > 0;
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus(), []);
  return (
    <div role="status" className={`rise max-h-[60vh] overflow-y-auto border-t-4 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] ${good ? 'border-good bg-[color-mix(in_oklab,var(--lumo-good)_12%,var(--lumo-bg))]' : 'border-bad bg-[color-mix(in_oklab,var(--lumo-bad)_10%,var(--lumo-bg))]'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xl font-black ${good ? 'text-good' : 'text-bad'}`}>
          {good ? t(result.multiplier > 1 ? 'quiz.correctCombo' : 'quiz.correct') : partial ? t('quiz.partial', { pct: Math.round(result.score * 100) }) : t('quiz.notQuite')}
        </p>
        {result.xp > 0 && <span className="rounded-full bg-amber-glow/25 px-2.5 py-0.5 text-sm font-black">+{result.xp} XP</span>}
      </div>
      {result.mastered && <p className="mt-1 font-black text-brand">🌟 {t('quiz.mastered')}</p>}
      {result.feedback && <p className="mt-2 font-bold">{result.feedback}</p>}
      {!good && result.correctAnswer && (
        <div className="mt-2">
          <p className="text-xs font-black tracking-wide text-muted uppercase">{t('quiz.correctAnswer')}</p>
          <p className="font-bold whitespace-pre-line">{result.correctAnswer}</p>
        </div>
      )}
      {result.missingPoints && result.missingPoints.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-black tracking-wide text-muted uppercase">{t('quiz.missing')}</p>
          <ul className="list-disc pl-5 text-sm font-bold">
            {result.missingPoints.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-2 text-sm" open={!good}>
        <summary className="cursor-pointer font-black text-muted">{t('quiz.why')}</summary>
        <p className="mt-1 whitespace-pre-line">{result.explanation}</p>
      </details>
      {result.retryScheduled && <p className="mt-2 text-sm font-bold text-muted">🔁 {t('quiz.retrySoon')}</p>}
      <button
        ref={btn}
        onClick={onContinue}
        className={`mt-3 w-full rounded-2xl py-4 text-lg font-black text-white shadow-[0_4px_0_0_rgb(0_0_0/0.18)] active:translate-y-0.5 active:shadow-none ${good ? 'bg-good' : 'bg-bad'}`}
      >
        {last ? t('quiz.finish') : t('quiz.continue')}
      </button>
    </div>
  );
}

function Summary({ summary, deckId }: { summary: SessionSummary; deckId: string }) {
  const { t } = useTranslation();
  const outOfHearts = summary.endedReason === 'out_of_hearts';
  useEffect(() => {
    if (outOfHearts || summary.accuracy < 0.6) return;
    const colors = ['#F5A524', '#4F46E5', '#F472B6', '#22C55E', '#38BDF8'];
    const nodes = Array.from({ length: 40 }, (_, i) => {
      const el = document.createElement('span');
      el.className = 'confetti';
      el.style.left = `${Math.random() * 100}vw`;
      el.style.background = colors[i % colors.length]!;
      el.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
      el.style.animationDelay = `${Math.random() * 0.4}s`;
      document.body.appendChild(el);
      return el;
    });
    const timer = setTimeout(() => nodes.forEach((n) => n.remove()), 4000);
    return () => {
      clearTimeout(timer);
      nodes.forEach((n) => n.remove());
    };
  }, [outOfHearts, summary.accuracy]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center px-4 py-8 text-center">
      <Lumo size={130} mood={outOfHearts ? 'sad' : 'cheer'} glow={1} />
      <h1 className="mt-3 text-3xl font-black">{outOfHearts ? t('quiz.outOfHearts') : t('quiz.sessionDone')}</h1>
      <p className="mt-1 text-muted">{outOfHearts ? t('quiz.outOfHeartsBody') : t('quiz.sessionDoneBody')}</p>

      <div className="mt-6 grid w-full grid-cols-3 gap-3">
        <Stat label={t('quiz.accuracy')} value={`${Math.round(summary.accuracy * 100)}%`} />
        <Stat label="XP" value={`+${summary.xp}`} />
        <Stat label={t('quiz.bestCombo')} value={`×${summary.bestCombo}`} />
      </div>
      <div className="mt-3 flex w-full flex-wrap justify-center gap-2 text-sm font-black">
        {summary.coins > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 ring-1 ring-line">
            <CoinIcon size={18} /> +{summary.coins}
          </span>
        )}
        {summary.streak.extended && (
          <span className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 ring-1 ring-line">
            <FlameIcon size={18} /> {t('quiz.streakDays', { count: summary.streak.days })}
          </span>
        )}
        {summary.heartsGained > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-heart ring-1 ring-line">
            <HeartIcon size={18} /> +{summary.heartsGained}
          </span>
        )}
      </div>

      <section className="mt-6 w-full rounded-3xl bg-surface p-4 text-left ring-1 ring-line">
        <h2 className="mb-2 font-black">{t('quiz.conceptsPracticed')}</h2>
        <ul className="space-y-2">
          {summary.concepts.map((c) => (
            <li key={c.id}>
              <div className="flex justify-between text-sm font-bold">
                <span>{c.term}</span>
                <span className="text-muted">{t(`mastery.${c.band}`)}</span>
              </div>
              <MasteryBar score={c.score} />
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid w-full gap-3">
        <Link to={`/decks/${deckId}`} className="rounded-2xl bg-brand py-4 text-lg font-black text-brand-ink shadow-[0_4px_0_0_rgb(0_0_0/0.18)]">
          {t('quiz.backToDeck')}
        </Link>
        <Link to="/" className="font-black text-muted">
          {t('nav.home')}
        </Link>
      </div>
    </div>
  );
}

export function MasteryBar({ score }: { score: number }) {
  return (
    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${score >= 1 ? 'bg-amber-glow' : score >= 0.5 ? 'bg-brand' : 'bg-indigo-300'}`} style={{ width: `${Math.max(4, score * 100)}%` }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-bold text-muted">{label}</p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-center">{children}</div>;
}
