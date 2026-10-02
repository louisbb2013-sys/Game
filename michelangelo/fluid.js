// Real-time red-wine fluid simulation (stable fluids on the GPU, WebGL2).
// Pointer movement stirs the wine; on load it is "poured" in from the top.

const VS = `#version 300 es
precision highp float;
in vec2 aPos;
uniform vec2 texel;
out vec2 vUv, vL, vR, vT, vB;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texel.x, 0.0); vR = vUv + vec2(texel.x, 0.0);
  vT = vUv + vec2(0.0, texel.y); vB = vUv - vec2(0.0, texel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB;
out vec4 o;
`;

const FS = {
  splat: `
uniform sampler2D uTarget; uniform float aspect; uniform vec3 color; uniform vec2 point; uniform float radius;
void main() {
  vec2 p = vUv - point; p.x *= aspect;
  o = vec4(texture(uTarget, vUv).xyz + exp(-dot(p, p) / radius) * color, 1.0);
}`,
  advect: `
uniform sampler2D uVelocity, uSource; uniform vec2 simTexel; uniform float dt, dissipation;
void main() {
  vec2 c = vUv - dt * texture(uVelocity, vUv).xy * simTexel;
  o = texture(uSource, c) / (1.0 + dissipation * dt); o.a = 1.0;
}`,
  divergence: `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x, R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y, B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,
  curl: `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y, R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x, B = texture(uVelocity, vB).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,
  vorticity: `
uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
void main() {
  float L = texture(uCurl, vL).x, R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x, B = texture(uCurl, vB).x, C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 0.0001; f *= curl * C; f.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + f * dt;
  o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,
  pressure: `
uniform sampler2D uPressure, uDivergence;
void main() {
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  o = vec4((L + R + B + T - texture(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`,
  gradient: `
uniform sampler2D uPressure, uVelocity;
void main() {
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  o = vec4(v, 0.0, 1.0);
}`,
  scale: `
uniform sampler2D uTexture; uniform float value;
void main() { o = value * texture(uTexture, vUv); }`,
  // Shades the dye field as a glossy liquid surface: density -> height -> normal.
  display: `
uniform sampler2D uDye; uniform vec2 res; uniform float time;
float raw(vec2 uv) { return texture(uDye, uv).r; }
// Compressed height so dense pools stay smooth instead of speckled.
float h(vec2 uv) { return 1.0 - exp(-raw(uv) * 0.9); }
void main() {
  float d = raw(vUv);
  vec2 e = vec2(2.5) / res;
  float dx = h(vUv + vec2(e.x, 0.0)) - h(vUv - vec2(e.x, 0.0));
  float dy = h(vUv + vec2(0.0, e.y)) - h(vUv - vec2(0.0, e.y));
  vec3 n = normalize(vec3(-dx * 2.6, -dy * 2.6, 1.0));

  // Background: warm near-black with a soft vignette.
  vec2 q = vUv - vec2(0.62, 0.55);
  vec3 bg = mix(vec3(0.050, 0.030, 0.026), vec3(0.020, 0.012, 0.010), smoothstep(0.1, 0.95, length(q)));

  // Wine body: thin film is translucent ruby, depth goes to black-garnet.
  float cover = 1.0 - exp(-d * 3.0);
  float depth = 1.0 - exp(-d * 0.9);
  vec3 rim = vec3(0.62, 0.07, 0.11);
  vec3 core = vec3(0.17, 0.008, 0.025);
  vec3 wine = mix(rim, core, depth);

  vec3 L1 = normalize(vec3(-0.45, 0.55, 0.70));
  vec3 L2 = normalize(vec3(0.6, -0.2, 0.75));
  float diff = 0.55 + 0.45 * max(dot(n, L1), 0.0);
  float spec = pow(max(dot(n, normalize(L1 + vec3(0, 0, 1))), 0.0), 140.0);
  float spec2 = pow(max(dot(n, normalize(L2 + vec3(0, 0, 1))), 0.0), 60.0) * 0.25;
  float fres = pow(1.0 - n.z, 2.0);

  vec3 col = mix(bg, wine * diff, cover);
  col += cover * (spec * vec3(1.0, 0.92, 0.86) * 1.3 + spec2 * vec3(1.0, 0.6, 0.5));
  col += cover * fres * vec3(0.55, 0.12, 0.14) * 0.6;
  // Subtle film grain to avoid banding.
  float g = fract(sin(dot(vUv * res + time, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.012;
  o = vec4(pow(col, vec3(0.92)), 1.0);
}`,
};

export function initFluid(canvas, { reduced = false } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: false, depth: false, stencil: false, antialias: false });
  if (!gl) throw new Error('WebGL2 unavailable');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('Float render targets unavailable');
  gl.getExtension('OES_texture_float_linear');

  const SIM = 128, DYE = window.innerWidth < 700 ? 512 : 1024;
  const cfg = { velDiss: 0.25, dyeDiss: 0.18, curl: 10, pressureIters: 22, pressureDecay: 0.8 };

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VS);
  function program(fsBody) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + fsBody));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }
  const P = Object.fromEntries(Object.entries(FS).map(([k, src]) => [k, program(src)]));

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function fbo(w, h, internal, format) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, tx: 1 / w, ty: 1 / h };
  }
  function double(w, h, internal, format) {
    let a = fbo(w, h, internal, format), b = fbo(w, h, internal, format);
    return { w, h, tx: a.tx, ty: a.ty, get read() { return a; }, get write() { return b; }, swap() { [a, b] = [b, a]; } };
  }
  function res(r) {
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const max = Math.round(r * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? [max, r] : [r, max];
  }

  let velocity, dye, divergence, curl, pressure;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width === w && canvas.height === h && velocity) return;
    canvas.width = w; canvas.height = h;
    const [sw, sh] = res(SIM), [dw, dh] = res(DYE);
    velocity = double(sw, sh, gl.RG16F, gl.RG);
    dye = double(dw, dh, gl.RGBA16F, gl.RGBA);
    divergence = fbo(sw, sh, gl.R16F, gl.RED);
    curl = fbo(sw, sh, gl.R16F, gl.RED);
    pressure = double(sw, sh, gl.R16F, gl.RED);
  }
  resize();
  window.addEventListener('resize', resize);

  function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); return unit; }
  function blit(target, prog, texel) {
    gl.useProgram(prog.p);
    gl.uniform2f(prog.u.texel, texel[0], texel[1]);
    if (target) { gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function splat(x, y, dx, dy, amount, radius = 0.0022) {
    const aspect = canvas.width / canvas.height;
    const s = P.splat;
    gl.useProgram(s.p);
    gl.uniform1f(s.u.aspect, aspect);
    gl.uniform2f(s.u.point, x, y);
    gl.uniform1f(s.u.radius, aspect > 1 ? radius * aspect : radius);
    gl.uniform1i(s.u.uTarget, bindTex(0, velocity.read.tex));
    gl.uniform3f(s.u.color, dx, dy, 0);
    blit(velocity.write, s, [velocity.tx, velocity.ty]);
    velocity.swap();
    gl.useProgram(s.p);
    gl.uniform1i(s.u.uTarget, bindTex(0, dye.read.tex));
    gl.uniform3f(s.u.color, amount, 0, 0);
    blit(dye.write, s, [dye.tx, dye.ty]);
    dye.swap();
  }

  function step(dt) {
    const vt = [velocity.tx, velocity.ty];
    let p = P.curl; gl.useProgram(p.p);
    gl.uniform1i(p.u.uVelocity, bindTex(0, velocity.read.tex)); blit(curl, p, vt);

    p = P.vorticity; gl.useProgram(p.p);
    gl.uniform1i(p.u.uVelocity, bindTex(0, velocity.read.tex));
    gl.uniform1i(p.u.uCurl, bindTex(1, curl.tex));
    gl.uniform1f(p.u.curl, cfg.curl); gl.uniform1f(p.u.dt, dt);
    blit(velocity.write, p, vt); velocity.swap();

    p = P.divergence; gl.useProgram(p.p);
    gl.uniform1i(p.u.uVelocity, bindTex(0, velocity.read.tex)); blit(divergence, p, vt);

    p = P.scale; gl.useProgram(p.p);
    gl.uniform1i(p.u.uTexture, bindTex(0, pressure.read.tex)); gl.uniform1f(p.u.value, cfg.pressureDecay);
    blit(pressure.write, p, vt); pressure.swap();

    p = P.pressure; gl.useProgram(p.p);
    gl.uniform1i(p.u.uDivergence, bindTex(0, divergence.tex));
    for (let i = 0; i < cfg.pressureIters; i++) {
      gl.uniform1i(p.u.uPressure, bindTex(1, pressure.read.tex));
      blit(pressure.write, p, vt); pressure.swap();
    }

    p = P.gradient; gl.useProgram(p.p);
    gl.uniform1i(p.u.uPressure, bindTex(0, pressure.read.tex));
    gl.uniform1i(p.u.uVelocity, bindTex(1, velocity.read.tex));
    blit(velocity.write, p, vt); velocity.swap();

    p = P.advect; gl.useProgram(p.p);
    gl.uniform2f(p.u.simTexel, velocity.tx, velocity.ty);
    gl.uniform1f(p.u.dt, dt);
    gl.uniform1i(p.u.uVelocity, bindTex(0, velocity.read.tex));
    gl.uniform1i(p.u.uSource, bindTex(0, velocity.read.tex));
    gl.uniform1f(p.u.dissipation, cfg.velDiss);
    blit(velocity.write, p, vt); velocity.swap();

    gl.useProgram(p.p);
    gl.uniform1i(p.u.uVelocity, bindTex(0, velocity.read.tex));
    gl.uniform1i(p.u.uSource, bindTex(1, dye.read.tex));
    gl.uniform1f(p.u.dissipation, cfg.dyeDiss);
    blit(dye.write, p, [dye.tx, dye.ty]); dye.swap();
  }

  function render(t) {
    const p = P.display; gl.useProgram(p.p);
    gl.uniform1i(p.u.uDye, bindTex(0, dye.read.tex));
    gl.uniform2f(p.u.res, dye.w, dye.h);
    gl.uniform1f(p.u.time, t % 100);
    blit(null, p, [dye.tx, dye.ty]);
  }

  // ---- Input: stir with mouse / finger ----
  let last = null;
  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) { last = null; return; }
    if (last) {
      const aspect = r.width / r.height;
      let dx = x - last.x, dy = y - last.y;
      if (aspect < 1) dx *= aspect; else dy /= aspect;
      const speed = Math.hypot(dx, dy);
      if (speed > 0.0005) queue.push([x, y, dx * 5000, dy * 5000, Math.min(0.16, 0.04 + speed * 4)]);
    }
    last = { x, y };
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerleave', () => { last = null; });

  // ---- The pour: a thin stream falls from the top, then pools ----
  const queue = [];
  const pourStart = performance.now() + 300;
  const POUR_MS = reduced ? 0 : 2600;
  let nextAmbient = performance.now() + 4500;
  if (reduced) {
    for (let i = 0; i < 6; i++) queue.push([0.55 + Math.random() * 0.3, 0.3 + Math.random() * 0.4, 0, 0, 0.9, 0.02]);
  }

  // Pause when off-screen.
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  let prev = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - prev) / 1000, 1 / 60);
    prev = now;
    if (!visible) return;
    resize();

    const tp = now - pourStart;
    if (tp > 0 && tp < POUR_MS) {
      const k = tp / POUR_MS;
      const x = 0.66 + Math.sin(tp * 0.004) * 0.012 + k * 0.02;
      splat(x, 0.99, Math.sin(tp * 0.01) * 40, -800, 0.5, 0.0011);
      if (k > 0.25) splat(x + (Math.random() - 0.5) * 0.04, 0.38 + Math.random() * 0.06, (Math.random() - 0.5) * 500, -120, 0.12, 0.004);
    }
    if (!reduced && now > nextAmbient) {
      nextAmbient = now + 3000 + Math.random() * 3000;
      const a = Math.random() * Math.PI * 2;
      queue.push([0.45 + Math.random() * 0.45, 0.25 + Math.random() * 0.5, Math.cos(a) * 300, Math.sin(a) * 300, 0.1, 0.004]);
    }
    while (queue.length) { const s = queue.shift(); splat(...s); }

    step(dt);
    render(now / 1000);
  }
  requestAnimationFrame(frame);
}
