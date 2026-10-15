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
  // Jewel tones: deep and rich, with a soft gold light from the top corner.
  return `radial-gradient(120% 90% at 90% -10%, rgb(232 196 104 / 0.28), transparent 55%), linear-gradient(140deg, hsl(${h} 62% 34%), hsl(${(h + 40) % 360} 70% 18%))`;
}
