import { Canvas } from '@react-three/fiber';
import { useSearchParams } from 'react-router-dom';
import { sortedCreatures, creatureBySlug } from '../../content/creatures';
import { Creature3D } from '../../three/Creature3D';
import { NoToneMapping, NeutralToneMapping } from 'three';

/** Dev-only lab: inspect the fur in isolation, several angles and moods. */
export default function Lab() {
  const [params] = useSearchParams();
  const one = params.get('c');
  const mood = (params.get('mood') as 'day' | 'night') ?? 'day';
  const shells = Number(params.get('shells') ?? 36);
  const list = one ? one.split(',').map((s) => creatureBySlug(s)!) : sortedCreatures;
  const yaw = Number(params.get('yaw') ?? 0.4);
  const size = Number(params.get('size') ?? (one && !one.includes(',') ? 640 : 300));
  void NoToneMapping;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, background: mood === 'night' ? '#1A1745' : '#FCF9F4' }}>
      {list.map((c) => (
        <div key={c.slug} style={{ width: size, height: size }} data-lab={c.slug}>
          <Canvas camera={{ position: [0, 0.5, Number(params.get('dist') ?? 6.2)], fov: 30 }} dpr={Number(params.get('dpr') ?? 1)} gl={{ toneMapping: NeutralToneMapping, preserveDrawingBuffer: true }}>
            <Creature3D creature={c} shells={shells} detail={28} mood={mood} float={false} yaw={yaw} />
          </Canvas>
        </div>
      ))}
    </div>
  );
}
