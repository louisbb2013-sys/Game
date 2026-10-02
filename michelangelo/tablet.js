import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { makeMarble } from './marble.js';

// A Calacatta marble tablet with a classical inscription cut into it and
// filled with gold leaf. A warm "candle" light follows the pointer.
export async function initTablet(canvas, { reduced = false } = {}) {
  const W = 2048, H = 1024;
  await Promise.race([
    document.fonts.load('600 120px "Cormorant Garamond"'),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});

  const marble = makeMarble('calacatta', W, H, 3);
  const maps = engrave(marble, W, H);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 2, 0.1, 50);
  camera.position.set(0, 0, 9.2);

  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const front = new THREE.MeshPhysicalMaterial({
    map: tex(maps.color, true), normalMap: tex(maps.normal, false), normalScale: new THREE.Vector2(1.4, 1.4),
    roughnessMap: tex(maps.rm, false), metalnessMap: tex(maps.rm, false),
    roughness: 1, metalness: 1, clearcoat: 0.4, clearcoatRoughness: 0.18, envMapIntensity: 0.45,
  });
  const sideTex = tex(makeMarble('calacatta', 512, 256, 9), true);
  const side = new THREE.MeshPhysicalMaterial({ map: sideTex, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.45 });

  // Rounded-edge slab: extruded rounded rectangle with a bevel.
  const sw = 4.4, sh = 2.2, rad = 0.06;
  const shape = new THREE.Shape();
  shape.moveTo(-sw / 2 + rad, -sh / 2);
  shape.lineTo(sw / 2 - rad, -sh / 2); shape.quadraticCurveTo(sw / 2, -sh / 2, sw / 2, -sh / 2 + rad);
  shape.lineTo(sw / 2, sh / 2 - rad); shape.quadraticCurveTo(sw / 2, sh / 2, sw / 2 - rad, sh / 2);
  shape.lineTo(-sw / 2 + rad, sh / 2); shape.quadraticCurveTo(-sw / 2, sh / 2, -sw / 2, sh / 2 - rad);
  shape.lineTo(-sw / 2, -sh / 2 + rad); shape.quadraticCurveTo(-sw / 2, -sh / 2, -sw / 2 + rad, -sh / 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4, curveSegments: 8 });
  geo.translate(0, 0, -0.11);
  // Map front-face UVs to 0..1 across the slab so the inscription lands where drawn.
  const pos = geo.attributes.position, uv = geo.attributes.uv, nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    if (nrm.getZ(i) > 0.5) uv.setXY(i, (pos.getX(i) + sw / 2) / sw, (pos.getY(i) + sh / 2) / sh);
    else uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
  }
  // ExtrudeGeometry groups: 0 = caps (front/back), 1 = sides.
  const slab = new THREE.Mesh(geo, [front, side]);
  const group = new THREE.Group();
  group.add(slab);
  scene.add(group);

  const candle = new THREE.PointLight(0xffb86b, 22, 14, 1.6);
  candle.position.set(-1.5, 1, 2.2);
  scene.add(candle);
  const key = new THREE.DirectionalLight(0xfff1dd, 0.45);
  key.position.set(2, 3, 5);
  scene.add(key);

  const target = { x: -0.5, y: 0.4 }, cur = { x: -0.5, y: 0.4 };
  let pointerActive = false, lastMove = 0;
  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    target.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    pointerActive = true; lastMove = performance.now();
  }, { passive: true });

  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole slab in frame on narrow screens.
    const fitW = (sw * 1.15) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const fitH = (sh * 1.3) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.z = Math.max(fitW, fitH);
    camera.updateProjectionMatrix();
  }
  size();
  window.addEventListener('resize', size);

  // Dust motes drifting through the candlelight; they glow only near the flame.
  const DUST = 260;
  const dpos = new Float32Array(DUST * 3), dseed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dpos[i * 3] = (Math.random() - 0.5) * 7;
    dpos[i * 3 + 1] = (Math.random() - 0.5) * 3.6;
    dpos[i * 3 + 2] = 0.25 + Math.random() * 2.4;
    dseed[i] = Math.random();
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute('seed', new THREE.BufferAttribute(dseed, 1));
  const dmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uLight: { value: new THREE.Vector3() }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float seed; uniform float uTime, uPx; uniform vec3 uLight; varying float vA;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * (0.03 + seed * 0.05) + 1.8, 3.6) - 1.8;
        p.x += sin(uTime * 0.3 + seed * 30.0) * 0.15;
        p.z += cos(uTime * 0.25 + seed * 20.0) * 0.1;
        float d = distance(p, uLight);
        vA = (0.25 + 0.75 * abs(sin(uTime * (0.5 + seed) + seed * 50.0))) / (1.0 + d * d * 0.9);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.5 + seed * 2.5) * uPx * (9.0 / -mv.z);
      }`,
    fragmentShader: `
      varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 0.82, 0.55, smoothstep(0.5, 0.0, d) * vA); }`,
  });
  scene.add(new THREE.Points(dgeo, dmat));

  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = clock.getElapsedTime();
    if (!pointerActive || performance.now() - lastMove > 4000) {
      // Idle: the candle drifts slowly across the inscription.
      target.x = reduced ? -0.4 : Math.sin(t * 0.35) * 0.9;
      target.y = reduced ? 0.3 : 0.35 + Math.cos(t * 0.5) * 0.3;
    }
    cur.x += (target.x - cur.x) * 0.06;
    cur.y += (target.y - cur.y) * 0.06;
    candle.position.set(cur.x * 2.6, cur.y * 1.4, 3.2);
    candle.intensity = 22 + (reduced ? 0 : Math.sin(t * 7.1) * 0.6 + Math.sin(t * 13.7) * 0.4);
    // Entrance: the slab swings up from below and settles as it scrolls into view.
    const r = canvas.getBoundingClientRect();
    const enter = reduced ? 1 : THREE.MathUtils.clamp((window.innerHeight - r.top) / (window.innerHeight * 0.85), 0, 1);
    const e = 1 - Math.pow(1 - enter, 3);
    const p = THREE.MathUtils.clamp(1 - (r.top + r.height / 2) / window.innerHeight, 0, 1);
    group.rotation.y = cur.x * 0.12 + (1 - e) * 0.35;
    group.rotation.x = -cur.y * 0.08 - (1 - e) * 1.1;
    group.rotation.z = (1 - e) * -0.08;
    group.position.y = (0.5 - p) * 0.25 - (1 - e) * 0.8;
    group.position.z = -(1 - e) * 2.5;
    dmat.uniforms.uTime.value = reduced ? 0 : t;
    dmat.uniforms.uLight.value.copy(candle.position);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// Draws the inscription and derives colour, normal and roughness/metalness maps.
function engrave(marble, W, H) {
  const mask = document.createElement('canvas');
  mask.width = W; mask.height = H;
  const m = mask.getContext('2d');
  m.fillStyle = '#000'; m.fillRect(0, 0, W, H);
  m.fillStyle = '#fff'; m.strokeStyle = '#fff';
  m.textAlign = 'center'; m.textBaseline = 'middle';
  const serif = '"Cormorant Garamond", "Times New Roman", serif';
  const spaced = (txt, y, size, weight, spacing) => {
    // Shrink to fit inside the border whatever font actually loaded.
    m.font = `${weight} ${size}px ${serif}`;
    const wdt = m.measureText(txt).width + spacing * txt.length;
    if (wdt > W - 360) { size *= (W - 360) / wdt; spacing *= (W - 360) / wdt; m.font = `${weight} ${size}px ${serif}`; }
    if ('letterSpacing' in m) { m.letterSpacing = spacing + 'px'; m.fillText(txt, W / 2 + spacing / 2, y); m.letterSpacing = '0px'; }
    else m.fillText(txt.split('').join(' '), W / 2, y);
  };
  spaced('RISTORANTE', 250, 64, 600, 28);
  spaced('LE MICHELANGELO', 470, 196, 600, 14);
  m.lineWidth = 5;
  m.beginPath(); m.moveTo(W / 2 - 520, 640); m.lineTo(W / 2 - 80, 640); m.moveTo(W / 2 + 80, 640); m.lineTo(W / 2 + 520, 640); m.stroke();
  m.save(); m.translate(W / 2, 640); m.rotate(Math.PI / 4); m.fillRect(-14, -14, 28, 28); m.restore();
  spaced('MCMLXXIII', 790, 112, 600, 22);
  // Inner border line.
  m.lineWidth = 6; m.strokeRect(70, 70, W - 140, H - 140);

  const src = m.getImageData(0, 0, W, H).data;
  const a = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) a[i] = src[i * 4] / 255;
  // V-cut profile: blur the mask so the groove slopes toward its centre line.
  const hgt = boxBlur(boxBlur(a, W, H, 4), W, H, 3);

  const color = document.createElement('canvas'); color.width = W; color.height = H;
  const cc = color.getContext('2d'); cc.drawImage(marble, 0, 0);
  const cImg = cc.getImageData(0, 0, W, H), cd = cImg.data;
  const normal = document.createElement('canvas'); normal.width = W; normal.height = H;
  const nc = normal.getContext('2d'), nImg = nc.createImageData(W, H), nd = nImg.data;
  const rm = document.createElement('canvas'); rm.width = W; rm.height = H;
  const rc = rm.getContext('2d'), rImg = rc.createImageData(W, H), rd = rImg.data;

  const S = 10;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, j = i * 4;
      const l = hgt[y * W + Math.max(0, x - 1)], r = hgt[y * W + Math.min(W - 1, x + 1)];
      const u = hgt[Math.max(0, y - 1) * W + x], d = hgt[Math.min(H - 1, y + 1) * W + x];
      // Groove depth = -hgt. Normal of a height field h: (-dh/dx, -dh/dy, 1), y up.
      let nx = (r - l) * S, ny = (u - d) * S, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nd[j] = (nx / len * 0.5 + 0.5) * 255; nd[j + 1] = (ny / len * 0.5 + 0.5) * 255; nd[j + 2] = (nz / len * 0.5 + 0.5) * 255; nd[j + 3] = 255;

      const g = hgt[i];
      const gold = smooth(0.35, 0.75, g);
      // Shadowed walls of the cut, then gold leaf in the bottom.
      const shade = 1 - 0.45 * Math.min(1, g * 2.2) * (1 - gold);
      const n = (hash(x, y) - 0.5) * 18;
      cd[j] = lerp(cd[j] * shade, 196 + n, gold);
      cd[j + 1] = lerp(cd[j + 1] * shade, 150 + n * 0.8, gold);
      cd[j + 2] = lerp(cd[j + 2] * shade, 72 + n * 0.5, gold);
      rd[j] = 0;
      rd[j + 1] = lerp(0.14, 0.32 + (hash(y, x) - 0.5) * 0.1, gold) * 255 + g * 60 * (1 - gold); // roughness
      rd[j + 2] = gold * 255; // metalness
      rd[j + 3] = 255;
    }
  }
  cc.putImageData(cImg, 0, 0);
  nc.putImageData(nImg, 0, 0);
  rc.putImageData(rImg, 0, 0);
  return { color, normal, rm };
}

function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), k = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc * k;
      acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc * k;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
