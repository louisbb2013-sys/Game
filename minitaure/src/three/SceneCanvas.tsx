import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { NeutralToneMapping } from 'three';
import { useInView } from '../hooks/useInView';
import { useQuality } from '../hooks/useQuality';

interface Props {
  children: ReactNode;
  camera?: { position?: [number, number, number]; fov?: number };
  className?: string;
  style?: CSSProperties;
  /** Render even when off-screen (e.g. inside a pinned section). */
  alwaysOn?: boolean;
  /** Called once the first frame has been drawn. */
  onReady?: () => void;
  /** Accessible label; canvases are otherwise hidden from assistive tech. */
  label?: string;
}

/**
 * Canvas with the site-wide rendering policy: capped DPR that steps down if
 * the frame rate drops, neutral tone mapping, and no rendering at all while
 * the canvas is off-screen.
 */
export function SceneCanvas({ children, camera, className, style, alwaysOn, onReady, label }: Props) {
  const q = useQuality();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, '120px');
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, q.dpr[1]));
  return (
    <div
      ref={ref}
      className={className}
      style={{ touchAction: 'pan-y', ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Canvas
        frameloop={visible || alwaysOn ? 'always' : 'never'}
        dpr={dpr}
        camera={{ fov: 32, position: [0, 0.4, 9], ...camera }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
        onCreated={() => requestAnimationFrame(() => onReady?.())}
      >
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => setDpr((d) => Math.max(q.dpr[0], +(d - 0.25).toFixed(2)))}
        />
        {children}
      </Canvas>
    </div>
  );
}
