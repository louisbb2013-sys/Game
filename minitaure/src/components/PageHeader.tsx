import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import styles from './PageHeader.module.css';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Inner-page header: eyebrow, large soft serif title, lede, optional aside. */
export function PageHeader({ eyebrow, title, lede, aside }: { eyebrow: string; title: ReactNode; lede?: string; aside?: ReactNode }) {
  const reduced = useReducedMotion();
  const enter = (d: number) =>
    reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } }
      : { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: d, ease: EASE } };
  return (
    <header className={`container ${styles.head}`}>
      <div className={styles.copy}>
        <motion.p className="eyebrow" {...enter(0.05)}>
          {eyebrow}
        </motion.p>
        <span className={styles.mask}>
          <motion.h1
            className={styles.title}
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: '0%' }}
            transition={{ duration: reduced ? 0.4 : 1.1, delay: 0.1, ease: EASE }}
          >
            {title}
          </motion.h1>
        </span>
        {lede && (
          <motion.p className={`lede ${styles.lede}`} {...enter(0.15)}>
            {lede}
          </motion.p>
        )}
      </div>
      {aside && (
        <motion.div className={styles.aside} {...enter(0.4)}>
          {aside}
        </motion.div>
      )}
    </header>
  );
}
