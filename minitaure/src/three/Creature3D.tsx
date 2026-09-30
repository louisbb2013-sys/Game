import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Creature } from '../content/types';
import { getBodyGeometry } from './body';
import { createFurMaterial, type Mood } from './furMaterial';
import { damp, globalPointer } from './pointer';

export interface Creature3DProps {
  creature: Creature;
  /** Shell count (fur layers). */
  shells?: number;
  /** Icosphere subdivision. */
  detail?: number;
  mood?: Mood;
  /** Idle float, breathing and breeze. */
  float?: boolean;
  /** Drag to rotate (with inertia), hover ruffle, pointer tilt, click. */
  interactive?: boolean;
  /** Glance toward the global pointer. */
  tilt?: boolean;
  onSelect?: () => void;
  /** Constant yaw speed in rad/s. */
  autoRotate?: number;
  shadow?: boolean;
  /** Delay (s) before the fur grows in. Negative = start fully grown. */
  appearDelay?: number;
  /** Externally driven hover (e.g. a DOM card). */
  hovered?: boolean;
  /** Initial yaw so the pattern shows its best side. */
  yaw?: number;
  position?: [number, number, number];
  scale?: number;
  /** Phase offset for the idle motion so groups don't move in sync. */
  phase?: number;
  /** Mutable ref the parent can use to add extra yaw (e.g. scroll-driven). */
  extraYaw?: React.RefObject<number>;
}

const noRaycast = () => null;

