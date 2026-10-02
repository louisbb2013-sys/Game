// Procedural Italian marble, rendered once on the GPU and returned as a 2D canvas.
// Domain-warped fractal noise produces the cloudy ground and the veins.

const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 size; uniform float seed, scale, sharp, veinAmt, angle;
uniform vec3 base, base2, vein, vein2;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float f = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 7; i++) { f += a * noise(p); p = m * p; a *= 0.5; }
  return f;
}
void main() {
  vec2 p = (vUv * size / size.y) * scale + seed;
  float ca = cos(angle), sa = sin(angle);
  p = mat2(ca, -sa, sa, ca) * p;
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2)), fbm(p + 3.5 * q + vec2(8.3, 2.8)));
  float f = fbm(p + 3.0 * r);

  // Large flowing veins + a finer secondary network.
  float v1 = 1.0 - abs(sin(p.x * 1.1 + f * 5.5 + r.y * 2.0));
  float v2 = 1.0 - abs(sin(p.y * 2.3 - p.x * 0.7 + f * 9.0 + q.x * 4.0));
  float vein1 = pow(v1, sharp) * smoothstep(-0.2, 0.35, r.x + 0.1);
  float vein2m = pow(v2, sharp * 2.5) * 0.7;
  float hair = pow(1.0 - abs(sin(p.x * 4.0 + fbm(p * 3.0) * 12.0)), sharp * 6.0) * 0.35;

  float cloud = smoothstep(-0.6, 0.6, fbm(p * 0.7 + q * 1.5));
  vec3 col = mix(base, base2, cloud);
  col = mix(col, vein2, clamp(vein2m + hair, 0.0, 1.0));
  col = mix(col, vein, clamp(vein1 * veinAmt, 0.0, 1.0));
  // Calcite crystal sparkle and fine grain.
  col += 0.025 * noise(p * 140.0) + 0.02 * pow(max(noise(p * 260.0), 0.0), 3.0) * 8.0;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const MARBLES = {
  carrara:   { base: '#ece9e4', base2: '#d9d6d1', vein: '#7e8186', vein2: '#b9babd', sharp: 14, veinAmt: 0.85, scale: 2.2, angle: 0.5 },
  calacatta: { base: '#f1ede6', base2: '#e4ddd1', vein: '#8d7b5c', vein2: '#cdbb98', sharp: 9, veinAmt: 0.95, scale: 1.6, angle: 0.9 },
  nero:      { base: '#121111', base2: '#1f1d1c', vein: '#ece6dc', vein2: '#6e675e', sharp: 22, veinAmt: 1.0, scale: 2.0, angle: -0.6 },
  rosso:     { base: '#4f1514', base2: '#77271f', vein: '#e2d6c4', vein2: '#2a0a0a', sharp: 12, veinAmt: 0.8, scale: 2.6, angle: 0.2 },
  verde:     { base: '#0d2620', base2: '#1b4134', vein: '#d6e4d6', vein2: '#04110d', sharp: 16, veinAmt: 0.9, scale: 2.4, angle: 1.2 },
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

let ctx = null;
function getCtx() {
  if (ctx) return ctx;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  ctx = { canvas, gl, p };
  return ctx;
}

// Returns a 2D canvas of the given marble. Falls back to a flat colour if WebGL2 is missing.
export function makeMarble(type, w, h, seed = 1) {
  const m = MARBLES[type];
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const c2d = out.getContext('2d');
  const c = getCtx();
  if (!c) { c2d.fillStyle = m.base; c2d.fillRect(0, 0, w, h); return out; }
  const { canvas, gl, p } = c;
  canvas.width = w; canvas.height = h;
  gl.viewport(0, 0, w, h);
  gl.useProgram(p);
  const u = (n) => gl.getUniformLocation(p, n);
  gl.uniform2f(u('size'), w, h);
  gl.uniform1f(u('seed'), seed * 17.31);
  gl.uniform1f(u('scale'), m.scale);
  gl.uniform1f(u('sharp'), m.sharp);
  gl.uniform1f(u('veinAmt'), m.veinAmt);
  gl.uniform1f(u('angle'), m.angle);
  for (const k of ['base', 'base2', 'vein', 'vein2']) gl.uniform3fv(u(k), hex(m[k]));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  c2d.drawImage(canvas, 0, 0);
  return out;
}
