import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera, View } from '@react-three/drei';
import type { Creature } from '../content/types';
import { Creature3D } from './Creature3D';
import { thumbs } from '../lib/thumbs';
import { useQuality } from '../hooks/useQuality';

/** Coffret layout: three creatures side by side on one ground line (x, scale). */
const TRIO: [number, number][] = [
  [-1.3, 0.5],
  [0.02, 0.58],
  [1.28, 0.46],
];
const TRIO_GROUND = -0.8;

interface Props {
  creatures: Creature[];
  hovered: boolean;
  className?: string;
  onLive?: () => void;
}

/**
 * A live 3D thumbnail drawn by the shared ThumbCanvas. The framing matches
 * the pre-rendered still exactly, so the swap from still to live is seamless.
 */
export default function LiveThumb({ creatures, hovered, className, onLive }: Props) {
  useEffect(() => thumbs.register(), []);
  return (
    <View className={className}>
      <Scene creatures={creatures} hovered={hovered} onLive={onLive} />
    </View>
  );
}

function Scene({ creatures, hovered, onLive }: Omit<Props, 'className'>) {
  const q = useQuality();
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 4) onLive?.();
  });
  const trio = creatures.length > 1;
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.7, 6.3]} fov={30} onUpdate={(c) => c.lookAt(0, -0.08, 0)} />
      {creatures.map((c, i) => (
        <Creature3D
          key={c.slug}
          creature={c}
          shells={q.shells.thumb}
          detail={q.geo.thumb}
          hovered={hovered}
          yaw={0.5 + i}
          phase={i * 1.4}
          scale={trio ? TRIO[i][1] : 1}
          position={trio ? [TRIO[i][0], TRIO_GROUND + TRIO[i][1], 0] : [0, 0, 0]}
        />
      ))}
    </>
  );
}
