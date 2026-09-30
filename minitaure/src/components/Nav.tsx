import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { nav } from '../content/site';
import { useCart } from '../lib/cart';
import { LogoMark, Wordmark } from './Wordmark';
import { MobileMenu } from './MobileMenu';
import styles from './Nav.module.css';

/**
 * Sticky navigation. Floats into a blurred pill once the page scrolls, and
 * switches to light ink whenever it sits over a night section.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [overNight, setOverNight] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 24);
      const h = headerRef.current;
      if (!h) return;
      const r = h.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const hits = document.elementsFromPoint(window.innerWidth / 2, y);
      const under = hits.find((el) => !h.contains(el));
      setOverNight(!!under?.closest('[data-tone="night"]'));
    };
    let settle = 0;
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
      // Re-check once scrolling settles (smooth scroll can end between frames).
      window.clearTimeout(settle);
      settle = window.setTimeout(update, 160);
    };
    update();
    const t = window.setTimeout(update, 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.clearTimeout(t);
      window.clearTimeout(settle);
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return (
    <>
      <header
        ref={headerRef}
        className={styles.header}
        data-scrolled={scrolled || undefined}
        data-night={(overNight && !menuOpen) || undefined}
      >
        <div className={styles.bar}>
          <Link to="/" className={styles.brand} aria-label="Minitaure, accueil">
            <LogoMark size={30} />
            <Wordmark className={styles.word} />
          </Link>

          <nav aria-label="Navigation principale" className={styles.links}>
            <ul>
              {nav.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === '/'} className={styles.link}>
                    {({ isActive }) => (
                      <>
                        {item.label}
                        {isActive && (
                          <motion.span layoutId="nav-dot" className={styles.dot} transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.actions}>
            <CartButton />
            <button
              type="button"
              className={styles.menuBtn}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="visually-hidden">{menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}</span>
              <span className={styles.burger} data-open={menuOpen || undefined} aria-hidden="true">
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>
      </header>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

function CartButton() {
  const { count, setOpen, pulse } = useCart();
  const reduced = useReducedMotion();
  return (
    <button type="button" className={styles.cart} onClick={() => setOpen(true)}>
      <span className="visually-hidden">Panier, {count} article{count > 1 ? 's' : ''}</span>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5.5 8.5h13l-1.1 10.1a2 2 0 0 1-2 1.9H8.6a2 2 0 0 1-2-1.9L5.5 8.5Z" />
        <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
      </svg>
      <AnimatePresence initial={false}>
        {count > 0 && (
          <motion.span
            key={reduced ? 'badge' : `badge-${pulse}`}
            className={styles.badge}
            aria-hidden="true"
            initial={reduced ? { opacity: 0 } : { scale: 0.4, y: -6 }}
            animate={reduced ? { opacity: 1 } : { scale: [1.35, 1], y: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
