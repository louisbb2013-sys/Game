import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Lumo } from '../components/Lumo';
import { api, ApiError } from '../lib/api';
import { canAskClaude, deckFromTopic, photoLimits, readPhotos, ReaderError } from '../local/reader';

/** Browser-only build: paste notes (or open a .txt file) and Lumo builds a deck on this device. */
export function NewDeck() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<'en' | 'fr'>(i18n.language === 'fr' ? 'fr' : 'en');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoCaps, setPhotoCaps] = useState<Awaited<ReturnType<typeof photoLimits>>>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  // Photos can be read only where this page may ask Claude (inside a Claude viewer, once allowed).
  const [ai, setAi] = useState(false);
  const [topic, setTopic] = useState('');
  const [researching, setResearching] = useState(false);
  useEffect(() => {
    void photoLimits().then(setPhotoCaps);
    void canAskClaude().then(setAi);
  }, []);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const readThem = async () => {
    setReading(true);
    setError(null);
    ctl.current = new AbortController();
    try {
      const draft = await readPhotos(photos, language, title, ctl.current.signal);
      const { id } = await api<{ id: string }>('/api/local/decks', { method: 'POST', body: { ...draft, title: title || draft.title } });
      navigate(`/decks/${id}`);
    } catch (err) {
      const code = err instanceof ReaderError ? err.code : 'upstream_error';
      if (code !== 'cancelled') setError(t(`local.photoErrors.${code}`, { defaultValue: t('local.photoErrors.upstream_error') }));
      setReading(false);
    }
  };

  /** Just a topic: Claude researches it and builds the deck. */
  const fromTopic = async (what: string) => {
    if (what.trim().length < 3) return;
    setResearching(true);
    setError(null);
    ctl.current = new AbortController();
    try {
      const draft = await deckFromTopic(what.trim(), language, ctl.current.signal);
      const { id } = await api<{ id: string }>('/api/local/decks', { method: 'POST', body: { ...draft, title: title || draft.title } });
      navigate(`/decks/${id}`);
    } catch (err) {
      const code = err instanceof ReaderError ? err.code : 'upstream_error';
      if (code !== 'cancelled') setError(t(`local.topicErrors.${code}`, { defaultValue: t('local.photoErrors.upstream_error') }));
      setResearching(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // A few words, not notes: treat it as a topic to research.
    if (ai && text.trim().length < 160 && !text.trim().includes('\n')) return void fromTopic(text);
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>('/api/local/decks/from-notes', { method: 'POST', body: { title, text, language } });
      navigate(`/decks/${id}`);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'nothing_found' ? t('local.nothingFound') : t('signin.errors.network'));
      setBusy(false);
    }
  };

  const readFile = (file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      setText(String(r.result ?? ''));
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    };
    r.readAsText(file);
  };

  const example = language === 'fr' ? t('local.exampleFr') : t('local.exampleEn');

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3">
        <Lumo size={64} mood="happy" />
        <div>
          <h1 className="text-2xl font-black">{t('local.newDeckTitle')}</h1>
          <p className="text-sm text-muted">{t('local.newDeckBody')}</p>
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">{t('local.deckName')}</span>
        <input id="deck-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t('local.deckNamePlaceholder')} className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 font-bold outline-none focus:border-brand" />
      </label>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-bold">
          {t('local.language')}
          <select id="deck-language" value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'fr')} className="rounded-xl border-2 border-line bg-bg px-2 py-1 font-bold">
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </label>
        <label className="cursor-pointer rounded-xl bg-surface px-3 py-1.5 text-sm font-black ring-1 ring-line">
          📄 {t('local.openFile')}
          <input id="deck-file" type="file" accept=".txt,.md,text/plain,text/markdown" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
      </div>
      {ai && (
        <section className="space-y-3 rounded-3xl bg-gradient-to-br from-brand/15 to-fuchsia-400/10 p-4 ring-1 ring-brand/40">
          <h2 className="font-black">🔎 {t('local.topicTitle')}</h2>
          <p className="text-sm text-muted">{t('local.topicBody')}</p>
          <input
            id="deck-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void fromTopic(topic);
              }
            }}
            maxLength={300}
            enterKeyHint="go"
            placeholder={t('local.topicPlaceholder')}
            aria-label={t('local.topicTitle')}
            className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 font-bold outline-none focus:border-brand"
          />
          {researching ? (
            <div className="flex items-center gap-3" role="status">
              <Lumo size={40} mood="thinking" />
              <span className="flex-1 text-sm font-bold">{t('local.researching')}</span>
              <button type="button" onClick={() => ctl.current?.abort()} className="rounded-xl px-3 py-1.5 text-sm font-black ring-1 ring-line">
                {t('local.stop')}
              </button>
            </div>
          ) : (
            <button type="button" disabled={topic.trim().length < 3} onClick={() => void fromTopic(topic)} className="w-full rounded-2xl bg-brand py-3 font-black text-brand-ink disabled:opacity-40">
              ✨ {t('local.makeFromTopic')}
            </button>
          )}
        </section>
      )}

      {photoCaps && (
        <section className="space-y-3 rounded-3xl bg-amber-glow/15 p-4 ring-1 ring-amber-glow/40">
          <h2 className="font-black">📸 {t('local.photosTitle')}</h2>
          <p className="text-sm text-muted">{t('local.photosBody')}</p>
          <label className="block cursor-pointer rounded-2xl bg-surface px-4 py-3 text-center font-black ring-1 ring-line">
            {photos.length ? t('local.photosChosen', { count: photos.length }) : t('local.choosePhotos')}
            <input
              id="deck-photos"
              type="file"
              multiple
              accept={(photoCaps.mediaTypes ?? ['image/jpeg', 'image/png', 'image/webp']).join(',')}
              className="sr-only"
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, photoCaps.maxCount))}
            />
          </label>
          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {previews.map((u, i) => (
                <img key={u} src={u} alt={t('local.photoAlt', { n: i + 1 })} className="size-20 shrink-0 rounded-xl object-cover ring-1 ring-line" />
              ))}
            </div>
          )}
          {reading ? (
            <div className="flex items-center gap-3">
              <Lumo size={40} mood="thinking" />
              <span className="flex-1 text-sm font-bold">{t('local.reading')}</span>
              <button type="button" onClick={() => ctl.current?.abort()} className="rounded-xl px-3 py-1.5 text-sm font-black ring-1 ring-line">
                {t('local.stop')}
              </button>
            </div>
          ) : (
            <button type="button" disabled={photos.length === 0} onClick={() => void readThem()} className="w-full rounded-2xl bg-brand py-3 font-black text-brand-ink disabled:opacity-40">
              ✨ {t('local.readPhotos')}
            </button>
          )}
          <p className="text-xs text-muted">{t('local.photosPrivacy')}</p>
        </section>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-bold">{photoCaps ? t('local.orNotes') : t('local.notes')}</span>
        <textarea id="deck-notes" required rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={example} className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 outline-none focus:border-brand" />
      </label>
      <button type="button" onClick={() => setText(example)} className="text-sm font-black text-brand">
        {t('local.useExample')}
      </button>
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">{t('local.notesTip')}</p>
      {error && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
          {error}
        </p>
      )}
      <button disabled={busy || researching || text.trim().length < (ai ? 3 : 20)} className="w-full rounded-2xl bg-brand py-3.5 text-lg font-black text-brand-ink disabled:opacity-40">
        {busy ? t('common.loading') : `✨ ${t('local.makeDeck')}`}
      </button>
      <Link to="/learn" className="block text-center text-sm font-bold text-muted">
        {t('common.back')}
      </Link>
    </form>
  );
}
