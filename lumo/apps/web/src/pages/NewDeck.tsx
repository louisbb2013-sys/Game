import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MemoryLink } from './Memory';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { DeckOptionsPanel, lastDeckOptions, rememberDeckOptions } from '../components/DeckOptions';
import { CameraIcon, SearchIcon, TextIcon, UploadIcon } from '../components/icons';
import { shrinkPhoto } from '../lib/files';
import { Lumo } from '../components/Lumo';
import { api, ApiError, NETLIFY } from '../lib/api';
import { claudeProblem, loadSession } from '../netlify/cloud';
import { canAskClaude, deckFromNotes, deckFromTopic, photoLimits, readPhotos, ReaderError, type DeckDraft, type DeckOptions, type KnownIdea } from '../local/reader';
import type { Concept } from '@lumo/core';
import { writeQuestions } from '../local/writer';

type Source = 'topic' | 'upload' | 'notes';
type Draft = DeckDraft;
/** Adding new notes to a deck I have: what it already holds. */
interface Target {
  title: string;
  language: 'en' | 'fr';
  options: DeckOptions;
  known: KnownIdea[];
}

const TEXT_FILE = /\.(txt|md|markdown|csv)$/i;

/**
 * Create a deck, Gizmo-style: a topic, a file (PDF or photos of notes) or pasted notes. Claude reads
 * it, breaks it into sub-aspects and every fact, and writes the questions; then it's straight to
 * playing. "Make it yours" sets the level, how much to cover, how hard and which kinds of questions.
 * Without Claude (trying the site without an account), notes still work with Lumo's own reader.
 * With `?add=<deck>`: new notes, photos or a topic added to that deck (only what's new is kept).
 */
