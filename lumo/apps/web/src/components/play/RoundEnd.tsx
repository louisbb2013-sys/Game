import { useEffect, useRef, useState } from 'react';
import { ChestArt } from '../Art';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CoinIcon, FlameIcon, HeartIcon } from '../icons';
import { Lumo } from '../Lumo';
import { useConfetti } from '../../lib/confetti';
import { burst, reduced } from '../../lib/fx';
import { play } from '../../lib/sound';
import type { Mode, SessionSummary } from '../../lib/quiz';
import type { Rewards } from '../../lib/rewards';
import { BADGES } from '@lumo/core';

/** End of a round: stars, what you earned, what to review, and the next thing to play. */
export function RoundEnd({ summary, rewards, deckId, onAgain, onMode, onChests }: { summary: SessionSummary; rewards?: Rewards | null; deckId: string; onAgain: () => void; onMode: (m: Mode) => void; onChests: () => void }) {
  const { t } = useTranslation();
  const mode = summary.mode ?? 'practice';
  const stars = summary.stars ?? (summary.accuracy >= 0.9 ? 3 : summary.accuracy >= 0.7 ? 2 : summary.accuracy >= 0.4 ? 1 : 0);
  const won = mode === 'boss' ? summary.endedReason === 'boss_defeated' : mode === 'speed' ? true : summary.endedReason !== 'out_of_hearts';
  useConfetti(won && (stars >= 2 || !!summary.newBest || mode === 'boss'));
  const starsRef = useRef<HTMLDivElement>(null);
  const xp = useCountUp(summary.xp, 900);
  const points = useCountUp(summary.points ?? 0, 900);

  useEffect(() => {
    play(won ? 'win' : 'lose');
    const timers = Array.from({ length: stars }, (_, i) =>
      setTimeout(() => {
        play('star', i * 3);
        burst(starsRef.current?.children[i], { count: 12, colors: ['#facc15', '#fde68a', '#ffffff'], spread: 70 });
      }, 450 + i * 380),
    );
    return () => timers.forEach(clearTimeout);
  }, [stars, won]);

  const title =
    mode === 'boss'
      ? summary.endedReason === 'boss_defeated'
        ? t('play.end.bossWon')
        : summary.endedReason === 'boss_escaped'
          ? t('play.end.bossEscaped')
          : t('play.end.bossLost')
      : mode === 'speed'
        ? summary.newBest
          ? t('play.end.newBest')
          : t('play.end.timeUp')
        : summary.endedReason === 'out_of_hearts'
          ? t('quiz.outOfHearts')
          : stars >= 3
            ? t('play.end.perfect')
            : t('play.end.done');
  const missed = summary.missed ?? [];

  return (
    <div className="arena relative" data-mode={mode} data-theme="dark">
      <div className="arena-stars" aria-hidden />
      {/* Always a way out, at the top, like closing a game. */}
      <Link
        to={`/decks/${deckId}`}
        aria-label={t('play.end.close')}
        className="fixed top-[max(env(safe-area-inset-top),0.75rem)] right-3 z-30 grid size-11 place-items-center rounded-full bg-white/15 text-2xl font-black text-white ring-1 ring-white/25 backdrop-blur"
        data-testid="round-close"
      >
        ✕
      </Link>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center px-4 pt-8 pb-10 text-center lg:max-w-2xl">
        <div className="pop-in">
          <Lumo size={110} mood={won ? 'cheer' : 'sad'} glow={1} />
        </div>
        <h1 className="mt-2 text-3xl font-black">{title}</h1>
        {summary.endedReason === 'out_of_hearts' && <p className="mt-1 max-w-sm text-sm font-bold text-white/80">{t('quiz.outOfHeartsBody')}</p>}
        {mode === 'speed' && (
          <p className="font-display text-gold mt-1 text-6xl font-black tabular-nums" aria-label={t('play.points', { n: summary.points ?? 0 })}>
            {points}
            <span className="ml-2 text-lg text-white/70">{t('play.pts')}</span>
          </p>
        )}
        {mode === 'speed' && summary.best !== undefined && <p className="text-sm font-bold text-white/80">{t('play.bestScore', { n: summary.best })}</p>}

        {mode !== 'speed' && (
          <div ref={starsRef} className="mt-4 flex items-end gap-2" role="img" aria-label={t('play.starsLabel', { count: stars })}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`${i < stars ? 'star-pop' : 'opacity-25 grayscale'} ${i === 1 ? 'text-7xl' : 'text-5xl'}`} style={{ ['--d' as string]: `${0.45 + i * 0.38}s` }}>
                ⭐
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 grid w-full grid-cols-3 gap-3">
          <Stat label={t('quiz.accuracy')} value={`${Math.round(summary.accuracy * 100)}%`} delay={500} />
          <Stat label="XP" value={`+${xp}`} count={false} />
          <Stat label={t('quiz.bestCombo')} value={`×${summary.bestCombo}`} delay={900} />
        </div>
        <div className="mt-3 flex w-full flex-wrap justify-center gap-2 text-sm font-black">
          {summary.coins > 0 && (
            <Chip>
              <CoinIcon size={18} /> +{summary.coins}
            </Chip>
          )}
          {summary.streak.extended && (
            <Chip>
              <FlameIcon size={18} /> {t('quiz.streakDays', { count: summary.streak.days })}
            </Chip>
          )}
          {!!summary.petCoins && (
            <Chip>
              🐾 {t('play.end.petCoins', { n: summary.petCoins })}
            </Chip>
          )}
          {summary.heartsGained > 0 && (
            <Chip>
              <HeartIcon size={18} className="text-heart" /> +{summary.heartsGained}
            </Chip>
          )}
        </div>
        {rewards && (rewards.levelUp || rewards.chest || rewards.badges.length > 0 || rewards.questsCompleted.length > 0) && (
          <div className="mt-3 flex w-full flex-wrap justify-center gap-2 text-sm font-black">
            {rewards.levelUp && (
              <span className="pop-in flex items-center gap-1.5 rounded-full royal px-3 py-1 text-white">
                🚀 {t('rewards.levelUp', { level: rewards.levelUp.level })} +{rewards.levelUp.coins} 🪙
              </span>
            )}
            {rewards.chest && (
              <Link to="/shop?tab=mine" className="pop-in flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1 text-night">
                <ChestArt kind={rewards.chest as 'common' | 'rare' | 'epic'} size={30} /> {t('rewards.chest', { chest: t(`chests.${rewards.chest}`) })}
              </Link>
            )}
            {rewards.badges.map((b) => (
              <Link key={b} to="/me" className="pop-in flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ring-1 ring-amber-300/60">
                {BADGES.find((x) => x.id === b)?.emoji ?? '🏅'} {t(`badges.${b}.name`)}
              </Link>
            ))}
            {rewards.questsCompleted.length > 0 && (
              <Link to="/" className="pop-in flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 ring-1 ring-white/25">
                📜 {t('rewards.quest', { count: rewards.questsCompleted.length })}
              </Link>
            )}
          </div>
        )}

        <div className="mt-6 grid w-full gap-3">
          {(summary.chestsLeft ?? 0) > 0 && (
            <button type="button" onClick={onChests} className="rounded-2xl bg-[#f7f1e3] py-4 text-lg font-black text-night ring-2 ring-[#e8c468]">
              <ChestArt kind="common" size={30} /> {t('play.openChests', { count: summary.chestsLeft })}
            </button>
          )}
          <button type="button" onClick={onAgain} className="btn-gold rounded-2xl py-4 text-lg font-black">
            {mode === 'boss' && !won ? `⚔️ ${t('play.end.rematch')}` : `▶ ${t('play.end.again')}`}
          </button>
          <div className="grid grid-cols-2 gap-3">
            {missed.length > 0 ? (
              <button type="button" onClick={() => onMode('wrong_only')} className="rounded-2xl bg-white/15 py-3 font-black ring-1 ring-white/25">
                🎯 {t('play.end.fix', { count: missed.length })}
              </button>
            ) : (
              <button type="button" onClick={() => onMode(mode === 'boss' ? 'practice' : 'boss')} className="rounded-2xl bg-white/15 py-3 font-black ring-1 ring-white/25">
                {mode === 'boss' ? `✨ ${t('play.modes.learn')}` : `🐉 ${t('play.modes.boss')}`}
              </button>
            )}
            <button type="button" onClick={() => onMode(mode === 'speed' ? 'practice' : 'speed')} className="rounded-2xl bg-white/15 py-3 font-black ring-1 ring-white/25">
              {mode === 'speed' ? `✨ ${t('play.modes.learn')}` : `⚡ ${t('play.modes.speed')}`}
            </button>
          </div>
          <Link to={`/decks/${deckId}`} className="rounded-2xl bg-white py-3.5 text-lg font-black text-night shadow-lg">
            ✓ {t('play.end.finish')}
          </Link>
        </div>

        {missed.length > 0 && (
          <section className="mt-6 w-full text-left">
            <h2 className="mb-2 font-black">📌 {t('play.end.review')}</h2>
            <ul className="space-y-2">
              {missed.map((m, i) => (
                <li key={i} className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15">
                  {m.context && <p className="mb-1 line-clamp-2 text-xs text-white/70 italic">{m.context}</p>}
                  <p className="font-bold">{m.prompt}</p>
                  <p className="mt-1 text-sm">
                    <span className="font-black text-green-300">✓ {m.answer}</span>
                  </p>
                  {m.note && <p className="mt-1 text-sm text-rose-200">✗ {m.note}</p>}
                  <p className="mt-1 text-sm text-white/80">💡 {m.explanation}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {summary.concepts.length > 0 && (
          <section className="mt-6 w-full rounded-3xl bg-white/10 p-4 text-left ring-1 ring-white/15">
            <h2 className="mb-2 font-black">{t('quiz.conceptsPracticed')}</h2>
            <ul className="space-y-2">
              {summary.concepts.map((c) => (
                <li key={c.id}>
                  <div className="flex justify-between gap-2 text-sm font-bold">
                    <span className="min-w-0 truncate">{c.term}</span>
                    <span className="shrink-0 text-white/70">{t(`mastery.${c.band}`)}</span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/15">
                    <div className={`h-full rounded-full ${c.score >= 1 ? 'bg-amber-300' : c.score >= 0.5 ? 'bg-indigo-300' : 'bg-indigo-500'}`} style={{ width: `${Math.max(4, c.score * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 flex items-center gap-6 font-black text-white/80">
          <Link to={`/decks/${deckId}`}>{t('quiz.backToDeck')}</Link>
          <Link to="/">
            <span aria-hidden>🏠 </span>
            {t('nav.home')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function useCountUp(target: number, ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

/** The number in a stat counts up from zero when the results appear. */
function useCountUpText(value: string, delayMs: number, on: boolean) {
  const m = /^([^0-9-]*)(-?\d+)(.*)$/.exec(value);
  const target = m ? Number(m[2]) : 0;
  const [n, setN] = useState(() => (m && on && !reduced() ? 0 : target));
  useEffect(() => {
    if (!m || !on || reduced()) return setN(target);
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 900));
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return m ? `${m[1]}${n}${m[3]}` : value;
}

function Stat({ label, value, delay = 0, count = true }: { label: string; value: string; delay?: number; count?: boolean }) {
  const shown = useCountUpText(value, delay, count);
  return (
    <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-[#e8c468]/35">
      <p className="font-display text-2xl font-black tabular-nums" aria-label={value}>
        {shown}
      </p>
      <p className="text-xs font-bold text-white/75">{label}</p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/20">{children}</span>;
}
