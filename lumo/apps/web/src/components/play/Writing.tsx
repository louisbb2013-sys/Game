import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Lumo } from '../Lumo';
import { onWriting, writeQuestions, writingState, type WriteState } from '../../local/writer';

/** Enough questions to start playing while Claude writes the rest. */
export const READY_TO_PLAY = 6;

/** Follow Claude writing a deck's questions. */
export function useWriting(deckId: string | undefined): WriteState | null {
  const [s, setS] = useState<WriteState | null>(() => (deckId ? writingState(deckId) : null));
  useEffect(() => {
    if (!deckId) return;
    setS(writingState(deckId));
    return onWriting(deckId, setS);
  }, [deckId]);
  return s;
}

/** Open the viewer's permission panel (the way back after saying no to Claude). */
async function managePermissions() {
  const use = (window as unknown as { claude?: { use?: (n: string) => Promise<{ manage?: () => Promise<void> } | null> } }).claude?.use;
  const p = use ? await use('permissions').catch(() => null) : null;
  await p?.manage?.().catch(() => {});
}

/**
 * Full-screen "Claude is writing your test" while the first questions arrive. Something to watch
 * (and a warm-up with flashcards) instead of a spinner; as soon as a few questions are ready, play.
 */
export function WritingScreen({ deckId, bank, onPlay, onClose, onBasic }: { deckId: string; bank: number; onPlay: () => void; onClose: () => void; onBasic: () => void }) {
  const { t } = useTranslation();
  const w = useWriting(deckId);
  const lines = t('write.lines', { returnObjects: true }) as string[];
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLine((n) => (n + 1) % Math.max(1, lines.length)), 2600);
    return () => clearInterval(id);
  }, [lines.length]);
  const count = Math.max(bank, w?.bank ?? 0);
  const ready = count >= READY_TO_PLAY;
  const failed = w?.status === 'error' && count === 0;
  // Questions arrive one by one, so the bar follows them (and the finished groups).
  const pct = w && w.groups ? Math.round(Math.max(w.groupsDone / w.groups, w.expected ? w.saved / w.expected : 0) * 100) : 6;

  return (
    <div className="arena fixed inset-0 z-50 overflow-y-auto" data-theme="dark" role="dialog" aria-modal="true" aria-label={t('write.title')}>
      <div className="arena-stars" aria-hidden />
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center px-5 pt-4 pb-8 text-center">
        <button type="button" onClick={onClose} aria-label={t('common.back')} className="grid size-10 place-items-center self-start rounded-full bg-white/10 text-2xl font-black text-white/80">
          ×
        </button>
        <div className="relative mt-4">
          <Lumo size={120} mood={failed ? 'sad' : 'thinking'} glow={0.9} />
          {!failed && (
            <span className="write-bob absolute -right-6 bottom-2 text-5xl" aria-hidden>
              ✍️
            </span>
          )}
        </div>
        <h1 className="mt-4 text-3xl leading-tight font-black">{failed ? t('write.failedTitle') : ready ? t('write.readyTitle') : t('write.title')}</h1>

        {failed ? (
          <>
            <p className="mt-2 font-bold text-white/85">{t(`write.errors.${w?.error}`, { defaultValue: t('write.errors.upstream_error') })}</p>
            <div className="mt-6 grid w-full gap-3">
              {w?.error === 'not_granted' ? (
                <button type="button" onClick={() => void managePermissions().then(() => writeQuestions(deckId))} className="btn-gold rounded-2xl py-4 text-lg font-black">
                  🔓 {t('write.allow')}
                </button>
              ) : (
                <button type="button" onClick={() => void writeQuestions(deckId)} className="btn-gold rounded-2xl py-4 text-lg font-black">
                  🔄 {t('write.retry')}
                </button>
              )}
              <button type="button" onClick={onBasic} className="rounded-2xl bg-white/15 py-3 font-black ring-1 ring-white/25">
                {t('write.basic')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p key={line} className="pop-in mt-2 min-h-12 font-bold text-white/85">
              {lines[line]}
            </p>
            <div className="mt-5 w-full">
              <div className="shimmer h-4 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('write.title')}>
                <div className="h-full rounded-full bg-gradient-to-r from-amber-300 via-pink-400 to-indigo-400 transition-[width] duration-700" style={{ width: `${Math.min(100, Math.max(6, pct))}%` }} />
              </div>
              <p className="mt-2 text-sm font-black text-amber-200" aria-live="polite">
                {t('write.count', { count })}
              </p>
            </div>
            <button
              type="button"
              disabled={!ready}
              onClick={onPlay}
              className={`mt-6 w-full rounded-2xl py-4 text-xl font-black ${ready ? 'btn-gold breathe' : 'bg-white/15 text-white/60'}`}
            >
              {ready ? `▶ ${t('write.playNow')}` : t('write.almost', { n: READY_TO_PLAY - count })}
            </button>
            <p className="mt-3 text-xs font-bold text-white/70">{ready ? t('write.keepsWriting') : t('write.why')}</p>
            <Link to={`/cards/${deckId}`} className="mt-5 rounded-full bg-white/10 px-4 py-2 text-sm font-black ring-1 ring-white/20">
              🃏 {t('write.warmup')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