export function NewDeck() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = useRef((location.state as { text?: string; source?: Source | 'file'; files?: File[] } | null) ?? null);
  const [language, setLanguage] = useState<'en' | 'fr'>(i18n.language === 'fr' ? 'fr' : 'en');
  const [title, setTitle] = useState('');
  const [ai, setAi] = useState<boolean | null>(null);
  const [caps, setCaps] = useState<Awaited<ReturnType<typeof photoLimits>>>(null);
  const [source, setSource] = useState<Source>('upload');
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<DeckOptions>(lastDeckOptions);
  const [busy, setBusy] = useState<Source | null>(null);
  const [params] = useSearchParams();
  const addTo = params.get('add');
  const [target, setTarget] = useState<Target | null>(null);
  useEffect(() => {
    if (!addTo) return;
    void Promise.all([api<{ deck: { title: string; language: string; options?: DeckOptions } }>(`/api/decks/${addTo}`), api<{ concepts: Concept[] }>(`/api/decks/${addTo}/offline`)]).then(
      ([m, d]) => {
        const lang = m.deck.language === 'fr' ? 'fr' : 'en';
        setTarget({ title: m.deck.title, language: lang, options: m.deck.options ?? {}, known: d.concepts.map((c) => ({ topic: c.topic, term: c.term, facts: c.keyPoints })) });
        setLanguage(lang);
      },
      () => setError(t('deck.notFound')),
    );
  }, [addTo, t]);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  // New decks are written in the app's language (switching language here switches the deck too).
  useEffect(() => {
    if (!addTo) setLanguage(i18n.language === 'fr' ? 'fr' : 'en');
  }, [i18n.language, addTo]);

  useEffect(() => {
    void Promise.all([canAskClaude(), photoLimits()]).then(([ok, limits]) => {
      setAi(ok);
      setCaps(limits);
      const inc = incoming.current;
      const text = inc?.text?.trim() ?? '';
      const asTopic = text && text.length < 160 && !text.includes('\n');
      // Trying the site without an account: stay on the topic tab, which says what an account adds.
      const fallback = ok || (NETLIFY && !loadSession()) ? null : 'notes';
      if (inc?.source === 'file' || inc?.files?.length) setSource(fallback ?? 'upload');
      else if (inc?.source === 'notes' || (text && !asTopic)) setSource('notes');
      else if (fallback) setSource(fallback);
      else if (text && asTopic) setSource('topic');
      if (text && asTopic) setTopic(text);
      else if (text) setNotes(text);
    });
    // Leaving this page stops any reading in progress.
    return () => ctl.current?.abort();
  }, []);

  // Coming from Home's "what do you want to study?": start right away.
  const started = useRef(false);
  useEffect(() => {
    if (ai === null || started.current) return;
    started.current = true;
    const text = incoming.current?.text?.trim() ?? '';
    const photos = incoming.current?.files ?? [];
    navigate(location.pathname + location.search, { replace: true, state: null }); // coming back here doesn't start again
    if (ai && photos.length)
      void addFiles(photos).then((ready) => {
        if (ready.length) void run('upload', '', ready);
      });
    else if (photos.length) void addFiles(photos);
    else if (ai && text && text.length < 160 && !text.includes('\n')) void run('topic', text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai]);

  /** Save the draft as a deck (or add what's new to the deck), start Claude on the questions, and open it. */
  const finish = async (draft: Draft) => {
    if (addTo) {
      const r = await api<{ ideas: number; facts: number }>(`/api/local/decks/${addTo}/ideas`, { method: 'POST', body: { concepts: draft.concepts } });
      void writeQuestions(addTo);
      navigate(`/decks/${addTo}`, { state: { added: r } });
      return;
    }
    rememberDeckOptions(options);
    const { id } = await api<{ id: string }>('/api/local/decks', { method: 'POST', body: { ...draft, options, title: title.trim() || draft.title } });
    void writeQuestions(id);
    navigate(`/decks/${id}`, { state: { fresh: true } });
  };
  // Adding to a deck follows that deck's own options.
  const opts = addTo ? (target?.options ?? {}) : options;
  const known = addTo ? (target?.known ?? []) : undefined;

  const fail = (kind: Source, err: unknown) => {
    const code = err instanceof ReaderError ? err.code : err instanceof ApiError ? err.code : 'upstream_error';
    if (code === 'cancelled') return;
    const problem = claudeProblem();
    if (code === 'unavailable' && problem) setError(t(`create.ai.${problem}`));
    else if (code === 'nothing_new') setError(t('addNotes.nothingNew'));
    else if (code === 'nothing_found' && kind === 'notes') setError(t('local.nothingFound'));
    else if (kind === 'topic') setError(t(`local.topicErrors.${code}`, { defaultValue: t('local.photoErrors.upstream_error') }));
    else setError(t(`local.photoErrors.${code}`, { defaultValue: t('local.photoErrors.upstream_error') }));
  };

  const run = async (kind: Source, topicText = topic, chosen = files) => {
    if (busy) return;
    setError(null);
    setBusy(kind);
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    try {
      if (kind === 'topic') {
        if (topicText.trim().length < 3) throw new ReaderError('nothing_found');
        await finish(await deckFromTopic(topicText.trim(), language, signal, opts, known));
      } else if (kind === 'upload') {
        // Text files are notes; PDFs and photos are read by Claude.
        const text = (await Promise.all(chosen.filter((f) => TEXT_FILE.test(f.name)).map((f) => f.text()))).join('\n\n').trim();
        const media = chosen.filter((f) => !TEXT_FILE.test(f.name));
        if (media.length) await finish(await readPhotos(media, language, text.slice(0, 1500), signal, opts, known));
        else if (text) await finish(await deckFromNotes(text, language, signal, opts, known));
        else throw new ReaderError('nothing_found');
      } else {
        // With Claude, notes are read properly (ideas, examples, typical mistakes); without, the built-in reader.
        const draft = ai
          ? await deckFromNotes(notes, language, signal, opts, known).catch((e) => {
              if (e instanceof ReaderError && e.code === 'cancelled') throw e;
              return null;
            })
          : null;
        if (draft) await finish(draft);
        else if (addTo) {
          await api(`/api/local/decks/${addTo}/ideas-from-notes`, { method: 'POST', body: { text: notes, language } });
          if (ai) void writeQuestions(addTo);
          navigate(`/decks/${addTo}`);
        } else {
          const { id } = await api<{ id: string }>('/api/local/decks/from-notes', { method: 'POST', body: { title, text: notes, language } });
          if (ai) void writeQuestions(id);
          navigate(`/decks/${id}`, { state: { fresh: true } });
        }
      }
    } catch (e) {
      fail(kind, e);
      setBusy(null);
    }
  };

  const accept = [...(caps?.mediaTypes ?? []), '.txt', '.md', 'text/plain'].join(',');
  /** Add photos / files (photos are shrunk first); returns the new list. */
  const filesRef = useRef<File[]>([]);
  const addFiles = async (list: FileList | File[] | null): Promise<File[]> => {
    if (!list) return filesRef.current;
    const limits = caps ?? (await photoLimits());
    const max = limits?.maxCount ?? 5;
    const types = limits?.mediaTypes ?? [];
    const picked = Array.from(list).filter((f) => TEXT_FILE.test(f.name) || f.type.startsWith('text/') || f.type.startsWith('image/') || types.includes(f.type));
    const ready = await Promise.all(picked.map(shrinkPhoto));
    const tooBig = ready.find((f) => f.size > (limits?.maxInputBytes ?? 4_000_000) && !TEXT_FILE.test(f.name));
    setError(tooBig ? t('create.tooBig', { name: tooBig.name }) : null);
    // Photos taken one after another all stay (each one is added to the latest list).
    const next = [...filesRef.current, ...ready.filter((f) => f !== tooBig)].slice(0, max);
    filesRef.current = next;
    setFiles(next);
    if (!title && next[0] && !next[0].type.startsWith('image/')) setTitle(next[0].name.replace(/\.[^.]+$/, '').slice(0, 120));
    return next;
  };
  const removeFile = (i: number) => {
    filesRef.current = filesRef.current.filter((_, j) => j !== i);
    setFiles(filesRef.current);
  };
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : ''));
    setPreviews(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);

  const example = language === 'fr' ? t('local.exampleFr') : t('local.exampleEn');
  const guest = NETLIFY && !loadSession();

  const tabs: { id: Source; icon: ReactNode; label: string }[] = [
    { id: 'upload', icon: <CameraIcon size={18} />, label: t('create.tabs.upload') },
    { id: 'topic', icon: <SearchIcon size={18} />, label: t('create.tabs.topic') },
    { id: 'notes', icon: <TextIcon size={18} />, label: t('create.tabs.notes') },
  ];

  if (busy) return <Generating kind={busy} onStop={() => ctl.current?.abort()} />;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-10">
      <div className="min-w-0 space-y-5">
        <header>
          <p className="eyebrow text-sm">{addTo ? t('addNotes.eyebrow') : t('create.eyebrow')}</p>
          <h1 className="text-3xl leading-tight font-black sm:text-4xl">{addTo ? (target?.title ?? '…') : t('create.title')}</h1>
          <p className="mt-1 text-muted">{addTo ? t('addNotes.body') : t('create.body')}</p>
        </header>

        <div role="tablist" aria-label={t('create.from')} className="panel grid grid-cols-3 gap-1 p-1.5">
          {tabs.map((x) => (
            <button
              key={x.id}
              role="tab"
              type="button"
              id={`tab-${x.id}`}
              aria-selected={source === x.id}
              aria-controls={`panel-${x.id}`}
              onClick={() => {
                setSource(x.id);
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-2xl px-2 py-3 text-sm font-black transition sm:text-base ${source === x.id ? 'btn-gold' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
            >
              {x.icon}
              <span className="truncate">{x.label}</span>
            </button>
          ))}
        </div>

        {ai === false && source !== 'notes' && (
          <div className="panel space-y-3 p-5">
            <p className="font-black">{t(guest ? 'create.ai.guestTitle' : 'create.ai.offTitle')}</p>
            <p className="text-sm text-muted">{t(guest ? 'create.ai.guestBody' : 'create.ai.offBody')}</p>
            <div className="flex flex-wrap gap-2">
              {guest && (
                <button type="button" onClick={() => void import('../netlify/Gate').then((m) => m.signOut())} className="btn-gold rounded-xl px-4 py-2 text-sm font-black">
                  {t('gate.makeAccount')}
                </button>
              )}
              <button type="button" onClick={() => setSource('notes')} className="rounded-xl bg-surface-2 px-4 py-2 text-sm font-black ring-1 ring-line">
                {t('create.useNotes')}
              </button>
            </div>
          </div>
        )}

        {source === 'topic' && ai !== false && (
          <form
            id="panel-topic"
            role="tabpanel"
            aria-labelledby="tab-topic"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run('topic');
            }}
            className="lacquer lux-frame space-y-4 rounded-[1.75rem] p-5 sm:p-7"
          >
            <label className="block">
              <span className="font-display block text-xl font-black sm:text-2xl">{t('local.topicTitle')}</span>
              <span className="mt-1 block text-sm text-white/70">{t('local.topicBody')}</span>
              <input
                id="deck-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={300}
                enterKeyHint="go"
                placeholder={t('local.topicPlaceholder')}
                className="mt-3 w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-3.5 text-lg font-bold text-white outline-none placeholder:text-white/40 focus:border-gold"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(t('create.examples', { returnObjects: true }) as string[]).map((ex) => (
                <button key={ex} type="button" onClick={() => setTopic(ex)} className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-bold text-white/85 ring-1 ring-white/15 hover:ring-[#e8c468]/50">
                  {ex}
                </button>
              ))}
            </div>
            <button disabled={topic.trim().length < 3} className="btn-gold w-full rounded-2xl py-4 text-lg font-black disabled:opacity-60">
              ✨ {addTo ? t('addNotes.go') : t('local.makeFromTopic')}
            </button>
          </form>
        )}

        {source === 'upload' && ai !== false && (
          <section id="panel-upload" role="tabpanel" aria-labelledby="tab-upload" className="space-y-4">
            <label
              className="drop-zone flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[1.75rem] px-6 py-10 text-center"
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                e.currentTarget.setAttribute('data-over', 'true');
              }}
              onDragLeave={(e: DragEvent) => e.currentTarget.removeAttribute('data-over')}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                e.currentTarget.removeAttribute('data-over');
                void addFiles(e.dataTransfer.files);
              }}
            >
              <span className="btn-gold grid size-14 place-items-center rounded-2xl">
                <UploadIcon size={28} />
              </span>
              <span className="font-display text-xl font-black">{t('create.dropTitle')}</span>
              <span className="text-sm text-muted">{t(caps?.mediaTypes?.includes('application/pdf') ? 'create.dropBodyPdf' : 'create.dropBody', { count: caps?.maxCount ?? 5 })}</span>
              <input id="deck-photos" type="file" multiple accept={accept} className="sr-only" onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
            </label>
            <label className="btn-gold flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-black">
              <CameraIcon size={22} />
              {files.length ? t('create.anotherPhoto') : t('create.takePhoto')}
              <input id="deck-camera" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ''))} />
            </label>
            {files.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="panel relative aspect-[3/4] overflow-hidden p-0">
                    {previews[i] ? (
                      <img src={previews[i]} alt={t('local.photoAlt', { n: i + 1 })} className="size-full object-cover" />
                    ) : (
                      <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                        <span className="text-3xl" aria-hidden>
                          {f.type === 'application/pdf' ? '📕' : '📄'}
                        </span>
                        <span className="line-clamp-2 text-xs font-bold break-all">{f.name}</span>
                      </span>
                    )}
                    <button type="button" onClick={() => removeFile(i)} aria-label={t('create.remove', { name: f.name })} className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-sm font-black text-white">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" disabled={files.length === 0} onClick={() => void run('upload')} className="btn-gold w-full rounded-2xl py-4 text-lg font-black disabled:opacity-60">
              ✨ {addTo ? t('addNotes.go') : t('create.readFiles')}
            </button>
            <p className="text-xs text-muted">{t(NETLIFY ? 'create.privacySite' : 'local.photosPrivacy')}</p>
          </section>
        )}

        {source === 'notes' && (
          <form
            id="panel-notes"
            role="tabpanel"
            aria-labelledby="tab-notes"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run('notes');
            }}
            className="space-y-3"
          >
            <label className="block">
              <span className="mb-1 block text-sm font-bold">{t('local.notes')}</span>
              <textarea id="deck-notes" required rows={12} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={example} className="w-full rounded-3xl border-2 border-line bg-surface px-4 py-3 leading-relaxed outline-none focus:border-brand" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setNotes(example)} className="text-sm font-black text-accent">
                {t('local.useExample')}
              </button>
              <label className="cursor-pointer rounded-xl bg-surface px-3 py-1.5 text-sm font-black ring-1 ring-line">
                📄 {t('local.openFile')}
                <input
                  id="deck-file"
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void f.text().then((x) => setNotes(x));
                    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
                  }}
                />
              </label>
            </div>
            {!ai && <p className="rounded-2xl bg-surface-2 px-3 py-2 text-xs text-muted">{t('local.notesTip')}</p>}
            <button disabled={notes.trim().length < (ai ? 3 : 20)} className="btn-gold w-full rounded-2xl py-4 text-lg font-black disabled:opacity-60">
              ✨ {addTo ? t('addNotes.go') : t('local.makeDeck')}
            </button>
          </form>
        )}

        {!addTo && ai && <DeckOptionsPanel value={options} onChange={setOptions} />}

        {error && (
          <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-sm font-bold text-bad">
            {error}
          </p>
        )}

        <MemoryLink />

        {addTo ? (
          <Link to={`/decks/${addTo}`} className="block text-center text-sm font-bold text-muted">
            {t('common.back')}
          </Link>
        ) : (
        <details className="panel group p-4">
          <summary className="cursor-pointer text-sm font-black">{t('create.more')}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">{t('local.deckName')}</span>
              <input id="deck-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t('local.deckNamePlaceholder')} className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-2.5 font-bold outline-none focus:border-brand" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold">{t('local.language')}</span>
              <select id="deck-language" value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'fr')} className="w-full rounded-2xl border-2 border-line bg-surface px-3 py-2.5 font-bold">
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </label>
          </div>
        </details>
        )}

        <Link to="/learn" className="block text-center text-sm font-bold text-muted lg:hidden">
          {t('common.back')}
        </Link>
      </div>

      <aside className="mt-8 hidden space-y-4 lg:sticky lg:top-8 lg:mt-14 lg:block">
        <div className="panel p-5">
          <h2 className="text-lg font-black">{t('create.howTitle')}</h2>
          <ol className="mt-3 space-y-3">
            {(t('create.how', { returnObjects: true }) as string[]).map((step, i) => (
              <li key={step} className="flex gap-3 text-sm">
                <span className="font-display grid size-7 shrink-0 place-items-center rounded-full bg-gold text-sm font-black text-night">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-center gap-3 px-2">
          <Lumo size={56} mood="happy" />
          <p className="text-sm text-muted">{t('create.lumoTip')}</p>
        </div>
      </aside>
    </div>
  );
}

/** While Claude reads: what it's doing, with a way out. */
function Generating({ kind, onStop }: { kind: Source; onStop: () => void }) {
  const { t } = useTranslation();
  const steps = t(`create.steps.${kind}`, { returnObjects: true }) as string[];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(steps.length - 1, s + 1)), kind === 'topic' ? 9000 : 7000);
    return () => clearInterval(id);
  }, [kind, steps.length]);
  return (
    <div role="status" aria-live="polite" className="mx-auto flex max-w-lg flex-col items-center gap-6 pt-10 text-center">
      <div className="relative">
        <div aria-hidden className="absolute inset-0 -z-10 animate-pulse rounded-full bg-[#e8c468]/25 blur-2xl" />
        <Lumo size={130} mood="thinking" />
      </div>
      <div>
        <h1 className="text-3xl font-black">{t('create.generating')}</h1>
        <p className="mt-1 text-muted">{t(kind === 'topic' ? 'local.researching' : 'local.reading')}</p>
      </div>
      <ol className="panel w-full space-y-3 p-5 text-left">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 text-sm font-bold transition ${i > step ? 'text-muted/60' : ''}`}>
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${i < step ? 'bg-good text-white' : i === step ? 'bg-gold text-night' : 'bg-surface-2'}`}>{i < step ? '✓' : i + 1}</span>
            {s}
            {i === step && <span className="ml-auto size-2 animate-ping rounded-full bg-gold" aria-hidden />}
          </li>
        ))}
      </ol>
      <button type="button" onClick={onStop} className="rounded-xl px-4 py-2 text-sm font-black text-muted ring-1 ring-line hover:text-ink">
        {t('local.stop')}
      </button>
    </div>
  );
}
