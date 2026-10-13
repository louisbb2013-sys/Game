import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { HeartIcon } from '../components/icons';
import { Lumo } from '../components/Lumo';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { MasteryItem, Mode } from '../lib/quiz';

interface DeckData {
  deck: { id: string; title: string; subject: string; language: string; mine: boolean };
  concepts: MasteryItem[];
}

const BAND_STYLE: Record<MasteryItem['band'], string> = {
  new: 'bg-surface ring-line text-muted',
  learning: 'bg-indigo-100 ring-indigo-300 text-indigo-900 dark:bg-indigo-950 dark:ring-indigo-700 dark:text-indigo-100',
  familiar: 'bg-brand/20 ring-brand text-ink',
  mastered: 'bg-amber-glow/30 ring-amber-glow text-ink',
};

export function Deck() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DeckData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<Mode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api<DeckData>(`/api/decks/${id}`).then(setData, () => setError('deck_not_found'));
  }, [id]);

  const start = async (mode: Mode) => {
    setStarting(mode);
    setError(null);
    try {
      const res = await api<{ session: { id: string } }>(`/api/decks/${id}/sessions`, { method: 'POST', body: { mode, length: mode === 'review' ? 8 : 10 } });
      navigate(`/quiz/${res.session.id}`, { state: res });
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
      setStarting(null);
    }
  };

  const remove = async () => {
    await api(`/api/decks/${id}`, { method: 'DELETE' });
    navigate('/learn');
  };

  if (error === 'deck_not_found') {
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

  const topics = [...new Set(data.concepts.map((c) => c.topic))];
  const mastered = data.concepts.filter((c) => c.band === 'mastered').length;
  const due = data.concepts.filter((c) => c.due).length;
  const wrong = data.concepts.filter((c) => c.band === 'learning').length;
  const studied = data.concepts.some((c) => c.band !== 'new');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/learn" className="rounded-full bg-surface px-3 py-1 text-sm font-extrabold ring-1 ring-line">
          ← {t('common.back')}
        </Link>
      </div>
      <header className="flex items-center gap-4">
        <Lumo size={72} mood={mastered === data.concepts.length && mastered > 0 ? 'cheer' : 'happy'} glow={0.3 + (0.7 * mastered) / Math.max(1, data.concepts.length)} />
        <div className="min-w-0">
          <h1 className="text-2xl font-black">{data.deck.title}</h1>
          <p className="text-sm text-muted">
            {data.deck.subject} · {t('learn.mastered', { done: mastered, total: data.concepts.length })}
          </p>
        </div>
      </header>

      <section className="grid gap-3">
        <ModeButton primary onClick={() => void start('practice')} busy={starting === 'practice'} title={t('deck.practice')} body={t('deck.practiceBody')} icon="✨" />
        <div className="grid grid-cols-2 gap-3">
          <ModeButton onClick={() => void start('review')} busy={starting === 'review'} title={t('deck.review')} body={due ? t('deck.reviewDue', { count: due }) : t('deck.reviewBody')} icon="🔁" disabled={!studied} />
          <ModeButton onClick={() => void start('wrong_only')} busy={starting === 'wrong_only'} title={t('deck.fix')} body={t('deck.fixBody', { count: wrong })} icon="🎯" disabled={!studied} />
        </div>
        <ModeButton
          onClick={() => void start('challenge')}
          busy={starting === 'challenge'}
          title={t('deck.challenge')}
          body={t('deck.challengeBody')}
          icon={<HeartIcon size={22} className="text-heart" />}
          disabled={(user?.hearts.current ?? 0) === 0}
          note={(user?.hearts.current ?? 0) === 0 ? t('deck.noHearts') : undefined}
        />
        <Link to={`/live?deck=${data.deck.id}`} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-700 to-violet-600 p-3.5 text-white">
          <span className="text-2xl">⚡</span>
          <span className="min-w-0 flex-1">
            <span className="block font-black">{t('deck.live')}</span>
            <span className="block text-sm opacity-85">{t('deck.liveBody')}</span>
          </span>
          <span className="text-2xl">›</span>
        </Link>
        {error && error !== 'deck_not_found' && (
          <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
            {t(`quiz.errors.${error}`, { defaultValue: t('signin.errors.network') })}
          </p>
        )}
      </section>

      <section aria-labelledby="map-title" className="rounded-3xl bg-surface p-4 ring-1 ring-line">
        <h2 id="map-title" className="font-black">
          {t('deck.masteryMap')}
        </h2>
        <div className="mt-1 mb-3 flex flex-wrap gap-2 text-[0.7rem] font-bold">
          {(['new', 'learning', 'familiar', 'mastered'] as const).map((b) => (
            <span key={b} className={`rounded-full px-2 py-0.5 ring-1 ${BAND_STYLE[b]}`}>
              {t(`mastery.${b}`)}
            </span>
          ))}
        </div>
        <div className="space-y-4">
          {topics.map((topic) => {
            const items = data.concepts.filter((c) => c.topic === topic);
            const avg = items.reduce((s, c) => s + c.score, 0) / items.length;
            return (
              <div key={topic}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-black">{topic}</h3>
                  <span className="text-xs font-bold text-muted">{Math.round(avg * 100)}%</span>
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {items.map((c) => (
                    <li key={c.id} className={`rounded-xl px-2.5 py-1.5 text-sm font-bold ring-1 ${BAND_STYLE[c.band]}`} title={t('deck.formatsPassed', { count: c.formatsPassed })}>
                      {c.band === 'mastered' && '★ '}
                      {c.term}
                      {c.due && <span className="ml-1 text-amber-glow">●</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">{t('deck.masteryRule')}</p>
      </section>

      {data.deck.mine && (
        <div className="text-center">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-sm font-bold text-muted">
              {t('deck.delete')}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-3 text-sm font-bold">
              <span>{t('deck.deleteConfirm')}</span>
              <button onClick={() => void remove()} className="rounded-lg bg-bad px-3 py-1 text-white">
                {t('deck.deleteYes')}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-muted">
                {t('settings.cancel')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModeButton({ title, body, icon, onClick, busy, primary, disabled, note }: { title: string; body: string; icon: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean; disabled?: boolean; note?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`flex items-center gap-3 rounded-3xl p-4 text-left transition active:scale-[0.99] disabled:opacity-50 ${
        primary ? 'bg-brand text-brand-ink shadow-[0_4px_0_0_rgb(0_0_0/0.18)]' : 'bg-surface ring-1 ring-line hover:ring-brand'
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {busy ? '⏳' : icon}
      </span>
      <span className="min-w-0">
        <span className="block font-black">{title}</span>
        <span className={`block text-sm ${primary ? 'opacity-90' : 'text-muted'}`}>{note ?? body}</span>
      </span>
    </button>
  );
}
