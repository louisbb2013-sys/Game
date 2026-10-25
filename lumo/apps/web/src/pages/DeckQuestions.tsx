import type { Question } from '@lumo/core';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { DeckOptionsPanel } from '../components/DeckOptions';
import { useWriting } from '../components/play/Writing';
import { Lumo } from '../components/Lumo';
import { api, ApiError } from '../lib/api';
import { canAskClaude, type DeckOptions } from '../local/reader';
import { writeQuestions } from '../local/writer';

/**
 * Every question of a deck, like Gizmo's card list: what it asks, its answer and why, which fact of the
 * notes it checks. The learner can fix one, write their own, or remove one; and set how Claude writes
 * the deck's questions (level, difficulty, kinds) before asking it for more.
 */

type Row = Question & { answer: string; seen: number | null };
interface Data {
  deck: { id: string; title: string; language: string; mine: boolean };
  concepts: { id: string; term: string; topic: string; facts: string[] }[];
  questions: Row[];
}

/** The kinds a learner can write or fully edit here. */
type DraftType = 'mcq' | 'tf' | 'typed' | 'written' | 'order' | 'match';

interface Form {
  type: DraftType;
  conceptId: string;
  fact: number; // -1 = the idea as a whole
  context: string;
  q: string;
  why: string;
  options: string[];
  answer: number; // mcq: index of the right option
  isTrue: boolean;
  accepted: string; // typed: one per line
  wrong: string; // typed: tempting wrong answers, one per line
  lines: string; // written: rubric points; order: steps in order; match: "left = right"
  model: string;
}

const blank = (conceptId: string): Form => ({ type: 'mcq', conceptId, fact: -1, context: '', q: '', why: '', options: ['', '', ''], answer: 0, isTrue: true, accepted: '', wrong: '', lines: '', model: '' });

/** A question as an editable form (null: a kind this page can only remove). */
function toForm(q: Row): Form | null {
  const base = { ...blank(q.conceptId), fact: q.facts?.[0] ?? -1, context: q.context ?? '', q: q.prompt, why: q.explanation };
  switch (q.format) {
    case 'multiple_choice':
    case 'cause_effect':
      return { ...base, type: 'mcq', options: q.options.map((o) => o.text), answer: Math.max(0, q.options.findIndex((o) => o.id === q.correctId)) };
    case 'true_false':
      return { ...base, type: 'tf', isTrue: q.options[0]?.id === q.correctId };
    case 'type_answer':
      return { ...base, type: 'typed', accepted: q.accepted.join('\n'), wrong: (q.distractors ?? []).join('\n') };
    case 'explain':
    case 'apply':
    case 'compare':
      return { ...base, type: 'written', lines: q.keyPoints.join('\n'), model: q.modelAnswer };
    case 'ordering':
      return { ...base, type: 'order', lines: q.correctOrder.map((id) => q.items.find((i) => i.id === id)?.text ?? '').join('\n') };
    case 'matching':
      return { ...base, type: 'match', lines: Object.entries(q.pairs).map(([l, r]) => `${q.left.find((x) => x.id === l)?.text ?? ''} = ${q.right.find((x) => x.id === r)?.text ?? ''}`).join('\n') };
    default:
      return null;
  }
}

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

/** The form in the shape Claude writes questions in (the backend checks and builds it). */
function toDraft(f: Form): Record<string, unknown> {
  const common = { q: f.q.trim(), why: f.why.trim(), ...(f.context.trim() ? { context: f.context.trim() } : {}), ...(f.fact >= 0 ? { f: f.fact + 1 } : {}) };
  switch (f.type) {
    case 'mcq':
      return { ...common, type: 'mcq', options: f.options.map((o) => o.trim()), answer: f.answer };
    case 'tf':
      return { ...common, type: 'tf', answer: f.isTrue };
    case 'typed':
      return { ...common, type: 'typed', accepted: lines(f.accepted), wrong: lines(f.wrong) };
    case 'written':
      return { ...common, type: 'written', points: lines(f.lines), model: f.model.trim() || lines(f.lines).join(' '), level: 'understand' };
    case 'order':
      return { ...common, type: 'order', steps: lines(f.lines) };
    case 'match':
      return { ...common, type: 'match', pairs: lines(f.lines).map((l) => l.split('=').map((x) => x.trim())) };
  }
}

