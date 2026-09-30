import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rng } from './noise';
import { globalPointer, damp } from './pointer';

/** rgb += src.rgb, alpha unchanged (premultiplied canvas → additive glow). */
const ADDITIVE_GLOW = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

interface StarFieldProps {
  count?: number;
  /** Box the stars live in: [width, height, depth]. */
  size?: [number, number, number];
  tone?: 'day' | 'night';
  /** Drift speed multiplier (0 = still). */
  drift?: number;
  seed?: number;
  opacity?: number;
}

/**
 * Cosmic dust: a single Points draw. Each star has its own size, depth,
 * twinkle phase and colour. Stars drift slowly sideways (wrapping), and the
 * whole field parallaxes with the pointer, nearer stars moving more.
 */
export function StarField({
  count = 700,
  size = [16, 10, 8],
  tone = 'night',
  drift = 1,
  seed = 7,
  opacity = 1,
}: StarFieldProps) {
  const dpr = useThree((s) => s.viewport.dpr);
  const geometry = useMemo(() => {
    const rand = rng(seed);
    const pos = new Float32Array(count * 3);
    const attr = new Float32Array(count * 4); // size, phase, speed, colour pick
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * size[0];
      pos[i * 3 + 1] = (rand() - 0.5) * size[1];
      pos[i * 3 + 2] = -rand() * size[2];
      const big = rand() > 0.94;
      attr[i * 4] = big ? 2.2 + rand() * 2.4 : 0.7 + rand() * 1.3;
      attr[i * 4 + 1] = rand() * Math.PI * 2;
      attr[i * 4 + 2] = 0.3 + rand() * 0.7;
      attr[i * 4 + 3] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aStar', new THREE.BufferAttribute(attr, 4));
    return g;
  }, [count, size, seed]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        // Night: purely additive light that leaves canvas alpha untouched, so
        // it composites as glow over whatever the page paints underneath.
        ...(tone === 'night' ? ADDITIVE_GLOW : { blending: THREE.NormalBlending }),
        uniforms: {
          uTime: { value: 0 },
          uDpr: { value: dpr },
          uWidth: { value: size[0] },
          uParallax: { value: new THREE.Vector2() },
          uOpacity: { value: opacity },
          uNight: { value: tone === 'night' ? 1 : 0 },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uDpr;
          uniform float uWidth;
          uniform vec2 uParallax;
          attribute vec4 aStar;
          varying float vTw;
          varying float vPick;
          varying float vDepth;
          void main() {
            vec3 p = position;
            float depth = clamp(-p.z / 8.0, 0.0, 1.0);
            p.x += uTime * 0.05 * aStar.z;
            p.x = mod(p.x + uWidth * 0.5, uWidth) - uWidth * 0.5;
            p.xy += uParallax * (1.0 - depth) * 0.6;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            vTw = 0.55 + 0.45 * sin(uTime * (0.6 + aStar.z) + aStar.y);
            vPick = aStar.w;
            vDepth = depth;
            gl_PointSize = aStar.x * uDpr * (6.0 / -mv.z) * (1.0 - depth * 0.4);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          uniform float uNight;
          varying float vTw;
          varying float vPick;
          varying float vDepth;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c) * 2.0;
            float core = smoothstep(1.0, 0.0, d);
            float a = pow(core, 2.2);
            vec3 nightCol = vPick < 0.6 ? vec3(1.0, 0.98, 0.95) : (vPick < 0.85 ? vec3(0.82, 0.77, 1.0) : vec3(1.0, 0.86, 0.8));
            vec3 dayCol = vPick < 0.5 ? vec3(0.43, 0.31, 0.83) : (vPick < 0.8 ? vec3(0.65, 0.55, 0.95) : vec3(0.95, 0.6, 0.72));
            vec3 col = mix(dayCol, nightCol, uNight);
            float alpha = a * vTw * uOpacity * mix(0.55, 1.0, uNight) * (1.0 - vDepth * 0.5);
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(col, alpha);
            #include <colorspace_fragment>
            if (uNight > 0.5) gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
          }
        `,
      }),
    [tone, dpr, size, opacity],
  );

  const par = useRef({ x: 0, y: 0 });
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    material.uniforms.uTime.value += d * drift;
    par.current.x = damp(par.current.x, globalPointer.x * drift, 1.5, d);
    par.current.y = damp(par.current.y, globalPointer.y * drift, 1.5, d);
    material.uniforms.uParallax.value.set(par.current.x, par.current.y);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/** Faint additive nebula gradient plane. */
export function Nebula({
  color = '#6D4FD3',
  color2 = '#F8C9DB',
  position = [0, 0, -6] as [number, number, number],
  scale = 14,
  opacity = 0.35,
}: {
  color?: string;
  color2?: string;
  position?: [number, number, number];
  scale?: number;
  opacity?: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        ...ADDITIVE_GLOW,
        uniforms: {
          uTime: { value: 0 },
          uA: { value: new THREE.Color(color) },
          uB: { value: new THREE.Color(color2) },
          uOpacity: { value: opacity },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uOpacity;
          varying vec2 vUv;
          float n(vec2 p){ return sin(p.x*1.7+uTime*0.05)*sin(p.y*1.3-uTime*0.04)+sin((p.x+p.y)*0.9+uTime*0.03); }
          void main(){
            vec2 p = vUv - 0.5;
            float r = length(p * vec2(1.0, 1.4));
            float cloud = smoothstep(0.5, 0.0, r) * (0.65 + 0.35 * n(vUv * 4.0));
            vec3 col = mix(uA, uB, smoothstep(-0.3, 0.4, p.x + p.y * 0.5));
            gl_FragColor = vec4(col * cloud * uOpacity, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [color, color2, opacity],
  );
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += Math.min(dt, 0.05);
  });
  return (
    <mesh position={position} scale={scale} material={mat}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
