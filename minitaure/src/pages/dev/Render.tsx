import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NeutralToneMapping } from 'three';
import { creatureBySlug } from '../../content/creatures';
import { Creature3D } from '../../three/Creature3D';

declare global {
  interface Window {
    __stillReady?: boolean;
  }
}

function Ready() {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 8) window.__stillReady = true;
  });
  return null;
}

/**
 * Dev-only still renderer used by `npm run stills`. Renders one creature on a
 * transparent canvas with the production shader at maximum quality.
 */
export default function Render() {
  const [params] = useSearchParams();
  const c = creatureBySlug(params.get('c') ?? 'brume');
  const size = Number(params.get('size') ?? 640);
  if (!c) return <p>Inconnue</p>;
  return (
    <div style={{ width: size, height: size, background: 'transparent' }}>
      <Canvas
        id="still"
        dpr={1}
        frameloop="always"
        camera={{ position: [0, 0.7, 6.3], fov: 30 }}
        onCreated={({ camera }) => camera.lookAt(0, -0.08, 0)}
        gl={{ toneMapping: NeutralToneMapping, preserveDrawingBuffer: true, alpha: true, antialias: true }}
      >
        <Creature3D creature={c} shells={56} detail={40} float={false} yaw={0.5} />
        <Ready />
      </Canvas>
    </div>
  );
}
