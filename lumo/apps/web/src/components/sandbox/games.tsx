import { shuffle, type SandboxData } from '@lumo/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { play } from '../../lib/sound';
import { BigButton, fmtTime, ProgressDots, useTimer, type PlayerProps } from './shared';

type Crossword = Extract<SandboxData, { kind: 'crossword' }>;
type WordSearch = Extract<SandboxData, { kind: 'word_search' }>;
type Memory = Extract<SandboxData, { kind: 'memory' }>;
type Scramble = Extract<SandboxData, { kind: 'scramble' }>;
type Speed = Extract<SandboxData, { kind: 'speed_round' }>;
type TwoTruths = Extract<SandboxData, { kind: 'two_truths' }>;

const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

// ---------- crossword ----------

export function CrosswordPlayer({ data, onComplete }: PlayerProps<Crossword>) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [active, setActive] = useState(0);
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const entries = data.entries;
  const e = entries[active]!;

  // cell -> letter typed (from the entry that last wrote it)
  const cells = useMemo(() => {
    const m = new Map<string, { letter: string; numbers: number[]; entries: number[] }>();
    entries.forEach((en, idx) => {
      for (let k = 0; k < en.answer.length; k++) {
        const r = en.row + (en.dir === 'down' ? k : 0);
        const c = en.col + (en.dir === 'across' ? k : 0);
        const key = `${r},${c}`;
        const cur = m.get(key) ?? { letter: '', numbers: [], entries: [] };
        const typed = answers[idx]?.[k];
        if (typed) cur.letter = typed;
        if (k === 0 && !cur.numbers.includes(en.number)) cur.numbers.push(en.number);
        cur.entries.push(idx);
        m.set(key, cur);
      }
    });
    return m;
  }, [entries, answers]);

  const correct = (idx: number) => (answers[idx] ?? '') === entries[idx]!.answer;
  const score = entries.filter((_, idx) => correct(idx) && !revealed.has(idx)).length / entries.length;

  const setAnswer = (idx: number, v: string) => setAnswers((a) => ({ ...a, [idx]: clean(v).slice(0, entries[idx]!.answer.length) }));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface p-2 ring-1 ring-line">
        {/* Cells shrink to fit the screen (max 2.25rem) so the whole grid is always visible. */}
        <div className="mx-auto grid gap-0.5" style={{ gridTemplateColumns: `repeat(${data.width}, minmax(0, 1fr))`, maxWidth: `${data.width * 2.25}rem` }} role="grid" aria-label={t('sandbox.kinds.crossword')}>
          {Array.from({ length: data.height * data.width }, (_, n) => {
            const r = Math.floor(n / data.width);
            const c = n % data.width;
            const cell = cells.get(`${r},${c}`);
            if (!cell) return <span key={n} className="aspect-square" />;
            const inActive = cell.entries.includes(active);
            const wrong = checked && cell.entries.some((idx) => !correct(idx)) && cell.letter;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setActive(cell.entries.find((x) => x !== active) !== undefined && inActive ? cell.entries.find((x) => x !== active)! : cell.entries[0]!)}
                className={`relative aspect-square rounded-md text-[clamp(0.6rem,3.2vw,1rem)] font-black uppercase ring-1 ${inActive ? 'bg-amber-glow/30 ring-amber-glow' : 'bg-bg ring-line'} ${wrong ? 'text-bad' : ''}`}
              >
                {cell.numbers[0] && <span className="absolute top-0 left-0.5 text-[0.55rem] leading-none font-bold text-muted">{cell.numbers[0]}</span>}
                {cell.letter}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
        <p className="text-sm font-black text-muted">
          {e.number} {t(`sandbox.${e.dir}`)} · {t('sandbox.letters', { n: e.answer.length })}
        </p>
        <p className="font-bold">{e.clue}</p>
        <input
          key={active}
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label={t('sandbox.typeWord')}
          value={answers[active] ?? ''}
          maxLength={e.answer.length}
          onChange={(ev) => setAnswer(active, ev.target.value)}
          onKeyDown={(ev) => ev.key === 'Enter' && setActive((active + 1) % entries.length)}
          className="w-full rounded-xl border-2 border-line bg-bg px-3 py-2 font-mono text-xl tracking-[0.3em] uppercase outline-none focus:border-brand"
        />
        <div className="flex gap-2">
          <button type="button" className="flex-1 rounded-xl py-2 font-bold ring-1 ring-line" onClick={() => setActive((active - 1 + entries.length) % entries.length)}>
            ← {t('sandbox.prevClue')}
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl py-2 font-bold ring-1 ring-line"
            onClick={() => {
              setRevealed((s) => new Set(s).add(active));
              setAnswer(active, e.answer);
            }}
          >
            💡 {t('sandbox.reveal')}
          </button>
          <button type="button" className="flex-1 rounded-xl py-2 font-bold ring-1 ring-line" onClick={() => setActive((active + 1) % entries.length)}>
            {t('sandbox.nextClue')} →
          </button>
        </div>
      </div>

      <ol className="grid gap-1 text-sm">
        {entries.map((en, idx) => (
          <li key={idx}>
            <button type="button" onClick={() => setActive(idx)} className={`w-full rounded-lg px-2 py-1 text-left ${idx === active ? 'bg-brand/10 font-bold' : ''} ${checked ? (correct(idx) ? 'text-good' : 'text-bad') : ''}`}>
              {en.number}. {t(`sandbox.${en.dir}`)} — {en.clue}
            </button>
          </li>
        ))}
      </ol>
      {!checked ? (
        <BigButton onClick={() => (setChecked(true), play(score === 1 ? 'correct' : 'wrong'))}>{t('quiz.check')}</BigButton>
      ) : (
        <BigButton tone="good" onClick={() => onComplete(score)}>
          {t('sandbox.finishScore', { pct: Math.round(score * 100) })}
        </BigButton>
      )}
    </div>
  );
}

