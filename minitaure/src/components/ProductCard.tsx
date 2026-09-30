import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Product } from '../content/types';
import { collectionBySlug } from '../content/collections';
import { creatureBySlug, formatNumber } from '../content/creatures';
import { formatPrice } from '../content/products';
import { useCart } from '../lib/cart';
import { CreaturePlate } from './CreaturePlate';
import styles from './ProductCard.module.css';

/** Boutique card: specimen plate, index-style price, add-to-cart. */
export function ProductCard({ product, priority }: { product: Product; priority?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [added, setAdded] = useState(0);
  const { add } = useCart();
  const reduced = useReducedMotion();
  const col = collectionBySlug(product.collection);
  const creatures = product.creatures.map((s) => creatureBySlug(s)!).filter(Boolean);
  const lead = creatures[0];
  const isCoffret = product.kind === 'coffret';

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(0), 1600);
    return () => window.clearTimeout(t);
  }, [added]);

  return (
    <article
      className={styles.card}
      data-kind={product.kind}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Link
        to={isCoffret ? `/boutique?collection=${product.collection}` : `/creatures/${lead.slug}`}
        className={styles.media}
        tabIndex={-1}
        aria-hidden="true"
      >
        <CreaturePlate creatures={creatures} hovered={hovered} tint={col?.tint} alt="" priority={priority} wide={isCoffret} />
      </Link>
      <div className={styles.body}>
        <p className={styles.kicker}>
          <span className={styles.dot} style={{ background: col?.accent }} aria-hidden="true" />
          {isCoffret ? (product.edition ?? 'Coffret de trois') : `${formatNumber(lead.number)} · ${col?.name}`}
        </p>
        <h3 className={styles.name}>
          {isCoffret ? (
            product.name
          ) : (
            <Link to={`/creatures/${lead.slug}`} className={styles.nameLink}>
              {product.name}
            </Link>
          )}
        </h3>
        <p className={styles.blurb}>{product.blurb}</p>
        <div className={styles.row}>
          <span className={styles.price}>{formatPrice(product.priceCents)}</span>
          <button
            type="button"
            className={styles.add}
            data-added={added > 0 || undefined}
            onClick={() => {
              add(product.slug);
              setAdded((n) => n + 1);
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {added ? (
                <motion.span
                  key="ok"
                  className={styles.addInner}
                  initial={reduced ? { opacity: 0 } : { y: 18, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduced ? { opacity: 0 } : { y: -18, opacity: 0 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  Ajouté<span className="visually-hidden"> au panier</span>
                </motion.span>
              ) : (
                <motion.span
                  key="add"
                  className={styles.addInner}
                  initial={reduced ? { opacity: 0 } : { y: 18, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduced ? { opacity: 0 } : { y: -18, opacity: 0 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Accueillir<span className="visually-hidden"> {product.name}, ajouter au panier</span>
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </article>
  );
}
