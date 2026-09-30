import { lazy, Suspense, useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CartProvider, useCart } from './lib/cart';
import { scrollToTop, startSmoothScroll } from './lib/scroll';
import { useQuality } from './hooks/useQuality';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { SvgDefs } from './components/SvgDefs';
import Home from './pages/Home';

const Shop = lazy(() => import('./pages/Shop'));
const Creatures = lazy(() => import('./pages/Creatures'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Lab = import.meta.env.DEV ? lazy(() => import('./pages/dev/Lab')) : null;
const Render = import.meta.env.DEV ? lazy(() => import('./pages/dev/Render')) : null;
const ThumbCanvas = lazy(() => import('./three/ThumbCanvas'));

const EASE = [0.22, 1, 0.36, 1] as const;

export default function App() {
  const location = useLocation();
  if (import.meta.env.DEV && location.pathname.startsWith('/_')) {
    return (
      <Suspense fallback={null}>
        <Routes>
          {Lab && <Route path="/_lab" element={<Lab />} />}
          {Render && <Route path="/_render" element={<Render />} />}
        </Routes>
      </Suspense>
    );
  }
  return (
    <CartProvider>
      <Site />
    </CartProvider>
  );
}

function Site() {
  const location = useLocation();
  const reduced = useReducedMotion();
  const q = useQuality();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);
  // Only the first path segment defines a "page": /creatures → /creatures/brume
  // opens the sheet over the gallery without a page transition.
  const pageKey = '/' + (location.pathname.split('/')[1] ?? '');

  useEffect(() => {
    startSmoothScroll();
  }, []);

  // Move focus to the new page for keyboard and screen-reader users.
  const onEntered = () => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <SvgDefs />
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <Nav />
      <AnimatePresence mode="wait" onExitComplete={scrollToTop}>
        <motion.main
          key={pageKey}
          id="main"
          ref={mainRef}
          tabIndex={-1}
          style={{ outline: 'none' }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0.25 : 0.7, ease: EASE } }}
          exit={{ opacity: 0, y: reduced ? 0 : -8, transition: { duration: reduced ? 0.15 : 0.35, ease: [0.4, 0, 1, 1] } }}
          onAnimationComplete={(def) => {
            if (typeof def === 'object' && def && 'opacity' in def && (def as { opacity: number }).opacity === 1) onEntered();
          }}
        >
          <Suspense fallback={<div style={{ minHeight: '100svh' }} />}>
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/boutique" element={<Shop />} />
              <Route path="/creatures/:slug?" element={<Creatures />} />
              <Route path="/a-propos" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </motion.main>
      </AnimatePresence>
      <Footer />
      <CartDrawer />
      <CartAnnouncer />
      {q.tier === 'high' && (
        <Suspense fallback={null}>
          <ThumbCanvas />
        </Suspense>
      )}
    </>
  );
}

/** Polite live region announcing cart additions. */
function CartAnnouncer() {
  const { pulse, lastAdded } = useCart();
  return (
    <p className="visually-hidden" role="status" aria-live="polite">
      {pulse > 0 && lastAdded ? `${lastAdded} a été ajouté au panier.` : ''}
    </p>
  );
}