// ---------- word search ----------

export function WordSearchPlayer({ data, onComplete }: PlayerProps<WordSearch>) {
  const { t } = useTranslation();
  const [start, setStart] = useState<[number, number] | null>(null);
  const [found, setFound] = useState<{ word: string; cells: string[] }[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const foundCells = new Set(found.flatMap((f) => f.cells));

  const tap = (r: number, c: number) => {
    if (!start) return setStart([r, c]);
    const [r0, c0] = start;
    setStart(null);
    const dr = Math.sign(r - r0);
    const dc = Math.sign(c - c0);
    const len = Math.max(Math.abs(r - r0), Math.abs(c - c0)) + 1;
    if (!(r0 === r || c0 === c || Math.abs(r - r0) === Math.abs(c - c0))) return;
    let s = '';
    const cells: string[] = [];
    for (let k = 0; k < len; k++) {
      s += data.grid[r0 + dr * k]![c0 + dc * k];
      cells.push(`${r0 + dr * k},${c0 + dc * k}`);
    }
    const rev = [...s].reverse().join('');
    const hit = data.words.find((w) => (w.word === s || w.word === rev) && !found.some((f) => f.word === w.word));
    if (hit) {
      play('correct');
      setFound((f) => [...f, { word: hit.word, cells }]);
      setFlash(hit.display);
      setTimeout(() => setFlash(null), 1500);
    } else play('wrong');
  };

  return (
    <div className="space-y-4">
      <p className="text-center text-sm font-bold text-muted">{t('sandbox.wordSearchHint')}</p>
      <div className="mx-auto grid w-full max-w-md select-none gap-0.5" style={{ gridTemplateColumns: `repeat(${data.size}, minmax(0, 1fr))` }}>
        {data.grid.flatMap((row, r) =>
          [...row].map((ch, c) => {
            const key = `${r},${c}`;
            const isStart = start?.[0] === r && start?.[1] === c;
            return (
              <button
                key={key}
                type="button"
                onClick={() => tap(r, c)}
                aria-label={`${ch} ${r + 1},${c + 1}`}
                className={`aspect-square rounded text-sm font-black sm:text-base ${isStart ? 'bg-brand text-brand-ink' : foundCells.has(key) ? 'bg-amber-glow/60' : 'bg-surface'}`}
              >
                {ch}
              </button>
            );
          }),
        )}
      </div>
      {flash && <p className="pop-in text-center text-lg font-black text-good">✓ {flash}</p>}
      <ul className="grid gap-1.5 text-sm">
        {data.words.map((w) => {
          const ok = found.some((f) => f.word === w.word);
          return (
            <li key={w.word} className={`rounded-xl px-3 py-2 ring-1 ring-line ${ok ? 'bg-good/10' : 'bg-surface'}`}>
              {ok ? <b>{w.display} — </b> : <b>{'_ '.repeat(w.word.length).trim()} — </b>}
              {w.clue}
            </li>
          );
        })}
      </ul>
      <BigButton tone={found.length === data.words.length ? 'good' : 'plain'} onClick={() => onComplete(found.length / data.words.length)}>
        {found.length === data.words.length ? t('sandbox.finish') : t('sandbox.foundSoFar', { n: found.length, total: data.words.length })}
      </BigButton>
    </div>
  );
}

// ---------- memory ----------

export function MemoryPlayer({ data, onComplete }: PlayerProps<Memory>) {
  const { t } = useTranslation();
  const cards = useMemo(() => shuffle(data.pairs.flatMap((p) => [{ key: `${p.id}a`, pair: p.id, text: p.a, term: true }, { key: `${p.id}b`, pair: p.id, text: p.b, term: false }])), [data]);
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const done = matched.size === data.pairs.length;

  const flip = (key: string) => {
    if (open.length === 2 || open.includes(key)) return;
    const next = [...open, key];
    setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next.map((k) => cards.find((c) => c.key === k)!);
      if (a!.pair === b!.pair) {
        play('correct');
        setTimeout(() => {
          setMatched((s) => new Set(s).add(a!.pair));
          setOpen([]);
        }, 500);
      } else setTimeout(() => setOpen([]), 1200);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-center text-sm font-bold text-muted">
        {t('sandbox.memoryHint')} · {t('sandbox.moves', { n: moves })}
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {cards.map((c) => {
          const shown = open.includes(c.key) || matched.has(c.pair);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => flip(c.key)}
              disabled={matched.has(c.pair)}
              aria-label={shown ? c.text : t('sandbox.hiddenCard')}
              className={`min-h-24 rounded-2xl p-2 text-sm font-bold transition-all duration-300 ${
                shown ? (matched.has(c.pair) ? 'bg-good/20 ring-2 ring-good' : c.term ? 'bg-brand text-brand-ink' : 'bg-amber-glow/30 ring-2 ring-amber-glow') : 'bg-gradient-to-br from-indigo-700 to-violet-600 text-3xl text-white'
              }`}
            >
              {shown ? c.text : '✦'}
            </button>
          );
        })}
      </div>
      {done && (
        <BigButton tone="good" onClick={() => onComplete(Math.min(1, (data.pairs.length * 1.5) / Math.max(moves, 1)))}>
          {t('sandbox.finish')}
        </BigButton>
      )}
    </div>
  );
}

