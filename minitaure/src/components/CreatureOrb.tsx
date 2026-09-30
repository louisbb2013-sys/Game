import type { CSSProperties } from 'react';
import type { Creature } from '../content/types';
import { stillFor } from '../content/stills';
import styles from './CreatureOrb.module.css';

interface Props {
  creature: Creature;
  /** Accessible description. Pass '' when the name is already announced nearby. */
  alt?: string;
  className?: string;
  priority?: boolean;
  shadow?: boolean;
  style?: CSSProperties;
}

/**
 * Static creature: the pre-rendered still (made from the real fur shader by
 * `npm run stills`) or, when none exists yet, a CSS fur ball built from the
 * creature's colours. Never a face — only colour, fur and shape.
 */
export function CreatureOrb({ creature, alt, className, priority, shadow = true, style }: Props) {
  const src = stillFor(creature.slug);
  const label = alt ?? `${creature.name}, créature ${describe(creature)}`;
  return (
    <div className={[styles.orb, className].filter(Boolean).join(' ')} style={style}>
      {shadow && <span className={styles.shadow} aria-hidden="true" />}
      {src ? (
        <img
          className={styles.img}
          src={src}
          alt={label}
          width={640}
          height={640}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...(priority ? { fetchPriority: 'high' as const } : {})}
          draggable={false}
        />
      ) : (
        <FurBall creature={creature} label={label} />
      )}
    </div>
  );
}

export function FurBall({ creature, label }: { creature: Creature; label: string }) {
  const { base, tip } = creature.fur;
  const squash = creature.shape?.squash ?? 0.95;
  return (
    <span
      role="img"
      aria-label={label}
      className={styles.furball}
      style={
        {
          '--base': base,
          '--tip': tip,
          '--detail': creature.detail.color ?? tip,
          '--squash': squash,
        } as CSSProperties
      }
      data-detail={creature.detail.kind}
    />
  );
}

const DETAIL_WORDS: Record<string, string> = {
  plain: 'au pelage uni',
  tuft: 'à la petite mèche',
  crown: 'à la couronne de mèches',
  spots: 'tachetée',
  stripes: 'rayée',
  band: 'à la bande claire',
  sheen: 'à la bande argentée',
  speckle: 'mouchetée',
  fringe: 'à la frange',
};

export function describe(c: Creature) {
  return `ronde à fourrure douce, ${DETAIL_WORDS[c.detail.kind] ?? ''}`.trim();
}
