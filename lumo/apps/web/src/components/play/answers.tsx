import type { Answer, Opt, PublicQuestion } from '@lumo/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { play } from '../../lib/sound';

/**
 * Game-style answer areas for the play screen: big colourful tiles answered with one tap, true/false
 * in two giant buttons, and tap-only ordering and matching (no fiddly dragging on a phone).
 */

export interface Reveal {
  correct: boolean;
  correctAnswer: string;
  itemResults?: Record<string, boolean>;
}

const COLORS = ['tile-red', 'tile-blue', 'tile-yellow', 'tile-green'] as const;

export function Shape({ i, size = 18 }: { i: number; size?: number }) {
  const fill = i === 2 ? '#1e1b4b' : '#fff';
  const s = { width: size, height: size };
  switch (i % 4) {
    case 0:
      return (
        <svg viewBox="0 0 20 20" style={s} aria-hidden>
          <path d="M10 2 19 18H1z" fill={fill} />
        </svg>
      );
    case 1:
      return (
        <svg viewBox="0 0 20 20" style={s} aria-hidden>
          <path d="M10 1 19 10 10 19 1 10z" fill={fill} />
        </svg>
      );
    case 2:
      return (
        <svg viewBox="0 0 20 20" style={s} aria-hidden>
          <circle cx="10" cy="10" r="8.5" fill={fill} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 20 20" style={s} aria-hidden>
          <rect x="2" y="2" width="16" height="16" rx="2" fill={fill} />
        </svg>
      );
  }
}

type TileState = 'idle' | 'right' | 'wrong' | 'dim' | 'gone';

function Tile({ i, state, onTap, children, pressed, disabled, label }: { i: number; state: TileState; onTap: () => void; children: ReactNode; pressed?: boolean; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      data-state={state}
      data-pressed={pressed ? 'true' : undefined}
      aria-label={label}
      className={`tile tile-deal ${COLORS[i % 4]}`}
      style={{ ['--d' as string]: `${0.08 + i * 0.07}s` }}
    >
      <span className="tile-shape">
        <Shape i={i} />
      </span>
      <span className="min-w-0 text-[1.05rem] leading-snug break-words">{children}</span>
      {state === 'right' && <span className="tile-badge bg-good text-night">✓</span>}
      {state === 'wrong' && <span className="tile-badge bg-bad text-white">✗</span>}
    </button>
  );
}