export function Creature3D({
  creature,
  shells = 32,
  detail = 24,
  mood = 'day',
  float = true,
  interactive = false,
  tilt = false,
  onSelect,
  autoRotate = 0,
  shadow = true,
  appearDelay = -1,
  hovered = false,
  yaw = 0.4,
  position = [0, 0, 0],
  scale = 1,
  phase = 0,
  extraYaw,
}: Creature3DProps) {
  const geometry = useMemo(() => getBodyGeometry(creature, detail), [creature, detail]);
  const material = useMemo(() => createFurMaterial(creature, shells, mood), [creature, shells, mood]);
  useEffect(() => () => material.dispose(), [material]);

  const floatRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  const shadowMat = useRef<THREE.ShaderMaterial>(null);
  const shadowRef = useRef<THREE.Mesh>(null);

  const s = useRef({
    t: phase * 10,
    age: 0,
    yaw,
    pitch: 0,
    vYaw: 0,
    vPitch: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    downX: 0,
    downY: 0,
    hover: 0,
    selfHover: false,
    tiltX: 0,
    tiltY: 0,
    squish: 0,
  });

  // Global listeners while dragging.
  useEffect(() => {
    if (!interactive) return;
    const move = (e: PointerEvent) => {
      const st = s.current;
      if (!st.dragging) return;
      const dx = e.clientX - st.lastX;
      const dy = e.clientY - st.lastY;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      st.vYaw = dx * 0.012;
      st.vPitch = dy * 0.008;
      st.yaw += st.vYaw;
      st.pitch = THREE.MathUtils.clamp(st.pitch + st.vPitch, -0.7, 0.7);
    };
    const up = () => {
      const st = s.current;
      if (!st.dragging) return;
      st.dragging = false;
      document.body.style.cursor = st.selfHover ? 'grab' : '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [interactive]);

  useEffect(() => () => {
    if (s.current.selfHover) document.body.style.cursor = '';
  }, []);

  const squash = creature.shape?.squash ?? 0.95;
  const bottom = -squash * 0.98;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const st = s.current;
    // Appearance timing follows the wall clock, so a slow frame rate never
    // stretches the intro into slow motion.
    st.age += Math.min(rawDt, 0.5);
    if (float) st.t += dt;
    material.uniforms.uTime.value = st.t;

    // Fur grows in on appearance.
    if (appearDelay >= 0) {
      const k = THREE.MathUtils.clamp((st.age - appearDelay) / 1.6, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      material.uniforms.uGrow.value = 0.05 + 0.95 * e;
    }

    // Hover ruffle + squish.
    const hoverTarget = hovered || st.selfHover || st.dragging ? 1 : 0;
    st.hover = damp(st.hover, hoverTarget, 6, dt);
    material.uniforms.uRuffle.value = st.hover * 0.35;
    material.uniforms.uWind.value = float ? 0.12 + st.hover * 0.1 : 0;

    // Rotation: drag inertia, auto-rotate, tilt.
    if (!st.dragging) {
      st.yaw += st.vYaw;
      st.vYaw *= Math.exp(-dt * 2.6);
      st.pitch += st.vPitch;
      st.vPitch *= Math.exp(-dt * 3.5);
      st.pitch = damp(st.pitch, 0, 1.2, dt);
      st.yaw += autoRotate * dt;
    }
    const px = tilt && globalPointer.active ? globalPointer.x : 0;
    const py = tilt && globalPointer.active ? globalPointer.y : 0;
    st.tiltX = damp(st.tiltX, px, 2.5, dt);
    st.tiltY = damp(st.tiltY, py, 2.5, dt);

    if (spinRef.current) {
      spinRef.current.rotation.y = st.yaw + st.tiltX * 0.35 + (extraYaw?.current ?? 0);
      spinRef.current.rotation.x = st.pitch - st.tiltY * 0.18;
      spinRef.current.rotation.z = -st.tiltX * 0.05;
    }

    // Idle float and breathing.
    const lift = float ? Math.sin(st.t * 0.9 + phase * 3) * 0.05 + 0.03 : 0;
    const breath = float ? Math.sin(st.t * 1.5 + phase * 5) * 0.012 : 0;
    st.squish = damp(st.squish, st.hover, 7, dt);
    if (floatRef.current) {
      floatRef.current.position.y = lift + st.squish * 0.02;
      const sx = 1 + breath + st.squish * 0.025;
      const sy = 1 - breath * 0.6 - st.squish * 0.02;
      floatRef.current.scale.set(sx, sy, sx);
    }
    if (shadowMat.current && shadowRef.current) {
      const h = lift + st.squish * 0.02;
      shadowMat.current.uniforms.uOpacity.value = (mood === 'night' ? 0.5 : 0.32) * (1 - h * 2.2);
      const sc = 1 - h * 0.9;
      shadowRef.current.scale.set(sc, sc, sc);
    }
  });

  const handlers = interactive
    ? {
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          const st = s.current;
          st.dragging = true;
          st.lastX = st.downX = e.nativeEvent.clientX;
          st.lastY = st.downY = e.nativeEvent.clientY;
          st.vYaw = st.vPitch = 0;
          document.body.style.cursor = 'grabbing';
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          s.current.selfHover = true;
          if (!s.current.dragging) document.body.style.cursor = onSelect ? 'pointer' : 'grab';
        },
        onPointerOut: () => {
          s.current.selfHover = false;
          if (!s.current.dragging) document.body.style.cursor = '';
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          const st = s.current;
          const moved = Math.hypot(e.nativeEvent.clientX - st.downX, e.nativeEvent.clientY - st.downY);
          if (moved < 6 && onSelect) {
            e.stopPropagation();
            onSelect();
          }
        },
      }
    : {};

  return (
    <group position={position} scale={scale}>
      <group ref={floatRef}>
        <group ref={spinRef}>
          <instancedMesh
            args={[geometry, material, shells]}
            raycast={noRaycast}
          />
        </group>
        {interactive && (
          <mesh {...handlers}>
            <sphereGeometry args={[1.12, 16, 12]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} />
          </mesh>
        )}
      </group>
      {shadow && (
        <mesh ref={shadowRef} position={[0, bottom - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <planeGeometry args={[2.8, 2.8]} />
          <shaderMaterial
            ref={shadowMat}
            transparent
            depthWrite={false}
            uniforms={{
              uOpacity: { value: 0.3 },
              uColor: { value: new THREE.Color(mood === 'night' ? '#07061A' : '#2A2270') },
            }}
            vertexShader={shadowVert}
            fragmentShader={shadowFrag}
          />
        </mesh>
      )}
    </group>
  );
}

const shadowVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const shadowFrag = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float core = pow(1.0 - smoothstep(0.0, 0.62, d), 2.0);
    float soft = pow(1.0 - smoothstep(0.0, 1.0, d), 3.0);
    gl_FragColor = vec4(uColor, (core * 0.65 + soft * 0.35) * uOpacity);
    #include <colorspace_fragment>
  }
`;
