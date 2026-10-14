import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Tiny drag-and-drop for touch + mouse (HTML5 DnD doesn't work on phones).
 * Also supports tap-to-select then tap-a-target, which is easier for many learners
 * and works with screen readers / keyboards.
 */
interface DndValue {
  selected: string | null;
  select: (id: string | null) => void;
  drop: (itemId: string, targetId: string) => void;
  startDrag: (e: React.PointerEvent, itemId: string, label: string, onTap?: () => void) => void;
  dragging: string | null;
}

const Ctx = createContext<DndValue | null>(null);

export function DndProvider({ onDrop, children, disabled }: { onDrop: (itemId: string, targetId: string) => void; children: ReactNode; disabled?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);

  const drop = useCallback(
    (itemId: string, targetId: string) => {
      if (disabled) return;
      onDrop(itemId, targetId);
      setSelected(null);
    },
    [onDrop, disabled],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, itemId: string, label: string, onTap?: () => void) => {
      if (disabled || e.button > 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let active = false;

      type Pt = { clientX: number; clientY: number; preventDefault?: () => void };
      let last: Pt = { clientX: startX, clientY: startY };

      const move = (ev: Pt) => {
        last = { clientX: ev.clientX, clientY: ev.clientY };
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
        if (!active) {
          active = true;
          setDragging(itemId);
          const g = document.createElement('div');
          g.textContent = label;
          g.className = 'fixed z-50 pointer-events-none max-w-[70vw] rounded-xl bg-brand px-3 py-2 text-sm font-bold text-brand-ink shadow-xl';
          document.body.appendChild(g);
          ghost.current = g;
        }
        ev.preventDefault?.();
        if (ghost.current) ghost.current.style.transform = `translate(${ev.clientX - 20}px, ${ev.clientY - 24}px)`;
        document.querySelectorAll('[data-drop].drop-hover').forEach((el) => el.classList.remove('drop-hover'));
        (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]') as HTMLElement | null)?.classList.add('drop-hover');
      };
      const end = (at: Pt | null) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        window.removeEventListener('touchmove', tmove);
        window.removeEventListener('touchend', tend);
        window.removeEventListener('touchcancel', tend);
        document.querySelectorAll('[data-drop].drop-hover').forEach((el) => el.classList.remove('drop-hover'));
        ghost.current?.remove();
        ghost.current = null;
        setDragging(null);
        if (!active) {
          // A finger tap: the chip blocks the browser's own touch handling (so a drag can never
          // turn into a page scroll), which also means no click event; select it here instead.
          if (at && touch) onTap?.();
          return; // a mouse click is handled by onClick
        }
        if (!at) return;
        const target = (document.elementFromPoint(at.clientX, at.clientY)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop;
        if (target) drop(itemId, target);
      };
      const up = (ev: PointerEvent) => end(ev.type === 'pointercancel' ? null : ev);
      // Fingers: follow the touch itself. Phones may cancel the pointer stream mid-drag (a fast
      // flick), but touch events keep coming until the finger lifts.
      const tmove = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (t) move({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => ev.cancelable && ev.preventDefault() });
      };
      const tend = (ev: TouchEvent) => {
        const t = ev.changedTouches[0];
        end(ev.type === 'touchcancel' ? null : t ? { clientX: t.clientX, clientY: t.clientY } : last);
      };
      const touch = e.pointerType === 'touch';
      if (touch) {
        window.addEventListener('touchmove', tmove, { passive: false });
        window.addEventListener('touchend', tend);
        window.addEventListener('touchcancel', tend);
      } else {
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      }
    },
    [disabled, drop],
  );

  return <Ctx.Provider value={{ selected, select: setSelected, drop, startDrag, dragging }}>{children}</Ctx.Provider>;
}

export function useDnd(): DndValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDnd outside DndProvider');
  return v;
}

export function DragChip({ id, label, className = '', children }: { id: string; label: string; className?: string; children?: ReactNode }) {
  const { selected, select, startDrag, dragging } = useDnd();
  const isSel = selected === id;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Phones: keep the finger's gesture ours from the very first touch, so a quick flick drags the
    // chip instead of scrolling the page away from under it.
    const el = ref.current;
    const stop = (e: TouchEvent) => e.cancelable && e.preventDefault();
    el?.addEventListener('touchstart', stop, { passive: false });
    return () => el?.removeEventListener('touchstart', stop);
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={isSel}
      onPointerDown={(e) => startDrag(e, id, label, () => select(isSel ? null : id))}
      onClick={() => select(isSel ? null : id)}
      style={{ touchAction: 'none' }}
      className={`select-none rounded-xl px-3 py-2 text-left text-sm font-bold ring-2 transition ${
        isSel ? 'bg-brand text-brand-ink ring-brand' : 'bg-surface ring-line hover:ring-brand/60'
      } ${dragging === id ? 'opacity-40' : ''} ${className}`}
    >
      {children ?? label}
    </button>
  );
}

export function DropZone({ id, className = '', children, label }: { id: string; className?: string; children: ReactNode; label: string }) {
  const { selected, drop } = useDnd();
  return (
    <div
      data-drop={id}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={(e) => {
        if (selected && e.target === e.currentTarget) drop(selected, id);
        else if (selected && !(e.target as HTMLElement).closest('button')) drop(selected, id);
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && selected) {
          e.preventDefault();
          drop(selected, id);
        }
      }}
      className={`transition ${selected ? 'ring-2 ring-dashed ring-brand/60' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
