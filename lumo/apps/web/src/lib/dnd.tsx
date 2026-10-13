import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

/**
 * Tiny drag-and-drop for touch + mouse (HTML5 DnD doesn't work on phones).
 * Also supports tap-to-select then tap-a-target, which is easier for many learners
 * and works with screen readers / keyboards.
 */
interface DndValue {
  selected: string | null;
  select: (id: string | null) => void;
  drop: (itemId: string, targetId: string) => void;
  startDrag: (e: React.PointerEvent, itemId: string, label: string) => void;
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
    (e: React.PointerEvent, itemId: string, label: string) => {
      if (disabled || e.button > 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let active = false;

      const move = (ev: PointerEvent) => {
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
        ev.preventDefault();
        if (ghost.current) ghost.current.style.transform = `translate(${ev.clientX - 20}px, ${ev.clientY - 24}px)`;
        document.querySelectorAll('[data-drop].drop-hover').forEach((el) => el.classList.remove('drop-hover'));
        (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]') as HTMLElement | null)?.classList.add('drop-hover');
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        document.querySelectorAll('[data-drop].drop-hover').forEach((el) => el.classList.remove('drop-hover'));
        ghost.current?.remove();
        ghost.current = null;
        setDragging(null);
        if (!active) return; // it was a tap: handled by onClick
        const target = (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop;
        if (target) drop(itemId, target);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
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
  return (
    <button
      type="button"
      aria-pressed={isSel}
      onPointerDown={(e) => startDrag(e, id, label)}
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
