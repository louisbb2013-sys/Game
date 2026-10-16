import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Lumo } from '../components/Lumo';
import { api } from '../lib/api';
import { useConfetti } from '../lib/confetti';
import { burst, haptic } from '../lib/fx';
import { useRewards, type Rewards } from '../lib/rewards';
import { play } from '../lib/sound';

interface Card {
  conceptId: string;
  term: string;
  front: string;
  context?: string;
  back: string;
  why?: string;
}

/**
 * Flashcards (Gizmo's "Memorise" without stakes): read the question, answer it IN YOUR HEAD, flip,
 * then say honestly if you knew it. Cards you didn't know come back at the end; the rating feeds
 * the spaced-repetition schedule. Swipe right = knew it, left = not yet (or use the buttons/keys).
 */
export function Flashcards() {
  const { deckId } = useParams();
  const { t } = useTranslation();
  const showRewards = useRewards();
  const [deck, setDeck] = useState<{ id: string; title: string } | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null);
  const [known, setKnown] = useState(0);
  const [total, setTotal] = useState(0);
  const [seen, setSeen] = useState(0);
  const [error, setError] = useState(false);
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const [dx, setDx] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ deck: { id: string; title: string }; cards: Card[] }>(`/api/decks/${deckId}/cards`).then(
      (r) => {
        setDeck(r.deck);
        setQueue(r.cards);
        setTotal(r.cards.length);
      },
      () => setError(true),
    );
  }, [deckId]);

  const card = queue[0];
  const done = deck && queue.length === 0;
  useConfetti(!!done && total > 0 && known / Math.max(1, seen) >= 0.7);

  const rate = (knew: boolean) => {
    if (!card || leaving) return;
    setLeaving(knew ? 'right' : 'left');
    play(knew ? 'correct' : 'whoosh');
    haptic(knew ? 15 : 8);
    if (knew) burst(cardRef.current, { count: 14 });
    void api<{ rewards: Rewards }>(`/api/decks/${deckId}/cards`, { method: 'POST', body: { conceptId: card.conceptId, knew } }).then((r) => showRewards(r.rewards), () => {});
    setSeen((n) => n + 1);
    if (knew) setKnown((n) => n + 1);
    setTimeout(() => {
      // A card you didn't know comes back at the end of the pile.
      setQueue((qs) => (knew ? qs.slice(1) : [...qs.slice(1), qs[0]!]));
      setFlipped(false);
      setLeaving(null);
      setDx(0);
    }, 330);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && e.key === 'ArrowRight') rate(true);
      else if (flipped && e.key === 'ArrowLeft') rate(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  if (error) {
    return (
      <Shell>
        <p className="pt-20 text-center font-bold">{t('quiz.loadError')}</p>
      </Shell>
    );
  }
  if (!deck) {
    return (
      <Shell>
        <div className="grid min-h-[70dvh] place-items-center">
          <Lumo mood="thinking" size={90} />
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="flex min-h-[85dvh] flex-col items-center justify-center gap-3 text-center">
          <Lumo size={110} mood="cheer" glow={1} />
          <h1 className="text-3xl font-black">{t('cards.done')}</h1>
          <p className="font-bold text-white/85">{t('cards.doneBody', { known, total: seen })}</p>
          <Link to={`/decks/${deckId}`} className="btn-gold mt-4 w-full max-w-sm rounded-2xl py-4 text-lg font-black">
            {t('quiz.backToDeck')}
          </Link>
        </div>
      </Shell>
    );
  }

  const tiltDeg = dx / 18;
  return (
    <Shell>
      <div className="flex items-center gap-3 pt-1">
        <Link to={`/decks/${deckId}`} aria-label={t('quiz.exit')} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-2xl font-black text-white/80">
          ×
        </Link>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label={t('play.progress')} aria-valuenow={total - queue.length} aria-valuemin={0} aria-valuemax={total}>
          <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-300 transition-[width] duration-500" style={{ width: `${Math.max(5, ((total - queue.length) / Math.max(1, total)) * 100)}%` }} />
        </div>
        <span className="text-sm font-black text-white/80 tabular-nums">
          {known} ✓
        </span>
      </div>
      <p className="mt-3 text-center text-sm font-black tracking-wide text-indigo-200 uppercase">{flipped ? t('cards.didYouKnow') : t('cards.thinkFirst')}</p>

      <div
        ref={cardRef}
        className={`flip mx-auto mt-3 h-[58dvh] w-full max-w-md select-none lg:max-w-xl ${leaving === 'right' ? 'swipe-out-right' : leaving === 'left' ? 'swipe-out-left' : ''}`}
        data-flipped={flipped}
        style={leaving ? undefined : { transform: `translateX(${dx}px) rotate(${tiltDeg}deg)`, transition: drag.current ? 'none' : 'transform 0.25s' }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, dx: 0 };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !flipped) return;
          drag.current.dx = e.clientX - drag.current.x;
          setDx(drag.current.dx);
        }}
        onPointerUp={() => {
          const d = drag.current?.dx ?? 0;
          drag.current = null;
          if (flipped && Math.abs(d) > 90) rate(d > 0);
          else {
            setDx(0);
            if (Math.abs(d) < 8) {
              setFlipped((f) => !f);
              play('tap');
            }
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDx(0);
        }}
      >
        <div className="flip-inner">
          <button type="button" className="flip-face flex flex-col items-center justify-center rounded-3xl bg-white p-6 text-center text-night shadow-2xl" aria-label={t('cards.flip')} tabIndex={flipped ? -1 : 0}>
            <span className="mb-3 rounded-full bg-indigo-100 px-3 py-1 text-xs font-black tracking-wide text-indigo-700 uppercase">{t('cards.question')}</span>
            {card!.context && <span className="mb-3 line-clamp-4 rounded-xl bg-amber-50 p-2 text-sm text-slate-700 italic">{card!.context}</span>}
            <span className={`leading-snug font-black ${card!.front.length < 60 ? 'text-3xl' : 'text-xl'}`}>{card!.front}</span>
            <span className="mt-6 text-sm font-bold text-slate-500">👆 {t('cards.tapToFlip')}</span>
          </button>
          <div className="flip-face flip-back flex flex-col items-center justify-center overflow-y-auto rounded-3xl royal p-6 text-center text-white shadow-2xl">
            <span className="mb-3 rounded-full bg-white/20 px-3 py-1 text-xs font-black tracking-wide uppercase">{t('cards.answer')}</span>
            <span className={`leading-snug font-black whitespace-pre-line ${card!.back.length < 60 ? 'text-3xl' : 'text-xl'}`}>{card!.back}</span>
            {card!.why && <span className="mt-4 text-sm leading-snug text-white/85">💡 {card!.why}</span>}
          </div>
        </div>
      </div>

      <div className="mx-auto mt-5 grid w-full max-w-md grid-cols-2 gap-3 pb-6 lg:max-w-xl">
        <button type="button" disabled={!flipped} onClick={() => rate(false)} className="rounded-2xl bg-rose-500 py-4 text-lg font-black text-white shadow-[0_5px_0_0_rgb(0_0_0/0.3)] disabled:opacity-35">
          😅 {t('cards.notYet')}
        </button>
        <button type="button" disabled={!flipped} onClick={() => rate(true)} className="rounded-2xl bg-emerald-500 py-4 text-lg font-black text-night shadow-[0_5px_0_0_rgb(0_0_0/0.3)] disabled:opacity-35">
          😎 {t('cards.knewIt')}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="arena relative" data-theme="dark">
      <div className="arena-stars" aria-hidden />
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-3 lg:max-w-3xl lg:pt-8">{children}</div>
    </div>
  );
}
