import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Creature } from '../content/types';
import { collectionBySlug } from '../content/collections';
import { formatNumber } from '../content/creatures';
import { CreaturePlate } from './CreaturePlate';
import styles from './CreatureCard.module.css';

interface Props {
  creature: Creature;
  /** Enables the shared-element transition into the creature sheet. */
  shared?: boolean;
  priority?: boolean;
  headingLevel?: 'h2' | 'h3';
}

/** Specimen card: plate, catalogue number, name, collection. */
export function CreatureCard({ creature, shared = false, priority, headingLevel = 'h3' }: Props) {
  const [hovered, setHovered] = useState(false);
  const col = collectionBySlug(creature.collection);
  const H = headingLevel;
  return (
    <article
      className={styles.card}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <Link to={`/creatures/${creature.slug}`} className={styles.link} preventScrollReset aria-label={`${creature.name}, ${formatNumber(creature.number)}, collection ${col?.name}. Ouvrir la fiche`}>
        <CreaturePlate
          creatures={[creature]}
          hovered={hovered}
          tint={col?.tint}
          layoutId={shared ? `orb-${creature.slug}` : undefined}
          alt=""
          priority={priority}
        />
        <div className={styles.meta}>
          <span className={`${styles.num} num`}>{formatNumber(creature.number)}</span>
          <H className={styles.name}>{creature.name}</H>
          <span className={styles.col}>
            <span className={styles.dot} style={{ background: col?.accent }} aria-hidden="true" />
            {col?.name}
          </span>
        </div>
        {creature.isNew && <span className={styles.new}>Nouveau</span>}
      </Link>
    </article>
  );
}