// ---------- word scramble ----------

export function ScramblePlayer({ data, onComplete }: PlayerProps<Scramble>) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [hints, setHints] = useState(0);
  const [points, setPoints] = useState(0);
  const [state, setState] = useState<'playing' | 'right' | 'skipped'>('playing');
  const item = data.items[i];

  if (!item) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl">🔤</p>
        <p className="text-xl font-black">{t('sandbox.scrambleDone', { n: Math.round(points), total: data.items.length })}</p>
        <BigButton tone="good" onClick={() => onComplete(points / data.items.length)}>
          {t('sandbox.finish')}
        </BigButton>
      </div>
    );
  }

  const letters = [...item.scrambled];
  const guess = picked.map((k) => letters[k]).join('');
  const nextItem = () => {
    setI(i + 1);
    setPicked([]);
    setHints(0);
    setState('playing');
  };
  const pickLetter = (k: number) => {
    const next = [...picked, k];
    setPicked(next);
    const g = next.map((x) => letters[x]).join('');
    if (g.length === item.answer.length) {
      if (g === item.answer) {
        play('correct');
        setPoints((p) => p + Math.max(0.25, 1 - hints * 0.25));
        setState('right');
      } else {
        play('wrong');
        setTimeout(() => setPicked([]), 600);
      }
    }
  };
  const hint = () => {
    // Put the next correct letter in place.
    const want = item.answer[picked.length];
    const k = letters.findIndex((ch, idx) => ch === want && !picked.includes(idx));
    if (k >= 0) {
      setHints((h) => h + 1);
      pickLetter(k);
    }
  };

  return (
    <div className="space-y-4">
      <ProgressDots total={data.items.length} current={i} />
      <p className="rounded-2xl bg-surface p-4 font-bold ring-1 ring-line">{item.clue}</p>
      <div className="flex min-h-12 flex-wrap justify-center gap-1.5">
        {Array.from({ length: item.answer.length }, (_, k) => (
          <span key={k} className={`grid size-9 place-items-center rounded-lg border-b-4 text-xl font-black ${state === 'right' ? 'border-good text-good' : 'border-brand'}`}>
            {guess[k] ?? ''}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {letters.map((ch, k) => (
          <button key={k} type="button" disabled={picked.includes(k) || state !== 'playing'} onClick={() => pickLetter(k)} className="size-11 rounded-xl bg-brand text-xl font-black text-brand-ink shadow disabled:opacity-25">
            {ch}
          </button>
        ))}
      </div>
      {state === 'playing' ? (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setPicked(picked.slice(0, -1))} className="rounded-xl py-2 font-bold ring-1 ring-line">
            ⌫
          </button>
          <button type="button" onClick={hint} className="rounded-xl py-2 font-bold ring-1 ring-line">
            💡 {t('sandbox.hint')}
          </button>
          <button type="button" onClick={() => setState('skipped')} className="rounded-xl py-2 font-bold ring-1 ring-line">
            {t('sandbox.skip')}
          </button>
        </div>
      ) : (
        <div className="space-y-2 text-center">
          <p className={`text-lg font-black ${state === 'right' ? 'text-good' : 'text-muted'}`}>{state === 'right' ? `✓ ${item.answer}` : t('sandbox.itWas', { word: item.answer })}</p>
          <BigButton onClick={nextItem}>{t('quiz.continue')}</BigButton>
        </div>
      )}
    </div>
  );
}

// ---------- speed round ----------

export function SpeedPlayer({ data, onComplete }: PlayerProps<Speed>) {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const [over, setOver] = useState(false);
  const left = useTimer(data.seconds, started && !over, () => setOver(true));
  const item = data.items[i % data.items.length]!;
  const answered = i;

  const answer = (v: boolean) => {
    const ok = v === item.isTrue;
    play(ok ? 'correct' : 'wrong');
    setFlash(ok ? 'good' : 'bad');
    setTimeout(() => setFlash(null), 250);
    if (ok) {
      setRight((r) => r + 1);
      setStreak((s) => s + 1);
    } else setStreak(0);
    if (i + 1 >= data.items.length) setOver(true);
    setI(i + 1);
  };

  if (!started) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-6xl">⚡</p>
        <p className="text-lg font-bold">{t('sandbox.speedIntro', { s: data.seconds })}</p>
        <BigButton onClick={() => setStarted(true)}>{t('sandbox.go')}</BigButton>
      </div>
    );
  }
  if (over) {
    const score = answered ? (right / answered) * Math.min(1, answered / 10) : 0;
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl">🏁</p>
        <p className="text-2xl font-black">{t('sandbox.speedDone', { right, total: answered })}</p>
        <BigButton tone="good" onClick={() => onComplete(score)}>
          {t('sandbox.finish')}
        </BigButton>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between font-black">
        <span className={`text-2xl ${left <= 10 ? 'text-bad' : ''}`}>⏱ {fmtTime(left)}</span>
        <span>
          ✓ {right} {streak >= 3 && <span className="text-amber-glow">🔥×{streak}</span>}
        </span>
      </div>
      <div className={`min-h-40 rounded-3xl p-6 text-center text-xl font-black ring-4 transition-colors ${flash === 'good' ? 'bg-good/20 ring-good' : flash === 'bad' ? 'bg-bad/15 ring-bad' : 'bg-surface ring-line'}`}>
        {item.statement}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <BigButton tone="good" onClick={() => answer(true)}>
          ✓ {t('quiz.true')}
        </BigButton>
        <BigButton tone="bad" onClick={() => answer(false)}>
          ✗ {t('quiz.false')}
        </BigButton>
      </div>
    </div>
  );
}

