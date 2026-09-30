import type { Creature } from '../content/types';
import { Creature3D } from './Creature3D';
import { SceneCanvas } from './SceneCanvas';
import { useQuality } from '../hooks/useQuality';

/** Creature sheet: one large creature to drag, turn and inspect. */
export default function SheetScene({
  creature,
  onReady,
  className,
  still = false,
}: {
  creature: Creature;
  onReady?: () => void;
  className?: string;
  /** Reduced-motion opt-in: no idle motion, only user-driven rotation. */
  still?: boolean;
}) {
  const q = useQuality();
  return (
    <SceneCanvas
      className={className}
      camera={{ position: [0, 0.6, 8.4], fov: 30 }}
      onReady={onReady}
      label={`${creature.name} en 3D. Faites glisser pour la faire tourner.`}
    >
      <Creature3D
        creature={creature}
        shells={q.tier === 'high' ? q.shells.detail : Math.max(q.shells.detail, 26)}
        detail={q.geo.hero}
        interactive
        tilt={!still}
        float={!still}
        scale={0.95}
        yaw={0.5}
        position={[0, -0.12, 0]}
      />
    </SceneCanvas>
  );
}