const KIND_ICON: Record<string, string> = { multiple_choice: '🔘', cause_effect: '🔘', true_false: '✅', type_answer: '⌨️', explain: '✍️', apply: '✍️', compare: '✍️', ordering: '🔢', matching: '🔗', multiple_select: '☑️', fill_blank: '▁', categorize: '🗂️', calculation: '🧮' };

export function DeckQuestions() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ key: string | null; form: Form } | null>(null);
  const [options, setOptions] = useState<DeckOptions | null>(null);
  const [savedOptions, setSavedOptions] = useState(false);
  const [ai, setAi] = useState(false);
  const writing = useWriting(id);

  const load = () =>
    api<Data>(`/api/local/decks/${id}/questions`).then(
      (d) => setData(d),
      () => setError('deck_not_found'),
    );
  useEffect(() => {
    void load();
    void api<{ deck: { options?: DeckOptions } }>(`/api/decks/${id}`).then((m) => setOptions(m.deck.options ?? {}), () => {});
    void canAskClaude().then(setAi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // New questions show up while Claude writes them.
  const writtenSoFar = writing?.bank;
  useEffect(() => {
    if (writtenSoFar !== undefined) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writtenSoFar]);

  const byConcept = useMemo(() => {
    const m = new Map<string, Row[]>();
    const s = search.trim().toLowerCase();
    for (const q of data?.questions ?? []) {
      if (s && !`${q.prompt} ${q.answer} ${q.context ?? ''}`.toLowerCase().includes(s)) continue;
      m.set(q.conceptId, [...(m.get(q.conceptId) ?? []), q]);
    }
    return m;
  }, [data, search]);

  if (error) {
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

  const factsTotal = data.concepts.reduce((a, c) => a + Math.max(1, c.facts.length), 0);
  const covered = new Set(data.questions.flatMap((q) => (q.facts?.length ? q.facts.map((f) => `${q.conceptId}:${f}`) : [`${q.conceptId}:*`])));
  const factsCovered = data.concepts.reduce((a, c) => a + (c.facts.length ? c.facts.filter((_, f) => covered.has(`${c.id}:${f}`) || covered.has(`${c.id}:*`)).length : covered.has(`${c.id}:*`) ? 1 : 0), 0);
  const topics = [...new Set(data.concepts.map((c) => c.topic))];
  const isWriting = writing?.status === 'writing';

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      const body = { conceptId: editing.form.conceptId, draft: toDraft(editing.form) };
      if (editing.key) await api(`/api/local/decks/${id}/questions/${encodeURIComponent(editing.key)}`, { method: 'PUT', body });
      else await api(`/api/local/decks/${id}/questions`, { method: 'POST', body });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
    }
  };
  const remove = async (key: string) => {
    await api(`/api/local/decks/${id}/questions/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
    await load();
  };
  const saveOptions = async () => {
    if (!options) return;
    await api(`/api/local/decks/${id}/options`, { method: 'PUT', body: { options } }).catch(() => {});
    setSavedOptions(true);
    setTimeout(() => setSavedOptions(false), 2000);
  };

  return (
    <div className="space-y-4" data-testid="deck-questions">
      <Link to={`/decks/${id}`} className="inline-block rounded-full bg-surface px-3 py-1 text-sm font-extrabold ring-1 ring-line">
        ← {t('common.back')}
      </Link>
      <header>
        <p className="eyebrow text-sm">{t('questions.eyebrow')}</p>
        <h1 className="text-2xl leading-tight font-black sm:text-3xl">{data.deck.title}</h1>
        <p className="mt-1 text-sm font-bold text-muted" aria-live="polite">
          {t('questions.count', { count: data.questions.length })} · {t('questions.covered', { n: factsCovered, total: factsTotal })}
          {isWriting && ` · ✍️ ${t('questions.writing')}`}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setEditing({ key: null, form: blank(data.concepts[0]?.id ?? '') })} className="btn-gold rounded-2xl py-3 font-black" data-testid="new-question">
          ➕ {t('questions.new')}
        </button>
        {ai ? (
          <button type="button" disabled={isWriting} onClick={() => void writeQuestions(id!, { more: true })} className="rounded-2xl bg-surface py-3 font-black ring-1 ring-line hover:ring-brand disabled:opacity-60">
            ✨ {isWriting ? t('questions.writing') : t('questions.more')}
          </button>
        ) : (
          <Link to={`/chat?add=${id}`} className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
            ➕ {t('addNotes.open')}
          </Link>
        )}
      </div>

      {options && (
        <div className="space-y-2">
          <DeckOptionsPanel value={options} onChange={setOptions} />
          <button type="button" onClick={() => void saveOptions()} className="w-full rounded-2xl bg-surface py-2.5 text-sm font-black ring-1 ring-line hover:ring-brand">
            {savedOptions ? `✓ ${t('questions.optionsSaved')}` : t('questions.saveOptions')}
          </button>
        </div>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('questions.search')}
        aria-label={t('questions.search')}
        className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-2.5 font-bold outline-none focus:border-brand"
      />

      {editing && (
        <Editor
          form={editing.form}
          concepts={data.concepts}
          isNew={!editing.key}
          error={error}
          onChange={(form) => setEditing({ ...editing, form })}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={() => void save()}
        />
      )}

      {data.questions.length === 0 && <p className="panel p-4 text-center font-bold text-muted">{isWriting ? t('questions.writing') : t('questions.none')}</p>}

      {topics.map((topic) => {
        const ideas = data.concepts.filter((c) => c.topic === topic && byConcept.get(c.id)?.length);
        if (ideas.length === 0) return null;
        return (
          <section key={topic} className="space-y-3">
            <h2 className="text-lg font-black">{topic}</h2>
            {ideas.map((c) => (
              <div key={c.id} className="panel space-y-2 p-3 sm:p-4">
                <h3 className="font-black">
                  {c.term} <span className="text-xs font-bold text-muted">· {t('questions.count', { count: byConcept.get(c.id)!.length })}</span>
                </h3>
                <ul className="space-y-2">
                  {byConcept.get(c.id)!.map((q) => (
                    <QuestionCard key={q.variantKey} q={q} fact={q.facts?.length ? c.facts[q.facts[0]!] : undefined} onEdit={(form) => setEditing({ key: q.variantKey, form })} onRemove={() => void remove(q.variantKey)} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function QuestionCard({ q, fact, onEdit, onRemove }: { q: Row; fact?: string; onEdit: (f: Form) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const [sure, setSure] = useState(false);
  const [open, setOpen] = useState(false);
  const form = toForm(q);
  const options = 'options' in q && q.format !== 'true_false' ? q.options : null;
  return (
    <li className="rounded-2xl bg-surface-2 p-3" data-testid="question-row">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-2 text-left">
        <span className="text-lg" aria-hidden title={t(`formats.${q.format}`)}>
          {KIND_ICON[q.format] ?? '❓'}
        </span>
        <span className="min-w-0 flex-1">
          {q.context && <span className="mb-1 block truncate text-xs text-muted">📄 {q.context}</span>}
          <span className="block font-bold whitespace-pre-line">{q.prompt}</span>
          <span className="mt-1 block text-sm font-black text-good">✓ {q.answer}</span>
        </span>
        {q.seen === null && <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[0.7rem] font-black">{t('questions.unseen')}</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-line pt-2 text-sm">
          {options && (
            <ul className="space-y-1">
              {options.map((o) => (
                <li key={o.id} className={`rounded-xl px-2.5 py-1 ${'correctId' in q && q.correctId === o.id ? 'bg-good/15 font-black text-good' : 'bg-surface'}`}>
                  {o.text}
                </li>
              ))}
            </ul>
          )}
          <p>💡 {q.explanation}</p>
          {fact && <p className="text-xs text-muted">🧩 {t('questions.fact')}: {fact}</p>}
          <div className="flex gap-2">
            {form && (
              <button type="button" onClick={() => onEdit(form)} className="rounded-xl bg-surface px-3 py-1.5 font-black ring-1 ring-line">
                ✏️ {t('questions.edit')}
              </button>
            )}
            <button type="button" onClick={() => (sure ? onRemove() : setSure(true))} onBlur={() => setSure(false)} className={`rounded-xl px-3 py-1.5 font-black ring-1 ${sure ? 'bg-bad text-white ring-bad' : 'bg-surface ring-line'}`}>
              🗑️ {sure ? t('questions.removeSure') : t('questions.remove')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Editor({ form, concepts, isNew, error, onChange, onCancel, onSave }: { form: Form; concepts: Data['concepts']; isNew: boolean; error: string | null; onChange: (f: Form) => void; onCancel: () => void; onSave: () => void }) {
  const { t } = useTranslation();
  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const idea = concepts.find((c) => c.id === form.conceptId);
  const field = 'w-full rounded-2xl border-2 border-line bg-surface px-3 py-2 font-bold outline-none focus:border-brand';
  return (
    <form
      className="panel space-y-3 p-4 ring-2 ring-brand"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      data-testid="question-editor"
    >
      <h2 className="font-black">{isNew ? t('questions.new') : t('questions.edit')}</h2>
      {isNew && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm font-bold">
            {t('questions.idea')}
            <select value={form.conceptId} onChange={(e) => set({ conceptId: e.target.value, fact: -1 })} className={field}>
              {concepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.topic} › {c.term}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold">
            {t('questions.kind')}
            <select value={form.type} onChange={(e) => set({ type: e.target.value as DraftType })} className={field}>
              {(['mcq', 'tf', 'typed', 'written'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`questions.kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {idea && idea.facts.length > 0 && (
        <label className="block text-sm font-bold">
          {t('questions.fact')}
          <select value={form.fact} onChange={(e) => set({ fact: Number(e.target.value) })} className={field}>
            <option value={-1}>{t('questions.wholeIdea')}</option>
            {idea.facts.map((f, i) => (
              <option key={i} value={i}>
                {f}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm font-bold">
        {form.type === 'tf' ? t('questions.statement') : t('questions.question')}
        <textarea required rows={2} value={form.q} onChange={(e) => set({ q: e.target.value })} className={field} />
      </label>
      {form.type === 'mcq' && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-bold">{t('questions.options')}</legend>
          {form.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="right" checked={form.answer === i} onChange={() => set({ answer: i })} aria-label={t('questions.rightOne')} className="size-5 accent-[var(--color-good,#16a34a)]" />
              <input value={o} onChange={(e) => set({ options: form.options.map((x, j) => (j === i ? e.target.value : x)) })} required className={field} aria-label={t('questions.optionN', { n: i + 1 })} />
              {form.options.length > 3 && (
                <button type="button" onClick={() => set({ options: form.options.filter((_, j) => j !== i), answer: form.answer === i ? 0 : form.answer > i ? form.answer - 1 : form.answer })} aria-label={t('questions.remove')} className="px-1 font-black text-muted">
                  ✕
                </button>
              )}
            </div>
          ))}
          {form.options.length < 5 && (
            <button type="button" onClick={() => set({ options: [...form.options, ''] })} className="text-sm font-black text-accent">
              + {t('questions.addOption')}
            </button>
          )}
          <p className="text-xs text-muted">{t('questions.pickRight')}</p>
        </fieldset>
      )}
      {form.type === 'tf' && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('questions.isItTrue')}>
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={form.isTrue === v} onClick={() => set({ isTrue: v })} className={`rounded-xl py-2 font-black ring-2 ${form.isTrue === v ? 'bg-brand/10 ring-brand' : 'ring-line'}`}>
              {v ? t('questions.true') : t('questions.false')}
            </button>
          ))}
        </div>
      )}
      {form.type === 'typed' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm font-bold">
            {t('questions.accepted')}
            <textarea required rows={3} value={form.accepted} onChange={(e) => set({ accepted: e.target.value })} className={field} />
          </label>
          <label className="block text-sm font-bold">
            {t('questions.wrongOnes')}
            <textarea rows={3} value={form.wrong} onChange={(e) => set({ wrong: e.target.value })} className={field} />
          </label>
        </div>
      )}
      {(form.type === 'written' || form.type === 'order' || form.type === 'match') && (
        <label className="block text-sm font-bold">
          {t(`questions.lines.${form.type}`)}
          <textarea required rows={4} value={form.lines} onChange={(e) => set({ lines: e.target.value })} className={field} />
        </label>
      )}
      <label className="block text-sm font-bold">
        {t('questions.why')}
        <textarea rows={2} value={form.why} onChange={(e) => set({ why: e.target.value })} className={field} />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
          {t(`questions.errors.${error}`, { defaultValue: t('questions.errors.bad_question') })}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-gold flex-1 rounded-2xl py-3 font-black">{t('questions.save')}</button>
        <button type="button" onClick={onCancel} className="rounded-2xl bg-surface px-4 py-3 font-black ring-1 ring-line">
          {t('settings.cancel')}
        </button>
      </div>
    </form>
  );
}
