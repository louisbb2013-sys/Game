import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';
import { NeutralToneMapping } from 'three';
import { useThumbs } from '../lib/thumbs';
import { useQuality } from '../hooks/useQuality';

/**
 * ONE fixed, full-viewport, click-through canvas that renders every live
 * card thumbnail through drei <View> scissoring. One WebGL context for the
 * whole grid instead of one per card.
 */
export default function ThumbCanvas() {
  const { count, paused } = useThumbs();
  const q = useQuality();
  if (count === 0) return null;
  return (
    <Canvas
      aria-hidden="true"
      frameloop={paused ? 'never' : 'always'}
      dpr={Math.min(window.devicePixelRatio || 1, q.dpr[1])}
      gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping }}
      style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', opacity: paused ? 0 : 1, transition: 'opacity .3s' }}
      eventSource={document.getElementById('root')!}
    >
      <View.Port />
    </Canvas>
  );
}
