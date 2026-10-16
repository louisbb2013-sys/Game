import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnswerResult } from '../../lib/quiz';

/**
 * The moment after answering: right or wrong, WHY (the explanation always shows: explained feedback
 * is what makes a quiz teach), and for a wrong pick, why that option was tempting. A right answer
 * moves on by itself after a moment unless you touch the panel to keep reading.
 */
export function FeedbackSheet({ result, chosenText, onContinue, onReport, onExplain, last, auto }: { result: AnswerResult; chosenText: string | null; onContinue: () => void; onReport: () => void; onExplain?: () => Promise<string>; last: boolean; auto: boolean }) {
  const { t } = useTranslation();
  const good = result.correct;
  const partial = !good && result.score > 0;
  const btn = useRef<HTMLButtonElement>(null);
  const [held, setHeld] = useState(!auto || !good);
  const [reported, setReported] = useState(false);
  const [more, setMore] = useState<{ busy: boolean; text?: string; failed?: boolean } | null>(null);
  const explain = async () => {
    if (!onExplain || more?.busy) return;
    setHeld(true);
    setMore({ busy: true });
    try {
      setMore({ busy: false, text: await onExplain() });
    } catch {
      setMore({ busy: false, failed: true });
    }
  };
  const praise = useRef(good ? pick(t('play.praise', { returnObjects: true }) as string[]) : pick(t('play.oops', { returnObjects: true }) as string[]));

  useEffect(() => {
    btn.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (held) return;
    const id = setTimeout(onContinue, 2600);
    return () => clearTimeout(id);
  }, [held, onContinue]);

  return (
    <div
      role="status"
      onPointerDown={() => setHeld(true)}
      className={`sheet-up fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[72dvh] max-w-xl overflow-y-auto lg:max-w-3xl rounded-t-3xl p-4 pb-[max(env(safe-area-inset-bottom),1rem)] text-night shadow-[0_-12px_40px_rgb(0_0_0/0.45)] ${good ? 'bg-[#dcfce7]' : partial ? 'bg-[#fef3c7]' : 'bg-[#ffe4e6]'}`}
    >
      <div className="flex items-center gap-3">
        <span className={`grid size-12 shrink-0 place-items-center rounded-full text-2xl font-black text-white ${good ? 'bg-green-600' : partial ? 'bg-amber-500' : 'bg-rose-600'}`} aria-hidden>
          {good ? '✓' : partial ? '½' : '✗'}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-2xl leading-tight font-black ${good ? 'text-green-800' : partial ? 'text-amber-800' : 'text-rose-800'}`}>
            {good ? praise.current : partial ? t('quiz.partial', { pct: Math.round(result.score * 100) }) : praise.current}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs font-black">
            {result.xp > 0 && <span className="rounded-full bg-white/80 px-2 py-0.5">+{result.xp} XP{result.lightning ? ' ⚡×2' : ''}</span>}
            {good && result.combo >= 2 && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-white">🔥 ×{result.combo}</span>}
            {result.mastered && <span className="rounded-full bg-amber-400 px-2 py-0.5">🌟 {t('quiz.mastered')}</span>}
          </div>
        </div>
      </div>

      {!good && chosenText && result.chosenNote && (
        <div className="mt-3 rounded-2xl bg-white/80 p-3">
          <p className="text-xs font-black tracking-wide text-rose-700 uppercase">{t('play.youPicked', { answer: chosenText })}</p>
          <p className="mt-0.5 font-bold">{result.chosenNote}</p>
        </div>
      )}
      {!good && result.correctAnswer && (
        <div className="mt-3">
          <p className="text-xs font-black tracking-wide text-slate-600 uppercase">{t('quiz.correctAnswer')}</p>
          <p className="text-lg font-black whitespace-pre-line">{result.correctAnswer}</p>
        </div>
      )}
      {result.feedback && <p className="mt-2 font-bold">{result.feedback}</p>}
      {result.missingPoints && result.missingPoints.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-black tracking-wide text-slate-600 uppercase">{t('quiz.missing')}</p>
          <ul className="list-disc pl-5 text-sm font-bold">
            {result.missingPoints.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 rounded-2xl bg-white/60 p-3">
        <p className="text-xs font-black tracking-wide text-slate-600 uppercase">💡 {t('quiz.why')}</p>
        <p className="mt-0.5 leading-snug whitespace-pre-line">{result.explanation}</p>
      </div>
      {onExplain && (
        <div className="mt-2">
          {more?.text ? (
            <div className="pop-in rounded-2xl bg-indigo-100 p-3 text-indigo-950">
              <p className="text-xs font-black tracking-wide uppercase">🤖 {t('play.explainTitle')}</p>
              <p className="mt-0.5 leading-snug whitespace-pre-line">{more.text}</p>
            </div>
          ) : (
            <button type="button" onClick={() => void explain()} disabled={more?.busy} className="w-full rounded-2xl bg-white/70 px-3 py-2 text-sm font-black text-indigo-800 ring-1 ring-indigo-300 disabled:opacity-60">
              {more?.busy ? t('play.explaining') : more?.failed ? t('play.explainFailed') : `🤖 ${t('play.explainMore')}`}
            </button>
          )}
        </div>
      )}
      {result.retryScheduled && <p className="mt-2 text-sm font-bold text-slate-700">🔁 {t('quiz.retrySoon')}</p>}

      <button
        ref={btn}
        onClick={onContinue}
        className={`relative mt-3 w-full overflow-hidden rounded-2xl py-4 text-lg font-black text-white shadow-[0_5px_0_0_rgb(0_0_0/0.25)] active:translate-y-1 active:shadow-none ${good ? 'bg-green-600' : 'bg-rose-600'}`}
      >
        {!held && <span className="absolute inset-y-0 left-0 bg-white/25" style={{ animation: 'fill-bar 2.6s linear forwards' }} aria-hidden />}
        <span className="relative">{last ? t('quiz.finish') : t('quiz.continue')}</span>
      </button>
      <div className="mt-2 text-center">
        <button
          type="button"
          disabled={reported}
          onClick={() => {
            setReported(true);
            setHeld(true);
            onReport();
          }}
          className="text-xs font-bold text-slate-600 underline-offset-2 hover:underline disabled:no-underline"
        >
          {reported ? t('play.reported') : `🚩 ${t('play.report')}`}
        </button>
      </div>
    </div>
  );
}

function pick(list: string[] | string): string {
  if (!Array.isArray(list) || list.length === 0) return String(list);
  return list[Math.floor(Math.random() * list.length)]!;
}
