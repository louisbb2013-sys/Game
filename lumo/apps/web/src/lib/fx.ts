/**
 * Game feel for the play screen: particle bursts, floating "+12" numbers, a quick screen flash and
 * phone vibration. All DOM-only (no canvas), short-lived, and skipped when motion is reduced.
 */

export const reduced = () =>
  document.documentElement.dataset.reduceMotion === 'true' ||
  (document.documentElement.dataset.reduceMotion !== 'false' && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

let hapticsOn = true;
export function setHaptics(on: boolean) {
  hapticsOn = on;
}

/** A short buzz on phones that support it (Android); silently nothing elsewhere. */
export function haptic(pattern: number | number[]) {
  if (!hapticsOn) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not allowed here */
  }
}

function centerOf(el: Element | null | undefined): { x: number; y: number } {
  if (!el) return { x: innerWidth / 2, y: innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Sparks flying out from an element (a right answer, a hit on the boss). */
export function burst(from: Element | null | undefined, opts: { count?: number; colors?: string[]; spread?: number } = {}) {
  if (reduced()) return;
  const { x, y } = centerOf(from);
  const colors = opts.colors ?? ['#facc15', '#4ade80', '#38bdf8', '#f472b6', '#ffffff'];
  const n = opts.count ?? 18;
  const spread = opts.spread ?? 120;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = 'fx-spark';
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const dist = spread * (0.45 + Math.random() * 0.75);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = colors[i % colors.length]!;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 30}px`);
    p.style.setProperty('--s', `${0.6 + Math.random() * 0.9}`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

/** A number or word that floats up and fades ("+12 XP", "-1 🛡️", "CRIT!"). */
export function floatText(text: string, from: Element | null | undefined, opts: { color?: string; size?: number; dy?: number } = {}) {
  const { x, y } = centerOf(from);
  const el = document.createElement('span');
  el.className = 'fx-float';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (opts.color) el.style.color = opts.color;
  if (opts.size) el.style.fontSize = `${opts.size}px`;
  el.style.setProperty('--dy', `${opts.dy ?? -70}px`);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), reduced() ? 600 : 1100);
}

/** The whole screen glows green or red for a moment. */
export function flash(kind: 'good' | 'bad' | 'gold') {
  if (reduced()) return;
  const el = document.createElement('div');
  el.className = `fx-flash fx-flash-${kind}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 500);
}

/** Shake an element (a wrong tile, the boss when hit). */
export function shake(el: Element | null | undefined, cls = 'shake') {
  if (!el || reduced()) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth; // restart the animation
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 550);
}
