import type { Answer, Opt, PublicQuestion } from '@lumo/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndProvider, DragChip, DropZone } from '../../lib/dnd';

export interface Reveal {
  correct: boolean;
  correctAnswer: string;
  itemResults?: Record<string, boolean>;
}

export interface InputProps {
  q: PublicQuestion;
  value: Answer | null;
  onChange: (a: Answer | null) => void;
  onSubmit: () => void;
  reveal: Reveal | null; // set after grading
}

/** Can the learner submit this answer yet? */
export function isReady(q: PublicQuestion, a: Answer | null): boolean {
  if (!a) return false;
  switch (a.kind) {
    case 'choice':
      return !!a.optionId;
    case 'multi':
      return a.optionIds.length > 0;
    case 'text':
      return a.text.trim().length > 0;
    case 'blanks':
      return a.values.length === (q.blankCount ?? 0) && a.values.every((v) => v.trim());
    case 'tf':
      return a.justification.trim().length > 0;
    case 'pairs':
      return Object.keys(a.pairs).length === (q.format === 'matching' ? q.left!.length : q.format === 'categorize' ? q.items!.length : q.spots!.length);
    case 'order':
      return a.order.length === q.items!.length;
    case 'mistake':
      return !!a.segmentId && a.correction.trim().length > 0;
    case 'number':
      return Number.isFinite(a.value);
  }
}

export function QuestionInput(p: InputProps) {
  switch (p.q.format) {
    case 'multiple_choice':
    case 'cause_effect':
      return <ChoiceInput {...p} />;
    case 'multiple_select':
      return <MultiInput {...p} />;
    case 'type_answer':
      return <ShortText {...p} />;
    case 'explain':
    case 'apply':
    case 'compare':
    case 'teach_back':
      return <LongText {...p} />;
    case 'fill_blank':
      return <BlanksInput {...p} />;
    case 'true_false_justify':
      return <TrueFalseInput {...p} />;
    case 'matching':
      return <MatchingInput {...p} />;
    case 'categorize':
      return <CategorizeInput {...p} />;
    case 'label_diagram':
      return <LabelInput {...p} />;
    case 'ordering':
      return <OrderInput {...p} />;
    case 'spot_mistake':
      return <MistakeInput {...p} />;
    case 'calculation':
      return <NumberInput {...p} />;
  }
}

const LETTERS = 'ABCDEFGH';

function optionStyle(state: 'idle' | 'selected' | 'right' | 'wrong' | 'missed') {
  return {
    idle: 'bg-surface ring-line hover:ring-brand/60',
    selected: 'bg-brand/10 ring-brand',
    right: 'bg-good/15 ring-good',
    wrong: 'bg-bad/10 ring-bad',
    missed: 'bg-good/5 ring-good ring-dashed',
  }[state];
}

