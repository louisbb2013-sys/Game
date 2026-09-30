import { lazy, Suspense, useState, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import type { Creature } from '../content/types';
import { useQuality } from '../hooks/useQuality';
import { CreatureOrb } from './CreatureOrb';
import styles from './CreaturePlate.module.css';

const LiveThumb = lazy(() => import('../three/LiveThumb'));

interface Props {
  creatures: Creature[];
  hovered?: boolean;
  tint?: string;
  /** Shared-element id (creature sheet transition). */
  layoutId?: string;
  alt?: string;
  className?: string;
  priority?: boolean;
  /** Allow a live 3D thumbnail when the device can afford it. */
  live?: boolean;
}

/**
 * The visual half of a card: a tinted plate with a soft pedestal and the
 * creature standing on it. Shows the still first, then (desktop-class
 * devices only) swaps seamlessly to a live 3D thumbnail.
 */
export function CreaturePlate({ creatures, hovered = false, tint, layoutId, alt, className, priority, live = true }: Props) {
  const q = useQuality();
  const [isLive, setIsLive] = useState(false);
  const canLive = live && q.tier === 'high';
  const trio = creatures.length > 1;

  return (
    <div className={[styles.plate, className].filter(Boolean).join(' ')} style={{ '--tint': tint } as CSSProperties} data-hovered={hovered || undefined}>
      <span className={styles.halo} aria-hidden="true" />
      <motion.div layoutId={layoutId} className={styles.stage} data-live={isLive || undefined} transition={{ type: 'spring', stiffness: 170, damping: 26 }}>
        {trio ? (
          <div className={styles.trio} role="img" aria-label={alt ?? creatures.map((c) => c.name).join(', ')}>
            {creatures.map((c, i) => (
              <CreatureOrb key={c.slug} creature={c} alt="" className={styles[`t${i}`]} shadow={false} />
            ))}
          </div>
        ) : (
          <CreatureOrb creature={creatures[0]} alt={alt} priority={priority} />
        )}
      </motion.div>
      {canLive && (
        <Suspense fallback={null}>
          <LiveThumb creatures={creatures} hovered={hovered} className={styles.view} onLive={() => setIsLive(true)} />
        </Suspense>
      )}
    </div>
  );
}
