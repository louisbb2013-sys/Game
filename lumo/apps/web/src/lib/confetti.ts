import { useEffect } from 'react';

const COLORS = ['#F5A524', '#4F46E5', '#F472B6', '#22C55E', '#38BDF8'];

/** A short burst of confetti while `on` is true (respects reduced motion via CSS). */
export function useConfetti(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const nodes = Array.from({ length: 40 }, (_, i) => {
      const el = document.createElement('span');
      el.className = 'confetti';
      el.style.left = `${Math.random() * 100}vw`;
      el.style.background = COLORS[i % COLORS.length]!;
      el.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
      el.style.animationDelay = `${Math.random() * 0.4}s`;
      document.body.appendChild(el);
      return el;
    });
    const timer = setTimeout(() => nodes.forEach((n) => n.remove()), 4000);
    return () => {
      clearTimeout(timer);
      nodes.forEach((n) => n.remove());
    };
  }, [on]);
}
