import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { CameraIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { SharedDecks } from '../components/SharedDecks';
import { DeckCard } from '../components/DeckCard';
import { api, LOCAL } from '../lib/api';
import type { DeckListItem } from '../lib/quiz';

export function Learn() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckListItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [find, setFind] = useState('');

  useEffect(() => {
    api<{ decks: DeckListItem[] }>('/api/decks').then((r) => setDecks(r.decks), () => setDecks([]));
  }, []);

  const addSample = async () => {
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/api/decks/sample', { method: 'POST', body: { language: i18n.language === 'fr' ? 'fr' : 'en' } });
      navigate(`/decks/${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-sm">{t('learn.eyebrow')}</p>
          <h1 className="text-3xl font-black sm:text-4xl">{t('learn.title')}</h1>
        </div>
        {!LOCAL && (
          <Link to="/offline" className="rounded-full bg-surface px-4 py-2 text-sm font-black ring-1 ring-line">
            📥 {t('offline.title')}
          </Link>
        )}
      </header>

      <Link to="/chat" className="lacquer lux-frame flex items-center gap-4 rounded-3xl p-5 transition hover:-translate-y-0.5">
        <span className="btn-gold grid size-12 shrink-0 place-items-center rounded-2xl">
          <CameraIcon size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black">{t('home.createTitle')}</h2>
          <p className="text-sm text-white/75">{t(LOCAL ? 'local.createBody' : 'home.createBody')}</p>
        </div>
        <span className="shrink-0 text-2xl text-white/60">›</span>
      </Link>

      {decks === null ? (
        <p className="text-center font-bold text-muted">{t('common.loading')}</p>
      ) : decks.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 p-8 text-center">
          <Lumo size={96} mood="thinking" />
          <p className="text-lg font-black">{t('learn.empty')}</p>
          <p className="max-w-md text-sm text-muted">{t('learn.emptyBody')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/chat" className="btn-gold rounded-2xl px-5 py-3 font-black">
              ✨ {t('chat.start')}
            </Link>
            <button onClick={() => void addSample()} disabled={busy} className="rounded-2xl bg-surface-2 px-5 py-3 font-black ring-1 ring-line disabled:opacity-50">
              {t('learn.trySample')}
            </button>
          </div>
        </div>
      ) : (
        <>
        {decks.length > 6 && (
          <input
            type="search"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder={t('learn.search')}
            aria-label={t('learn.search')}
            className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 font-bold outline-none focus:border-brand sm:max-w-sm"
          />
        )}
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {decks.filter((d) => !find.trim() || `${d.title} ${d.subject}`.toLowerCase().includes(find.trim().toLowerCase())).map((d, i) => (
            <li key={d.id}>
              <DeckCard deck={d} index={i} />
            </li>
          ))}
          <li>
            <button onClick={() => void addSample()} disabled={busy} className="grid h-full min-h-[10.5rem] w-full place-items-center rounded-3xl border-2 border-dashed border-line text-sm font-black text-muted hover:border-gold/60 hover:text-ink">
              + {t('learn.trySample')}
            </button>
          </li>
        </ul>
        </>
      )}

      {LOCAL && <SharedDecks />}
    </div>
  );
}
