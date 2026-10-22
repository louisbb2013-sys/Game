import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Lumo } from '../components/Lumo';
import { api, ApiError } from '../lib/api';
import { play } from '../lib/sound';
import { forgetMemoryCache, loadMemory, type MemoryView, type StudyPrefs } from '../local/memory';

const IDEAS = ['book', 'grade', 'hard', 'like', 'tests'] as const;
const IDEA_EMOJI: Record<(typeof IDEAS)[number], string> = { book: '📘', grade: '🎓', hard: '😅', like: '❤️', tests: '📝' };

/**
 * Lumo's memory: what the learner tells Lumo (their class, the book they use, what's hard, what they
 * like), what Lumo noticed from how they play, and how it adapts. Used when Lumo writes their decks,
 * questions and explanations.
 */
export function Memory() {
  const { t } = useTranslation();
  const [m, setM] = useState<MemoryView | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    forgetMemoryCache();
    setM(await loadMemory(true));
  };
  useEffect(() => {
    void load();
  }, []);

  const remember = async (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/local/memory/notes', { method: 'POST', body: { text: v } });
      setText('');
      setMsg(t('memory.saved'));
      play('correct');
      await load();
    } catch (e) {
      setMsg(t(`memory.errors.${e instanceof ApiError ? e.code : 'network'}`, { defaultValue: t('signin.errors.network') }));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void remember(text);
  };
  const forget = async (id: string) => {
    await api(`/api/local/memory/notes/${id}`, { method: 'DELETE' }).catch(() => {});
    await load();
  };
  const dismiss = async (s: string) => {
    await api('/api/local/memory/dismiss', { method: 'POST', body: { text: s } }).catch(() => {});
    await load();
  };
  const setPrefs = async (patch: Partial<StudyPrefs>) => {
    setM((x) => (x ? { ...x, prefs: { ...x.prefs, ...patch } } : x));
    await api('/api/local/memory/prefs', { method: 'PATCH', body: patch }).catch(() => {});
    forgetMemoryCache();
  };
  const idea = (k: (typeof IDEAS)[number]) => {
    setText(t(`memory.ideaText.${k}`));
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  if (!m) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;
  const n = m.noticed;
  const fmt = (list: { format: string }[]) => list.map((f) => t(`formats.${f.format}`)).join(', ');

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-5">
        <header className="flex items-center gap-4">
          <Lumo size={72} mood="happy" />
          <div>
            <h1 className="font-display text-3xl font-black">{t('memory.title')}</h1>
            <p className="text-muted">{t('memory.subtitle')}</p>
          </div>
        </header>

        <section className="space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-line" aria-labelledby="tell-title">
          <h2 id="tell-title" className="text-lg font-black">
            🧠 {t('memory.tellTitle')}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {IDEAS.map((k) => (
              <button key={k} type="button" onClick={() => idea(k)} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-bold ring-1 ring-line hover:ring-brand">
                {IDEA_EMOJI[k]} {t(`memory.ideas.${k}`)}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-2">
            <label htmlFor="memory-text" className="sr-only">
              {t('memory.tellTitle')}
            </label>
            <textarea
              id="memory-text"
              ref={box}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void remember(text);
                }
              }}
              maxLength={300}
              rows={2}
              placeholder={t('memory.placeholder')}
              className="w-full resize-none rounded-2xl border-2 border-line bg-bg px-4 py-3 font-bold outline-none focus:border-brand"
            />
            <button disabled={!text.trim() || busy} className="btn-gold w-full rounded-2xl py-3 text-lg font-black disabled:opacity-50">
              {t('memory.add')}
            </button>
          </form>
          {msg && (
            <p role="status" className="text-sm font-bold text-muted">
              {msg}
            </p>
          )}
          <p className="text-xs text-muted">🔒 {t('memory.privacy')}</p>
        </section>

        {m.suggestions.length > 0 && (
          <section className="space-y-2" aria-labelledby="suggest-title">
            <h2 id="suggest-title" className="font-black">
              ✨ {t('memory.suggestTitle')}
            </h2>
            {m.suggestions.map((s) => (
              <div key={s} className="flex items-center gap-2 rounded-2xl bg-amber-glow/10 p-3 ring-1 ring-amber-glow/40">
                <p className="min-w-0 flex-1 font-bold">{s}</p>
                <button type="button" onClick={() => void remember(s)} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-black text-brand-ink">
                  {t('memory.keep')}
                </button>
                <button type="button" onClick={() => void dismiss(s)} className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-black">
                  {t('memory.no')}
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-2" aria-labelledby="notes-title">
          <h2 id="notes-title" className="font-black">
            {t('memory.notesTitle', { count: m.notes.length })}
          </h2>
          {m.notes.length === 0 ? (
            <p className="rounded-2xl bg-surface p-3 text-sm text-muted ring-1 ring-line">{t('memory.empty')}</p>
          ) : (
            <ul className="space-y-2" data-testid="memory-notes">
              {m.notes
                .slice()
                .reverse()
                .map((note) => (
                  <li key={note.id} className="pop-in flex items-start gap-2 rounded-2xl bg-surface p-3 ring-1 ring-line">
                    <span aria-hidden>💡</span>
                    <p className="min-w-0 flex-1 font-bold break-words">{note.text}</p>
                    <button type="button" onClick={() => void forget(note.id)} aria-label={t('memory.forgetLabel', { text: note.text })} className="rounded-lg px-2 text-muted hover:text-bad">
                      ✕
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <div className="space-y-5 lg:sticky lg:top-8">
        <section className="space-y-2 rounded-3xl royal p-4 text-white" aria-labelledby="noticed-title">
          <h2 id="noticed-title" className="text-lg font-black">
            👀 {t('memory.noticedTitle')}
          </h2>
          {n.answered < 8 ? (
            <p className="font-bold opacity-90">{t('memory.noticedEmpty')}</p>
          ) : (
            <ul className="space-y-1.5 font-bold" data-testid="memory-noticed">
              <li>📊 {t('memory.answered', { count: n.answered })}</li>
              {n.accuracy !== null && <li>🎯 {t('memory.accuracy', { pct: Math.round(n.accuracy * 100) })}</li>}
              {n.strongFormats.length > 0 && <li>💪 {t('memory.strong', { list: fmt(n.strongFormats) })}</li>}
              {n.weakFormats.length > 0 && <li>🧗 {t('memory.weak', { list: fmt(n.weakFormats) })}</li>}
              {n.timeOfDay && <li>🕒 {t(`memory.time.${n.timeOfDay}`)}</li>}
              {n.subjects.length > 0 && <li>📚 {t('memory.subjects', { list: n.subjects.join(', ') })}</li>}
              {n.weakIdeas.length > 0 && <li>🔁 {t('memory.weakIdeas', { list: n.weakIdeas.join(', ') })}</li>}
            </ul>
          )}
        </section>

        <section className="space-y-3 rounded-3xl bg-surface p-4 ring-1 ring-line" aria-labelledby="adapt-title">
          <h2 id="adapt-title" className="text-lg font-black">
            🎛️ {t('memory.adaptTitle')}
          </h2>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block font-black">{t('memory.adapt')}</span>
              <span className="block text-xs text-muted">{t('memory.adaptBody')}</span>
            </span>
            <input type="checkbox" role="switch" checked={m.prefs.adapt} onChange={(e) => void setPrefs({ adapt: e.target.checked })} className="size-6 accent-brand" />
          </label>
          <Choice label={t('memory.level')} value={m.prefs.level} options={['auto', 'easier', 'harder']} name={(o) => t(`memory.levels.${o}`)} onChange={(level) => void setPrefs({ level })} />
          <Choice label={t('memory.explain')} value={m.prefs.explain} options={['short', 'normal', 'detailed']} name={(o) => t(`memory.explains.${o}`)} onChange={(explain) => void setPrefs({ explain })} />
        </section>
      </div>
    </div>
  );
}

function Choice<T extends string>({ label, value, options, name, onChange }: { label: string; value: T; options: T[]; name: (o: T) => string; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1 text-sm font-black">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1.5">
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={`rounded-xl py-2 text-sm font-black ring-1 ${value === o ? 'bg-brand text-brand-ink ring-brand' : 'bg-surface-2 ring-line'}`}>
            {name(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A small "Lumo remembers N things" link (or an invitation to tell Lumo), for the create page. */
export function MemoryLink() {
  const { t } = useTranslation();
  const count = useMemoryCount();
  if (count === null) return null;
  return (
    <Link to="/memory" className="inline-flex flex-wrap items-center gap-1.5 text-sm font-bold text-muted hover:text-brand" data-testid="memory-link">
      🧠 {count ? t('memory.createHint', { count }) : t('memory.createHintEmpty')} <span className="font-black text-brand">{t('memory.edit')}</span>
    </Link>
  );
}

/** Home: tell Lumo about you (until you have), then a quiet reminder of what it remembers. */
export function MemoryCard() {
  const { t } = useTranslation();
  const count = useMemoryCount();
  if (count === null) return null;
  return (
    <Link to="/memory" className="flex items-center gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line hover:ring-brand" data-testid="memory-card">
      <span className="text-3xl" aria-hidden>
        🧠
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-black">{count ? t('memory.homeCount', { count }) : t('memory.homeTitle')}</span>
        <span className="block text-sm text-muted">{t('memory.homeBody')}</span>
      </span>
      <span className="text-2xl" aria-hidden>
        ›
      </span>
    </Link>
  );
}

function useMemoryCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    void loadMemory().then((m) => setCount(m ? m.notes.length : null));
  }, []);
  return count;
}
