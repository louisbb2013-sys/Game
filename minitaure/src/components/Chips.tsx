import { motion, useReducedMotion } from 'motion/react';
import styles from './Chips.module.css';

export interface ChipOption {
  value: string;
  label: string;
  color?: string;
  count?: number;
}

/**
 * Filter chips ("constellations"). A radio group semantically: one active
 * value, arrow keys move between options.
 */
export function Chips({
  options,
  value,
  onChange,
  label,
  id,
}: {
  options: ChipOption[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  id: string;
}) {
  const reduced = useReducedMotion();
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    const el = document.getElementById(`${id}-${options[next].value}`);
    el?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={styles.chips}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            id={`${id}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={styles.chip}
            data-on={on || undefined}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {on && (
              <motion.span
                layoutId={`${id}-pill`}
                className={styles.pill}
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }}
              />
            )}
            <span className={styles.inner}>
              {o.color && <span className={styles.dot} style={{ background: o.color }} aria-hidden="true" />}
              {o.label}
              {typeof o.count === 'number' && <span className={styles.count}>{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