/** Multiple choice (and true/false): tap a tile and it's your answer. */
export function ChoiceTiles({ q, chosen, reveal, removed, onPick, locked }: { q: PublicQuestion; chosen: string | null; reveal: Reveal | null; removed: string[]; onPick: (id: string) => void; locked: boolean }) {
  const { t } = useTranslation();
  const opts = q.options!;
  const tf = q.format === 'true_false';
  // Short options sit in a 2×2 grid (like Kahoot); long ones stack so they stay readable.
  const grid = tf || (opts.length === 4 && opts.every((o) => o.text.length <= 42));
  const stateOf = (o: Opt): TileState => {
    if (removed.includes(o.id)) return 'gone';
    if (!reveal) return chosen && chosen !== o.id ? 'dim' : 'idle';
    if (o.text === reveal.correctAnswer) return 'right';
    if (o.id === chosen) return 'wrong';
    return 'dim';
  };
  // Keys 1-4 (or T/F, V/F) answer on a computer.
  useEffect(() => {
    if (locked || reveal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      let idx = Number(k) - 1;
      if (tf && (k === 't' || k === 'v')) idx = 0;
      if (tf && k === 'f') idx = 1;
      const o = opts[idx];
      if (o && !removed.includes(o.id)) onPick(o.id);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [opts, locked, reveal, removed, onPick, tf]);
  return (
    <div className={`grid gap-3 ${grid ? 'tile-grid grid-cols-2' : 'grid-cols-1'}`} role="group" aria-label={t('play.answers')}>
      {opts.map((o, i) => (
        <Tile
          key={o.id}
          i={tf ? (i === 0 ? 1 : 0) : i}
          state={stateOf(o)}
          pressed={chosen === o.id && !reveal}
          disabled={locked || !!reveal || removed.includes(o.id)}
          onTap={() => onPick(o.id)}
          label={o.text}
        >
          {tf ? <span className="text-2xl">{o.text}</span> : o.text}
        </Tile>
      ))}
    </div>
  );
}

/** Choose all that apply: tiles toggle, then "Check". */
export function MultiTiles({ q, value, onChange, reveal }: { q: PublicQuestion; value: Answer | null; onChange: (a: Answer | null) => void; reveal: Reveal | null }) {
  const { t } = useTranslation();
  const chosen = new Set(value?.kind === 'multi' ? value.optionIds : []);
  const toggle = (id: string) => {
    play('tap');
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next.size ? { kind: 'multi', optionIds: [...next] } : null);
  };
  return (
    <div className="grid gap-2.5">
      <p className="text-sm font-black tracking-wide text-indigo-200 uppercase">{t('quiz.selectAll')}</p>
      {q.options!.map((o, i) => {
        const ok = reveal?.itemResults?.[o.id];
        const on = chosen.has(o.id);
        const state: TileState = reveal ? (on ? (ok ? 'right' : 'wrong') : ok === false ? 'right' : 'dim') : 'idle';
        return (
          <button
            key={o.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={!!reveal}
            onClick={() => toggle(o.id)}
            data-state={state}
            className={`tile rise-in ${COLORS[i % 4]} ${on && !reveal ? 'ring-4 ring-white' : ''}`}
            style={{ ['--d' as string]: `${i * 0.06}s` }}
          >
            <span className="tile-shape">{on ? <span className="text-lg">✓</span> : <Shape i={i} />}</span>
            <span className="min-w-0 leading-snug">{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A short typed answer, with the first letter shown after a hint. */
export function TypeIn({ value, onChange, onSubmit, reveal, hint }: { value: Answer | null; onChange: (a: Answer | null) => void; onSubmit: () => void; reveal: Reveal | null; hint: { firstLetter: string; letters: number } | null }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Focus without scrolling the question off screen on phones.
    ref.current?.focus({ preventScroll: true });
  }, []);
  const text = value?.kind === 'text' ? value.text : '';
  return (
    <div className="space-y-2">
      {hint && (
        <p className="text-center font-mono text-xl font-black tracking-[0.3em] text-amber-200" aria-label={t('play.hintLetter', { letter: hint.firstLetter, count: hint.letters })}>
          {hint.firstLetter}
          {'_'.repeat(Math.max(0, hint.letters - 1))}
        </p>
      )}
      <input
        ref={ref}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        disabled={!!reveal}
        aria-label={t('quiz.yourAnswer')}
        placeholder={t('quiz.typeHere')}
        value={text}
        onChange={(e) => onChange(e.target.value ? { kind: 'text', text: e.target.value } : null)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        className={`w-full rounded-2xl border-4 bg-white px-5 py-4 text-center text-2xl font-black text-night shadow-[0_6px_0_0_rgb(0_0_0/0.3)] outline-none placeholder:text-slate-400 ${reveal ? (reveal.correct ? 'border-good' : 'border-bad') : 'border-transparent focus:border-amber-300'}`}
      />
    </div>
  );
}

/** Put things in order by tapping them first to last (tap a placed one to take it back). */
export function OrderTap({ q, value, onChange, reveal }: { q: PublicQuestion; value: Answer | null; onChange: (a: Answer | null) => void; reveal: Reveal | null }) {
  const { t } = useTranslation();
  const order = value?.kind === 'order' ? value.order : [];
  const items = q.items!;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const correctOrder = reveal ? reveal.correctAnswer.split('\n').map((l) => l.replace(/^\d+\.\s*/, '')) : null;
  const place = (id: string) => {
    if (reveal) return;
    play('tap');
    const next = order.includes(id) ? order.filter((x) => x !== id) : [...order, id];
    onChange(next.length ? { kind: 'order', order: next } : null);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm font-black tracking-wide text-indigo-200 uppercase">{t('play.orderTap')}</p>
      <ol className="space-y-2" aria-label={t('play.yourOrder')}>
        {items.map((_, slot) => {
          const id = order[slot];
          const it = id ? byId.get(id) : null;
          const ok = reveal && it ? correctOrder?.[slot] === it.text : null;
          return (
            <li key={slot}>
              <button
                type="button"
                disabled={!it || !!reveal}
                onClick={() => it && place(it.id)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left font-black transition ${it ? (ok === null ? 'bg-white text-night shadow-[0_4px_0_0_rgb(0_0_0/0.3)]' : ok ? 'bg-good text-night' : 'bg-bad text-white') : 'border-2 border-dashed border-white/30 text-white/40'}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-night/15 text-sm">{slot + 1}</span>
                <span className="min-w-0 flex-1">{it?.text ?? ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {!reveal && (
        <div role="group" aria-label={t('quiz.pool')} className="flex flex-wrap gap-2">
          {items
            .filter((i) => !order.includes(i.id))
            .map((i, k) => (
              <button key={i.id} type="button" onClick={() => place(i.id)} className={`tile rise-in !min-h-0 !py-2.5 ${COLORS[k % 4]}`} style={{ ['--d' as string]: `${k * 0.05}s` }}>
                {i.text}
              </button>
            ))}
        </div>
      )}
      {reveal && !reveal.correct && <p className="text-sm font-bold whitespace-pre-line text-indigo-100">{reveal.correctAnswer}</p>}
    </div>
  );
}

/** Match pairs: tap one on the left, then its partner on the right. */
export function MatchTap({ q, value, onChange, reveal }: { q: PublicQuestion; value: Answer | null; onChange: (a: Answer | null) => void; reveal: Reveal | null }) {
  const { t } = useTranslation();
  const pairs = value?.kind === 'pairs' ? value.pairs : {};
  const [left, setLeft] = useState<string | null>(null);
  const colorOf = (leftId: string) => COLORS[q.left!.findIndex((l) => l.id === leftId) % 4];
  const rightTaken = new Map(Object.entries(pairs).map(([l, r]) => [r, l]));
  const tapLeft = (id: string) => {
    if (reveal) return;
    play('tap');
    if (pairs[id]) {
      const next = { ...pairs };
      delete next[id];
      onChange(Object.keys(next).length ? { kind: 'pairs', pairs: next } : null);
    }
    setLeft(id);
  };
  const tapRight = (id: string) => {
    if (reveal || !left) return;
    play('tap');
    const next = { ...pairs };
    const owner = rightTaken.get(id);
    if (owner) delete next[owner];
    next[left] = id;
    onChange({ kind: 'pairs', pairs: next });
    setLeft(null);
  };
  const resultFor = (leftId: string) => (reveal?.itemResults ? (reveal.itemResults[leftId] ? 'outline outline-4 outline-good' : 'outline outline-4 outline-bad') : '');
  return (
    <div className="space-y-2">
      <p className="text-sm font-black tracking-wide text-indigo-200 uppercase">{t('play.matchTap')}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div role="group" aria-label={t('play.matchLeft')} className="space-y-2.5">
          {q.left!.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={!!reveal}
              aria-pressed={left === l.id}
              onClick={() => tapLeft(l.id)}
              className={`tile !min-h-14 w-full !p-2.5 text-sm ${pairs[l.id] || left === l.id ? colorOf(l.id) : 'bg-white/10'} ${left === l.id ? 'ring-4 ring-white' : ''} ${resultFor(l.id)}`}
            >
              {l.text}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t('play.matchRight')} className="space-y-2.5">
          {q.right!.map((r) => {
            const owner = rightTaken.get(r.id);
            return (
              <button
                key={r.id}
                type="button"
                disabled={!!reveal || !left}
                onClick={() => tapRight(r.id)}
                className={`tile !min-h-14 w-full !p-2.5 text-sm ${owner ? colorOf(owner) : 'bg-white/10'} ${left && !owner ? 'ring-2 ring-white/50' : ''}`}
              >
                {r.text}
              </button>
            );
          })}
        </div>
      </div>
      {reveal && !reveal.correct && <p className="text-sm font-bold whitespace-pre-line text-indigo-100">{reveal.correctAnswer}</p>}
    </div>
  );
}
