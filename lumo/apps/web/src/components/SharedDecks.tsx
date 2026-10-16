import type { Concept, Locale } from '@lumo/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api, NETLIFY } from '../lib/api';
import { myPublicDecks, setPublicDecks, useNames, useSharedDecks, useTogether } from '../local/together';

/** Browser-only build: decks friends made public. Copy one to study it, or host a Live game with it. */
export function SharedDecks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const together = useTogether();
  const decks = useSharedDecks();
  const names = useNames((decks ?? []).map((d) => d.ownerId));
  const [busy, setBusy] = useState<string | null>(null);
  if (!together || !decks) return null;
  const others = decks.filter((d) => d.ownerId !== together.me);

  const copy = async (d: (typeof others)[number], thenLive: boolean) => {
    setBusy(d.id);
    try {
      const { id } = await api<{ id: string }>('/api/local/decks', { method: 'POST', body: { title: d.title, subject: d.subject, language: d.language, concepts: d.concepts.map(({ id: _id, ...c }) => c) } });
      navigate(thenLive ? `/live?deck=${id}` : `/decks/${id}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-2" aria-labelledby="shared-title">
      <h2 id="shared-title" className="font-black">
        🤝 {t('together.sharedDecks')}
      </h2>
      {others.length === 0 ? (
        <p className="rounded-2xl bg-surface p-3 text-sm text-muted ring-1 ring-line">{t('together.noSharedDecks')}</p>
      ) : (
        others.map((d) => (
          <div key={`${d.ownerId}:${d.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-black">{d.title}</span>
              <span className="text-xs font-bold text-muted">{t('together.sharedBy', { name: names[d.ownerId]?.name || t('together.someone'), count: d.concepts.length })}</span>
            </span>
            <button disabled={busy === d.id} onClick={() => void copy(d, true)} className="rounded-xl bg-surface-2 px-2.5 py-1.5 text-sm font-black" aria-label={t('together.playLiveWith', { deck: d.title })}>
              ⚡
            </button>
            <button disabled={busy === d.id} onClick={() => void copy(d, false)} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-black text-brand-ink disabled:opacity-50">
              {t('together.addToMine')}
            </button>
          </div>
        ))
      )}
    </section>
  );
}

/** Deck page (browser-only build): make this deck public for friends, or private again. */
export function ShareDeckToggle({ deckId }: { deckId: string }) {
  const { t } = useTranslation();
  const together = useTogether();
  const [shared, setShared] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (together) void myPublicDecks().then((l) => setShared(l.some((d) => d.id === deckId)));
  }, [together, deckId]);
  if (!together || shared === null) return null;

  const toggle = async () => {
    setMsg(null);
    try {
      const list = (await myPublicDecks()).filter((d) => d.id !== deckId);
      if (!shared) {
        const d = await api<{ deck: { id: string; title: string; subject: string; language: Locale }; concepts: Concept[] }>(`/api/decks/${deckId}/offline`);
        list.unshift({ ...d.deck, concepts: d.concepts, updatedAt: Date.now() });
      }
      await setPublicDecks(list);
      setShared(!shared);
      setMsg(!shared ? t('together.nowPublic') : t('together.nowPrivate'));
    } catch {
      setMsg(t('together.cantShare'));
    }
  };

  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface p-3.5 ring-1 ring-line">
        <span>
          <span className="block font-black">🤝 {t('together.shareDeck')}</span>
          <span className="block text-xs text-muted">{t(NETLIFY ? 'together.shareDeckBodySite' : 'together.shareDeckBody')}</span>
        </span>
        <input type="checkbox" role="switch" checked={shared} onChange={() => void toggle()} className="size-6 accent-brand" />
      </label>
      {msg && (
        <p role="status" className="text-sm font-bold text-muted">
          {msg}
        </p>
      )}
    </div>
  );
}
