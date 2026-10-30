import { SANDBOX_EMOJI, SANDBOX_GROUPS, type SandboxKind } from '@lumo/core';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Lumo } from '../components/Lumo';
import { api, ApiError } from '../lib/api';
import type { DeckListItem } from '../lib/quiz';

interface Recent {
  id: string;
  kind: SandboxKind;
  title: string;
  score: number | null;
  completedAt: string | null;
}

export function Sandbox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [decks, setDecks] = useState<DeckListItem[] | null>(null);
  const deckId = params.get('deck') ?? decks?.[0]?.id ?? '';
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [recent, setRecent] = useState<Recent[]>([]);
  const [stats, setStats] = useState<{ done: number; stars: number; best: Record<string, number>; daily: SandboxKind; dailyDone: boolean } | null>(null);
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ decks: DeckListItem[] }>('/api/decks').then((r) => setDecks(r.decks), () => setDecks([]));
    api<{ activities: Recent[]; stats?: NonNullable<typeof stats> }>('/api/sandbox').then(
      (r) => {
        setRecent(r.activities);
        if (r.stats) setStats(r.stats);
      },
      () => {},
    );
  }, []);
  useEffect(() => {
    if (!deckId) return;
    api<{ formats: { kind: string; available: boolean }[] }>(`/api/decks/${deckId}/sandbox`).then(
      (r) => setAvailable(Object.fromEntries(r.formats.map((f) => [f.kind, f.available]))),
      () => setAvailable({}),
    );
  }, [deckId]);

  const open = (id: string) => navigate(`/sandbox/play/${id}`);
  const make = async (kind: SandboxKind) => {
    setBusy(kind);
    setError(null);
    try {
      open((await api<{ id: string }>('/api/sandbox', { method: 'POST', body: { deckId, kind } })).id);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'network');
      setBusy(null);
    }
  };
  const submitAsk = async (e: FormEvent) => {
    e.preventDefault();
    if (!ask.trim()) return;
    setBusy('ask');
    setError(null);
    try {
      open((await api<{ id: string }>('/api/sandbox/ask', { method: 'POST', body: { text: ask, deckId: deckId || undefined } })).id);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'network');
      setBusy(null);
    }
  };

  if (decks && decks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 pt-10 text-center">
        <Lumo size={110} mood="thinking" />
        <h1 className="text-2xl font-black">{t('sandbox.title')}</h1>
        <p className="text-muted">{t('sandbox.needDeck')}</p>
        <Link to="/chat" className="rounded-2xl bg-brand px-5 py-3 font-black text-brand-ink">
          {t('chat.start')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="lacquer lux-frame flex items-center gap-3 rounded-3xl p-4 text-white">
        <Lumo size={64} mood="cheer" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black">{t('sandbox.title')}</h1>
          <p className="text-sm text-white/75">{t('sandbox.subtitle')}</p>
          {stats && (
            <p className="mt-1 flex flex-wrap gap-2 text-xs font-black" data-testid="sandbox-stats">
              <span className="rounded-full bg-white/15 px-2 py-0.5">⭐ {t('sandboxx.stars', { count: stats.stars })}</span>
              <span className="rounded-full bg-white/15 px-2 py-0.5">🎮 {t('sandboxx.played', { count: stats.done })}</span>
              <span className="rounded-full bg-white/15 px-2 py-0.5">🏷️ {t(`sandboxx.rank.${stats.stars >= 120 ? 'legend' : stats.stars >= 60 ? 'master' : stats.stars >= 20 ? 'explorer' : 'rookie'}`)}</span>
            </p>
          )}
        </div>
      </header>

      {stats && deckId && (
        // One game a day gives double XP.
        <div className="flex items-center gap-3 rounded-3xl bg-gradient-to-r from-amber-300 to-pink-300 p-3 text-night" data-testid="sandbox-daily">
          <span className="text-4xl" aria-hidden>
            {SANDBOX_EMOJI[stats.daily]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-black tracking-wide uppercase">{t('sandboxx.dailyTitle')}</span>
            <span className="block font-black">{t(`sandbox.kinds.${stats.daily}`)} · ×2 XP</span>
            <span className="block text-xs font-bold">{stats.dailyDone ? t('sandboxx.dailyDone') : t('sandboxx.dailyBody')}</span>
          </span>
          {!stats.dailyDone && available[stats.daily] !== false && (
            <button type="button" disabled={busy !== null} onClick={() => void make(stats.daily)} className="rounded-2xl bg-night px-4 py-2 font-black text-white">
              ▶
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy !== null || !deckId}
          onClick={() => {
            // Surprise me: any game this deck can make.
            const kinds = (Object.values(SANDBOX_GROUPS).flat() as SandboxKind[]).filter((k) => available[k] !== false);
            if (kinds.length) void make(kinds[Math.floor(Math.random() * kinds.length)]!);
          }}
          className="rounded-2xl bg-brand py-3 font-black text-brand-ink disabled:opacity-40"
          data-testid="sandbox-surprise"
        >
          🎲 {t('sandboxx.surprise')}
        </button>
        <Link to="/lumo" className="rounded-2xl bg-surface py-3 text-center font-black ring-1 ring-line">
          💬 {t('sandboxx.askLumo')}
        </Link>
      </div>

      {decks && decks.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-sm font-bold">{t('sandbox.fromDeck')}</span>
          <select value={deckId} onChange={(e) => setParams({ deck: e.target.value })} className="w-full rounded-2xl border-2 border-line bg-surface px-3 py-2.5 font-bold">
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <form onSubmit={submitAsk} className="flex gap-2">
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder={t('sandbox.askPlaceholder')}
          aria-label={t('sandbox.askLabel')}
          className="min-w-0 flex-1 rounded-2xl border-2 border-line bg-surface px-4 py-3 outline-none focus:border-brand"
        />
        <button disabled={busy !== null || !ask.trim()} className="rounded-2xl bg-brand px-4 font-black text-brand-ink disabled:opacity-40">
          {busy === 'ask' ? '…' : t('sandbox.make')}
        </button>
      </form>
      {error && (
        <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-bold text-bad">
          {t(`sandbox.errors.${error}`, { defaultValue: t('signin.errors.network') })}
        </p>
      )}

      {(Object.keys(SANDBOX_GROUPS) as (keyof typeof SANDBOX_GROUPS)[]).map((g) => (
        <section key={g}>
          <h2 className="mb-2 font-black">{t(`sandbox.groups.${g}`)}</h2>
          <div className="grid grid-cols-2 gap-3">
            {SANDBOX_GROUPS[g].map((kind) => {
              const ok = available[kind] !== false;
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={!ok || busy !== null || !deckId}
                  onClick={() => void make(kind)}
                  className={`flex flex-col items-start gap-1 rounded-3xl p-3.5 text-left ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-brand disabled:opacity-40 disabled:hover:translate-y-0 ${g === 'play' ? 'bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/10' : g === 'watch' ? 'bg-gradient-to-br from-sky-500/15 to-emerald-500/10' : 'bg-gradient-to-br from-amber-500/15 to-rose-500/10'}`}
                >
                  <span className="text-3xl" aria-hidden>
                    {busy === kind ? '⏳' : SANDBOX_EMOJI[kind]}
                  </span>
                  <span className="flex w-full items-center gap-1 font-black">
                    {t(`sandbox.kinds.${kind}`)}
                    {stats && stats.best[kind] === undefined && ok && <span className="ml-auto rounded-full bg-amber-glow px-1.5 text-[0.6rem] text-night">{t('sandboxx.new')}</span>}
                    {stats?.best[kind] !== undefined && (
                      <span className="ml-auto text-xs text-amber-glow" aria-label={t('sandboxx.bestStars', { n: Math.round(stats.best[kind]! * 3) })}>
                        {'★'.repeat(Math.round(stats.best[kind]! * 3))}
                        {'☆'.repeat(3 - Math.round(stats.best[kind]! * 3))}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted">{ok ? t(`sandbox.desc.${kind}`) : t('sandbox.notForDeck')}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 font-black">{t('sandbox.recent')}</h2>
          <ul className="space-y-2">
            {recent.slice(0, 8).map((r) => (
              <li key={r.id}>
                <Link to={`/sandbox/play/${r.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
                  <span className="text-2xl">{SANDBOX_EMOJI[r.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{t(`sandbox.kinds.${r.kind}`)}</span>
                    <span className="block truncate text-xs text-muted">{r.title}</span>
                  </span>
                  {r.completedAt && <span className="text-sm font-black text-good">{Math.round((r.score ?? 0) * 100)}%</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
