import { useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { nav, site } from '../content/site';
import { sortedCreatures } from '../content/creatures';
import { useCart } from '../lib/cart';
import { lockScroll } from '../lib/scroll';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useEffect } from 'react';
import { Wordmark } from './Wordmark';
import styles from './MobileMenu.module.css';

const ORBS = ['brume', 'praline', 'comete', 'abricot', 'pistache'];

/**
 * Mobile navigation as its own small night sky: large serif links with
 * catalogue indices, a coloured orb per entry, actions within thumb reach.
 */
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { count, setOpen } = useCart();
  useFocusTrap(ref, open, onClose);

  useEffect(() => {
    lockScroll(open);
    return () => lockScroll(false);
  }, [open]);

  const colours = ORBS.map((s) => sortedCreatures.find((c) => c.slug === s)!.fur);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          id="mobile-menu"
          className={`${styles.menu} night`}
          data-tone="night"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          initial={reduced ? { opacity: 0 } : { clipPath: 'circle(0% at calc(100% - 44px) 38px)' }}
          animate={reduced ? { opacity: 1 } : { clipPath: 'circle(150% at calc(100% - 44px) 38px)' }}
          exit={reduced ? { opacity: 0 } : { clipPath: 'circle(0% at calc(100% - 44px) 38px)' }}
          transition={{ duration: reduced ? 0.2 : 0.7, ease: [0.65, 0, 0.35, 1] }}
        >
          <div className={styles.stars} aria-hidden="true" />
          <div className={styles.top}>
            <Link to="/" className={styles.brand} onClick={onClose} aria-label="Minitaure, accueil">
              <Wordmark />
            </Link>
            <button type="button" className={styles.close} onClick={onClose} data-autofocus>
              <span className="visually-hidden">Fermer le menu</span>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav aria-label="Navigation principale" className={styles.nav}>
            <ol>
              {nav.map((item, i) => (
                <motion.li
                  key={item.to}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduced ? 0 : 0.18 + i * 0.06, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                >
                  <NavLink to={item.to} end={item.to === '/'} className={styles.link} onClick={onClose}>
                    <span className={styles.index}>0{i + 1}</span>
                    <span className={styles.label}>{item.label}</span>
                    <span
                      className={styles.orb}
                      aria-hidden="true"
                      style={{ background: `radial-gradient(circle at 35% 30%, ${colours[i].base}, ${colours[i].tip})` }}
                    />
                  </NavLink>
                </motion.li>
              ))}
            </ol>
          </nav>

          <motion.div
            className={styles.bottom}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.5, duration: 0.6 }}
          >
            <button
              type="button"
              className={styles.cart}
              onClick={() => {
                onClose();
                setOpen(true);
              }}
            >
              Panier <span className={styles.count}>{count}</span>
            </button>
            <ul className={styles.social}>
              {site.social.map((s) => (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noreferrer">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
