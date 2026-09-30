import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Creature } from '../content/types';
import { Creature3D } from './Creature3D';
import { Nebula, StarField } from './StarField';
import { SceneCanvas } from './SceneCanvas';
import { useQuality } from '../hooks/useQuality';

/** À propos: a deep star field with a few creatures drifting far away. */
export default function AboutScene({ drifters, className }: { drifters: Creature[]; className?: string }) {
  return (
    <SceneCanvas className={className} camera={{ position: [0, 0, 10], fov: 36 }}>
      <AboutContent drifters={drifters} />
    </SceneCanvas>
  );
}

function AboutContent({ drifters }: { drifters: Creature[] }) {
  const q = useQuality();
  return (
    <>
      <StarField count={Math.round(q.stars * 1.2)} size={[26, 16, 12]} tone="night" drift={0.5} seed={19} />
      <Nebula color="#6D4FD3" color2="#F8C9DB" position={[-3, 1, -6]} scale={16} opacity={0.3} />
      <Nebula color="#BBD6F9" color2="#6D4FD3" position={[5, -2, -7]} scale={12} opacity={0.2} />
      {drifters.map((c, i) => (
        <Drifter key={c.slug} creature={c} index={i} shells={q.shells.small} detail={q.geo.small} />
      ))}
    </>
  );
}

const SPOTS: [number, number, number, number][] = [
  [3.6, 1.3, -1, 0.75],
  [5.6, -2.2, -4, 0.55],
  [1.6, 2.9, -6, 0.42],
];

function Drifter({ creature, index, shells, detail }: { creature: Creature; index: number; shells: number; detail: number }) {
  const ref = useRef<THREE.Group>(null);
  const [x, y, z, s] = SPOTS[index % SPOTS.length];
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.12 + index * 2;
    if (ref.current) ref.current.position.set(x + Math.sin(t) * 0.5, y + Math.cos(t * 1.3) * 0.3, z);
  });
  return (
    <group ref={ref}>
      <Creature3D creature={creature} mood="night" shells={shells} detail={detail} scale={s} shadow={false} autoRotate={0.2} phase={index} appearDelay={0.3 + index * 0.4} />
    </group>
  );
}
