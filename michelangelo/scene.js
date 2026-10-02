import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

// Hero 3D scene: a crystal wine glass with red wine, floating fresh pasta,
// and drifting gold dust. Reacts to the mouse and to scroll position.
export function initScene(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0706, 0.05);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 11);

  // Lights: warm key, wine-coloured rim, soft fill.
  const key = new THREE.SpotLight(0xffd9a0, 120, 30, Math.PI / 6, 0.6);
  key.position.set(4, 6, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0xb0182c, 60, 20);
  rim.position.set(-4, 1, -3);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x2a1810, 1.2));

  // ---- Wine glass (lathe) ----
  const glass = new THREE.Group();
  const v = (x, y) => new THREE.Vector2(x, y);
  const glassProfile = [
    v(0, 0), v(1.0, 0), v(1.0, 0.05), v(0.14, 0.12), v(0.07, 0.3), v(0.06, 1.6),
    v(0.12, 1.85), v(0.45, 2.0), v(0.85, 2.35), v(1.05, 2.8), v(1.08, 3.3), v(1.0, 3.8), v(0.93, 4.1),
  ];
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.25,
    ior: 1.5, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05,
    side: THREE.DoubleSide, transparent: true, opacity: 0.9,
  });
  glass.add(new THREE.Mesh(new THREE.LatheGeometry(glassProfile, 96), glassMat));

  const wineProfile = [v(0, 1.97), v(0.42, 2.05), v(0.8, 2.37), v(0.99, 2.8), v(0, 2.8)];
  const wineMat = new THREE.MeshPhysicalMaterial({
    color: 0x6b0f1a, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
    sheen: 1, sheenColor: new THREE.Color(0xff3a4a), envMapIntensity: 1.2,
  });
  const wine = new THREE.Mesh(new THREE.LatheGeometry(wineProfile, 96), wineMat);
  wine.scale.setScalar(0.97);
  wine.position.y = 0.04;
  glass.add(wine);

  // Gold rim ring.
  const rimRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.93, 0.012, 12, 120),
    new THREE.MeshStandardMaterial({ color: 0xe0be74, metalness: 1, roughness: 0.2 })
  );
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = 4.1;
  glass.add(rimRing);

  glass.scale.setScalar(0.9);
  const glassPivot = new THREE.Group();
  glass.position.y = -1.85;
  glassPivot.add(glass);
  glassPivot.rotation.z = -0.12;
  scene.add(glassPivot);

  // ---- Floating pasta ----
  const pastaMat = new THREE.MeshStandardMaterial({ color: 0xe8c27a, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af62, roughness: 0.25, metalness: 1 });
  const rigatoni = new THREE.CylinderGeometry(0.16, 0.16, 0.62, 28, 1, true);
  // Ridges on the rigatoni.
  const pos = rigatoni.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const r = 0.16 + Math.sin(a * 14) * 0.008;
    pos.setX(i, Math.cos(a) * r);
    pos.setZ(i, Math.sin(a) * r);
  }
  rigatoni.computeVertexNormals();
  const anelli = new THREE.TorusGeometry(0.2, 0.06, 16, 48);
  const farfalle = makeFarfalle();
  const pearl = new THREE.IcosahedronGeometry(0.07, 3);

  const pasta = [];
  const geos = [rigatoni, anelli, farfalle, rigatoni, farfalle];
  const COUNT = window.innerWidth < 700 ? 16 : 28;
  for (let i = 0; i < COUNT; i++) {
    const isGold = i % 7 === 0;
    const m = new THREE.Mesh(isGold ? pearl : geos[i % geos.length], isGold ? goldMat : pastaMat);
    const angle = (i / COUNT) * Math.PI * 2;
    const radius = 2.6 + Math.random() * 2.4;
    m.userData = {
      angle, radius,
      y: (Math.random() - 0.5) * 6,
      speed: 0.04 + Math.random() * 0.06,
      spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.8),
      bob: Math.random() * Math.PI * 2,
    };
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    pasta.push(m);
    scene.add(m);
  }

  // ---- Gold dust ----
  const DUST = window.innerWidth < 700 ? 700 : 1600;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  const dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 22;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 2;
    dustSeed[i] = Math.random();
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('seed', new THREE.BufferAttribute(dustSeed, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixel: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */`
      attribute float seed;
      uniform float uTime; uniform float uPixel;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * (0.15 + seed * 0.25) + 7.0, 14.0) - 7.0;
        p.x += sin(uTime * 0.5 + seed * 20.0) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + seed * 5.0) * uPixel * (8.0 / -mv.z);
        vAlpha = 0.35 + 0.65 * abs(sin(uTime * (0.6 + seed) + seed * 40.0));
      }`,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(1.0, 0.82, 0.5, a * vAlpha * 0.8);
      }`,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // ---- Layout & input ----
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let baseX = 0, baseY = 0, baseScale = 1;
  function layout() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const mobile = w < 800;
    baseX = mobile ? 0.9 : 2.4;
    baseY = mobile ? -2.1 : 0;
    baseScale = mobile ? 0.6 : 1;
  }
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  const clock = new THREE.Clock();
  let scrollP = 0;
  let pageP = 0;
  function tick() {
    const t = clock.getElapsedTime();
    const motion = reduced ? 0.15 : 1;
    const targetScroll = window.scrollY / window.innerHeight;
    scrollP += (targetScroll - scrollP) * 0.08;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    pageP += (window.scrollY / maxScroll - pageP) * 0.08;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    // Glass: slow turn, follows mouse, lifts away and tips as the hero scrolls out.
    const heroP = Math.min(scrollP, 1.6);
    glassPivot.position.set(baseX + mouse.x * 0.25, baseY + Math.sin(t * 0.8) * 0.12 * motion + heroP * 3.2, 0);
    glassPivot.scale.setScalar(baseScale * (1 - heroP * 0.2));
    glassPivot.rotation.y = t * 0.25 * motion + mouse.x * 0.4;
    glassPivot.rotation.z = -0.12 + mouse.x * -0.08 + heroP * 0.5;
    glassPivot.rotation.x = mouse.y * 0.12;
    // Wine sloshes opposite to the tilt.
    wine.rotation.z = Math.sin(t * 1.4) * 0.03 * motion - glassPivot.rotation.z * 0.15;

    // Pasta orbits; drifts outward and rotates with page progress.
    for (const m of pasta) {
      const d = m.userData;
      const a = d.angle + t * d.speed * motion + pageP * 2.5;
      const r = d.radius + heroP * 1.2;
      m.position.set(
        Math.cos(a) * r + baseX * 0.4,
        d.y + Math.sin(t * 0.6 + d.bob) * 0.3 * motion - pageP * 3,
        Math.sin(a) * r * 0.6 - 2.5
      );
      m.rotation.x += 0.004 * d.spin.x * (1 + motion);
      m.rotation.y += 0.004 * d.spin.y * (1 + motion);
    }

    dustMat.uniforms.uTime.value = t * motion;
    dust.rotation.y = pageP * 0.8;

    camera.position.x = mouse.x * 0.6;
    camera.position.y = -mouse.y * 0.4 - pageP * 1.5;
    camera.lookAt(0, -pageP * 1.5, 0);

    rim.intensity = 50 + Math.sin(t * 1.3) * 12;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Bow-tie pasta: a flat plane pinched in the middle with rippled edges.
function makeFarfalle() {
  const g = new THREE.PlaneGeometry(0.6, 0.36, 24, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const pinch = 0.35 + 0.65 * Math.min(1, Math.abs(x) / 0.3);
    const edge = Math.abs(x) > 0.26 ? Math.sin(y * 60) * 0.015 : 0;
    p.setY(i, y * pinch);
    p.setZ(i, Math.sin(x * 6) * 0.04 + edge + Math.cos(y * 8) * 0.02);
    p.setX(i, x + edge * 0.5);
  }
  g.computeVertexNormals();
  return g;
}