function ChoiceInput({ q, value, onChange, reveal }: InputProps) {
  const chosen = value?.kind === 'choice' ? value.optionId : null;
  return (
    <div className="grid gap-2.5" role="radiogroup">
      {q.options!.map((o, i) => {
        const isChosen = chosen === o.id;
        const isRight = reveal && o.text === reveal.correctAnswer;
        const state = reveal ? (isRight ? 'right' : isChosen ? 'wrong' : 'idle') : isChosen ? 'selected' : 'idle';
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={isChosen}
            disabled={!!reveal}
            onClick={() => onChange({ kind: 'choice', optionId: o.id })}
            className={`press rise-in flex items-start gap-3 rounded-2xl p-3.5 text-left font-bold ring-2 ${state === 'right' ? 'press-right' : state === 'wrong' ? 'press-wrong' : ''} ${optionStyle(state)}`}
            style={{ ['--d' as string]: `${i * 0.06}s` }}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-black">{LETTERS[i]}</span>
            <span className="pt-0.5">{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function MultiInput({ q, value, onChange, reveal }: InputProps) {
  const { t } = useTranslation();
  const chosen = new Set(value?.kind === 'multi' ? value.optionIds : []);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ kind: 'multi', optionIds: [...next] });
  };
  return (
    <div className="grid gap-2.5">
      <p className="text-sm font-bold text-muted">{t('quiz.selectAll')}</p>
      {q.options!.map((o) => {
        const ok = reveal?.itemResults?.[o.id];
        const state = reveal ? (chosen.has(o.id) ? (ok ? 'right' : 'wrong') : ok === false ? 'missed' : 'idle') : chosen.has(o.id) ? 'selected' : 'idle';
        return (
          <button
            key={o.id}
            type="button"
            role="checkbox"
            aria-checked={chosen.has(o.id)}
            disabled={!!reveal}
            onClick={() => toggle(o.id)}
            className={`flex items-start gap-3 rounded-2xl p-3.5 text-left font-bold ring-2 transition ${optionStyle(state)}`}
          >
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 ${chosen.has(o.id) ? 'border-brand bg-brand text-brand-ink' : 'border-line'}`}>{chosen.has(o.id) ? '✓' : ''}</span>
            <span>{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

const fieldCls = 'w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 text-lg outline-none focus:border-brand disabled:opacity-80';

function ShortText({ value, onChange, onSubmit, reveal }: InputProps) {
  const { t } = useTranslation();
  return (
    <input
      autoFocus
      autoComplete="off"
      autoCapitalize="none"
      spellCheck={false}
      disabled={!!reveal}
      aria-label={t('quiz.yourAnswer')}
      placeholder={t('quiz.typeHere')}
      value={value?.kind === 'text' ? value.text : ''}
      onChange={(e) => onChange({ kind: 'text', text: e.target.value })}
      onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
      className={`${fieldCls} ${reveal ? (reveal.correct ? 'border-good' : 'border-bad') : ''}`}
    />
  );
}

function LongText({ q, value, onChange, reveal }: InputProps) {
  const { t } = useTranslation();
  const text = value?.kind === 'text' ? value.text : '';
  return (
    <div>
      <textarea
        autoFocus
        rows={5}
        disabled={!!reveal}
        aria-label={t('quiz.yourAnswer')}
        placeholder={q.format === 'teach_back' ? t('quiz.teachPlaceholder') : t('quiz.explainPlaceholder')}
        value={text}
        maxLength={4000}
        onChange={(e) => onChange({ kind: 'text', text: e.target.value })}
        className={`${fieldCls} resize-none text-base`}
      />
      <p className="mt-1 text-right text-xs text-muted">{t('quiz.ownWords')}</p>
    </div>
  );
}

function BlanksInput({ q, value, onChange, onSubmit, reveal }: InputProps) {
  const { t } = useTranslation();
  const values = value?.kind === 'blanks' ? value.values : Array.from({ length: q.blankCount ?? 0 }, () => '');
  const parts = q.text!.split('___');
  return (
    <p className="rounded-2xl bg-surface p-4 text-lg leading-loose ring-1 ring-line">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <input
              autoFocus={i === 0}
              disabled={!!reveal}
              aria-label={t('quiz.blank', { n: i + 1 })}
              value={values[i] ?? ''}
              onChange={(e) => {
                const next = values.slice();
                next[i] = e.target.value;
                onChange({ kind: 'blanks', values: next });
              }}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              className={`mx-1 inline-block w-36 border-b-[3px] bg-transparent px-1 text-center font-bold outline-none ${
                reveal ? (reveal.itemResults?.[String(i)] ? 'border-good text-good' : 'border-bad text-bad') : 'border-brand'
              }`}
            />
          )}
        </span>
      ))}
    </p>
  );
}

function TrueFalseInput({ q, value, onChange, reveal }: InputProps) {
  const { t } = useTranslation();
  const v = value?.kind === 'tf' ? value : { kind: 'tf' as const, value: null as boolean | null, justification: '' };
  const set = (patch: Partial<{ value: boolean; justification: string }>) => {
    const next = { ...v, ...patch };
    if (next.value === null) return onChange(null);
    onChange({ kind: 'tf', value: next.value, justification: next.justification });
  };
  return (
    <div className="space-y-3">
      <blockquote className="rounded-2xl bg-surface-2 p-4 text-lg font-bold">“{q.statement}”</blockquote>
      <div className="grid grid-cols-2 gap-3">
        {[true, false].map((b) => (
          <button
            key={String(b)}
            type="button"
            disabled={!!reveal}
            aria-pressed={v.value === b}
            onClick={() => set({ value: b })}
            className={`rounded-2xl py-3 text-lg font-black ring-2 ${v.value === b ? 'bg-brand text-brand-ink ring-brand' : 'bg-surface ring-line'}`}
          >
            {b ? t('quiz.true') : t('quiz.false')}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        disabled={!!reveal || v.value === null}
        placeholder={t('quiz.whyPlaceholder')}
        aria-label={t('quiz.why')}
        value={v.justification}
        onChange={(e) => set({ justification: e.target.value })}
        className={`${fieldCls} resize-none text-base`}
      />
    </div>
  );
}

/** Shared board: drag chips from a pool onto targets; each target may hold several (categories) or one (matching/labels). */
function PairsBoard({
  q,
  value,
  onChange,
  reveal,
  pool,
  targets,
  single,
  renderTargets,
}: InputProps & { pool: Opt[]; targets: Opt[]; single: boolean; renderTargets?: (content: (t: Opt) => React.ReactNode) => React.ReactNode }) {
  const { t } = useTranslation();
  // Internal map is chipId -> targetId; matching/labels answer as targetId -> chipId.
  const answerPairs = value?.kind === 'pairs' ? value.pairs : {};
  const placed: Record<string, string> = useMemo(() => {
    if (q.format === 'categorize') return answerPairs;
    return Object.fromEntries(Object.entries(answerPairs).map(([target, chip]) => [chip, target]));
  }, [answerPairs, q.format]);

  const commit = (next: Record<string, string>) => {
    const pairs = q.format === 'categorize' ? next : Object.fromEntries(Object.entries(next).map(([chip, target]) => [target, chip]));
    onChange(Object.keys(pairs).length ? { kind: 'pairs', pairs } : null);
  };
  const onDrop = (chip: string, target: string) => {
    const next = { ...placed };
    if (target === '__pool') delete next[chip];
    else {
      if (single) for (const [c, tg] of Object.entries(next)) if (tg === target) delete next[c]; // bump the previous one
      next[chip] = target;
    }
    commit(next);
  };
  const chipsIn = (targetId: string) => pool.filter((c) => placed[c.id] === targetId);
  const resultFor = (target: Opt, chip: Opt) => {
    if (!reveal?.itemResults) return '';
    const key = q.format === 'categorize' ? chip.id : target.id;
    return reveal.itemResults[key] ? 'ring-good bg-good/10' : 'ring-bad bg-bad/10';
  };
  const content = (target: Opt) => (
    <>
      {chipsIn(target.id).map((c) => (
        <DragChip key={c.id} id={c.id} label={c.text} className={resultFor(target, c)} />
      ))}
    </>
  );
  const free = pool.filter((c) => !placed[c.id]);

  return (
    <DndProvider onDrop={onDrop} disabled={!!reveal}>
      <div className="space-y-4">
        {renderTargets ? (
          renderTargets(content)
        ) : (
          <div className={`grid gap-2.5 ${q.format === 'categorize' ? 'sm:grid-cols-2' : ''}`}>
            {targets.map((target) => (
              <DropZone key={target.id} id={target.id} label={target.text} className="rounded-2xl bg-surface-2 p-3">
                <p className="mb-2 font-black">{target.text}</p>
                <div className="flex min-h-11 flex-wrap gap-2 rounded-xl border-2 border-dashed border-line p-1.5">{content(target)}</div>
              </DropZone>
            ))}
          </div>
        )}
        {!reveal && (
          <DropZone id="__pool" label={t('quiz.pool')} className="rounded-2xl p-1">
            <p className="mb-2 text-xs font-bold text-muted">{free.length ? t('quiz.dragHint') : t('quiz.allPlaced')}</p>
            <div className="flex flex-wrap gap-2">
              {free.map((c) => (
                <DragChip key={c.id} id={c.id} label={c.text} />
              ))}
            </div>
          </DropZone>
        )}
      </div>
    </DndProvider>
  );
}

function MatchingInput(p: InputProps) {
  return <PairsBoard {...p} pool={p.q.right!} targets={p.q.left!} single />;
}

function CategorizeInput(p: InputProps) {
  return <PairsBoard {...p} pool={p.q.items!} targets={p.q.categories!} single={false} />;
}

function LabelInput(p: InputProps) {
  const spots = p.q.spots!.map((s, i) => ({ ...s, text: String(i + 1) }));
  return (
    <PairsBoard
      {...p}
      pool={p.q.labels!}
      targets={spots}
      single
      renderTargets={(content) => (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-2xl ring-1 ring-line">
            <img src={p.q.imageUrl} alt="" className="w-full" />
            {spots.map((s) => (
              <span key={s.id} className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand text-sm font-black text-brand-ink shadow" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                {s.text}
              </span>
            ))}
          </div>
          {spots.map((s) => (
            <DropZone key={s.id} id={s.id} label={s.text} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-black text-brand-ink">{s.text}</span>
              <div className="flex min-h-10 flex-1 flex-wrap gap-2 rounded-lg border-2 border-dashed border-line p-1">{content(s)}</div>
            </DropZone>
          ))}
        </div>
      )}
    />
  );
}

function OrderInput({ q, value, onChange, reveal }: InputProps) {
  const { t } = useTranslation();
  const order = value?.kind === 'order' ? value.order : q.items!.map((i) => i.id);
  const byId = new Map(q.items!.map((i) => [i.id, i]));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    onChange({ kind: 'order', order: next });
  };
  const onDrop = (item: string, target: string) => move(order.indexOf(item), order.indexOf(target));
  // Ordering is always answerable: the initial order counts as an answer.
  useEffect(() => {
    if (!value && !reveal) onChange({ kind: 'order', order: q.items!.map((i) => i.id) });
  }, [value, reveal, onChange, q.items]);
  return (
    <DndProvider onDrop={onDrop} disabled={!!reveal}>
      <p className="mb-2 text-xs font-bold text-muted">{t('quiz.orderHint')}</p>
      <ol className="space-y-2">
        {order.map((id, i) => (
          <li key={id}>
            <DropZone id={id} label={byId.get(id)!.text} className="flex items-center gap-2 rounded-2xl bg-surface p-2 ring-1 ring-line">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-black">{i + 1}</span>
              <DragChip id={id} label={byId.get(id)!.text} className="flex-1 !ring-0 !bg-transparent" />
              {!reveal && (
                <span className="flex flex-col">
                  <button type="button" aria-label={t('quiz.moveUp')} onClick={() => move(i, i - 1)} className="px-2 text-muted hover:text-ink">▲</button>
                  <button type="button" aria-label={t('quiz.moveDown')} onClick={() => move(i, i + 1)} className="px-2 text-muted hover:text-ink">▼</button>
                </span>
              )}
            </DropZone>
          </li>
        ))}
      </ol>
    </DndProvider>
  );
}

function MistakeInput({ q, value, onChange, onSubmit, reveal }: InputProps) {
  const { t } = useTranslation();
  const v = value?.kind === 'mistake' ? value : null;
  const [seg, setSeg] = useState<string | null>(v?.segmentId ?? null);
  const correction = v?.correction ?? '';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
        {q.segments!.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!!reveal}
            aria-pressed={seg === s.id}
            onClick={() => {
              setSeg(s.id);
              onChange({ kind: 'mistake', segmentId: s.id, correction });
            }}
            className={`rounded-lg px-2 py-1 text-left font-bold ring-2 ${seg === s.id ? (reveal ? (reveal.correct ? 'bg-good/15 ring-good' : 'bg-bad/10 ring-bad') : 'bg-amber-glow/25 ring-amber-glow') : 'ring-transparent hover:ring-line'}`}
          >
            {s.text}
          </button>
        ))}
      </div>
      <input
        disabled={!!reveal || !seg}
        placeholder={seg ? t('quiz.correctionPlaceholder') : t('quiz.tapMistakeFirst')}
        aria-label={t('quiz.correction')}
        value={correction}
        onChange={(e) => seg && onChange({ kind: 'mistake', segmentId: seg, correction: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        className={fieldCls}
      />
    </div>
  );
}

function NumberInput({ q, value, onChange, onSubmit, reveal }: InputProps) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState('');
  const [work, setWork] = useState('');
  const update = (r: string, w: string) => {
    const n = Number(r.replace(',', '.').replace(/\s/g, ''));
    onChange(r.trim() && Number.isFinite(n) ? { kind: 'number', value: n, work: w || undefined } : null);
  };
  return (
    <div className="space-y-3">
      <ul className="grid gap-1.5 rounded-2xl bg-surface-2 p-3 font-bold">
        {q.given!.map((g) => (
          <li key={g.symbol}>
            {g.name} (<i>{g.symbol}</i>) = {g.value} {g.unit}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          inputMode="decimal"
          disabled={!!reveal}
          aria-label={t('quiz.yourAnswer')}
          placeholder="0"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            update(e.target.value, work);
          }}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          className={`${fieldCls} font-mono ${reveal ? (reveal.correct ? 'border-good' : 'border-bad') : ''}`}
        />
        {q.unit && <span className="shrink-0 font-black text-muted">{q.unit}</span>}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-bold text-muted">{t('quiz.showWork')}</summary>
        <textarea
          rows={3}
          disabled={!!reveal}
          value={work}
          onChange={(e) => {
            setWork(e.target.value);
            update(raw, e.target.value);
          }}
          className={`${fieldCls} mt-2 resize-none text-base`}
        />
      </details>
      {value?.kind === 'number' ? null : raw && <p className="text-xs text-bad">{t('quiz.notANumber')}</p>}
    </div>
  );
}
