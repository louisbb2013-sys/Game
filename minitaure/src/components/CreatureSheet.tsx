import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
import type { Creature } from '../content/types';
import { collectionBySlug } from '../content/collections';
import { formatNumber, sortedCreatures } from '../content/creatures';
import { formatPrice, productBySlug } from '../content/products';
import { useCart } from '../lib/cart';
import { lockScroll } from '../lib/scroll';
import { thumbs } from '../lib/thumbs';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useQuality } from '../hooks/useQuality';
import { CreatureOrb, describe } from './CreatureOrb';
import { Arrow, Button, ButtonLink } from './Button';
import styles from './CreatureSheet.module.css';

const SheetScene = lazy(() => import('../three/SheetScene'));

const FUR_WORDS = (c: Creature) => {
  const l = c.fur.length;
  const len = l < 0.1 ? 'rase' : l < 0.13 ? 'courte' : l < 0.16 ? 'mi-longue' : 'longue';
  const d = c.fur.density > 115 ? 'très dense' : c.fur.density > 100 ? 'dense' : 'aérienne';
  return `${len}, ${d}`;
};

/**
 * Creature detail sheet. Desktop: centred split panel. Mobile: bottom sheet
 * (drag down to close). The orb flies in from its card (shared layoutId),
 * then the live 3D creature fades in over it.
 */
export function CreatureSheet({ creature, onClose }: { creature: Creature; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const q = useQuality();
  const mobile = useMediaQuery('(max-width: 760px)');
  const { add } = useCart();
  const [ready3d, setReady3d] = useState(false);
  const [optIn3d, setOptIn3d] = useState(false);
  const [settled, setSettled] = useState(false);
  const [added, setAdded] = useState(false);
  const dragControls = useDragControls();

  const col = collectionBySlug(creature.collection);
  const product = productBySlug(creature.slug);
  const idx = sortedCreatures.findIndex((c) => c.slug === creature.slug);
  const prev = sortedCreatures[(idx - 1 + sortedCreatures.length) % sortedCreatures.length];
  const next = sortedCreatures[(idx + 1) % sortedCreatures.length];

  const show3d = q.webgl && (q.tier !== 'static' || optIn3d);

  useFocusTrap(ref, true, onClose);
  useEffect(() => {
    lockScroll(true);
    thumbs.pause(true);
    return () => {
      lockScroll(false);
      thumbs.pause(false);
    };
  }, []);

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(false), 1800);
    return () => window.clearTimeout(t);
  }, [added]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return (
    <div className={styles.root}>
      <motion.div
        className={styles.backdrop}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.35 } }}
        transition={{ duration: 0.5 }}
      />
      <motion.div
        ref={ref}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        aria-describedby="sheet-tagline"
        style={{ '--tint': col?.tint } as React.CSSProperties}
        initial={reduced ? { opacity: 0 } : mobile ? { y: '100%' } : { opacity: 0, y: 40, scale: 0.98 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : mobile ? { y: '100%' } : { opacity: 0, y: 30, scale: 0.98 }}
        transition={reduced ? { duration: 0.3 } : { type: 'spring', stiffness: 220, damping: 30 }}
        onAnimationComplete={() => setSettled(true)}
        drag={mobile && !reduced ? 'y' : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        dragListener={false}
        dragControls={dragControls}
        dragSnapToOrigin
        onDragEnd={onDragEnd}
      >
        {mobile && (
          <div className={styles.handle} aria-hidden="true" onPointerDown={(e) => !reduced && dragControls.start(e)}>
            <span />
          </div>
        )}
        <button type="button" className={styles.close} onClick={onClose}>
          <span className="visually-hidden">Fermer la fiche</span>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className={styles.stage}>
          <span className={styles.stageGlow} aria-hidden="true" />
          <motion.div
            layoutId={reduced ? undefined : `orb-${creature.slug}`}
            className={styles.orb}
            data-hidden={(show3d && ready3d) || undefined}
            transition={{ type: 'spring', stiffness: 170, damping: 26 }}
          >
            <CreatureOrb creature={creature} priority alt={`${creature.name}, créature ${describe(creature)}`} />
          </motion.div>
          {show3d && (settled || reduced) && (
            <Suspense fallback={null}>
              <SheetScene
                creature={creature}
                still={q.reducedMotion}
                className={styles.canvas}
                onReady={() => window.setTimeout(() => setReady3d(true), 250)}
              />
            </Suspense>
          )}
          <p className={styles.stageHint}>
            {show3d ? (
              'Glisser pour la faire tourner'
            ) : q.webgl ? (
              <button type="button" className={styles.opt3d} onClick={() => setOptIn3d(true)}>
                Voir en 3D
              </button>
            ) : (
              'Vue fixe'
            )}
          </p>
        </div>

        <div className={styles.info} data-lenis-prevent>
          <div className={styles.kicker}>
            <span className="num">{formatNumber(creature.number)}</span>
            <span className={styles.colChip}>
              <span className={styles.dot} style={{ background: col?.accent }} aria-hidden="true" />
              {col?.name}
            </span>
          </div>
          <h2 id="sheet-title" className={styles.name} tabIndex={-1} data-autofocus>
            {creature.name}
          </h2>
          <p id="sheet-tagline" className={styles.tagline}>
            {creature.tagline}
          </p>
          <div className={styles.story}>
            {creature.story.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <dl className={styles.specs}>
            <div>
              <dt>Taille</dt>
              <dd>{creature.size}</dd>
            </div>
            <div>
              <dt>Matière</dt>
              <dd>{creature.material}</dd>
            </div>
            <div>
              <dt>Collection</dt>
              <dd>
                {col?.name} — <span className={styles.muted}>{col?.subtitle}</span>
              </dd>
            </div>
            <div>
              <dt>Fourrure</dt>
              <dd>{FUR_WORDS(creature)}</dd>
            </div>
            <div>
              <dt>Couleurs</dt>
              <dd className={styles.swatches}>
                <span style={{ background: creature.fur.base }} title="Racine" aria-hidden="true" />
                <span style={{ background: creature.fur.tip }} title="Pointes" aria-hidden="true" />
                {creature.detail.color && <span style={{ background: creature.detail.color }} title="Détail" aria-hidden="true" />}
                <span className="visually-hidden">
                  Racine {creature.fur.base}, pointes {creature.fur.tip}
                </span>
              </dd>
            </div>
          </dl>

          <div className={styles.actions}>
            <ButtonLink to={`/boutique?collection=${creature.collection}`} variant="primary" icon={<Arrow />}>
              Voir en boutique
            </ButtonLink>
            {product && (
              <Button
                variant="ghost"
                onClick={() => {
                  add(product.slug);
                  setAdded(true);
                }}
              >
                {added ? 'Ajoutée au panier' : `Accueillir · ${formatPrice(product.priceCents)}`}
              </Button>
            )}
          </div>

          <nav className={styles.pager} aria-label="Autres créatures">
            <Link to={`/creatures/${prev.slug}`} replace className={styles.pagerLink}>
              <span aria-hidden="true">←</span> {formatNumber(prev.number)} {prev.name}
            </Link>
            <Link to={`/creatures/${next.slug}`} replace className={styles.pagerLink}>
              {formatNumber(next.number)} {next.name} <span aria-hidden="true">→</span>
            </Link>
          </nav>
        </div>
      </motion.div>
    </div>
  );
}
