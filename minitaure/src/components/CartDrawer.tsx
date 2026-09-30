import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCart } from '../lib/cart';
import { startCheckout } from '../lib/checkout';
import { lockScroll } from '../lib/scroll';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { formatPrice } from '../content/products';
import { creatureBySlug } from '../content/creatures';
import { CreatureOrb } from './CreatureOrb';
import { Button } from './Button';
import styles from './CartDrawer.module.css';

export function CartDrawer() {
  const { open, setOpen, lines, totalCents, setQty, remove, count } = useCart();
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const sheet = useMediaQuery('(max-width: 560px)');
  const hidden = sheet ? { y: '104%' } : { x: '104%' };
  const [status, setStatus] = useState<{ busy: boolean; message?: string }>({ busy: false });
  const close = () => setOpen(false);
  useFocusTrap(ref, open, close);

  useEffect(() => {
    lockScroll(open);
    if (!open) setStatus({ busy: false });
  }, [open]);

  const checkout = async () => {
    setStatus({ busy: true });
    const res = await startCheckout(lines.map(({ slug, qty }) => ({ slug, qty })));
    setStatus({ busy: false, message: res.message });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className={styles.root}>
          <motion.div
            className={styles.backdrop}
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          />
          <motion.div
            ref={ref}
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            initial={reduced ? { opacity: 0 } : hidden}
            animate={reduced ? { opacity: 1 } : { x: 0, y: 0 }}
            exit={reduced ? { opacity: 0 } : { ...hidden, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
            transition={{ type: 'spring', stiffness: 260, damping: 34 }}
          >
            <div className={styles.head}>
              <h2 id="cart-title" className={styles.title}>
                Votre panier <span className={styles.count}>{count}</span>
              </h2>
              <button type="button" className={styles.close} onClick={close} data-autofocus>
                <span className="visually-hidden">Fermer le panier</span>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {lines.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>Rien ici pour l’instant.</p>
                <p>Les créatures attendent patiemment dans la boutique.</p>
                <Link to="/boutique" className={styles.emptyLink} onClick={close}>
                  Voir la boutique
                </Link>
              </div>
            ) : (
              <>
                <ul className={styles.lines}>
                  <AnimatePresence initial={false}>
                    {lines.map((l) => {
                      const c = creatureBySlug(l.product.creatures[0]);
                      return (
                        <motion.li
                          key={l.slug}
                          layout={!reduced}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className={styles.line}
                        >
                          <div className={styles.thumb}>{c && <CreatureOrb creature={c} alt="" shadow={false} />}</div>
                          <div className={styles.info}>
                            <p className={styles.name}>{l.product.name}</p>
                            <p className={styles.price}>{formatPrice(l.product.priceCents)}</p>
                            <div className={styles.qty} role="group" aria-label={`Quantité pour ${l.product.name}`}>
                              <button type="button" onClick={() => setQty(l.slug, l.qty - 1)} aria-label="Retirer un">
                                −
                              </button>
                              <output aria-live="polite">{l.qty}</output>
                              <button type="button" onClick={() => setQty(l.slug, l.qty + 1)} aria-label="Ajouter un" disabled={l.qty >= 9}>
                                +
                              </button>
                            </div>
                          </div>
                          <button type="button" className={styles.remove} onClick={() => remove(l.slug)}>
                            Retirer<span className="visually-hidden"> {l.product.name}</span>
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
                <div className={styles.foot}>
                  <div className={styles.total}>
                    <span>Total</span>
                    <strong>{formatPrice(totalCents)}</strong>
                  </div>
                  <p className={styles.note}>Livraison offerte dès deux créatures. Emballage en papier de soie.</p>
                  <Button variant="primary" size="lg" className={styles.checkout} onClick={checkout} disabled={status.busy}>
                    {status.busy ? 'Un instant…' : 'Passer commande'}
                  </Button>
                  <p className={styles.status} role="status" aria-live="polite">
                    {status.message}
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
