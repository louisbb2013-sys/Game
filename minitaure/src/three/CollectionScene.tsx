import { useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Collection, Creature } from '../content/types';
import { Creature3D } from './Creature3D';
import { Nebula, StarField } from './StarField';
import { SceneCanvas } from './SceneCanvas';
import { useQuality } from '../hooks/useQuality';
import { damp, globalPointer } from './pointer';

export const CLUSTER_GAP = 7.5;

interface Props {
  groups: { collection: Collection; creatures: Creature[] }[];
  /** 0..1 scroll progress, written by the ScrollTrigger in the page. */
  progress: RefObject<number>;
  className?: string;
}

/**
 * Scroll-driven flight past the collections. Each collection is a small
 * constellation of creatures; the camera follows a Catmull-Rom path whose
 * position is driven by the pinned section's scroll progress.
 */
export default function CollectionScene({ groups, progress, className }: Props) {
  return (
    <SceneCanvas className={className} alwaysOn camera={{ position: [0, 0.6, 8], fov: 34 }}>
      <Flight groups={groups} progress={progress} />
    </SceneCanvas>
  );
}

function Flight({ groups, progress }: Omit<Props, 'className'>) {
  const q = useQuality();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // Portrait viewports (phones, tablets upright) need the camera further back.
  const narrow = size.width / size.height < 1.05;

  const { path, look } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const looks: THREE.Vector3[] = [];
    groups.forEach((_, i) => {
      const x = i * CLUSTER_GAP;
      const side = i % 2 === 0 ? 1 : -1;
      pts.push(new THREE.Vector3(x - 1.2, 0.9 + side * 0.25, narrow ? 13.5 : 8.2));
      pts.push(new THREE.Vector3(x + 1.4, 0.5 - side * 0.2, narrow ? 12.6 : 7.4));
      looks.push(new THREE.Vector3(x - 0.2, 0, 0), new THREE.Vector3(x + 0.8, 0, 0));
    });
    return {
      path: new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
      look: new THREE.CatmullRomCurve3(looks, false, 'centripetal'),
    };
  }, [groups, narrow]);

  const eased = useRef(0);
  const target = useMemo(() => new THREE.Vector3(), []);
  const par = useRef({ x: 0, y: 0 });

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    eased.current = damp(eased.current, progress.current ?? 0, 5, d);
    const t = THREE.MathUtils.clamp(eased.current, 0, 1);
    path.getPointAt(t, camera.position);
    look.getPointAt(t, target);
    par.current.x = damp(par.current.x, globalPointer.x * 0.35, 2, d);
    par.current.y = damp(par.current.y, globalPointer.y * 0.2, 2, d);
    camera.position.x += par.current.x;
    camera.position.y += par.current.y;
    camera.lookAt(target);
  });

  return (
    <>
      <StarField count={q.stars} size={[groups.length * CLUSTER_GAP + 24, 16, 12]} tone="night" drift={0.4} seed={3} />
      {groups.map((g, i) => (
        <Cluster key={g.collection.slug} index={i} collection={g.collection} creatures={g.creatures} />
      ))}
    </>
  );
}

function Cluster({ index, collection, creatures }: { index: number; collection: Collection; creatures: Creature[] }) {
  const q = useQuality();
  const size = useThree((s) => s.size);
  // On landscape screens the captions sit on the left: shift creatures right.
  const offsetX = size.width / size.height >= 1.05 ? 1.6 : 0;
  const x0 = index * CLUSTER_GAP;
  const n = creatures.length;
  return (
    <group position={[x0 + offsetX, 0, 0]}>
      <Nebula color={collection.accent} color2="#6D4FD3" position={[0.5, 0.3, -4]} scale={11} opacity={0.2} />
      {creatures.map((c, i) => {
        // Arrange as a gentle arc; the first creature is the "lead".
        const a = (i - (n - 1) / 2) * 0.75;
        const r = 2.4;
        const pos: [number, number, number] = [Math.sin(a) * r * 1.2, (i % 2 ? 0.35 : -0.25) + (i === 0 ? 0 : 0), -Math.cos(a) * r + r - (i % 2) * 0.8];
        return (
          <Creature3D
            key={c.slug}
            creature={c}
            mood="night"
            shells={q.shells.small + 4}
            detail={q.geo.small}
            position={pos}
            scale={0.62 + ((i * 37) % 10) / 60}
            phase={i * 1.3 + index}
            autoRotate={0.12}
            yaw={i * 0.9}
          />
        );
      })}
    </group>
  );
}
