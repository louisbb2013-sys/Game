import type { Concept, Locale, Question } from '@lumo/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { api, NETLIFY } from '../lib/api';
import { FRIENDS_ONLY, myPublicDecks, setPublicDecks, sharedDeck, useNames, useSharedDecks, useTogether, type PublicDeck } from '../local/together';
import { shareOrCopy } from './QrCode';

type Shared = PublicDeck & { ownerId: string; fromFriend: boolean };

/** Copy a shared deck into my decks (its questions come along, so it plays right away). */
async function copyDeck(d: PublicDeck): Promise<string> {
  const { id } = await api<{ id: string }>('/api/local/decks/import', { method: 'POST', body: { title: d.title, subject: d.subject, language: d.language, concepts: d.concepts, bank: d.bank ?? [] } });
  return id;
}

/** Browser-only build: decks friends shared, and (on the website) public decks from anyone on Lumoly. */
export function SharedDecks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const together = useTogether();
  const decks = useSharedDecks() as Shared[] | null;
  const names = useNames((decks ?? []).map((d) => d.ownerId));
  const [busy, setBusy] = useState<string | null>(null);
  if (!together || !decks) return null;
  const others = decks.filter((d) => d.ownerId !== together.me);
  const friends = others.filter((d) => d.fromFriend);
  const everyone = others.filter((d) => !d.fromFriend).slice(0, 30);

  const copy = async (d: Shared, thenLive: boolean) => {
    setBusy(d.id);
    try {
      const id = await copyDeck(d);
      navigate(thenLive ? `/live?deck=${id}` : `/decks/${id}`);
    } finally {
      setBusy(null);
    }
  };

  const row = (d: Shared) => (
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
  );

  return (
    <section className="space-y-2" aria-labelledby="shared-title">
      <h2 id="shared-title" className="font-black">
        🤝 {t(FRIENDS_ONLY ? 'together.fromFriends' : 'together.sharedDecks')}
      </h2>
      {friends.length === 0 ? <p className="rounded-2xl bg-surface p-3 text-sm text-muted ring-1 ring-line">{t('together.noSharedDecks')}</p> : friends.map(row)}
      {FRIENDS_ONLY && everyone.length > 0 && (
        <>
          <h2 className="pt-2 font-black">🌍 {t('together.publicDecks')}</h2>
          {everyone.map(row)}
        </>
      )}
    </section>
  );
}

type Visibility = 'private' | 'friends' | 'public';

/** Deck page (browser-only build): who can see this deck: only me, my friends, or everyone (website). */
export function ShareDeckToggle({ deckId }: { deckId: string }) {
  const { t } = useTranslation();
  const together = useTogether();
  const [vis, setVis] = useState<Visibility | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (together) void myPublicDecks().then((l) => setVis(((d) => (d ? (d.visibility ?? 'friends') : 'private'))(l.find((d) => d.id === deckId))));
  }, [together, deckId]);
  if (!together || vis === null) return null;
  const link = together ? `${location.origin}/shared/${together.me}/${deckId}` : '';

  const choose = async (next: Visibility) => {
    if (next === vis || busy) return;
    setMsg(null);
    setBusy(true);
    try {
      const list = (await myPublicDecks()).filter((d) => d.id !== deckId);
      if (next !== 'private') {
        const d = await api<{ deck: { id: string; title: string; subject: string; language: Locale }; concepts: Concept[]; bank?: Question[] }>(`/api/decks/${deckId}/offline`);
        list.unshift({ ...d.deck, concepts: d.concepts, bank: d.bank ?? [], visibility: next, updatedAt: Date.now() });
      }
      await setPublicDecks(list);
      setVis(next);
      setMsg(t(`together.now.${next}`));
    } catch {
      setMsg(t('together.cantShare'));
    } finally {
      setBusy(false);
    }
  };

  const options: Visibility[] = FRIENDS_ONLY ? ['private', 'friends', 'public'] : ['private', 'friends'];
  return (
    <section className="space-y-2 rounded-2xl bg-surface p-3.5 ring-1 ring-line" aria-labelledby="share-title">
      <h2 id="share-title" className="font-black">
        🤝 {t('together.shareDeck')}
      </h2>
      <div role="radiogroup" aria-labelledby="share-title" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={vis === o}
            disabled={busy}
            onClick={() => void choose(o)}
            className={`rounded-xl px-2 py-2 text-sm font-black ring-1 transition ${vis === o ? 'bg-brand text-brand-ink ring-brand' : 'bg-surface-2 ring-line'}`}
          >
            {t(`together.vis.${o}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{t(`together.visBody.${vis}${NETLIFY || vis !== 'friends' ? '' : 'Claude'}`)}</p>
      {vis === 'public' && NETLIFY && (
        <button type="button" onClick={() => void shareOrCopy(link, t('together.shareDeck')).then((r) => r !== 'failed' && setMsg(t(`live.${r}`)))} className="w-full rounded-xl bg-surface-2 py-2 text-sm font-black ring-1 ring-line">
          🔗 {t('together.copyDeckLink')}
        </button>
      )}
      {msg && (
        <p role="status" className="text-sm font-bold text-muted">
          {msg}
        </p>
      )}
    </section>
  );
}

/** A deck someone shared by link (/shared/:owner/:deck): look at it, add it to my decks, or play it Live. */
export function SharedDeckPage() {
  const { owner = '', deck = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [d, setD] = useState<PublicDeck | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const names = useNames(owner ? [owner] : []);
  useEffect(() => {
    void sharedDeck(owner, deck).then(setD, () => setD(null));
  }, [owner, deck]);

  if (d === undefined) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;
  if (!d)
    return (
      <div className="space-y-4 pt-10 text-center">
        <p className="text-lg font-black">{t('together.deckGone')}</p>
        <Link to="/learn" className="inline-block rounded-2xl bg-brand px-6 py-3 font-black text-brand-ink">
          {t('live.back')}
        </Link>
      </div>
    );
  const add = async (live: boolean) => {
    setBusy(true);
    try {
      const id = await copyDeck(d);
      navigate(live ? `/live?deck=${id}` : `/decks/${id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <header className="holo rounded-3xl royal p-5 text-white">
        <p className="text-sm font-bold opacity-80">{t('together.sharedBy', { name: names[owner]?.name || t('together.someone'), count: d.concepts.length })}</p>
        <h1 className="mt-1 text-3xl font-black">{d.title}</h1>
        {d.subject && <p className="font-bold opacity-90">{d.subject}</p>}
        <p className="mt-2 text-sm font-bold">📝 {t('hub.questions', { count: d.bank?.length ?? 0 })}</p>
      </header>
      <ul className="space-y-1.5">
        {d.concepts.slice(0, 8).map((c) => (
          <li key={c.id} className="rounded-xl bg-surface px-3 py-2 font-bold ring-1 ring-line">
            {c.term}
          </li>
        ))}
      </ul>
      <button disabled={busy} onClick={() => void add(false)} className="btn-gold w-full rounded-2xl py-4 text-lg font-black disabled:opacity-60">
        {t('together.addToMine')}
      </button>
      <button disabled={busy} onClick={() => void add(true)} className="w-full rounded-2xl bg-surface py-3 font-black ring-1 ring-line disabled:opacity-60">
        ⚡ {t('together.playLiveWith', { deck: d.title })}
      </button>
    </div>
  );
}
