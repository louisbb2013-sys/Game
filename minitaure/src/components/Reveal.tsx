import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { CSSProperties, ElementType, ReactNode } from 'react';

/**
 * Scroll reveals, deliberately varied:
 *  rise   — gentle lift (paragraphs, small blocks)
 *  mask   — line rises out of a clipped mask (headlines)
 *  scale  — plates settle from 0.94 (images, cards)
 *  blur   — focus pull (numbers, quotes)
 *  drift  — slides in from the side (asides)
 * In reduced motion every variant becomes a plain opacity fade.
 */
export type RevealKind = 'rise' | 'mask' | 'scale' | 'blur' | 'drift' | 'fade';

const EASE = [0.22, 1, 0.36, 1] as const;

const variants: Record<RevealKind, Variants> = {
  rise: { hidden: { opacity: 0, y: 36 }, show: { opacity: 1, y: 0 } },
  mask: { hidden: { y: '105%' }, show: { y: '0%' } },
  scale: { hidden: { opacity: 0, scale: 0.94, y: 18 }, show: { opacity: 1, scale: 1, y: 0 } },
  blur: { hidden: { opacity: 0, filter: 'blur(12px)' }, show: { opacity: 1, filter: 'blur(0px)' } },
  drift: { hidden: { opacity: 0, x: -40 }, show: { opacity: 1, x: 0 } },
  fade: { hidden: { opacity: 0 }, show: { opacity: 1 } },
};
const reducedVariants: Variants = { hidden: { opacity: 0 }, show: { opacity: 1 } };

// motion.create must not run per render (it would remount the element).
const tagCache = new Map<ElementType, typeof motion.div>();
function m(as: ElementType) {
  let c = tagCache.get(as);
  if (!c) {
    c = motion.create(as as 'div') as unknown as typeof motion.div;
    tagCache.set(as, c);
  }
  return c;
}

interface Props {
  kind?: RevealKind;
  delay?: number;
  duration?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  amount?: number;
}

export function Reveal({ kind = 'rise', delay = 0, duration, as = 'div', className, style, children, amount = 0.3 }: Props) {
  const reduced = useReducedMotion();
  const MotionTag = m(as);
  const v = reduced ? reducedVariants : variants[kind];
  const d = duration ?? (kind === 'mask' ? 1.1 : kind === 'blur' ? 1.2 : 0.95);
  if (kind === 'mask' && !reduced) {
    // Observe the clipping wrapper, not the masked line: the line starts
    // fully clipped, so observing it directly would never fire.
    const Wrap = m('span');
    return (
      <Wrap
        className={className}
        style={{ display: 'block', overflow: 'hidden', paddingBottom: '0.08em', ...style }}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
      >
        <MotionTag style={{ display: 'block' }} variants={v} transition={{ duration: d, delay, ease: EASE }}>
          {children}
        </MotionTag>
      </Wrap>
    );
  }
  const content = (
    <MotionTag
      className={className}
      style={style}
      variants={v}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      transition={{ duration: reduced ? 0.4 : d, delay, ease: EASE }}
    >
      {children}
    </MotionTag>
  );
  return content;
}

/** Staggers direct <RevealItem> children. */
export function RevealGroup({
  children,
  className,
  stagger = 0.08,
  as = 'div',
  amount = 0.15,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  as?: ElementType;
  amount?: number;
}) {
  const MotionTag = m(as);
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </MotionTag>
  );
}

export function RevealItem({
  children,
  className,
  kind = 'scale',
  as = 'div',
  style,
}: {
  children: ReactNode;
  className?: string;
  kind?: RevealKind;
  as?: ElementType;
  style?: CSSProperties;
}) {
  const reduced = useReducedMotion();
  const MotionTag = m(as);
  return (
    <MotionTag
      className={className}
      style={style}
      variants={reduced ? reducedVariants : variants[kind]}
      transition={{ duration: reduced ? 0.4 : 0.9, ease: EASE }}
    >
      {children}
    </MotionTag>
  );
}
