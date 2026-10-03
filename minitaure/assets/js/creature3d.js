/* Minitaure 3D — construit des créatures toutes douces avec Three.js.
   Le pelage utilise la technique des « coquilles » : la même sphère est
   dessinée plusieurs fois, un peu plus grande à chaque couche, et un bruit 3D
   décide où les poils existent. Une seule InstancedMesh par pelage. */
(function () {
  if (!window.THREE) return;
  const T = THREE;

  const shared = {
    time: { value: 0 },
    light: { value: new T.Vector3(0.45, 0.85, 0.65).normalize() },
  };

  const FUR_VS = `
    attribute float aShell;
    uniform float uLen;
    uniform float uTime;
    uniform vec3 uGravity;
    varying vec3 vObjPos;
    varying vec3 vObjNormal;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    varying float vShell;
    void main() {
      vShell = aShell;
      vec3 n = normalize(normal);
      float k = aShell * aShell;
      vec3 p = position + n * uLen * aShell;
      p += uGravity * k * uLen;
      p += vec3(sin(uTime * 2.1 + position.y * 5.0), 0.0, cos(uTime * 1.7 + position.x * 5.0)) * 0.012 * k;
      vObjPos = position;
      vObjNormal = n;
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * n);
      vViewDir = normalize(cameraPosition - wp.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;

  const FUR_FS = `
    uniform vec3 uColA;
    uniform vec3 uColB;
    uniform vec3 uBelly;
    uniform float uBellyAmt;
    uniform float uSpots;
    uniform float uDensity;
    uniform float uSparkle;
    uniform float uTime;
    uniform vec3 uLight;
    uniform vec3 uRim;
    varying vec3 vObjPos;
    varying vec3 vObjNormal;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    varying float vShell;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float vnoise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
        f.z);
    }
    void main() {
      vec3 q = vObjPos * uDensity;
      float strand = vnoise(q) * 0.62 + vnoise(q * 2.3 + 7.1) * 0.38;
      if (vShell > 0.001 && strand < vShell * 0.82 + 0.1) discard;

      float spot = smoothstep(0.42, 0.62, vnoise(vObjPos * 2.4 + 3.0)) * uSpots;
      vec3 col = mix(uColA, uColB, spot);
      float belly = smoothstep(0.25, 0.85, vObjNormal.z) * smoothstep(0.75, -0.35, vObjNormal.y);
      col = mix(col, uBelly, belly * uBellyAmt * 0.9);

      col *= mix(0.5, 1.15, vShell);
      float diff = max(dot(vNormalW, uLight), 0.0) * 0.55 + 0.62;
      float rim = pow(1.0 - max(dot(vNormalW, vViewDir), 0.0), 2.2);
      col = col * diff + uRim * rim * (0.25 + 0.45 * vShell);

      if (uSparkle > 0.0) {
        float s = step(0.965, hash(floor(vObjPos * 26.0)));
        col += s * vShell * vec3(1.0, 0.95, 0.75) * (0.6 + 0.6 * sin(uTime * 3.0 + hash(floor(vObjPos * 26.0) + 3.0) * 30.0));
      }
      gl_FragColor = vec4(col, 1.0);
    }`;

  function col(c) { return new T.Color(c); }

  function furMesh(geometry, o) {
    const shells = o.shells || 18;
    const arr = new Float32Array(shells);
    for (let i = 0; i < shells; i++) arr[i] = i / (shells - 1);
    geometry.setAttribute("aShell", new T.InstancedBufferAttribute(arr, 1));
    const mat = new T.ShaderMaterial({
      uniforms: {
        uLen: { value: o.len == null ? 0.2 : o.len },
        uTime: shared.time,
        uLight: shared.light,
        uGravity: { value: o.gravity || new T.Vector3(0, -0.35, 0) },
        uColA: { value: col(o.a) },
        uColB: { value: col(o.b || o.a) },
        uBelly: { value: col(o.belly || o.a) },
        uBellyAmt: { value: o.bellyAmt == null ? 0 : o.bellyAmt },
        uSpots: { value: o.spots || 0 },
        uDensity: { value: o.density || 42 },
        uSparkle: { value: o.sparkle || 0 },
        uRim: { value: col(o.rim || "#ffffff") },
      },
      vertexShader: FUR_VS,
      fragmentShader: FUR_FS,
    });
    const mesh = new T.InstancedMesh(geometry, mat, shells);
    const id = new T.Matrix4();
    for (let i = 0; i < shells; i++) mesh.setMatrixAt(i, id);
    mesh.frustumCulled = false;
    mesh.userData.isFur = true;
    return mesh;
  }

  function std(color, extra) {
    return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0 }, extra || {}));
  }

  // Tube qui s'affine le long d'une courbe (cornes, bois, antennes…).
  function taperTube(points, r0, r1, segs, radial) {
    segs = segs || 24; radial = radial || 10;
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(p[0], p[1], p[2])));
    const g = new T.TubeGeometry(curve, segs, 1, radial, false);
    const pos = g.attributes.position;
    const v = new T.Vector3();
    for (let i = 0; i <= segs; i++) {
      const P = curve.getPointAt(i / segs);
      const r = r0 + (r1 - r0) * Math.pow(i / segs, 0.9);
      for (let j = 0; j <= radial; j++) {
        const idx = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, idx).sub(P).multiplyScalar(r).add(P);
        pos.setXYZ(idx, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
    return g;
  }

  function mirror(build) {
    const g = new T.Group();
    const l = build(1), r = build(-1);
    g.add(l, r);
    return g;
  }

  function surface(x, y, z, r) {
    return new T.Vector3(x, y, z).normalize().multiplyScalar(r || 1);
  }

  /* ---------- Parties animales ---------- */
  const PARTS = {
    horns(p) {
      return mirror((s) => {
        const g = taperTube([[0.45 * s, 0.62, 0.15], [0.8 * s, 0.85, 0.1], [0.95 * s, 1.15, 0.05], [0.82 * s, 1.38, 0.0]], 0.13, 0.01);
        return new T.Mesh(g, std(p.color, { roughness: 0.35 }));
      });
    },
    cowEars(p, ctx) {
      return mirror((s) => {
        const g = new T.SphereGeometry(0.2, 24, 16); g.scale(1.4, 0.55, 0.5);
        const m = furMesh(g, { a: p.color, b: ctx.fur.b, len: 0.05, shells: 8 });
        m.position.set(0.95 * s, 0.4, 0.05); m.rotation.z = -0.35 * s;
        ctx.anim.push((t) => { m.rotation.z = (-0.35 + Math.sin(t * 3 + s) * 0.08) * s; });
        return m;
      });
    },
    owlTufts(p, ctx) {
      return mirror((s) => {
        const g = taperTube([[0, 0, 0], [0.12 * s, 0.3, 0], [0.32 * s, 0.5, -0.02]], 0.16, 0.02, 20, 12);
        const m = furMesh(g, { a: p.color, b: ctx.fur.b, len: 0.08, shells: 10 });
        m.position.copy(surface(0.5 * s, 0.85, 0.15, 0.92)); m.rotation.z = -0.15 * s;
        return m;
      });
    },
    leaves(p) {
      const g = new T.Group();
      const stem = new T.Mesh(taperTube([[0, 0.95, 0], [0.05, 1.2, 0.02], [0.12, 1.35, 0]], 0.025, 0.015, 10, 6), std("#3b7d3a"));
      g.add(stem);
      [[0.12, 1.33, 0, 0.4], [-0.04, 1.2, 0.04, -0.7], [0.18, 1.22, -0.04, 1.1]].forEach((l, i) => {
        const lg = new T.SphereGeometry(0.16, 16, 10); lg.scale(0.55, 0.12, 1.2);
        const m = new T.Mesh(lg, std(i === 1 ? "#7fd36b" : p.color, { side: T.DoubleSide }));
        m.position.set(l[0], l[1], l[2]); m.rotation.set(0.3, l[3], 0.35);
        g.add(m);
      });
      return g;
    },
    gills(p, ctx) {
      return mirror((s) => {
        const g = new T.Group();
        for (let i = 0; i < 3; i++) {
          const a = -0.35 + i * 0.35;
          const tube = taperTube([[0, 0, 0], [0.22 * s, 0.1, 0], [0.42 * s, 0.25 + a * 0.2, -0.05]], 0.05, 0.02, 12, 8);
          const m = new T.Mesh(tube, std(p.color, { roughness: 0.4 }));
          m.rotation.z = a * s;
          for (let k = 1; k <= 3; k++) {
            const b = new T.Mesh(new T.SphereGeometry(0.035 + k * 0.006, 10, 8), std("#ffb3d4"));
            b.position.set(0.13 * k * s, 0.04 + k * 0.07, -0.02);
            m.add(b);
          }
          g.add(m);
        }
        g.position.set(0.82 * s, 0.25, 0.05);
        ctx.anim.push((t) => { g.rotation.y = Math.sin(t * 2.4 + s) * 0.18 * s; });
        return g;
      });
    },
    foxEars(p, ctx) {
      return mirror((s) => {
        const g = new T.ConeGeometry(0.26, 0.62, 24, 8); g.scale(1, 1, 0.55); g.translate(0, 0.31, 0);
        const m = furMesh(g, { a: p.color, b: p.tip, len: 0.06, shells: 10, spots: 0 });
        const tip = new T.Mesh(new T.ConeGeometry(0.1, 0.2, 16), std(p.tip));
        tip.position.y = 0.53; m.add(tip);
        m.position.copy(surface(0.5 * s, 0.85, 0.05, 0.92)); m.rotation.z = -0.45 * s;
        ctx.anim.push((t) => { m.rotation.x = Math.sin(t * 4 + s * 2) * 0.06; });
        return m;
      });
    },
    foxTail(p, ctx) {
      const g = new T.SphereGeometry(0.42, 32, 20); g.scale(0.75, 0.75, 1.5);
      const m = furMesh(g, { a: p.color, b: p.color, len: 0.12, shells: 12 });
      const tip = furMesh(new T.SphereGeometry(0.25, 24, 16), { a: p.tip, len: 0.1, shells: 10 });
      tip.position.z = -0.55; m.add(tip);
      const holder = new T.Group(); holder.add(m);
      m.position.set(0, 0.25, -0.75); m.rotation.x = -0.6;
      holder.position.set(0.15, -0.45, -0.55);
      ctx.anim.push((t) => { holder.rotation.y = Math.sin(t * 3) * 0.35; });
      return holder;
    },
    frogEyes(p, ctx) {
      return mirror((s) => {
        const bump = furMesh(new T.SphereGeometry(0.3, 28, 20), { a: p.color, b: ctx.fur.b, len: 0.06, shells: 10 });
        bump.position.set(0.42 * s, 0.82, 0.3);
        return bump;
      });
    },
    spikes(p, ctx) {
      const g = new T.Group();
      const mat = std(p.color, { emissive: new T.Color(p.color), emissiveIntensity: 0.35, roughness: 0.3 });
      const cone = new T.ConeGeometry(0.07, 0.42, 10); cone.translate(0, 0.21, 0);
      let n = 0;
      for (let i = 0; i < 70 && n < 34; i++) {
        const y = 1 - (i / 69) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = i * 2.399963;
        const d = new T.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
        if (d.z > 0.1 || d.y < -0.25) continue;
        const m = new T.Mesh(cone, mat);
        m.position.copy(d.clone().multiplyScalar(1.02));
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d);
        g.add(m); n++;
      }
      ctx.anim.push((t) => { mat.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.2; });
      return g;
    },
    batWings(p, ctx) {
      const shape = new T.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.3, 0.45, 0.75, 0.6, 1.05, 0.45);
      shape.quadraticCurveTo(0.9, 0.25, 0.95, 0.05);
      shape.quadraticCurveTo(0.75, 0.15, 0.65, -0.05);
      shape.quadraticCurveTo(0.5, 0.05, 0.38, -0.12);
      shape.quadraticCurveTo(0.2, 0.0, 0, -0.1);
      const geo = new T.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
      return mirror((s) => {
        const m = new T.Mesh(geo, std(p.color, { roughness: 0.45, side: T.DoubleSide }));
        const holder = new T.Group(); holder.add(m);
        m.scale.set(s, 1, 1);
        holder.position.set(0.78 * s, 0.15, -0.25);
        ctx.anim.push((t) => { holder.rotation.y = (0.5 + Math.sin(t * 7) * 0.45) * s; });
        return holder;
      });
    },
    catEars(p, ctx) {
      return mirror((s) => {
        const g = new T.ConeGeometry(0.26, 0.48, 3, 6); g.scale(1, 1, 0.6); g.translate(0, 0.24, 0);
        const m = furMesh(g, { a: p.color, b: ctx.fur.b, len: 0.05, shells: 9 });
        const ig = new T.ConeGeometry(0.14, 0.3, 3); ig.scale(1, 1, 0.3);
        const inner = new T.Mesh(ig, std(p.inner));
        inner.position.set(0, 0.2, 0.09); m.add(inner);
        m.position.copy(surface(0.52 * s, 0.82, 0.12, 0.92)); m.rotation.z = -0.38 * s;
        ctx.anim.push((t) => { m.rotation.z = (-0.38 + Math.max(0, Math.sin(t * 1.3 + s)) * 0.12) * s; });
        return m;
      });
    },
    antennae(p, ctx) {
      return mirror((s) => {
        const g = new T.Group();
        const tube = new T.Mesh(taperTube([[0, 0, 0], [0.12 * s, 0.35, 0.08], [0.3 * s, 0.62, 0.12]], 0.025, 0.015, 16, 6), std(p.color));
        const ball = new T.Mesh(new T.SphereGeometry(0.09, 16, 12), std(p.glow, { emissive: new T.Color(p.glow), emissiveIntensity: 1.2 }));
        ball.position.set(0.3 * s, 0.62, 0.12);
        g.add(tube, ball);
        g.position.copy(surface(0.25 * s, 0.95, 0.15, 1.0));
        ctx.anim.push((t) => { g.rotation.z = Math.sin(t * 2.2 + s) * 0.12; ball.material.emissiveIntensity = 0.9 + Math.sin(t * 3) * 0.4; });
        return g;
      });
    },
    mothWings(p, ctx) {
      const shape = new T.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.2, 0.75, 0.95, 0.85, 0.95, 0.35);
      shape.bezierCurveTo(0.95, 0.05, 0.6, -0.05, 0.75, -0.35);
      shape.bezierCurveTo(0.7, -0.7, 0.2, -0.55, 0, -0.1);
      const geo = new T.ShapeGeometry(shape, 24);
      return mirror((s) => {
        const mat = std(p.color, { side: T.DoubleSide, transparent: true, opacity: 0.85, emissive: new T.Color("#ffb7e3"), emissiveIntensity: 0.35 });
        const m = new T.Mesh(geo, mat);
        m.scale.set(1.35 * s, 1.35, 1);
        const dot = new T.Mesh(new T.CircleGeometry(0.13, 20), std("#a98bff", { side: T.DoubleSide, emissive: new T.Color("#a98bff"), emissiveIntensity: 0.5 }));
        dot.position.set(0.55, 0.38, 0.01); m.add(dot);
        const holder = new T.Group(); holder.add(m);
        holder.position.set(0.55 * s, 0.25, -0.45);
        ctx.anim.push((t) => { holder.rotation.y = (-0.25 + Math.sin(t * 3.2) * 0.3) * s; });
        return holder;
      });
    },
    bunnyEars(p, ctx) {
      return mirror((s) => {
        const g = new T.SphereGeometry(0.2, 28, 18); g.scale(1, 3.1, 0.55); g.translate(0, 0.55, 0);
        const m = furMesh(g, { a: p.color, b: ctx.fur.b, len: 0.05, shells: 10 });
        const ig = new T.SphereGeometry(0.12, 20, 12); ig.scale(1, 3.4, 0.3);
        const inner = new T.Mesh(ig, std(p.inner));
        inner.position.set(0, 0.55, 0.1); m.add(inner);
        const holder = new T.Group(); holder.add(m);
        holder.position.copy(surface(0.32 * s, 0.92, 0.05, 0.9));
        holder.rotation.z = -0.22 * s;
        ctx.anim.push((t) => { m.rotation.x = Math.sin(t * 2 + s) * 0.08 - 0.12; m.rotation.z = s > 0 ? Math.max(0, Math.sin(t * 0.9)) * -0.5 : 0; });
        return holder;
      });
    },
    puffTail(p) {
      const m = furMesh(new T.SphereGeometry(0.22, 24, 16), { a: p.color, len: 0.1, shells: 10 });
      m.position.set(0, -0.35, -1.0);
      return m;
    },
    antlers(p) {
      return mirror((s) => {
        const g = new T.Group();
        const mat = std(p.color, { roughness: 0.6 });
        g.add(new T.Mesh(taperTube([[0, 0, 0], [0.12 * s, 0.35, 0], [0.3 * s, 0.7, -0.05], [0.42 * s, 0.95, -0.05]], 0.06, 0.025), mat));
        g.add(new T.Mesh(taperTube([[0.12 * s, 0.38, 0], [0.0, 0.62, 0.02], [-0.02 * s, 0.78, 0.03]], 0.04, 0.02, 12, 8), mat));
        g.add(new T.Mesh(taperTube([[0.3 * s, 0.7, -0.05], [0.45 * s, 0.72, 0.0], [0.6 * s, 0.82, 0.0]], 0.035, 0.018, 12, 8), mat));
        g.position.copy(surface(0.32 * s, 0.92, 0.05, 0.97));
        g.userData.tips = [new T.Vector3(0.42 * s, 0.95, -0.05), new T.Vector3(-0.02 * s, 0.78, 0.03)];
        return g;
      });
    },
    deerEars(p, ctx) {
      return mirror((s) => {
        const g = new T.SphereGeometry(0.18, 24, 16); g.scale(1.6, 0.6, 0.45);
        const m = furMesh(g, { a: p.color, b: ctx.fur.b, len: 0.04, shells: 8 });
        m.position.set(0.92 * s, 0.5, 0.1); m.rotation.z = -0.5 * s;
        ctx.anim.push((t) => { m.rotation.z = (-0.5 + Math.sin(t * 2.5 + s * 3) * 0.1) * s; });
        return m;
      });
    },
    flowers(p, ctx) {
      const g = new T.Group();
      const len = ctx.fur.len;
      const spots = [[0.45, 0.85, 0.35, "#ff8fbf"], [-0.2, 0.95, 0.3, p.color], [-0.55, 0.72, 0.25, "#ffffff"]];
      spots.forEach((f) => {
        const fl = new T.Group();
        const c = new T.Mesh(new T.SphereGeometry(0.045, 12, 8), std("#ffb000"));
        fl.add(c);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const pg = new T.SphereGeometry(0.05, 10, 8); pg.scale(1, 0.4, 1.4);
          const pm = new T.Mesh(pg, std(f[3]));
          pm.position.set(Math.cos(a) * 0.065, 0, Math.sin(a) * 0.065);
          pm.rotation.y = -a + Math.PI / 2;
          fl.add(pm);
        }
        const pos = surface(f[0], f[1], f[2], 1 + len * 0.8);
        fl.position.copy(pos);
        fl.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), pos.clone().normalize());
        fl.scale.setScalar(1.5);
        g.add(fl);
      });
      return g;
    },
    beak(p, ctx) {
      const g = new T.ConeGeometry(0.13, 0.26, 20); g.rotateX(Math.PI / 2);
      const m = new T.Mesh(g, std(p.color, { roughness: 0.35 }));
      m.position.copy(surface(0, -0.05, 1, 1 + ctx.fur.len * 0.95));
      return m;
    },
    tinyWings(p, ctx) {
      return mirror((s) => {
        const g = new T.SphereGeometry(0.22, 24, 16); g.scale(0.5, 1, 1.1);
        const m = furMesh(g, { a: p.color, b: ctx.fur.b, len: 0.06, shells: 9 });
        const holder = new T.Group(); holder.add(m);
        m.position.set(0.1 * s, -0.2, 0);
        holder.position.set(0.95 * s, 0.05, -0.05);
        ctx.anim.push((t) => { holder.rotation.z = (0.2 + Math.max(0, Math.sin(t * 9)) * 0.5 * Math.max(0, Math.sin(t * 0.8))) * s; });
        return holder;
      });
    },
    crest(p) {
      const g = new T.Group();
      [-0.12, 0, 0.12].forEach((x, i) => {
        const m = new T.Mesh(taperTube([[x, 0.95, 0.05], [x * 1.4, 1.2, 0.0], [x * 2.2 - 0.05, 1.38 - Math.abs(x), -0.12]], 0.05, 0.015, 12, 8), std(p.color));
        g.add(m);
      });
      return g;
    },
    catTail(p, ctx) {
      const geo = taperTube([[0, -0.4, -0.9], [0.35, -0.3, -1.3], [0.55, 0.15, -1.25], [0.45, 0.55, -1.05], [0.25, 0.65, -0.95]], 0.12, 0.06, 32, 12);
      const m = furMesh(geo, { a: p.color, b: ctx.fur.b, len: 0.05, shells: 9, sparkle: 1 });
      const holder = new T.Group(); holder.add(m);
      ctx.anim.push((t) => { holder.rotation.y = Math.sin(t * 1.8) * 0.25; });
      return holder;
    },
    halo(p, ctx) {
      const g = new T.Group();
      const ring = new T.Mesh(new T.TorusGeometry(0.45, 0.035, 12, 48), std(p.color, { emissive: new T.Color(p.color), emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2 - 0.65;
      g.add(ring);
      for (let i = 0; i < 4; i++) {
        const st = new T.Mesh(new T.OctahedronGeometry(0.06), std("#ffffff", { emissive: new T.Color("#ffe9a8"), emissiveIntensity: 1 }));
        g.add(st);
        ctx.anim.push((t) => {
          const a = t * 1.2 + (i * Math.PI) / 2;
          st.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.11, Math.sin(a) * 0.45);
          st.rotation.y = t * 3;
        });
      }
      g.position.y = 1.55;
      ctx.anim.push((t) => { g.position.y = 1.55 + Math.sin(t * 2) * 0.06; g.rotation.y = t * 0.6; });
      return g;
    },
  };

  /* ---------- Visage ---------- */
  function face(ctx, data) {
    const g = new T.Group();
    const len = data.fur.len;
    const frog = data.parts.some((p) => p.type === "frogEyes");
    const eyeMat = std("#07051a", { roughness: 0.08, metalness: 0.2 });
    const whiteMat = new T.MeshBasicMaterial({ color: "#ffffff" });
    const eyes = [];
    [1, -1].forEach((s) => {
      const e = new T.Group();
      const r = frog ? 0.16 : 0.18;
      const ball = new T.Mesh(new T.SphereGeometry(r, 24, 18), eyeMat);
      const hi = new T.Mesh(new T.SphereGeometry(r * 0.32, 12, 10), whiteMat);
      hi.position.set(-0.05 * s - 0.03, 0.06, r * 0.82);
      const hi2 = new T.Mesh(new T.SphereGeometry(r * 0.14, 8, 8), whiteMat);
      hi2.position.set(0.05, -0.05, r * 0.9);
      e.add(ball, hi, hi2);
      if (frog) e.position.set(0.42 * s, 0.98, 0.52);
      else e.position.copy(surface(0.34 * s, 0.14, 0.93, 1 + len * 0.42));
      g.add(e); eyes.push(e);
    });
    const blushMat = new T.MeshBasicMaterial({ color: "#ff7fa8", transparent: true, opacity: 0.55, depthWrite: false });
    [1, -1].forEach((s) => {
      const b = new T.Mesh(new T.CircleGeometry(0.1, 20), blushMat);
      const pos = surface(0.55 * s, -0.12, 0.83, 1 + len * 0.62);
      b.position.copy(pos);
      b.lookAt(pos.clone().multiplyScalar(2));
      b.scale.set(1.3, 0.8, 1);
      g.add(b);
    });
    if (!data.parts.some((p) => p.type === "beak")) {
      const mouth = new T.Mesh(new T.TorusGeometry(0.075, 0.02, 8, 20, Math.PI), std("#2a1530"));
      const mp = surface(0, -0.12, 1, 1 + len * 0.5);
      mouth.position.copy(mp);
      mouth.rotation.z = Math.PI;
      g.add(mouth);
    }
    // clignement
    let next = 1 + Math.random() * 3;
    ctx.anim.push((t) => {
      const ph = t - next;
      let sy = 1;
      if (ph > 0 && ph < 0.16) sy = Math.max(0.08, Math.abs(ph - 0.08) / 0.08);
      else if (ph >= 0.16) next = t + 2 + Math.random() * 4;
      eyes.forEach((e) => { e.scale.y = sy; });
    });
    return g;
  }

  /* ---------- Créature complète ---------- */
  function createCreature(data, opts) {
    opts = opts || {};
    const ctx = { anim: [], fur: data.fur };
    const root = new T.Group();       // position / rotation globale
    const squash = new T.Group();     // écrasement élastique
    const body = new T.Group();
    root.add(squash); squash.add(body);

    const f = data.fur;
    const bodyGeo = new T.SphereGeometry(1, opts.segments || 64, opts.segments ? Math.round(opts.segments * 0.75) : 48);
    const fur = furMesh(bodyGeo, {
      a: f.a, b: f.b, belly: f.belly, bellyAmt: 1, len: f.len, spots: f.spots,
      shells: opts.shells || 22, sparkle: f.sparkle || 0, rim: data.accent || "#ffffff",
    });
    body.add(fur);
    body.add(face(ctx, data));
    data.parts.forEach((p) => {
      const fn = PARTS[p.type];
      if (fn) body.add(fn(p, ctx));
    });
    body.scale.set(1, 0.94, 1);

    const st = { sq: 0, v: 0, hop: 0, hopT: -10, look: new T.Vector2(), lookCur: new T.Vector2(), phase: Math.random() * 10 };
    const api = {
      data, group: root, body, ctx,
      idle: opts.idle !== false,
      hops: !!opts.hops,
      squish(amount) { st.v += amount == null ? 7 : amount; },
      hop() { st.hopT = st.t || 0; },
      lookAt(x, y) { st.look.set(x, y); },
      update(t, dt) {
        st.t = t;
        dt = Math.min(dt || 0.016, 0.05);
        const tt = t + st.phase;
        ctx.anim.forEach((fn) => fn(tt));
        // ressort d'écrasement
        const k = 160, d = 9;
        const a = -k * st.sq - d * st.v;
        st.v += a * dt; st.sq += st.v * dt;
        // petits sauts aléatoires
        if (api.hops && t - st.hopT > 4 + (st.phase % 3)) { if (Math.random() < 0.01) st.hopT = t; }
        let y = 0;
        const hp = t - st.hopT;
        if (hp >= 0 && hp < 0.6) {
          y = Math.sin((hp / 0.6) * Math.PI) * 0.55;
          if (hp > 0.56 && !st.landed) { st.v -= 4; st.landed = true; }
        } else st.landed = false;
        const breathe = api.idle ? Math.sin(tt * 2.2) * 0.025 : 0;
        const s = st.sq + breathe;
        squash.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
        squash.position.y = y + (api.idle ? Math.sin(tt * 1.6) * 0.04 : 0) - s * 0.5;
        st.lookCur.lerp(st.look, 0.06);
        body.rotation.y = st.lookCur.x * 0.6;
        body.rotation.x = -st.lookCur.y * 0.35;
      },
    };
    return api;
  }

  function addLights(scene) {
    scene.add(new T.HemisphereLight("#ffffff", "#5a3fa8", 0.85));
    const key = new T.DirectionalLight("#fff3e6", 0.9);
    key.position.set(3, 5, 4); scene.add(key);
    const rim = new T.DirectionalLight("#9fd8ff", 0.6);
    rim.position.set(-4, 2, -3); scene.add(rim);
  }

  function supported() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  function disposeTree(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  /* ---------- Portraits (images générées une seule fois) ---------- */
  let pr = null;
  const cache = {};
  const VERSION = "v5";
  function portrait(data, size) {
    size = size || 360;
    const key = `mini-portrait-${VERSION}-${data.id}-${size}`;
    if (cache[key]) return cache[key];
    try { const s = localStorage.getItem(key); if (s) return (cache[key] = s); } catch (e) {}
    if (!supported()) return null;
    if (!pr) {
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.outputEncoding = T.sRGBEncoding;
      const scene = new T.Scene();
      addLights(scene);
      const camera = new T.PerspectiveCamera(32, 1, 0.1, 50);
      pr = { renderer, scene, camera };
    }
    pr.renderer.setSize(size, size, false);
    const c = createCreature(data, { shells: 24 });
    c.idle = false;
    c.update(1.3, 0.016);
    c.group.rotation.y = -0.32;
    c.group.rotation.x = 0.08;
    const tall = data.parts.some((p) => ["horns", "bunnyEars", "antlers", "halo", "antennae"].includes(p.type));
    const wide = data.parts.some((p) => ["batWings", "mothWings", "gills"].includes(p.type));
    pr.camera.position.set(0, tall ? 0.55 : 0.25, tall || wide ? 6.8 : 5.9);
    pr.camera.lookAt(0, tall ? 0.38 : 0.08, 0);
    pr.scene.add(c.group);
    shared.time.value = 1.3;
    pr.renderer.render(pr.scene, pr.camera);
    const url = pr.renderer.domElement.toDataURL("image/png");
    pr.scene.remove(c.group);
    disposeTree(c.group);
    cache[key] = url;
    try { localStorage.setItem(key, url); } catch (e) {}
    return url;
  }

  // Remplit progressivement les <img data-portrait="id"> de la page.
  function fillPortraits(root) {
    const imgs = Array.from((root || document).querySelectorAll("img[data-portrait]:not([data-done])"));
    let i = 0;
    function step() {
      const start = performance.now();
      while (i < imgs.length && performance.now() - start < 30) {
        const img = imgs[i++];
        const d = window.MINI.creature(img.dataset.portrait);
        if (!d) continue;
        const url = portrait(d, +img.dataset.size || 360);
        img.dataset.done = "1";
        if (url) { img.src = url; img.classList.add("ready"); }
        else img.parentElement && img.parentElement.classList.add("no-webgl");
      }
      if (i < imgs.length) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Visionneuse interactive (glisser pour tourner, toucher pour écraser) ---------- */
  function viewer(container, data, opts) {
    opts = opts || {};
    if (!supported()) { container.classList.add("no-webgl"); return { dispose() {} }; }
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    container.appendChild(renderer.domElement);
    const scene = new T.Scene();
    addLights(scene);
    const camera = new T.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.5, 7.6);
    camera.lookAt(0, 0.22, 0);
    const c = createCreature(data, { shells: 26 });
    c.hops = !!opts.hops;
    scene.add(c.group);

    // petit socle lumineux
    const disc = new T.Mesh(new T.CircleGeometry(1.2, 48), new T.MeshBasicMaterial({ color: data.accent || "#a98bff", transparent: true, opacity: 0.22 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -1.05;
    scene.add(disc);

    let rotY = -0.3, velY = 0, dragging = false, lastX = 0, moved = 0;
    const el = renderer.domElement;
    el.style.touchAction = "pan-y";
    el.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; moved = 0; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      c.lookAt(((e.clientX - r.left) / r.width - 0.5) * 1.2, -((e.clientY - r.top) / r.height - 0.5) * 1.2);
      if (!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
      velY = dx * 0.01; rotY += velY;
    });
    el.addEventListener("pointerup", () => { dragging = false; if (moved < 6) { c.squish(9); if (opts.onSquish) opts.onSquish(); } });
    el.addEventListener("pointerleave", () => c.lookAt(0, 0));

    function resize() {
      const w = container.clientWidth, h = container.clientHeight || w;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container); else window.addEventListener("resize", resize);
    resize();

    const clock = new T.Clock();
    let raf = 0, alive = true;
    function loop() {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta(), t = clock.elapsedTime;
      if (!dragging) { velY *= 0.94; rotY += velY + (opts.autoRotate === false ? 0 : 0.004); }
      c.group.rotation.y = rotY;
      shared.time.value = t;
      c.update(t, dt);
      renderer.render(scene, camera);
    }
    loop();
    return {
      creature: c,
      dispose() {
        alive = false; cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        disposeTree(scene); renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
        el.remove();
      },
    };
  }

  window.Mini3D = { createCreature, furMesh, std, taperTube, addLights, supported, portrait, fillPortraits, viewer, disposeTree, shared };
})();
