import type { CheckQ } from '@lumo/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { play } from '../../lib/sound';

export interface PlayerProps<D> {
  data: D;
  language: 'en' | 'fr';
  onComplete: (score: number) => void;
}

/** A "pause and check" multiple-choice question used inside watch/listen formats. */
export function CheckCard({ q, onDone }: { q: CheckQ; onDone: (correct: boolean) => void }) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<number | null>(null);
  const answered = chosen !== null;
  const right = chosen === q.correctIndex;
  return (
    <div className="pop-in space-y-3 rounded-3xl bg-surface p-4 text-left text-ink ring-1 ring-line">
      <p className="text-lg font-black">{q.prompt}</p>
      <div className="grid gap-2">
        {q.options.map((o, i) => {
          const state = !answered ? 'bg-surface ring-line hover:ring-brand' : i === q.correctIndex ? 'bg-good/15 ring-good' : i === chosen ? 'bg-bad/10 ring-bad' : 'bg-surface ring-line opacity-60';
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => {
                setChosen(i);
                play(i === q.correctIndex ? 'correct' : 'wrong');
              }}
              className={`rounded-2xl p-3 text-left font-bold ring-2 transition ${state}`}
            >
              {answered && i === q.correctIndex && '✓ '}
              {answered && i === chosen && i !== q.correctIndex && '✗ '}
              {o}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="space-y-2">
          <p className={`font-black ${right ? 'text-good' : 'text-bad'}`}>{right ? t('sandbox.right') : t('sandbox.notQuite')}</p>
          <p className="text-sm">{q.explanation}</p>
          <button type="button" onClick={() => onDone(right)} className="w-full rounded-2xl bg-brand py-3 font-black text-brand-ink">
            {t('quiz.continue')}
          </button>
        </div>
      )}
    </div>
  );
}

export function BigButton({ children, onClick, disabled, tone = 'brand' }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'brand' | 'good' | 'bad' | 'plain' }) {
  const cls = { brand: 'bg-brand text-brand-ink', good: 'bg-good text-white', bad: 'bg-bad text-white', plain: 'bg-surface ring-1 ring-line' }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl py-3.5 text-lg font-black shadow-[0_4px_0_0_rgb(0_0_0/0.15)] transition active:translate-y-0.5 active:shadow-none disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

export function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex justify-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-2 rounded-full transition-all ${i === current ? 'w-6 bg-brand' : i < current ? 'w-2 bg-brand/50' : 'w-2 bg-line'}`} />
      ))}
    </div>
  );
}

export function useTimer(seconds: number, running: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const ended = useRef(false);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useIntervalEffect(running && left > 0, () => setLeft((l) => Math.max(0, l - 1)));
  useEffect(() => {
    if (running && left === 0 && !ended.current) {
      ended.current = true;
      endRef.current();
    }
  }, [left, running]);
  return left;
}

function useIntervalEffect(active: boolean, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => ref.current(), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
