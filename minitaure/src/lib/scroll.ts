import Lenis from 'lenis';

/**
 * Smooth scrolling (Lenis). Disabled entirely when the user prefers reduced
 * motion: native scrolling is never hijacked in that case. Lenis drives the
 * real window scroll, so GSAP ScrollTrigger works with native scroll events.
 */
let lenis: Lenis | null = null;

export function startSmoothScroll() {
  if (lenis || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Automated browsers (review screenshots, Lighthouse) scroll programmatically;
  // smoothing would fight those jumps, so native scrolling is kept there.
  if (navigator.webdriver) return;
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.1,
    wheelMultiplier: 0.95,
    // Touch keeps native momentum: smoother and more trustworthy on phones.
    syncTouch: false,
  });
}

export function stopSmoothScroll() {
  lenis?.destroy();
  lenis = null;
}

/** Pause/resume scrolling (e.g. while a modal is open). */
export function lockScroll(locked: boolean) {
  if (locked) {
    lenis?.stop();
    document.documentElement.style.overflow = 'hidden';
  } else {
    lenis?.start();
    document.documentElement.style.overflow = '';
  }
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo(0, 0);
}

export function scrollToEl(el: HTMLElement) {
  if (lenis) lenis.scrollTo(el, { offset: -80 });
  else el.scrollIntoView({ behavior: 'auto', block: 'start' });
}
