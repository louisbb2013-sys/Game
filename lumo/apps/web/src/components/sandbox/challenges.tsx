import { grade, publicQuestion, type Answer, type GradeResult, type Question, type SandboxData } from '@lumo/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { play } from '../../lib/sound';
import { isReady, QuestionInput } from '../quiz/inputs';
import { BigButton, fmtTime, useTimer, type PlayerProps } from './shared';

type QuizShow = Extract<SandboxData, { kind: 'quiz_show' }>;
type Escape = Extract<SandboxData, { kind: 'escape_room' }>;

/** One question, answered with the same inputs as the quiz and graded on the device. */
function LocalQuestion({ q, onGraded, onNext, nextLabel }: { q: Question; onGraded?: (r: GradeResult) => void; onNext: (r: GradeResult) => void; nextLabel?: string }) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const pq = publicQuestion(q);
  const check = () => {
    if (!answer || !isReady(pq, answer)) return;
    const r = grade(q, answer);
    setResult(r);
    play(r.correct ? 'correct' : 'wrong');
    onGraded?.(r);
  };
  return (
    <div className="space-y-3">
      <p className="text-lg font-black whitespace-pre-line">{q.prompt}</p>
      <fieldset disabled={!!result} className="min-w-0">
        <QuestionInput q={pq} value={answer} onChange={setAnswer} onSubmit={check} reveal={result} />
      </fieldset>
      {result ? (
        <div className={`space-y-2 rounded-2xl p-3 ${result.correct ? 'bg-good/10' : 'bg-bad/10'}`}>
          <p className={`font-black ${result.correct ? 'text-good' : 'text-bad'}`}>{result.correct ? t('sandbox.right') : t('sandbox.notQuite')}</p>
          {!result.correct && <p className="text-sm font-bold whitespace-pre-line">{result.correctAnswer}</p>}
          <p className="text-sm whitespace-pre-line">{result.explanation}</p>
          <BigButton onClick={() => onNext(result)}>{nextLabel ?? t('quiz.continue')}</BigButton>
        </div>
      ) : (
        <BigButton onClick={check} disabled={!answer || !isReady(pq, answer)}>
          {t('quiz.check')}
        </BigButton>
      )}
    </div>
  );
}

export function QuizShowPlayer({ data, onComplete }: PlayerProps<QuizShow>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<{ c: number; k: number } | null>(null);
  const [done, setDone] = useState<Record<string, number>>({}); // "c-k" -> points won (0 if wrong)
  const total = data.categories.reduce((s, c) => s + c.cells.reduce((a, x) => a + x.value, 0), 0);
  const won = Object.values(done).reduce((a, b) => a + b, 0);
  const cellCount = data.categories.reduce((s, c) => s + c.cells.length, 0);
  const finished = Object.keys(done).length === cellCount;

  if (open) {
    const cell = data.categories[open.c]!.cells[open.k]!;
    return (
      <div className="space-y-3">
        <p className="text-center font-black text-amber-glow">
          {data.categories[open.c]!.name} · {cell.value}
        </p>
        <LocalQuestion
          q={cell.q}
          onNext={(r) => {
            setDone((d) => ({ ...d, [`${open.c}-${open.k}`]: Math.round(cell.value * r.score) }));
            setOpen(null);
          }}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-center text-2xl font-black">
        🏆 {won} <span className="text-base text-muted">/ {total}</span>
      </p>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${data.categories.length}, minmax(0, 1fr))` }}>
        {data.categories.map((cat, c) => (
          <div key={c} className="space-y-2">
            <p className="flex min-h-12 items-center justify-center rounded-xl bg-night p-1 text-center text-xs font-black text-white sm:text-sm">{cat.name}</p>
            {cat.cells.map((cell, k) => {
              const key = `${c}-${k}`;
              const res = done[key];
              return (
                <button
                  key={k}
                  type="button"
                  disabled={res !== undefined}
                  onClick={() => setOpen({ c, k })}
                  className={`h-14 w-full rounded-xl text-lg font-black shadow transition ${res === undefined ? 'bg-brand text-amber-300 hover:scale-105' : res > 0 ? 'bg-good/20 text-good' : 'bg-bad/10 text-bad'}`}
                >
                  {res === undefined ? cell.value : res > 0 ? `+${res}` : '✗'}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <BigButton tone={finished ? 'good' : 'plain'} onClick={() => onComplete(won / total)}>
        {finished ? t('sandbox.finish') : t('sandbox.endGame')}
      </BigButton>
    </div>
  );
}

export function EscapeRoomPlayer({ data, onComplete }: PlayerProps<Escape>) {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [room, setRoom] = useState(0);
  const [digits, setDigits] = useState<number[]>([]);
  const [firstTry, setFirstTry] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const left = useTimer(data.minutes * 60, started && !escaped, () => setTimeUp(true));
  const r = data.rooms[room];

  if (!started) {
    return (
      <div className="space-y-4 rounded-3xl bg-gradient-to-br from-slate-900 to-indigo-900 p-6 text-center text-white">
        <p className="text-6xl">🔐</p>
        <p className="text-lg font-bold">{data.intro}</p>
        <p className="text-sm text-indigo-200">{t('sandbox.escapeRules', { rooms: data.rooms.length, min: data.minutes })}</p>
        <BigButton onClick={() => setStarted(true)}>{t('sandbox.enter')}</BigButton>
      </div>
    );
  }
  if (escaped || timeUp || !r) {
    const score = (firstTry / data.rooms.length) * (escaped ? 1 : 0.5);
    return (
      <div className="space-y-4 rounded-3xl bg-gradient-to-br from-slate-900 to-indigo-900 p-6 text-center text-white">
        <p className="text-6xl">{escaped ? '🚪✨' : '⌛'}</p>
        <p className="text-2xl font-black">{escaped ? t('sandbox.escaped') : t('sandbox.timeUp')}</p>
        <p className="font-mono text-3xl tracking-[0.4em]">{data.code}</p>
        <BigButton tone="good" onClick={() => onComplete(score)}>
          {t('sandbox.finish')}
        </BigButton>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-night px-4 py-2 font-black text-white">
        <span>
          {r.emoji} {r.title}
        </span>
        <span className="font-mono tracking-[0.3em]">
          {data.rooms.map((_, k) => (k < digits.length ? digits[k] : '•')).join('')}
        </span>
        <span className={left < 60 ? 'text-bad' : ''}>⏱ {fmtTime(left)}</span>
      </div>
      <p className="font-bold text-muted italic">{r.story}</p>
      <LocalQuestion
        key={`${room}-${attempt}`}
        q={r.q}
        nextLabel={undefined}
        onNext={(res) => {
          if (res.correct) {
            if (attempt === 0) setFirstTry((f) => f + 1);
            const nd = [...digits, r.digit];
            setDigits(nd);
            setAttempt(0);
            if (nd.length === data.rooms.length) {
              play('finish');
              setEscaped(true);
            } else setRoom(room + 1);
          } else setAttempt((a) => a + 1); // same lock, try again (a new attempt resets the input)
        }}
      />
    </div>
  );
}