// ---------- two truths and a lie ----------

export function TwoTruthsPlayer({ data, onComplete }: PlayerProps<TwoTruths>) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const round = data.rounds[i];
  if (!round) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl">🕵️</p>
        <p className="text-2xl font-black">{t('sandbox.detectiveScore', { right, total: data.rounds.length })}</p>
        <BigButton tone="good" onClick={() => onComplete(right / data.rounds.length)}>
          {t('sandbox.finish')}
        </BigButton>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ProgressDots total={data.rounds.length} current={i} />
      <p className="text-center text-lg font-black">{t('sandbox.findLie', { term: round.term })}</p>
      <div className="grid gap-2">
        {round.statements.map((s, k) => {
          const state = chosen === null ? 'bg-surface ring-line hover:ring-brand' : k === round.lieIndex ? 'bg-bad/10 ring-bad' : 'bg-good/10 ring-good';
          return (
            <button
              key={k}
              type="button"
              disabled={chosen !== null}
              onClick={() => {
                setChosen(k);
                const ok = k === round.lieIndex;
                play(ok ? 'correct' : 'wrong');
                if (ok) setRight((r) => r + 1);
              }}
              className={`rounded-2xl p-4 text-left font-bold ring-2 ${state}`}
            >
              {chosen !== null && (k === round.lieIndex ? '🤥 ' : '✅ ')}
              {s}
            </button>
          );
        })}
      </div>
      {chosen !== null && (
        <div className="space-y-2">
          <p className={`font-black ${chosen === round.lieIndex ? 'text-good' : 'text-bad'}`}>{chosen === round.lieIndex ? t('sandbox.caughtIt') : t('sandbox.fooled')}</p>
          <p className="text-sm">{round.explanation}</p>
          <BigButton
            onClick={() => {
              setI(i + 1);
              setChosen(null);
            }}
          >
            {t('quiz.continue')}
          </BigButton>
        </div>
      )}
    </div>
  );
}
