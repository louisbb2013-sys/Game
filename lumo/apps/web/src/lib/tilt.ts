import type { PointerEvent } from 'react';

/** Pointer handlers that tilt a `.holo` card toward the finger or cursor and move its shine. */
export const tilt = {
  onPointerMove(e: PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`);
    el.style.setProperty('--rx', `${(0.5 - y) * 12}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.style.setProperty('--hx', `${x * 100}%`);
  },
  onPointerLeave(e: PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    for (const k of ['--rx', '--ry', '--mx', '--my', '--hx']) el.style.removeProperty(k);
  },
};

/** A bright, stable colour pair for a deck (from its title), for its holographic card. */
export function deckColors(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 78% 46%), hsl(${(h + 48) % 360} 82% 36%))`;
}
