import { useTranslation } from 'react-i18next';
import { deckRankKey, useProfiles, useTogether } from '../local/together';

/**
 * Who earned the most XP on this deck: everyone playing it (a friend's copy of a shared deck counts
 * toward the original's ranking).
 */
export function DeckRanking({ deckId, origin }: { deckId: string; origin?: string | null }) {
  const { t } = useTranslation();
  const together = useTogether();
  const profiles = useProfiles();
  if (!together || !profiles) return null;
  const key = deckRankKey(together.me, deckId, origin ?? undefined);
  const rows = profiles
    .flatMap((p) => ((p.deckXp?.[key] ?? 0) > 0 ? [{ id: p.id, name: p.username || t('together.someone'), xp: p.deckXp![key]! }] : []))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <section className="panel space-y-2 p-4" data-testid="deck-ranking">
      <h2 className="font-black">🏆 {t('rank.title')}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t('rank.empty')}</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${r.id === together.me ? 'bg-brand/15 font-black' : ''}`}>
              <span className="w-7 text-center">{medal[i] ?? `${i + 1}.`}</span>
              <span className="min-w-0 flex-1 truncate">
                {r.name}
                {r.id === together.me ? ` (${t('rank.you')})` : ''}
              </span>
              <span className="text-sm font-black tabular-nums">{t('rank.xp', { n: r.xp })}</span>
            </li>
          ))}
        </ol>
      )}
      {rows.length < 2 && <p className="text-xs text-muted">{t('rank.share')}</p>}
    </section>
  );
}
