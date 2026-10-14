// The study egg (website): fills as you answer questions, then hatches into a pet.
import { Egg3D } from './Pet3D';

export interface EggState {
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  progress: number;
  target: number;
  emoji: string;
}

/** The study egg: a ring fills as you answer questions; at 100% it hatches into a pet. */
export function EggRing({ egg, size = 64, three = false }: { egg: Pick<EggState, 'progress' | 'target' | 'emoji'> & { rarity?: EggState['rarity'] }; size?: number; three?: boolean }) {
  const pct = Math.min(1, egg.progress / Math.max(1, egg.target));
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-amber-glow)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 600ms ease' }} />
      </svg>
      {three ? (
        <Egg3D rarity={egg.rarity ?? 'common'} progress={pct} className="absolute inset-1.5">
          <span className={pct >= 0.8 ? 'egg-wobble' : ''} style={{ fontSize: size * 0.48 }}>
            {egg.emoji}
          </span>
        </Egg3D>
      ) : (
        <span className={pct >= 0.8 ? 'egg-wobble' : ''} style={{ fontSize: size * 0.48 }}>
          {egg.emoji}
        </span>
      )}
    </span>
  );
}
