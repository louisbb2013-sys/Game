import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { deckColors, tilt } from '../lib/tilt';
import type { DeckListItem } from '../lib/quiz';

/** A deck as a jewel-toned card: title, how much is mastered, and what's due today. */
export function DeckCard({ deck: d, index = 0 }: { deck: DeckListItem; index?: number }) {
  const { t } = useTranslation();
  const ratio = d.conceptCount ? d.masteredCount / d.conceptCount : 0;
  return (
    <Link
      to={`/decks/${d.id}`}
      {...tilt}
      className="holo rise-in lux-frame flex min-h-[10.5rem] flex-col justify-between rounded-3xl p-5 text-white shadow-lg"
      style={{ background: deckColors(d.title), ['--d' as string]: `${Math.min(index, 8) * 0.05}s` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {d.subject && <p className="text-xs font-bold text-white/70">{d.subject}</p>}
          <p className="font-display mt-0.5 line-clamp-2 text-xl leading-snug font-black drop-shadow-sm">{d.title}</p>
        </div>
        {d.dueCount > 0 && <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 text-xs font-black text-night">{t('learn.due', { count: d.dueCount })}</span>}
      </div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-gradient-to-r from-[#c9973a] to-[#f6e2a0]" style={{ width: `${Math.max(3, ratio * 100)}%` }} />
        </div>
        <p className="mt-1.5 text-xs font-bold text-white/85">
          {t('learn.mastered', { done: d.masteredCount, total: d.conceptCount })} · {t('learn.concepts', { count: d.conceptCount })}
        </p>
      </div>
    </Link>
  );
}
