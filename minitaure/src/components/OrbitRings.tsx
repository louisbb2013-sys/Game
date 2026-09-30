import styles from './OrbitRings.module.css';

/** Thin tilted orbit ellipses with a few "planets" — pure decoration. */
export function OrbitRings({ className, tone = 'day' }: { className?: string; tone?: 'day' | 'night' }) {
  return (
    <svg className={[styles.rings, className].filter(Boolean).join(' ')} data-tone={tone} viewBox="0 0 800 800" aria-hidden="true" focusable="false">
      <g className={styles.spin1}>
        <ellipse cx="400" cy="400" rx="380" ry="150" transform="rotate(-14 400 400)" />
        <circle cx="30" cy="490" r="5" className={styles.planet} />
      </g>
      <g className={styles.spin2}>
        <ellipse cx="400" cy="400" rx="300" ry="112" transform="rotate(18 400 400)" strokeDasharray="2 7" />
        <circle cx="690" cy="470" r="3.5" className={styles.planet2} />
      </g>
      <ellipse cx="400" cy="400" rx="230" ry="228" className={styles.halo} />
    </svg>
  );
}
