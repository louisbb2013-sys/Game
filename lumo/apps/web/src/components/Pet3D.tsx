import type { Rarity } from '@lumo/core';
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import type { Handle } from '../three/stage';

/**
 * A 3D furry pet (or egg) drawn on Revio's shared 3D stage, with a 2D fallback underneath for
 * phones without WebGL2, reduced data, or while it loads. The 3D engine loads only when used.
 */
type Props = { className?: string; children?: ReactNode; label?: string };

function use3D(spec: Parameters<typeof import('../three/stage').mount>[1] | null, deps: unknown[]) {
  const el = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  useEffect(() => {
    let alive = true;
    if (!spec || !el.current) return;
    void import('../three/stage').then(({ mount }) => {
      if (!alive || !el.current) return;
      handle.current = mount(el.current, spec);
    });
    return () => {
      alive = false;
      handle.current?.dispose();
      handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { el, handle };
}

export const Creature3D = forwardRef<Handle | null, Props & { species: string; rarity: Rarity; mood?: 'happy' | 'angry' }>(function Creature3D({ species, rarity, mood, className = '', children, label }, ref) {
  const { el, handle } = use3D({ kind: 'creature', species, rarity, mood }, [species, rarity, mood]);
  useImperativeHandle(ref, () => proxy(handle), [handle]);
  return (
    <div ref={el} className={`c3d ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div className="c3d-fallback">{children}</div>
    </div>
  );
});

export const Egg3D = forwardRef<Handle | null, Props & { rarity: Rarity; progress: number }>(function Egg3D({ rarity, progress, className = '', children, label }, ref) {
  const { el, handle } = use3D({ kind: 'egg', rarity, progress }, [rarity]);
  useEffect(() => handle.current?.setProgress(progress), [progress, handle]);
  useImperativeHandle(ref, () => proxy(handle), [handle]);
  return (
    <div ref={el} className={`c3d ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div className="c3d-fallback">{children}</div>
    </div>
  );
});

/** A stable handle whose calls reach the 3D view once it exists (and do nothing without 3D). */
function proxy(h: { current: Handle | null }): Handle {
  return {
    jump: (f) => h.current?.jump(f),
    burst: (n) => h.current?.burst(n),
    crack: () => h.current?.crack(),
    setProgress: (p) => h.current?.setProgress(p),
    dispose: () => h.current?.dispose(),
  };
}
