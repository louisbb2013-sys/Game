import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { CameraIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { api } from '../lib/api';
import type { DeckListItem } from '../lib/quiz';

export function Learn() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckListItem[] | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="space-y-5">
      <h1 className="text-2xl font-black">{t('learn.title')}</h1>

      <div className="flex items-center gap-4 rounded-3xl bg-amber-glow/15 p-4 ring-1 ring-amber-glow/40">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-glow text-night">
          <CameraIcon size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-black">{t('home.createTitle')}</h2>
          <p className="text-sm text-muted">{t('home.createBody')}</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-extrabold text-muted">{t('home.soon')}</span>
      </div>

      {decks === null ? (
        <p className="text-center font-bold text-muted">{t('common.loading')}</p>
      ) : decks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
          <Lumo size={96} mood="thinking" />
          <p className="font-black">{t('learn.empty')}</p>
          <p className="text-sm text-muted">{t('learn.emptyBody')}</p>
          <button onClick={() => void addSample()} disabled={busy} className="rounded-2xl bg-brand px-5 py-3 font-black text-brand-ink disabled:opacity-50">
            {t('learn.trySample')}
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {decks.map((d) => {
            const ratio = d.conceptCount ? d.masteredCount / d.conceptCount : 0;
            return (
              <li key={d.id}>
                <Link to={`/decks/${d.id}`} className="block rounded-3xl bg-surface p-4 ring-1 ring-line transition hover:ring-brand">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black">{d.title}</p>
                      <p className="text-sm text-muted">
                        {d.subject} · {t('learn.concepts', { count: d.conceptCount })}
                      </p>
                    </div>
                    {d.dueCount > 0 && <span className="shrink-0 rounded-full bg-amber-glow px-2 py-0.5 text-xs font-black text-night">{t('learn.due', { count: d.dueCount })}</span>}
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-amber-glow" style={{ width: `${Math.max(3, ratio * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs font-bold text-muted">{t('learn.mastered', { done: d.masteredCount, total: d.conceptCount })}</p>
                </Link>
              </li>
            );
          })}
          <li>
            <button onClick={() => void addSample()} disabled={busy} className="w-full rounded-2xl border-2 border-dashed border-line py-3 text-sm font-black text-muted">
              + {t('learn.trySample')}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
