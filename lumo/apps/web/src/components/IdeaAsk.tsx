import type { ConceptInput } from '@lumo/core';
import { useTranslation } from 'react-i18next';

/**
 * While Lumo reads the notes, each part it finds pops up: "Do you want this in your deck?" Yes or no,
 * one at a time, so the deck (and its questions) is exactly what the student needs.
 */
export function IdeaAsk({ idea, asked, onAnswer, onKeepRest }: { idea: ConceptInput; asked: number; onAnswer: (yes: boolean) => void; onKeepRest: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="pop-in w-full rounded-3xl bg-surface p-5 text-left shadow-xl ring-2 ring-gold" role="dialog" aria-label={t('ask.title')} data-testid="idea-ask" key={idea.term}>
      <p className="text-sm font-black text-muted">❓ {t('ask.title')}</p>
      {idea.topic && <span className="mt-2 inline-block rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-black">📚 {idea.topic}</span>}
      <p className="mt-2 text-2xl leading-tight font-black" data-testid="idea-term">
        {idea.stars?.length ? '★ ' : ''}
        {idea.term}
      </p>
      {idea.summary && <p className="mt-1 text-sm text-muted">{idea.summary}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onAnswer(false)} className="rounded-2xl bg-bad/15 py-3.5 text-lg font-black text-bad ring-2 ring-bad/40" data-testid="idea-no">
          ✗ {t('ask.no')}
        </button>
        <button type="button" onClick={() => onAnswer(true)} className="rounded-2xl bg-good py-3.5 text-lg font-black text-white" data-testid="idea-yes">
          ✓ {t('ask.yes')}
        </button>
      </div>
      <button type="button" onClick={onKeepRest} className="mt-3 w-full text-center text-sm font-bold text-muted underline" data-testid="idea-keep-rest">
        {t('ask.keepRest', { count: asked })}
      </button>
    </div>
  );
}
