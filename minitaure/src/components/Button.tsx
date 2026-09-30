import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import styles from './Button.module.css';

type Variant = 'primary' | 'ghost' | 'soft';

interface Common {
  variant?: Variant;
  size?: 'md' | 'lg';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const cls = (variant: Variant, size: string, className?: string) =>
  [styles.btn, styles[variant], size === 'lg' && styles.lg, className].filter(Boolean).join(' ');

export function ButtonLink({ variant = 'primary', size = 'md', icon, children, className, ...rest }: Common & LinkProps) {
  return (
    <Link className={cls(variant, size, className)} {...rest}>
      <span className={styles.label}>{children}</span>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
    </Link>
  );
}

export const Button = forwardRef<HTMLButtonElement, Common & ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button({ variant = 'primary', size = 'md', icon, children, className, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={cls(variant, size, className)} {...rest}>
        <span className={styles.label}>{children}</span>
        {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      </button>
    );
  },
);

export const Arrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
