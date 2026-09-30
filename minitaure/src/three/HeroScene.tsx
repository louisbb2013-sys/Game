import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import type { Creature } from '../content/types';
import { Creature3D } from './Creature3D';
import { StarField } from './StarField';
import { SceneCanvas } from './SceneCanvas';
import { useQuality } from '../hooks/useQuality';
import { damp } from './pointer';

interface Props {
  hero: Creature;
  satellites: Creature[];
  onReady?: () => void;
  className?: string;
}

/** Accueil hero: a large interactive creature with small ones on orbit. */
export default function HeroScene({ hero, satellites, onReady, className }: Props) {
  return (
    <SceneCanvas
      className={className}
      camera={{ position: [0, 0.45, 10.5], fov: 30 }}
      onReady={onReady}
      label={`${hero.name}, une créature Minitaure en 3D, entourée de petites créatures en orbite`}
    >
      <HeroContent hero={hero} satellites={satellites} />
    </SceneCanvas>
  );
}

function HeroContent({ hero, satellites }: Omit<Props, 'onReady' | 'className'>) {
  const q = useQuality();
  const navigate = useNavigate();
  const drop = useRef<THREE.Group>(null);
  const st = useRef({ age: 0, y: 1.1 });

  // Load sequence: the creature drops in softly and settles.
  useFrame((_, dt) => {
    const s = st.current;
    s.age += Math.min(dt, 0.5);
    if (s.age > 0.7) s.y = damp(s.y, 0, 3.2, Math.min(dt, 0.5));
    if (drop.current) drop.current.position.y = s.y;
  });

  return (
    <>
      <StarField count={Math.round(q.stars * 0.45)} size={[18, 11, 7]} tone="day" drift={0.6} opacity={0.75} />
      <group position={[0, -0.3, 0]}>
      <group ref={drop}>
        <Creature3D
          creature={hero}
          shells={q.shells.hero}
          detail={q.geo.hero}
          interactive
          tilt
          appearDelay={0.6}
          scale={1.2}
          yaw={0.5}
          onSelect={() => navigate(`/creatures/${hero.slug}`)}
        />
      </group>
      </group>
      {satellites.map((c, i) => (
        <Satellite key={c.slug} creature={c} index={i} count={satellites.length} />
      ))}
    </>
  );
}

function Satellite({ creature, index, count }: { creature: Creature; index: number; count: number }) {
  const q = useQuality();
  const ref = useRef<THREE.Group>(null);
  const a = useRef((index / count) * Math.PI * 2 + 0.6);
  // Keep orbits inside narrow (portrait) canvases.
  const vw = useThree((st) => st.viewport.width);
  const radius = (2.35 + index * 0.3) * Math.min(1, vw / 6.6);
  const speed = 0.11 + index * 0.025;
  const tilt = -0.28 + index * 0.1;
  useFrame((_, dt) => {
    a.current += Math.min(dt, 0.05) * speed;
    const t = a.current;
    if (ref.current) {
      ref.current.position.set(Math.cos(t) * radius, Math.sin(t) * radius * tilt + 0.1, Math.sin(t) * radius * 0.6);
    }
  });
  return (
    <group ref={ref}>
      <Creature3D
        creature={creature}
        shells={q.shells.small}
        detail={q.geo.small}
        scale={0.34 + (index % 2) * 0.06}
        shadow={false}
        appearDelay={1.3 + index * 0.25}
        phase={index * 1.7}
        autoRotate={0.35}
      />
    </group>
  );
}
