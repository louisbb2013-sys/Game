/**
 * Global pointer position in normalised viewport coordinates (-1..1, y up).
 * Shared by every canvas so creatures can glance toward the cursor even when
 * it is outside their own canvas.
 */
export const globalPointer = { x: 0, y: 0, active: false };

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      globalPointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      globalPointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      globalPointer.active = true;
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => {
    globalPointer.active = false;
  });
}

/** Frame-rate independent exponential smoothing. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));
