import { useCallback, useEffect, useState } from 'react';
import { play } from '../../lib/sound';

/** A short pop-up over the game: a chapter done, halfway there, someone on fire… (never in a speed run or a mock exam). */
export interface Pop {
  key: string;
  icon: string;
  title: string;
  body?: string;
  tone: 'gold' | 'good' | 'royal';
}

/** A queue of pop-ups shown one at a time, each for 2.6 s. */
export function usePops() {
  const [pops, setPops] = useState<Pop[]>([]);
  const push = useCallback((p: Omit<Pop, 'key'>) => setPops((x) => [...x, { ...p, key: `${Date.now()}-${x.length}-${Math.random()}` }].slice(-4)), []);
  useEffect(() => {
    if (!pops.length) return;
    const id = setTimeout(() => setPops((x) => x.slice(1)), 2600);
    return () => clearTimeout(id);
  }, [pops]);
  return { pop: pops[0] ?? null, push };
}

/** One pop-up: it drops in, then floats away by itself (never blocks a tap). */
export function PopUp({ pop }: { pop: Pop }) {
  useEffect(() => play(pop.tone === 'royal' ? 'whoosh' : 'star'), [pop.key, pop.tone]);
  const tone = pop.tone === 'gold' ? 'bg-gradient-to-r from-amber-300 to-yellow-200 text-night' : pop.tone === 'good' ? 'bg-gradient-to-r from-emerald-400 to-lime-300 text-night' : 'royal text-white';
  return (
    // At the very top, over the progress bar (banners like "Lightning!" and combos sit lower); taps go through.
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center px-4 pt-[env(safe-area-inset-top)]" role="status" aria-live="polite" data-testid="pop-up">
      <div className={`pop-drop flex max-w-sm items-center gap-3 rounded-3xl px-4 py-3 shadow-2xl ring-2 ring-white/40 ${tone}`}>
        <span className="pop-icon text-4xl" aria-hidden>
          {pop.icon}
        </span>
        <span className="min-w-0">
          <span className="block text-lg leading-tight font-black">{pop.title}</span>
          {pop.body && <span className="block text-sm font-bold opacity-85">{pop.body}</span>}
        </span>
      </div>
    </div>
  );
}
