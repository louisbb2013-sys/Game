import { motion, useReducedMotion } from 'motion/react';
import styles from './Wordmark.module.css';

const LETTERS = 'minitaure'.split('');

interface Props {
  /** Play the load sequence (letters settle in one by one). */
  animate?: boolean;
  delay?: number;
  className?: string;
  as?: 'span' | 'h1';
}

/**
 * The Minitaure wordmark: lowercase Fraunces (SOFT 100) where both "i" are
 * dotless and carry a small round dot that settles in on load (in the text
 * colour: two contrasting dots side by side would read as a pair of eyes).
 */
export function Wordmark({ animate = false, delay = 0, className, as = 'span' }: Props) {
  const reduced = useReducedMotion();
  const Tag = as === 'h1' ? motion.h1 : motion.span;
  const play = animate && !reduced;
  return (
    <Tag className={[styles.mark, className].filter(Boolean).join(' ')}>
      <span className="visually-hidden">Minitaure</span>
      {LETTERS.map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className={ch === 'i' ? styles.i : styles.letter}
          initial={play ? { y: '0.5em', opacity: 0, filter: 'blur(8px)' } : animate && reduced ? { opacity: 0 } : false}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          transition={
            play
              ? { delay: delay + i * 0.065, type: 'spring', stiffness: 90, damping: 16, mass: 0.9 }
              : { duration: 0.6, delay }
          }
        >
          {ch === 'i' ? (
            <>
              <span className={styles.dotless}>ı</span>
              <motion.span
                className={styles.dot}
                initial={play ? { scale: 0, y: -14 } : false}
                animate={{ scale: 1, y: 0 }}
                transition={play ? { delay: delay + 0.75 + i * 0.07, type: 'spring', stiffness: 260, damping: 14 } : { duration: 0 }}
              />
            </>
          ) : (
            ch
          )}
        </motion.span>
      ))}
    </Tag>
  );
}

/** Small orb mark used in the nav and favicon. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={styles.logoMark}>
      <defs>
        <radialGradient id="lm-g" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#EFE9FC" />
          <stop offset="0.45" stopColor="#D2C4F8" />
          <stop offset="1" stopColor="#6D4FD3" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="34" rx="25" ry="23.5" fill="url(#lm-g)" filter="url(#fur-edge-sm)" />
      <ellipse cx="32" cy="34" rx="30" ry="12" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.6" transform="rotate(-16 32 34)" />
    </svg>
  );
}
