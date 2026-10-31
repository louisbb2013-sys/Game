import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../lib/api';
import { play } from '../lib/sound';

/**
 * A deck's world map: each topic is an island. Play an island to conquer it (70 % right); the next one
 * opens. Facts you start to forget fog the island over and the monsters come back: replay it to win it back.
 */

interface Island {
  topic: string;
  name: string;
  facts: number;
  known: number;
  fading: number;
  missed: number;
  fresh: number;
  conquered: boolean;
  open: boolean;
}

const LOOKS = ['🏝️', '🌋', '🏔️', '🌴', '🏜️', '🗻', '🏰', '🌲', '🍄', '❄️'];
// The path winds left, middle, right, middle…
const SPOT = ['self-start', 'self-center', 'self-end', 'self-center'];

export function WorldMap() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [map, setMap] = useState<{ title: string; islands: Island[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ title: string; islands: Island[] }>(`/api/decks/${id}/map`).then(setMap, (e) => setError(e instanceof ApiError ? e.code : 'network'));
  }, [id]);

  const sail = useCallback(
    async (topic: string) => {
      setBusy(topic);
      setError(null);
      try {
        const res = await api<{ session: { id: string } }>(`/api/decks/${id}/sessions`, { method: 'POST', body: { mode: 'practice', full: true, topic, length: 10 } });
        play('whoosh');
        navigate(`/quiz/${res.session.id}`, { state: res });
      } catch (e) {
        setError(e instanceof ApiError ? e.code : 'network');
        setBusy(null);
      }
    },
    [id, navigate],
  );

  if (!map) {
    return error ? (
      <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 font-bold text-bad">
        {t(`quiz.errors.${error}`, { defaultValue: t('signin.errors.network') })}
      </p>
    ) : null;
  }
  const won = map.islands.filter((x) => x.conquered).length;
  const fog = map.islands.reduce((n, x) => n + (x.conquered ? x.fading + x.missed : 0), 0);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <Link to={`/decks/${id}`} aria-label={t('common.back')} className="grid size-11 place-items-center rounded-full bg-surface-2 text-xl font-black ring-1 ring-line">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black">🗺️ {t('map.title')}</h1>
          <p className="truncate text-sm font-bold text-muted">{map.title}</p>
        </div>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-black ring-1 ring-line" data-testid="map-score">
          🏝️ {won}/{map.islands.length}
        </span>
      </div>
      <p className="text-sm text-muted">{fog ? t('map.fogNow', { count: fog }) : t('map.intro')}</p>
      {error && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
          {t(`quiz.errors.${error}`, { defaultValue: t('signin.errors.network') })}
        </p>
      )}

      <ol className="sea flex flex-col gap-1 rounded-[2rem] bg-gradient-to-b from-sky-400/30 via-cyan-600/25 to-blue-900/40 p-4 ring-1 ring-sky-300/30" aria-label={t('map.title')}>
        {map.islands.map((x, i) => {
          const fogged = x.conquered && x.fading + x.missed > 0;
          const state = !x.open ? 'locked' : fogged ? 'fog' : x.conquered ? 'won' : 'new';
          const pct = Math.round((x.known / Math.max(1, x.facts)) * 100);
          return (
            <li key={x.topic || i} className={`flex w-44 flex-col items-center text-center ${SPOT[i % SPOT.length]}`} data-testid="island" data-state={state}>
              {i > 0 && <span className="mb-1 h-6 border-l-4 border-dotted border-white/40" aria-hidden />}
              <button
                type="button"
                disabled={!x.open || !!busy}
                onClick={() => void sail(x.topic)}
                aria-label={`${x.name}: ${t(`map.state.${state}`)}`}
                className={`relative grid size-28 place-items-center rounded-full text-6xl shadow-xl ring-4 transition hover:-translate-y-1 disabled:hover:translate-y-0 ${state === 'won' ? 'bg-emerald-400/40 ring-emerald-300' : state === 'fog' ? 'bg-slate-400/40 ring-slate-300' : state === 'new' ? 'breathe bg-amber-300/40 ring-amber-200' : 'bg-white/10 opacity-50 ring-white/20'}`}
              >
                <span aria-hidden className={state === 'fog' ? 'opacity-60 blur-[1px]' : ''}>
                  {busy === x.topic ? '⏳' : !x.open ? '🔒' : LOOKS[i % LOOKS.length]}
                </span>
                {state === 'won' && (
                  <span className="absolute -top-1 -right-1 text-3xl" aria-hidden>
                    🚩
                  </span>
                )}
                {state === 'fog' && (
                  <span className="absolute -right-2 -bottom-1 rounded-full bg-night px-2 py-0.5 text-sm font-black text-white ring-2 ring-slate-300" aria-hidden>
                    🌫️👾 {x.fading + x.missed}
                  </span>
                )}
              </button>
              <p className="mt-1 line-clamp-2 font-black">{x.name}</p>
              <div className="mt-0.5 h-2 w-28 overflow-hidden rounded-full bg-black/30" aria-hidden>
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs font-bold text-muted">
                {state === 'locked' ? t('map.locked') : state === 'fog' ? t('map.fog', { count: x.fading + x.missed }) : state === 'won' ? t('map.safe', { known: x.known, facts: x.facts }) : t('map.toConquer', { known: x.known, facts: x.facts })}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
