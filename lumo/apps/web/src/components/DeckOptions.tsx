import { useTranslation } from 'react-i18next';
import { QUESTION_STYLES, type DeckOptions, type QuestionStyle } from '../local/reader';

/**
 * "Make it yours" when creating a deck: the level, how much of the notes to cover, how hard, which
 * kinds of questions, and what to focus on. Claude follows these for the deck and for every question it
 * writes for it later. The last choices are remembered on this device (the level rarely changes).
 */

const KEY = 'lumo.deckOptions';

export function lastDeckOptions(): DeckOptions {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as DeckOptions;
    // The focus is about one deck: never carried over.
    return { ...o, focus: undefined };
  } catch {
    return {};
  }
}

export function rememberDeckOptions(o: DeckOptions) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...o, focus: undefined }));
  } catch {
    /* fine: nothing remembered */
  }
}

const DETAILS = ['key', 'all', 'deep'] as const;
const LEVELS = ['easier', 'normal', 'harder'] as const;
const STYLE_ICON: Record<QuestionStyle, string> = { quick: '⚡', understand: '💡', apply: '🧪', written: '✍️' };

export function DeckOptionsPanel({ value, onChange, open: startOpen = false }: { value: DeckOptions; onChange: (o: DeckOptions) => void; open?: boolean }) {
  const { t } = useTranslation();
  const set = (patch: Partial<DeckOptions>) => onChange({ ...value, ...patch });
  const styles = value.styles ?? [];
  const toggle = (st: QuestionStyle) => set({ styles: styles.includes(st) ? styles.filter((x) => x !== st) : [...styles, st] });
  const chips = [
    value.level,
    value.detail && value.detail !== 'all' ? t(`deckOptions.detail.${value.detail}`) : null,
    value.difficulty && value.difficulty !== 'normal' ? t(`deckOptions.difficulty.${value.difficulty}`) : null,
    ...styles.map((st) => `${STYLE_ICON[st]} ${t(`deckOptions.styles.${st}`)}`),
    value.focus ? `🎯 ${value.focus.slice(0, 24)}${value.focus.length > 24 ? '…' : ''}` : null,
  ].filter(Boolean);
  return (
    <details className="panel group p-4" open={startOpen} data-testid="deck-options">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <span className="text-xl" aria-hidden>
          🎛️
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-black">{t('deckOptions.title')}</span>
          <span className="block truncate text-xs text-muted">{chips.length ? chips.join(' · ') : t('deckOptions.default')}</span>
        </span>
        <span className="text-muted transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-bold">{t('deckOptions.level')}</span>
          <input
            value={value.level ?? ''}
            onChange={(e) => set({ level: e.target.value })}
            maxLength={60}
            list="deck-levels"
            placeholder={t('deckOptions.levelPlaceholder')}
            className="w-full rounded-2xl border-2 border-line bg-surface px-4 py-2.5 font-bold outline-none focus:border-brand"
          />
          <datalist id="deck-levels">
            {(t('deckOptions.levels', { returnObjects: true }) as string[]).map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>

        <fieldset>
          <legend className="mb-1 text-sm font-bold">{t('deckOptions.detailTitle')}</legend>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
            {DETAILS.map((d) => {
              const on = (value.detail ?? 'all') === d;
              return (
                <button key={d} type="button" role="radio" aria-checked={on} onClick={() => set({ detail: d })} className={`rounded-xl px-2 py-2 text-left ring-2 ${on ? 'bg-brand/10 ring-brand' : 'ring-line'}`}>
                  <span className="block text-sm font-black">{t(`deckOptions.detail.${d}`)}</span>
                  <span className="block text-[0.7rem] leading-tight text-muted">{t(`deckOptions.detailBody.${d}`)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-bold">{t('deckOptions.difficultyTitle')}</legend>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
            {LEVELS.map((d) => {
              const on = (value.difficulty ?? 'normal') === d;
              return (
                <button key={d} type="button" role="radio" aria-checked={on} onClick={() => set({ difficulty: d })} className={`rounded-xl py-2 text-sm font-black ring-2 ${on ? 'bg-brand/10 ring-brand' : 'ring-line'}`}>
                  {t(`deckOptions.difficulty.${d}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-bold">{t('deckOptions.stylesTitle')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {QUESTION_STYLES.map((st) => {
              const on = styles.includes(st);
              return (
                <button key={st} type="button" aria-pressed={on} onClick={() => toggle(st)} className={`rounded-full px-3 py-1.5 text-sm font-black ring-2 ${on ? 'bg-brand text-brand-ink ring-brand' : 'ring-line'}`}>
                  {STYLE_ICON[st]} {t(`deckOptions.styles.${st}`)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">{styles.length ? t('deckOptions.stylesSome') : t('deckOptions.stylesMix')}</p>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-sm font-bold">{t('create.focus')}</span>
          <textarea
            value={value.focus ?? ''}
            onChange={(e) => set({ focus: e.target.value })}
            maxLength={600}
            rows={2}
            placeholder={t('deckOptions.focusPlaceholder')}
            className="w-full resize-none rounded-2xl border-2 border-line bg-surface px-4 py-2.5 font-bold outline-none focus:border-brand"
          />
        </label>
      </div>
    </details>
  );
}
