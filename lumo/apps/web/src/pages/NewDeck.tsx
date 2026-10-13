import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Lumo } from '../components/Lumo';
import { api, ApiError } from '../lib/api';

/** Browser-only build: paste notes (or open a .txt file) and Lumo builds a deck on this device. */
export function NewDeck() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<'en' | 'fr'>(i18n.language === 'fr' ? 'fr' : 'en');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
      <label className="block">
        <span className="mb-1 block text-sm font-bold">{t('local.notes')}</span>
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
      <button disabled={busy || text.trim().length < 20} className="w-full rounded-2xl bg-brand py-3.5 text-lg font-black text-brand-ink disabled:opacity-40">
        {busy ? t('common.loading') : `✨ ${t('local.makeDeck')}`}
      </button>
      <Link to="/learn" className="block text-center text-sm font-bold text-muted">
        {t('common.back')}
      </Link>
    </form>
  );
}
