/** Renderers for the new layer types. Character is about 2.9 units tall. */
import * as THREE from 'three';
import { getProceduralTexture } from '../../aura/textures';
import { getLayerVariant, WEAPON_FORMATIONS, type ExtraEffectType } from '../../aura/variants';
import {
  TAU, addMesh, applyCommon, createSolids, createSprites, createStrips, fadeInOut, fract,
  mergeParts, rand, shapeGeometry, surfaceMaterial, type Builder, type Kit,
} from './kit';

const v3 = () => new THREE.Vector3();
const int = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));
const UP = new THREE.Vector3(0, 1, 0);

// ============================================================ 1. wings
const wings: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const feathers = int(kit.layer.settings.particleCount, 3, 32);
  const membrane = variant === 'demon' || variant === 'butterfly';
  const sides = [-1, 1].map((sign) => {
    const pivot = new THREE.Group();
    const mirror = new THREE.Group();
    mirror.scale.x = sign;
    pivot.add(mirror);
    kit.group.add(pivot);
    return { sign, pivot, mirror };
  });

  const parts: { mesh: THREE.Mesh; index: number }[] = [];
  let material: THREE.ShaderMaterial;
  let strips: ReturnType<typeof createStrips> | null = null;

  if (variant === 'energy' || variant === 'phoenix') {
    strips = createStrips(kit, feathers * 2, 28);
  }

  if (variant === 'demon') {
    // Scalloped membrane stretched between four finger bones (unit wingspan).
    const outline: [number, number][] = [
      [0, 0], [0.3, 0.34], [0.55, 0.5], [1, 0.42], [0.82, 0.24], [0.9, -0.12], [0.66, -0.02],
      [0.62, -0.42], [0.42, -0.2], [0.28, -0.52], [0.16, -0.18],
    ];
    material = surfaceMaterial(kit, {
      fragment: `float vein = fbm(vec3(vPos.xy * 7.0, uTime * 0.2));
        float bones = 0.0;
        vec2 root = vec2(0.55, 0.5);
        vec2 tips[4]; tips[0] = vec2(1.0, 0.42); tips[1] = vec2(0.9, -0.12); tips[2] = vec2(0.62, -0.42); tips[3] = vec2(0.28, -0.52);
        for (int i = 0; i < 4; i++) { vec2 pa = vPos.xy - root, ba = tips[i] - root;
          float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
          bones = max(bones, 1.0 - smoothstep(0.006, 0.022 * (1.2 - h), length(pa - ba * h))); }
        vec2 pa = vPos.xy, ba = root; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        bones = max(bones, 1.0 - smoothstep(0.015, 0.045, length(pa - ba * h)));
        color = mix(uColorB, uColorA * 0.55, vein * vein) ;
        color = mix(color, uColorA * 1.4, bones);
        alpha = mix(0.8, 1.0, bones);`,
    });
    for (const side of sides) {
      const mesh = addMesh(kit, shapeGeometry(outline), material, side.mirror);
      parts.push({ mesh, index: 0 });
    }
  } else if (variant === 'butterfly') {
    const upper = new THREE.Shape();
    upper.moveTo(0, 0);
    upper.bezierCurveTo(0.15, 0.75, 0.95, 0.85, 1, 0.45);
    upper.bezierCurveTo(1.02, 0.1, 0.55, -0.02, 0, 0);
    const lower = new THREE.Shape();
    lower.moveTo(0, 0);
    lower.bezierCurveTo(0.55, -0.02, 0.82, -0.3, 0.6, -0.58);
    lower.bezierCurveTo(0.36, -0.82, 0.04, -0.4, 0, 0);
    material = surfaceMaterial(kit, {
      fragment: `float d = length(vPos.xy);
        float vein = pow(abs(sin(atan(vPos.y, vPos.x) * 14.0 + noise3(vec3(vPos.xy * 4.0, 0.0)) * 2.0)), 14.0);
        float spot = smoothstep(0.1, 0.07, length(vPos.xy - vec2(0.68, 0.42))) + smoothstep(0.07, 0.05, length(vPos.xy - vec2(0.43, -0.4)));
        float shimmer = noise3(vec3(vPos.xy * 6.0, uTime * 0.8));
        color = mix(uColorA, uColorB, smoothstep(0.15, 0.95, d)) + vein * 0.5 + spot * 0.9;
        alpha = 0.38 + vein * 0.4 + spot * 0.5 + shimmer * 0.18 + smoothstep(0.75, 1.05, d) * 0.35;`,
    });
    for (const side of sides) {
      for (const [index, shape] of [upper, lower].entries()) {
        parts.push({ mesh: addMesh(kit, new THREE.ShapeGeometry(shape, 24), material, side.mirror), index });
      }
    }
  } else if (!strips) {
    // Blade-like feathers, pointing along +X from the shoulder.
    const outline: [number, number][] = variant === 'mechanical'
      ? [[0, 0.07], [0.72, 0.1], [1, 0], [0.7, -0.06], [0.12, -0.07]]
      : variant === 'crystal'
        ? [[0, 0], [0.35, 0.11], [1, 0], [0.4, -0.09]]
        : [[0, 0.02], [0.2, 0.1], [0.7, 0.09], [0.94, 0.04], [1, -0.02], [0.8, -0.07], [0.3, -0.08], [0, -0.03]];
    material = surfaceMaterial(kit, {
      depthWrite: kit.layer.blendMode === 'normal',
      fragment: variant === 'mechanical'
        ? `float edge = 1.0 - smoothstep(0.008, 0.02, abs(vPos.y + 0.025));
           float pulse = pow(0.5 + 0.5 * sin(vPos.x * 12.0 - uTime * 4.0), 8.0);
           color = mix(uColorB * 0.7, uColorB * 1.2, smoothstep(-0.07, 0.1, vPos.y)) + uColorA * edge * (0.7 + pulse * 1.4);
           alpha = 1.0;`
        : variant === 'crystal'
          ? `float facet = step(0.0, vPos.y + sin(vPos.x * 9.0) * 0.02);
             float glint = pow(0.5 + 0.5 * sin(vPos.x * 7.0 - uTime * 2.5), 12.0);
             color = mix(uColorB, uColorA, vPos.x * 0.6 + facet * 0.4) + glint;
             alpha = 0.45 + facet * 0.2 + glint * 0.4;`
          : `float shaft = 1.0 - smoothstep(0.003, 0.012, abs(vPos.y));
             float barbs = 0.82 + 0.18 * sin((vPos.x - abs(vPos.y) * 2.0) * 90.0);
             color = mix(uColorB, uColorA, smoothstep(0.1, 0.8, vPos.x)) * barbs + shaft * 0.35;
             alpha = 0.85 * smoothstep(1.02, 0.75, vPos.x) + 0.1;`,
    });
    const blade = kit.track(shapeGeometry(outline));
    for (const side of sides) {
      for (let i = 0; i < feathers; i++) {
        const mesh = new THREE.Mesh(blade, material);
        mesh.frustumCulled = false;
        side.mirror.add(mesh);
        parts.push({ mesh, index: i });
      }
    }
  }

  return (f) => {
    const span = f.s.radius * f.objScale;
    const flap = Math.sin(f.t * 2.1) * (0.1 + f.s.turbulence * 0.18) * f.mod;
    for (const { sign, pivot } of sides) {
      pivot.position.set(sign * 0.18, 0, 0);
      pivot.rotation.set(f.s.tilt * 0.3, sign * (0.32 + flap), 0);
    }
    if (strips) {
      const phoenix = variant === 'phoenix';
      strips.update(
        f,
        (r, u, out) => {
          const sign = r % 2 ? 1 : -1;
          const k = Math.floor(r / 2) / Math.max(1, feathers - 1);
          const len = span * (1.15 - k * 0.55);
          const lift = 0.95 - k * 1.55 + flap * 1.2 * (1 - k * 0.5);
          const flick = Math.sin(u * 8 - f.t * 5 + r) * u * (phoenix ? 0.12 : 0.05);
          out.set(
            sign * (0.2 + len * Math.sin(u * 1.45) * Math.cos(lift * 0.6)),
            0.15 - k * 0.3 + len * (Math.sin(lift) * u - u * u * 0.5 * (0.35 + k)) + flick,
            -u * u * 0.55 - Math.abs(flap) * u - k * 0.05,
          );
        },
        (r, u) => f.objScale * (phoenix ? 0.2 : 0.11) * Math.sin(Math.min(1, u * 0.85 + 0.12) * Math.PI) * (1 - Math.floor(r / 2) / feathers * 0.3),
      );
      return;
    }
    for (const { mesh, index } of parts) {
      if (membrane) {
        mesh.scale.setScalar(span);
        if (variant === 'butterfly') mesh.rotation.y = index ? flap * 0.7 : -flap * 0.25;
      } else {
        const k = index / Math.max(1, feathers - 1);
        const angle = 1.0 - k * 2.0 + flap * (1 - k * 0.6);
        const length = span * (1.05 - k * 0.45) * (variant === 'angel' ? 0.85 + Math.sin(k * Math.PI) * 0.35 : 1);
        const spreadOut = variant === 'mechanical' ? 0.5 : 0.28;
        mesh.position.set(Math.cos(angle) * spreadOut, Math.sin(angle) * spreadOut + (variant === 'crystal' ? Math.sin(f.t * 1.6 + index) * 0.06 : 0), -index * 0.012);
        mesh.rotation.set(0, 0, angle);
        mesh.scale.set(length, span * (variant === 'angel' ? 0.95 : 0.8), 1);
      }
    }
    applyCommon(material, f);
  };
};

// ============================================================ 2. halos & crowns
const halos: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const count = int(kit.layer.settings.particleCount, 3, 32);
  const root = new THREE.Group();
  kit.group.add(root);
  const glow = surfaceMaterial(kit, {
    fragment: `float pulse = 0.8 + 0.35 * sin(vUv.x * 25.0 - uTime * 3.0);
      color = mix(uColorA, uColorB, pow(1.0 - facing, 2.0)) * pulse + pow(facing, 4.0) * 0.4;
      alpha = 0.95;`,
  });
  const torus = (radius: number, tube: number) => {
    const m = addMesh(kit, new THREE.TorusGeometry(radius, tube, 12, 80), glow, root);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  const rings: THREE.Mesh[] = [];
  let solids: ReturnType<typeof createSolids> | null = null;
  const solidKit: Kit = { ...kit, group: root };

  if (variant === 'halo') rings.push(torus(1, 0.07), torus(0.78, 0.018));
  else if (variant === 'triple_halo') rings.push(torus(1, 0.045), torus(0.76, 0.035), torus(0.52, 0.03));
  else if (variant === 'spike_crown') {
    rings.push(torus(1, 0.06));
    solids = createSolids(solidKit, new THREE.ConeGeometry(0.14, 0.75, 4), count);
  } else if (variant === 'horns') {
    // Curved, tapering horn built from a tube.
    const curve = new THREE.CubicBezierCurve3(v3().set(0, 0, 0), v3().set(0.55, 0.1, 0), v3().set(0.75, 0.65, 0.1), v3().set(0.45, 1.15, 0.35));
    const tube = new THREE.TubeGeometry(curve, 32, 0.2, 10, false);
    const p = tube.attributes.position;
    for (let s = 0; s <= 32; s++) {
      const c = curve.getPointAt(s / 32);
      for (let r = 0; r <= 10; r++) {
        const i = s * 11 + r;
        const k = 1 - (s / 32) * 0.95;
        p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
      }
    }
    solids = createSolids(solidKit, tube, 2, false);
  } else if (variant === 'sun_disc') {
    rings.push(torus(0.62, 0.035), torus(0.5, 0.012));
    solids = createSolids(solidKit, new THREE.ConeGeometry(0.07, 0.7, 4), count);
  } else if (variant === 'floating_crown') {
    rings.push(torus(1, 0.022));
    solids = createSolids(solidKit, new THREE.OctahedronGeometry(0.17, 0).scale(0.7, 1.5, 0.7), count);
  } else {
    rings.push(torus(1, 0.075));
    solids = createSolids(solidKit, new THREE.ConeGeometry(0.06, 0.34, 4), count * 2);
  }

  const q = new THREE.Quaternion();
  const dir = v3();
  return (f) => {
    const r = f.s.radius * f.objScale;
    root.scale.setScalar(r);
    root.position.y = Math.sin(f.t * 1.7) * 0.04;
    root.rotation.set(variant === 'sun_disc' || variant === 'horns' ? 0 : f.s.tilt, 0, 0);
    if (variant === 'sun_disc') root.position.z = -0.55;
    rings.forEach((m, i) => {
      if (variant === 'sun_disc') m.rotation.x = 0;
      if (variant === 'triple_halo') {
        m.position.y = i * 0.28;
        m.rotation.set(Math.PI / 2 + Math.sin(f.t * 1.3 + i * 2) * 0.28, Math.cos(f.t + i) * 0.22, 0);
      }
    });
    const spin = f.t * (f.layer.animation.rotationSpeed.y || 0.6);
    solids?.update(f, (i, o) => {
      if (variant === 'horns') {
        const sign = i ? 1 : -1;
        o.position.set(sign * 0.55, -0.25, 0);
        o.scale.set(sign, 1, 1);
      } else if (variant === 'sun_disc') {
        const a = (i / count) * TAU + spin * 0.5;
        const len = (i % 2 ? 0.65 : 1.1) * (0.9 + f.mod * 0.1);
        o.position.set(Math.cos(a) * (0.68 + len * 0.35), Math.sin(a) * (0.68 + len * 0.35), 0);
        o.rotation.z = a - Math.PI / 2;
        o.scale.set(1, len, 0.35);
      } else if (variant === 'thorns') {
        const a = (i / (count * 2)) * TAU + spin * 0.3;
        o.position.set(Math.cos(a), (rand(i, 1) - 0.5) * 0.14, Math.sin(a));
        dir.set(Math.cos(a) * (rand(i, 2) - 0.2), rand(i, 3) - 0.3, Math.sin(a) * (rand(i, 2) - 0.2)).normalize();
        o.quaternion.copy(q.setFromUnitVectors(UP, dir));
      } else {
        const a = (i / count) * TAU + spin;
        const tall = variant === 'spike_crown' ? (i % 2 ? 0.65 : 1) : 1;
        const bob = variant === 'floating_crown' ? 0.3 + Math.sin(f.t * 2 + i) * 0.1 : 0.37 * tall;
        o.position.set(Math.cos(a), bob, Math.sin(a));
        o.rotation.y = -a;
        o.scale.set(1, tall, 1);
      }
    });
    applyCommon(glow, f);
  };
};

// ============================================================ 3. magic circles
const CIRCLE_PATTERNS: Record<string, string> = {
  arcane: `
    float rr = r;
    alpha = ln(rr - 0.96, 0.008) + ln(rr - 0.9, 0.004) + ln(rr - 0.7, 0.006) + ln(rr - 0.34, 0.005);
    alpha += glyphs(a01 + uTime * 0.02, rr, 0.73, 0.87, 30.0);
    float t1 = poly(rot(p, uTime * 0.15), 3.0), t2 = poly(rot(p, -uTime * 0.15 + 1.047), 3.0);
    alpha += ln(t1 - 0.35, 0.006) * step(rr, 0.7) + ln(t2 - 0.35, 0.006) * step(rr, 0.7);
    alpha += ln(length(abs(rot(p, -uTime * 0.25)) - vec2(0.36)) - 0.09, 0.006) + glyphs(a01 - uTime * 0.05, rr, 0.22, 0.3, 12.0);`,
  summoning: `
    float sector = 6.28318 / 5.0; float spin = ang + uTime * 0.2;
    float star = 0.0;
    for (int i = 0; i < 5; i++) {
      float a0 = float(i) * sector - uTime * 0.2, a1 = float(i + 2) * sector - uTime * 0.2;
      vec2 s0 = vec2(cos(a0), sin(a0)) * 0.82, s1 = vec2(cos(a1), sin(a1)) * 0.82;
      vec2 pa = p - s0, ba = s1 - s0; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      star = max(star, ln(length(pa - ba * h), 0.007));
      star = max(star, ln(length(p - s0) - 0.075, 0.006));
    }
    alpha = star + ln(r - 0.82, 0.01) + ln(r - 0.97, 0.006) + glyphs(a01 + uTime * 0.03, r, 0.85, 0.94, 40.0) + ln(r - 0.2, 0.006);`,
  hex_array: `
    vec2 g = rot(p, uTime * 0.08) * 7.0; vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(g, s) - s * 0.5, b = mod(g - s * 0.5, s) - s * 0.5;
    vec2 c = dot(a, a) < dot(b, b) ? a : b; vec2 id = g - c;
    float edge = 0.5 - max(abs(c.x), dot(abs(c), s * 0.5));
    float wave = pow(0.5 + 0.5 * sin(length(id) * 1.4 - uTime * 3.0), 6.0);
    float on = step(r, 0.88);
    alpha = (1.0 - smoothstep(0.02, 0.07, edge)) * on * (0.35 + wave) + wave * on * 0.2
          + ln(poly(rot(p, -uTime * 0.1), 6.0) - 0.82, 0.012) + ln(r - 0.97, 0.006);`,
  lotus: `
    alpha = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i); float n = 8.0 + fi * 4.0;
      float a = ang + uTime * (0.12 + fi * 0.05) * (mod(fi, 2.0) * 2.0 - 1.0);
      float petal = (0.34 + fi * 0.22) + 0.2 * pow(abs(cos(a * n * 0.5)), 0.6);
      alpha += ln(r - petal, 0.008) + smoothstep(petal, petal - 0.2, r) * step(petal - 0.2, r) * 0.22;
    }
    alpha += ln(r - 0.16, 0.012) + ln(r - 0.98, 0.005);`,
  clock_face: `
    float ticks = ln(fract(a01 * 60.0) - 0.5, 0.12) * step(0.86, r) * step(r, 0.92);
    float hours = ln(fract(a01 * 12.0) - 0.5, 0.05) * step(0.74, r) * step(r, 0.92);
    vec2 h1 = rot(p, uTime * 1.2), h2 = rot(p, uTime * 0.1);
    float hand1 = ln(h1.x, 0.012) * step(0.0, h1.y) * step(h1.y, 0.72);
    float hand2 = ln(h2.x, 0.022) * step(0.0, h2.y) * step(h2.y, 0.45);
    alpha = ticks + hours + hand1 + hand2 + ln(r - 0.96, 0.01) + ln(r - 0.72, 0.004) + ln(r - 0.05, 0.015)
          + glyphs(a01 - uTime * 0.04, r, 0.52, 0.64, 18.0);`,
  pulse_grid: `
    float sweep = pow(fract((ang + uTime * 1.6) / 6.28318), 5.0);
    float waves = pow(fract(r * 2.0 - uTime * 0.8), 10.0);
    float grid = ln(fract(r * 4.0) - 0.5, 0.025) + ln(sin(ang * 6.0) * r, 0.008);
    float blip = step(0.9, h31(vec3(floor(p * 9.0), 1.0))) * smoothstep(0.35, 0.1, length(fract(p * 9.0) - 0.5)) * sweep * 3.0;
    alpha = (grid * 0.45 + sweep * 0.55 + waves * 0.5 + blip) * step(r, 0.96) + ln(r - 0.97, 0.008);`,
  abyss_pool: `
    float swirl = ang + r * 5.0 - uTime * 0.9;
    float n = fbm(vec3(cos(swirl) * r * 3.0, sin(swirl) * r * 3.0, uTime * 0.25));
    float edge = smoothstep(0.98, 0.7, r + (n - 0.5) * 0.35);
    float vein = pow(clamp(1.0 - abs(n - 0.52) * 8.0, 0.0, 1.0), 2.0);
    color = mix(uColorB, uColorA, vein + smoothstep(0.55, 0.95, r)) ;
    alpha = edge * (0.82 + vein * 0.18);`,
};

const circles: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const material = surfaceMaterial(kit, {
    fragmentPars: /* glsl */ `
      float ln(float d, float w) { float aa = fwidth(d) + 0.0008; return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
      vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c) * p; }
      float poly(vec2 p, float n) { float s = 6.28318 / n; float a = mod(atan(p.x, p.y), s) - s * 0.5; return length(p) * cos(a); }
      float glyphs(float a01, float r, float r0, float r1, float cells) {
        float c = a01 * cells; vec2 g = vec2((fract(c) - 0.2) / 0.6, (r - r0) / (r1 - r0));
        if (g.x <= 0.0 || g.x >= 1.0 || g.y <= 0.0 || g.y >= 1.0) return 0.0;
        vec2 k = g * 3.0; vec2 cell = floor(k); vec2 d = abs(fract(k) - 0.5);
        float seed = mod(floor(c), cells) * 17.0 + cell.x * 3.0 + cell.y * 11.0;
        return step(0.42, h31(vec3(seed))) * (h31(vec3(seed + 5.0)) > 0.5 ? 1.0 - smoothstep(0.1, 0.2, d.y) : 1.0 - smoothstep(0.1, 0.2, d.x));
      }`,
    fragment: `
      vec2 p = vUv * 2.0 - 1.0; float r = length(p); float ang = atan(p.y, p.x); float a01 = ang / 6.28318 + 0.5;
      if (r > 1.0) discard;
      color = mix(uColorA, uColorB, smoothstep(0.25, 0.95, r));
      ${CIRCLE_PATTERNS[variant]}
      ${variant === 'abyss_pool' ? '' : 'alpha += exp(-abs(r - 0.93) * 14.0) * 0.14;'}`,
  });
  const mesh = addMesh(kit, new THREE.PlaneGeometry(2, 2), material);
  mesh.rotation.x = -Math.PI / 2;
  return (f) => {
    mesh.scale.setScalar(f.s.radius * f.objScale * (0.96 + f.mod * 0.04));
    kit.group.rotation.set(f.layer.rotation.x + f.s.tilt, f.layer.rotation.y, f.layer.rotation.z);
    mesh.rotation.z = f.t * f.layer.animation.rotationSpeed.y * 0.35;
    applyCommon(material, f);
  };
};

// ============================================================ 4. floating weapons
/** All weapons point along +Y with unit length. */
function weaponGeometry(kind: string): THREE.BufferGeometry {
  const box = (w: number, h: number, d: number, y: number, x = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, 0);
  const flat = (pts: [number, number][], depth = 0.035) => shapeGeometry(pts, depth);
  switch (kind) {
    case 'daggers':
      return mergeParts([flat([[-0.08, -0.05], [0.08, -0.05], [0.05, 0.28], [0, 0.45], [-0.05, 0.28]]), box(0.28, 0.05, 0.07, -0.07), box(0.06, 0.2, 0.06, -0.19)]);
    case 'spears':
      return mergeParts([box(0.045, 1.1, 0.045, -0.15), flat([[0, 0.7], [0.1, 0.45], [0.03, 0.38], [-0.03, 0.38], [-0.1, 0.45]]), box(0.18, 0.035, 0.07, 0.36)]);
    case 'scythes':
      return mergeParts([box(0.05, 1.1, 0.05, -0.05), flat([[0, 0.55], [0.22, 0.58], [0.48, 0.42], [0.58, 0.14], [0.4, 0.34], [0.18, 0.42], [0, 0.4]])]);
    case 'axes':
      return mergeParts([
        box(0.065, 0.95, 0.065, -0.05),
        flat([[0.03, 0.38], [0.3, 0.52], [0.38, 0.3], [0.3, 0.08], [0.03, 0.22]], 0.05),
        flat([[-0.03, 0.38], [-0.3, 0.52], [-0.38, 0.3], [-0.3, 0.08], [-0.03, 0.22]], 0.05),
        new THREE.ConeGeometry(0.06, 0.18, 4).translate(0, 0.52, 0),
      ]);
    case 'arrows':
      return mergeParts([
        box(0.025, 0.7, 0.025, 0), new THREE.ConeGeometry(0.065, 0.18, 4).translate(0, 0.42, 0),
        flat([[0, -0.2], [0.09, -0.38], [0.09, -0.45], [0, -0.33], [-0.09, -0.45], [-0.09, -0.38]], 0.01),
      ]);
    default:
      return mergeParts([
        flat([[-0.065, -0.2], [0.065, -0.2], [0.055, 0.5], [0, 0.65], [-0.055, 0.5]]),
        box(0.34, 0.055, 0.09, -0.22), box(0.055, 0.22, 0.055, -0.35),
        new THREE.OctahedronGeometry(0.055, 0).translate(0, -0.49, 0),
      ]);
  }
}

const weapons: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const count = int(kit.layer.settings.particleCount, 1, 48);
  const formation = kit.layer.settings.formation ?? WEAPON_FORMATIONS[0];
  const solids = createSolids(kit, weaponGeometry(variant), count);
  const flares = createSprites(kit, count, getProceduralTexture('soft_orb'));
  const at = Array.from({ length: count }, v3);
  const size = new Float32Array(count);
  return (f) => {
    const r = f.s.radius;
    const spin = f.t * (f.layer.animation.rotationSpeed.y || 0.6);
    solids.update(f, (i, o) => {
      let alive = 1;
      const bob = Math.sin(f.t * 1.8 + i * 1.3) * 0.07 * (1 + f.s.turbulence);
      if (formation === 'back_fan') {
        const k = count > 1 ? i / (count - 1) : 0.5;
        const a = (k - 0.5) * Math.PI * 1.35;
        o.position.set(Math.sin(a) * r * 0.85, Math.cos(a) * r * 0.75 - 0.25 + bob, -0.62 - Math.abs(k - 0.5) * 0.1);
        o.rotation.z = -a + (f.s.reverseDirection ? Math.PI : 0);
      } else if (formation === 'orbit') {
        const a = (i / count) * TAU + spin;
        o.position.set(Math.cos(a) * r, bob * 2 + Math.sin(a * 2) * f.s.spread * 0.15, Math.sin(a) * r);
        o.rotation.set(0, -a + Math.PI / 2, f.s.reverseDirection ? 0 : Math.PI);
        o.rotateZ(f.s.tilt);
      } else if (formation === 'guard_ring') {
        const a = (i / count) * TAU + spin * 0.4;
        o.position.set(Math.cos(a) * r, -0.9 + bob, Math.sin(a) * r);
        o.rotation.set(0, -a + Math.PI / 2, Math.PI);
        o.rotateX(f.s.tilt * 0.6);
      } else if (formation === 'sword_rain') {
        const cycle = f.t * (0.35 + rand(i, 1) * 0.3) + rand(i, 2);
        const age = fract(cycle);
        const k = Math.floor(cycle) % 53;
        const a = rand(i, k) * TAU;
        const d = r * (0.45 + rand(i, k + 1) * 0.7);
        const fall = Math.min(1, age * 1.7);
        o.position.set(Math.cos(a) * d, (1 - fall * fall) * f.s.spread * 2 - 1.1, Math.sin(a) * d);
        o.rotation.set(0, a, Math.PI);
        alive = fadeInOut(age, 0.1);
      } else {
        const a = (i / count) * TAU + spin;
        o.position.set(Math.cos(a) * r * 0.75, 1.75 + bob, Math.sin(a) * r * 0.75);
        o.rotation.set(0, -a, Math.PI / 2);
      }
      const s = f.objScale * alive * (0.9 + f.mod * 0.1);
      o.scale.setScalar(s);
      at[i].copy(o.position);
      size[i] = s;
    });
    flares.update(f, (i, p) => {
      p.x = at[i].x; p.y = at[i].y; p.z = at[i].z;
      p.size = size[i] * 0.9;
      p.alpha = 0.16 * f.s.glow;
      p.mix = 0.5;
    });
  };
};

// ============================================================ 5. singularity & portals
const singularity: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const additiveKit: Kit = { ...kit, layer: { ...kit.layer, blendMode: 'additive' } };
  const normalKit: Kit = { ...kit, layer: { ...kit.layer, blendMode: 'normal' } };
  const root = new THREE.Group();
  kit.group.add(root);
  const materials: THREE.ShaderMaterial[] = [];
  const plane = (m: THREE.ShaderMaterial, parent: THREE.Object3D = root) => {
    materials.push(m);
    return addMesh(kit, new THREE.PlaneGeometry(2, 2), m, parent);
  };
  const polar = 'vec2 p = vUv * 2.0 - 1.0; float r = length(p); float ang = atan(p.y, p.x); if (r > 1.0) discard;';

  if (variant === 'black_hole' || variant === 'eclipse') {
    const core = surfaceMaterial(normalKit, {
      depthWrite: true,
      fragment: 'color = vec3(0.0); alpha = 1.0;',
    });
    const coreMesh = addMesh(kit, new THREE.SphereGeometry(variant === 'eclipse' ? 0.5 : 0.3, 40, 28), core, root);
    coreMesh.renderOrder = 1;
    materials.push(core);
    const rimKit = variant === 'eclipse' ? additiveKit : kit;
    const rim = surfaceMaterial(rimKit, {
      side: THREE.BackSide,
      vertex: `vUv = uv; vPos = position; vec4 mv = modelViewMatrix * vec4(position * 1.18, 1.0);
        vView = -mv.xyz; vNormalV = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv;`,
      fragment: 'color = mix(uColorB, uColorA, facing) * 1.6; alpha = smoothstep(0.0, 0.55, facing);',
    });
    materials.push(rim);
    addMesh(kit, new THREE.SphereGeometry(variant === 'eclipse' ? 0.5 : 0.3, 40, 28), rim, root);
  }

  const disc = variant === 'black_hole' ? plane(surfaceMaterial(kit, {
    fragment: `${polar}
      float swirl = ang + 3.4 / (r + 0.25) + uTime * 1.4;
      float n = fbm(vec3(cos(swirl) * 3.0, sin(swirl) * 3.0, r * 7.0));
      float band = smoothstep(0.26, 0.4, r) * smoothstep(1.0, 0.45, r);
      color = mix(uColorA * 1.7, uColorB, smoothstep(0.32, 0.8, r)) + pow(n, 4.0);
      alpha = band * smoothstep(0.2, 0.75, n) * 1.4 + smoothstep(0.05, 0.0, abs(r - 0.34));`,
  })) : null;

  const face = variant === 'eclipse' ? plane(surfaceMaterial(additiveKit, {
    fragment: `${polar}
      float n = fbm(vec3(cos(ang) * 4.0, sin(ang) * 4.0, uTime * 0.35 - r * 2.0));
      float flare = exp(-max(r - 0.5, 0.0) * (8.0 - n * 7.0)) * step(0.47, r) * smoothstep(1.0, 0.6, r);
      color = mix(uColorB, uColorA, exp(-(r - 0.5) * 7.0)); alpha = flare * (0.5 + n);`,
  })) : variant === 'portal' ? plane(surfaceMaterial(kit, {
    fragment: `${polar}
      float swirl = ang * 1.0 + r * 7.0 - uTime * 2.0;
      float n = fbm(vec3(cos(swirl) * 2.2, sin(swirl) * 2.2, r * 3.0 - uTime * 0.6));
      float rim = exp(-abs(r - 0.82 + (n - 0.5) * 0.18) * 20.0);
      color = mix(uColorB * 0.6, uColorA, smoothstep(0.35, 0.75, n)) + rim * 1.3;
      alpha = smoothstep(0.92, 0.7, r) * (0.55 + n * 0.5) + rim;`,
  })) : variant === 'spiral_galaxy' ? plane(surfaceMaterial(kit, {
    fragment: `${polar}
      float arms = pow(0.5 + 0.5 * sin(ang * 3.0 - log(r + 0.05) * 9.0 + uTime * 0.9), 2.0);
      float dust = fbm(vec3(p * 7.0, uTime * 0.1));
      vec2 cell = floor(p * 42.0); float h = h31(vec3(cell, 3.0));
      float star = step(0.94, h) * smoothstep(0.5, 0.1, length(fract(p * 42.0) - 0.5)) * (0.6 + 0.4 * sin(uTime * 3.0 + h * 80.0));
      float core = exp(-r * 7.0);
      color = mix(uColorA, uColorB, smoothstep(0.05, 0.8, r)) + core + star * 1.5;
      alpha = (arms * dust * 1.3 + star) * smoothstep(1.0, 0.45, r) + core;`,
  })) : null;

  let tunnel: THREE.Mesh | null = null;
  if (variant === 'wormhole') {
    const m = surfaceMaterial(kit, {
      fragment: `float depth = vUv.y;
        float swirl = vUv.x * 6.28318 * 6.0 + depth * 14.0 - uTime * 4.0;
        float n = fbm(vec3(vUv.x * 18.0, depth * 7.0 - uTime * 1.6, uTime * 0.2));
        float stripe = pow(0.5 + 0.5 * sin(swirl + n * 3.0), 5.0);
        color = mix(uColorB, uColorA, stripe) + pow(stripe, 4.0) * 0.4;
        alpha = (stripe * 0.75 + n * 0.25) * sin(depth * 3.14159);`,
    });
    materials.push(m);
    tunnel = addMesh(kit, new THREE.CylinderGeometry(1, 0.18, 1, 64, 32, true), m, root);
  }

  const dustCount = int(kit.layer.settings.particleCount, 1, 600);
  const dust = createSprites({ ...additiveKit, group: root }, dustCount, getProceduralTexture('soft_orb'));
  return (f) => {
    const r = f.s.radius * f.objScale;
    root.scale.setScalar(r * (0.96 + f.mod * 0.04));
    if (disc) disc.rotation.set(-Math.PI / 2 + 0.18 + f.s.tilt, 0, 0);
    if (face) {
      if (variant === 'spiral_galaxy') face.rotation.set(-Math.PI / 2 + f.s.tilt, 0, 0);
      else face.rotation.set(0, 0, variant === 'portal' ? 0 : f.t * 0.1);
    }
    if (tunnel) {
      tunnel.rotation.x = Math.PI / 2;
      tunnel.scale.set(1, f.s.spread / Math.max(0.1, f.s.radius), 1);
      tunnel.position.z = -f.s.spread / Math.max(0.1, f.s.radius) / 2;
    }
    for (const m of materials) applyCommon(m, f);
    dust.update(f, (i, p) => {
      const age = fract(f.t * (0.18 + rand(i, 1) * 0.3) + rand(i, 2));
      const d = 1.25 - age * 0.95;
      const a = rand(i, 3) * TAU + age * 5 + f.t * 0.4;
      p.x = Math.cos(a) * d;
      if (variant === 'black_hole' || variant === 'spiral_galaxy') {
        p.z = Math.sin(a) * d;
        p.y = (rand(i, 4) - 0.5) * 0.15 * d - p.z * Math.tan(variant === 'black_hole' ? 0.18 + f.s.tilt : f.s.tilt);
      } else {
        p.y = Math.sin(a) * d;
        p.z = (rand(i, 4) - 0.5) * 0.3 + 0.03;
      }
      p.size = 0.035 + rand(i, 5) * 0.05;
      p.alpha = fadeInOut(age, 0.25);
      p.mix = rand(i, 6);
    });
  };
};

// ============================================================ 6. flames & smoke
const flames: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const soft = variant === 'smoke' || variant === 'mist';
  const count = int(kit.layer.settings.particleCount, 8, 600);
  const material = surfaceMaterial(kit, {
    side: THREE.DoubleSide,
    vertex: /* glsl */ `
      vUv = uv; vPos = position;
      float h = uv.y;
      float a = atan(position.z, position.x);
      float n = fbm(vec3(cos(a) * 2.2, h * 3.0 - uTime * 2.6, sin(a) * 2.2));
      float shape = mix(1.0, 0.18, h * h) * (1.0 + (n - 0.45) * (0.35 + uTurbulence * 0.7) * (0.35 + h));
      vec3 p = vec3(position.x * shape, position.y, position.z * shape);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vView = -mv.xyz; vNormalV = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mv;
    `,
    fragment: `
      float a = atan(vPos.z, vPos.x);
      float n = fbm(vec3(cos(a) * 3.4, vUv.y * 3.6 - uTime * 3.2, sin(a) * 3.4));
      float tongue = smoothstep(0.34 + vUv.y * 0.3, 0.72 + vUv.y * 0.2, n);
      float edge = smoothstep(0.02, 0.55, facing);
      color = mix(uColorA, uColorB, clamp(vUv.y * 1.2 - tongue * 0.3, 0.0, 1.0)) * (1.0 + tongue * 0.6);
      alpha = tongue * edge * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.0, 0.12, vUv.y);
      ${variant === 'surge' ? 'float bolt = pow(clamp(1.0 - abs(noise3(vec3(a * 6.0, vUv.y * 2.0 - uTime * 9.0, 1.0)) - 0.5) * 9.0, 0.0, 1.0), 3.0); alpha += bolt * (1.0 - vUv.y) * 0.8; color += bolt;' : ''}`,
  });
  const shells = soft ? [] : [1, 0.72].map(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 56, 32, true);
    g.translate(0, 0.5, 0);
    return addMesh(kit, g, material);
  });
  const puffs = createSprites(kit, count, getProceduralTexture(soft ? kit.layer.textureRef : 'soft_orb'));
  return (f) => {
    const r = f.s.radius * f.objScale;
    const h = f.s.spread * f.objScale * (0.9 + f.mod * 0.1);
    shells.forEach((m, i) => {
      m.scale.set(r * (i ? 0.72 : 1), h * (i ? 0.78 : 1), r * (i ? 0.72 : 1));
      m.rotation.y = f.t * (i ? -0.7 : 0.45);
    });
    applyCommon(material, f);
    puffs.update(f, (i, p) => {
      const life = Math.max(0.3, f.s.lifetime * (0.6 + rand(i, 1) * 0.8));
      const age = fract(f.t / life + rand(i, 2));
      const a = rand(i, 3) * TAU + age * (soft ? 1.2 : 2.4);
      const d = r * Math.sqrt(rand(i, 4));
      if (variant === 'mist') {
        const dd = d * (0.5 + age);
        p.x = Math.cos(a) * dd; p.z = Math.sin(a) * dd; p.y = 0.12 + age * 0.3 + rand(i, 5) * 0.2;
        p.size = (0.6 + age * 1.1) * f.objScale;
      } else if (soft) {
        p.x = Math.cos(a) * d * (0.5 + age * 0.7); p.z = Math.sin(a) * d * (0.5 + age * 0.7); p.y = age * h;
        p.size = (0.35 + age * 1.0) * f.objScale;
      } else {
        const dd = d * (1 - age * 0.6);
        p.x = Math.cos(a) * dd; p.z = Math.sin(a) * dd; p.y = age * h * 1.15;
        p.size = (0.12 + rand(i, 6) * 0.14) * (1 - age) * f.objScale * 1.4;
        if (variant === 'surge') { p.dy = 0.4; p.size *= 0.7; }
      }
      p.rot = rand(i, 7) * TAU + f.t * (rand(i, 8) - 0.5);
      p.mix = age;
      p.alpha = fadeInOut(age, 0.25) * (soft ? 0.5 : 0.8);
    });
  };
};

// ============================================================ 7. weather
const weather: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const count = int(kit.layer.settings.particleCount, 5, 1500);
  const fixed: Record<string, Parameters<typeof getProceduralTexture>[0]> = { rain: 'spark_streak', ash: 'soft_orb', digital_rain: 'pixel_block' };
  const sprites = createSprites(kit, count, getProceduralTexture(fixed[variant] ?? kit.layer.textureRef));
  return (f) => {
    const { radius: r, spread, turbulence } = f.s;
    const fall: Record<string, number> = { rain: 3.8, snow: 0.55, petals: 0.65, leaves: 0.75, ash: 0.35, bubbles: -0.55, confetti: 0.9, digital_rain: 1.7 };
    const speed = fall[variant] ?? 1;
    const height = Math.max(0.5, spread * 2);
    sprites.update(f, (i, p) => {
      const v = speed * (0.7 + rand(i, 1) * 0.6);
      const age = fract(rand(i, 2) + (f.t * v) / height);
      let d = r * Math.sqrt(rand(i, 3));
      let a = rand(i, 4) * TAU;
      if (variant === 'digital_rain') {
        const column = Math.floor(i / 8);
        a = rand(column, 4) * TAU;
        d = r * (0.45 + rand(column, 3) * 0.65);
        const head = fract(rand(column, 2) + (f.t * speed * (0.6 + rand(column, 1))) / height);
        const k = i % 8;
        p.x = Math.cos(a) * d; p.z = Math.sin(a) * d;
        p.y = (1 - head) * height + k * 0.17 - 0.2;
        p.size = 0.13 * f.objScale;
        p.alpha = (1 - k / 8) * fadeInOut(head, 0.08) * (rand(i, Math.floor(f.t * 10) % 31) > 0.2 ? 1 : 0.3);
        p.mix = k / 8;
        return;
      }
      p.x = Math.cos(a) * d;
      p.z = Math.sin(a) * d;
      p.y = speed < 0 ? age * height : (1 - age) * height;
      const sway = variant === 'rain' ? 0.02 : 0.2 + turbulence * 0.3;
      p.x += Math.sin(f.t * (0.8 + rand(i, 5)) + i) * sway;
      p.z += Math.cos(f.t * (0.7 + rand(i, 6)) + i * 2) * sway;
      p.alpha = fadeInOut(age, 0.08);
      p.mix = rand(i, 7);
      p.size = (0.08 + rand(i, 8) * 0.08) * f.objScale;
      if (variant === 'rain') { p.dy = -0.55; p.dx = turbulence * 0.08; p.size *= 0.7; p.mix = 0.4; }
      else if (variant === 'snow') p.rot = f.t * (rand(i, 9) - 0.5) * 2 + i;
      else if (variant === 'ash') { p.size *= 0.55; p.alpha *= 0.55 + 0.45 * Math.sin(f.t * 5 + i); p.mix = rand(i, 7) > 0.82 ? 1 : 0; }
      else if (variant === 'bubbles') { p.size *= 1.7; p.mix = rand(i, 7); }
      else {
        p.rot = f.t * (rand(i, 9) - 0.5) * 5 + i;
        p.size *= variant === 'confetti' ? 0.75 : 1.5;
        if (variant === 'confetti') p.mix = rand(i, 7) > 0.5 ? 1 : 0;
      }
    });
  };
};

// ============================================================ 8. floating symbols
const SYMBOLS: Record<string, string[]> = {
  runes: ['ᚠ', 'ᚱ', 'ᛉ', 'ᛟ', 'ᚦ', 'ᛞ', 'ᚨ', 'ᛇ'],
  hearts: ['♥', '♡', '❤'],
  stars: ['★', '✦', '✧', '✶'],
  music: ['♪', '♫', '♬', '♩'],
  skulls: ['☠'],
  binary: ['0', '1'],
  zodiac: ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'],
};

function glyphTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // U+FE0E asks for the monochrome text form, so the layer colors apply.
  ctx.font = '700 88px "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 14;
  const glyph = text.length === 1 && text.charCodeAt(0) > 0x2000 ? `${text}︎` : text;
  const width = ctx.measureText(glyph).width;
  const fit = Math.min(1, 112 / Math.max(1, width));
  ctx.translate(64, 68);
  ctx.scale(fit, fit);
  ctx.fillText(glyph, 0, 0);
  ctx.fillText(glyph, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const symbols: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const custom = (kit.layer.settings.symbolText ?? '').trim() || 'DOM';
  // Words separated by spaces float as words; a single word floats whole.
  const set = variant === 'custom' ? custom.split(/\s+/).slice(0, 8) : SYMBOLS[variant];
  const count = int(kit.layer.settings.particleCount, 1, 120);
  const groups = set.slice(0, Math.min(set.length, count)).map((glyph, g, all) => {
    const size = Math.floor(count / all.length) + (g < count % all.length ? 1 : 0);
    return { g, step: all.length, sprites: createSprites(kit, size, kit.track(glyphTexture(glyph))) };
  });
  return (f) => {
    const { radius: r, spread, turbulence } = f.s;
    for (const group of groups) {
      group.sprites.update(f, (k, p) => {
        const i = group.g + k * group.step;
        const a = (i / count) * TAU + f.t * (f.layer.animation.rotationSpeed.y || 0.5) * 0.6;
        const rise = fract(i * 0.618 + f.t / Math.max(0.5, f.s.lifetime * 2.5));
        const rr = r * (0.8 + rand(i, 1) * 0.35);
        p.x = Math.cos(a) * rr;
        p.z = Math.sin(a) * rr;
        p.y = (rise - 0.5) * spread + Math.sin(f.t * 1.6 + i) * 0.12 * turbulence;
        p.size = 0.42 * f.objScale * (0.75 + rand(i, 2) * 0.5) * (0.85 + f.mod * 0.15);
        p.rot = Math.sin(f.t + i) * 0.22;
        p.alpha = fadeInOut(rise, 0.15);
        p.mix = rand(i, 3);
      });
    }
  };
};

// ============================================================ 9. ground eruptions
const eruption: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const count = int(kit.layer.settings.particleCount, 3, 120);
  const floating = variant === 'floating_rocks' || variant === 'floating_cubes';
  let geometry: THREE.BufferGeometry;
  if (variant === 'floating_rocks') {
    geometry = new THREE.IcosahedronGeometry(0.5, 1);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // Same seed for coincident vertices keeps the rock watertight.
      const key = Math.round(p.getX(i) * 97 + p.getY(i) * 389 + p.getZ(i) * 997);
      const k = 0.7 + rand(key, 1) * 0.6;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
    }
  } else if (variant === 'floating_cubes') geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  else if (variant === 'obsidian') geometry = new THREE.CylinderGeometry(0.12, 0.24, 1, 4).translate(0, 0.5, 0);
  else if (variant === 'magma') geometry = new THREE.ConeGeometry(0.24, 1, 7, 4).translate(0, 0.5, 0);
  else if (variant === 'ice_shards') geometry = new THREE.ConeGeometry(0.13, 1, 3).translate(0, 0.5, 0);
  else geometry = mergeParts([
    new THREE.CylinderGeometry(0.15, 0.18, 0.72, 6).translate(0, 0.36, 0),
    new THREE.ConeGeometry(0.15, 0.3, 6).translate(0, 0.87, 0),
  ]);
  const solids = createSolids(kit, geometry, count);
  const motes = createSprites(kit, count, getProceduralTexture('soft_orb'));
  return (f) => {
    const { radius: r, spread, turbulence } = f.s;
    solids.update(f, (i, o) => {
      const a = rand(i, 1) * TAU + (floating ? f.t * (0.12 + rand(i, 2) * 0.2) : 0);
      const d = r * (floating ? 0.55 + rand(i, 3) * 0.6 : 0.62 + rand(i, 3) * 0.45);
      if (floating) {
        const h = 0.15 + rand(i, 4) * spread;
        o.position.set(Math.cos(a) * d, h + Math.sin(f.t * (0.8 + rand(i, 5)) + i) * 0.18 * (1 + turbulence * 0.5), Math.sin(a) * d);
        o.rotation.set(f.t * (rand(i, 6) - 0.5) * 1.4 + i, f.t * (rand(i, 7) - 0.5) * 1.4, i * 2);
        o.scale.setScalar(f.objScale * (0.14 + rand(i, 8) * 0.38));
      } else {
        const lean = 0.12 + rand(i, 4) * 0.4 + f.s.tilt;
        const grow = 0.82 + 0.18 * Math.sin(f.t * 1.2 + rand(i, 5) * TAU) * (0.4 + turbulence);
        o.position.set(Math.cos(a) * d, -0.04, Math.sin(a) * d);
        o.rotation.set(0, -a, 0);
        o.rotateZ(-lean);
        o.rotateY(rand(i, 6) * TAU);
        const h = spread * (0.25 + rand(i, 7) * 0.75) * grow * (0.9 + f.mod * 0.1);
        o.scale.set(f.objScale * (0.55 + rand(i, 8) * 0.7), h * f.objScale, f.objScale * (0.55 + rand(i, 8) * 0.7));
      }
    });
    motes.update(f, (i, p) => {
      const age = fract(f.t * (0.2 + rand(i, 11) * 0.4) + rand(i, 12));
      const a = rand(i, 13) * TAU;
      const d = r * (0.4 + rand(i, 14) * 0.7);
      p.x = Math.cos(a) * d; p.z = Math.sin(a) * d; p.y = age * (spread + 0.8);
      p.size = 0.09 * f.objScale; p.alpha = fadeInOut(age, 0.2) * Math.min(1, f.s.glow); p.mix = age;
    });
  };
};

// ============================================================ 10. celestial bodies
const celestial: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const count = int(kit.layer.settings.particleCount, 1, 48);
  if (variant === 'constellation' || variant === 'dying_stars') {
    const stars = createSprites(kit, count);
    const links = createStrips(kit, variant === 'constellation' ? count : count * 2, 6, 1);
    const pos = Array.from({ length: count }, v3);
    const q = v3();
    return (f) => {
      const r = f.s.radius;
      const spin = f.t * (f.layer.animation.rotationSpeed.y || 0.4) * 0.3;
      pos.forEach((p, i) => {
        const y = (rand(i, 1) - 0.5) * f.s.spread;
        const a = (i / count) * TAU + spin + (rand(i, 2) - 0.5) * 0.4;
        p.set(Math.cos(a) * r * (0.85 + rand(i, 3) * 0.3), y, Math.sin(a) * r * (0.85 + rand(i, 3) * 0.3));
      });
      stars.update(f, (i, p) => {
        const tw = Math.pow(0.5 + 0.5 * Math.sin(f.t * (variant === 'dying_stars' ? 5 : 2.2) + i * 4.1), 3);
        p.x = pos[i].x; p.y = pos[i].y; p.z = pos[i].z;
        p.size = f.objScale * (variant === 'dying_stars' ? 0.45 + tw * 0.9 : 0.2 + tw * 0.25);
        p.rot = variant === 'dying_stars' ? f.t * 0.8 + i : 0;
        p.mix = rand(i, 4);
      });
      if (variant === 'constellation') {
        links.update(f, (i, u, out) => out.lerpVectors(pos[i], pos[(i + 1) % count], u), () => 0.014 * f.objScale, (i) => 0.25 + 0.3 * Math.max(0, Math.sin(f.t + i)));
      } else {
        links.update(f, (i, u, out) => {
          const star = Math.floor(i / 2);
          const sign = i % 2 ? 1 : -1;
          q.set(Math.cos(f.t * 2 + star), Math.sin(f.t * 1.4 + star * 2), Math.sin(f.t * 2 + star)).normalize();
          out.copy(pos[star]).addScaledVector(q, sign * u * 0.9 * f.objScale);
        }, (_i, u) => 0.06 * f.objScale * (1 - u), (i) => Math.pow(0.5 + 0.5 * Math.sin(f.t * 5 + Math.floor(i / 2) * 4.1), 2));
      }
    };
  }
  const ringed = variant === 'ringed_planets';
  const sphere = surfaceMaterial(kit, {
    pars: 'uniform float uSeed;',
    uniforms: { uSeed: { value: 0 } },
    depthWrite: kit.layer.blendMode === 'normal',
    fragment: `vec3 n3 = normalize(vPos);
      float bands = fbm(vec3(n3.x * 2.0, n3.y * ${variant === 'moons' ? '3.0' : '8.0'}, n3.z * 2.0) + uSeed * 9.0);
      float crater = ${variant === 'moons' ? 'smoothstep(0.55, 0.7, noise3(n3 * 7.0 + uSeed))' : '0.0'};
      float light = max(dot(normalize(vNormalV), normalize(vec3(-0.5, 0.45, 0.75))), 0.0);
      vec3 tint = mix(uColorA, uColorB, fract(uSeed * 0.618));
      color = mix(tint * 0.35, tint, smoothstep(0.3, 0.72, bands)) * (0.12 + light * 0.95) * (1.0 - crater * 0.4);
      color += uColorB * pow(1.0 - facing, 3.0) * 0.8;
      alpha = 1.0;`,
  });
  const ball = kit.track(new THREE.SphereGeometry(1, 32, 24));
  const ringGeo = kit.track(new THREE.RingGeometry(1.45, 2.25, 56));
  const ringMat = surfaceMaterial(kit, {
    fragment: `float r = length(vPos.xy); float k = (r - 1.45) / 0.8;
      color = mix(uColorA, uColorB, k); alpha = noise3(vec3(k * 18.0, 0.0, 0.0)) * smoothstep(0.0, 0.1, k) * smoothstep(1.0, 0.85, k);`,
  });
  const bodies = Array.from({ length: count }, (_, i) => {
    const holder = new THREE.Group();
    const mesh = new THREE.Mesh(ball, sphere);
    mesh.frustumCulled = false;
    mesh.onBeforeRender = () => {
      sphere.uniforms.uSeed.value = i;
      sphere.uniformsNeedUpdate = true;
    };
    holder.add(mesh);
    if (ringed || (variant === 'solar_system' && i === 3)) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2 + 0.4;
      holder.add(ring);
    }
    kit.group.add(holder);
    return { holder, mesh };
  });
  const solar = variant === 'solar_system';
  const orbitLines = solar ? createStrips(kit, count, 64) : null;
  return (f) => {
    const radiusOf = (i: number) => (solar ? f.s.radius * (0.5 + (i / Math.max(1, count - 1)) * 0.75) : f.s.radius * (0.85 + rand(i, 1) * 0.3));
    const angleOf = (i: number) => rand(i, 2) * TAU + (i / count) * TAU + f.t * (solar ? 1.1 / (1 + i * 0.45) : 0.45);
    const place = (i: number, a: number, out: THREE.Vector3) => {
      const r = radiusOf(i);
      const incline = solar ? f.s.tilt : (rand(i, 3) - 0.5) * 0.9 + f.s.tilt;
      return out.set(Math.cos(a) * r, Math.sin(a) * r * Math.sin(incline), Math.sin(a) * r * Math.cos(incline));
    };
    bodies.forEach(({ holder, mesh }, i) => {
      place(i, angleOf(i), holder.position);
      holder.scale.setScalar(f.objScale * (variant === 'moons' ? 0.2 + rand(i, 4) * 0.14 : ringed ? 0.2 : 0.09 + rand(i, 4) * 0.12));
      mesh.rotation.y = f.t * (0.4 + rand(i, 5));
    });
    applyCommon(sphere, f);
    applyCommon(ringMat, f);
    orbitLines?.update(f, (i, u, out) => place(i, angleOf(i) - u * TAU * 0.8, out), (_i, u) => 0.016 * (1 - u * 0.6));
  };
};

// ============================================================ 11. shockwaves
const shockwaves: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const count = int(kit.layer.settings.arcCount, 1, 8);
  const dome = variant === 'dome';
  const geometry = kit.track(
    dome ? new THREE.SphereGeometry(1, 56, 28, 0, TAU, 0, Math.PI / 2) : new THREE.PlaneGeometry(2, 2),
  );
  const fragment = dome
    ? `float edge = pow(1.0 - facing, 1.8);
       float n = fbm(vPos * 5.0 + vec3(0.0, -uTime, 0.0));
       color = mix(uColorB, uColorA, edge); alpha = (edge * 0.8 + smoothstep(0.55, 0.75, n) * 0.3) + (1.0 - smoothstep(0.0, 0.08, abs(vPos.y)));`
    : variant === 'hex_burst'
      ? `vec2 p = vUv * 2.0 - 1.0; vec2 q = abs(p); float hex = max(q.x * 0.866 + q.y * 0.5, q.y);
         float d = hex - 0.82; float cells = step(0.5, noise3(vec3(floor(p * 12.0), floor(uTime * 8.0))));
         color = mix(uColorB, uColorA, smoothstep(-0.2, 0.05, d));
         alpha = exp(-abs(d) * 30.0) + smoothstep(-0.35, -0.02, d) * step(d, 0.0) * cells * 0.45 + exp(-abs(hex - 0.58) * 60.0) * 0.5;`
      : `vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x); if (r > 1.0) discard;
         float n = fbm(vec3(cos(a) * 5.0, sin(a) * 5.0, uTime * 1.4));
         float d = r - 0.84 + (n - 0.5) * 0.12 * uTurbulence;
         color = mix(uColorB, uColorA, smoothstep(-0.18, 0.04, d)) ;
         alpha = exp(-abs(d) * 34.0) + smoothstep(-0.3, 0.0, d) * step(d, 0.0) * n * 0.7;`;
  const waves = Array.from({ length: count }, () => {
    const material = surfaceMaterial(kit, { fragment });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    if (!dome) mesh.rotation.x = -Math.PI / 2;
    kit.group.add(mesh);
    return { mesh, material };
  });
  return (f) => {
    const r = f.s.radius * f.objScale;
    waves.forEach(({ mesh, material }, i) => {
      let age = fract(f.t / Math.max(0.2, f.s.lifetime) + i / count);
      if (f.s.reverseDirection) age = 1 - age;
      let size = r * (0.12 + (1 - Math.pow(1 - age, 2.2)) * 1.0);
      let opacity = Math.pow(1 - age, 1.3) * Math.min(1, age * 8);
      mesh.position.y = 0;
      if (variant === 'stacked') {
        mesh.position.y = age * f.s.spread;
        size = r * (0.65 + 0.3 * Math.sin(age * Math.PI));
        opacity = fadeInOut(age, 0.2);
      } else if (variant === 'implode') {
        size = r * (1.15 - age);
        opacity = fadeInOut(age, 0.2);
      } else if (variant === 'hex_burst') mesh.rotation.z = i * 0.3 + age * 0.8;
      mesh.scale.setScalar(Math.max(0.05, size));
      applyCommon(material, f, opacity * (0.8 + f.mod * 0.2));
    });
  };
};

// ============================================================ 12. chains
const chains: Builder = (kit) => {
  const variant = getLayerVariant(kit.layer);
  const strands = int(kit.layer.settings.arcCount, 1, 12);
  const links = int(kit.layer.settings.segments, 8, 64);
  const total = strands * links;
  const solids = createSolids(kit, new THREE.TorusGeometry(0.075, 0.022, 6, 16).scale(1, 1.5, 1), total, false);
  const tips = createSprites(kit, strands, getProceduralTexture('soft_orb'));
  const a = v3();
  const b = v3();
  const dir = v3();
  const q = new THREE.Quaternion();
  const twist = new THREE.Quaternion();
  return (f) => {
    const { radius: r, spread, turbulence, tilt } = f.s;
    const t = f.t * (f.layer.animation.rotationSpeed.y || 0.5);
    const path = (s: number, u: number, out: THREE.Vector3) => {
      const phase = (s / strands) * TAU;
      if (variant === 'binding') {
        const ang = u * TAU * 1.0 + t + phase;
        const lean = (s % 2 ? -1 : 1) * (0.35 + tilt);
        out.set(Math.cos(ang) * r, (s - (strands - 1) / 2) * 0.32 + Math.cos(ang + phase) * lean, Math.sin(ang) * r);
      } else if (variant === 'anchored') {
        const ang = phase + t * 0.25;
        const sag = Math.sin(u * Math.PI) * 0.35 - Math.sin(u * 9 - f.t * 2 + s) * 0.04 * turbulence;
        const d = r * (1 - u * 0.88);
        out.set(Math.cos(ang) * d, -1.48 + u * spread * 0.75 - sag, Math.sin(ang) * d);
      } else if (variant === 'hanging') {
        const ang = phase + t * 0.15;
        const sway = Math.sin(f.t * 1.4 + s * 1.7 + u * 2) * u * 0.22 * (0.5 + turbulence);
        const d = r * (0.75 + rand(s, 1) * 0.35);
        out.set(Math.cos(ang) * d + sway, spread * 0.6 - u * spread * (0.55 + rand(s, 2) * 0.45), Math.sin(ang) * d);
      } else {
        const ang = u * TAU * 0.82 + t * 1.4 + phase;
        out.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
        out.applyAxisAngle(dir.set(Math.cos(phase), 0, Math.sin(phase)), 0.45 + tilt + s * 0.12);
      }
    };
    solids.update(f, (i, o) => {
      const s = Math.floor(i / links);
      const u = (i % links) / (links - 1);
      path(s, u, a);
      path(s, Math.min(1, u + 0.01), b);
      if (u > 0.99) { path(s, u - 0.01, b); b.sub(a).negate().add(a); }
      o.position.copy(a);
      b.sub(a).normalize();
      q.setFromUnitVectors(UP, b);
      twist.setFromAxisAngle(b, (i % 2) * (Math.PI / 2));
      o.quaternion.copy(twist).multiply(q);
      o.scale.setScalar(f.objScale * (0.9 + f.mod * 0.1));
    });
    tips.update(f, (s, p) => {
      path(s, variant === 'binding' ? fract(f.t * 0.3 + s / strands) : 1, a);
      p.x = a.x; p.y = a.y; p.z = a.z; p.size = 0.4 * f.objScale * Math.min(1.5, f.s.glow); p.mix = 0.2;
    });
  };
};

export const NEW_TYPE_BUILDERS: Record<ExtraEffectType, Builder> = {
  aura_wings: wings,
  halo_crowns: halos,
  magic_circles: circles,
  floating_weapons: weapons,
  singularity,
  aura_flames: flames,
  weather,
  floating_symbols: symbols,
  ground_eruption: eruption,
  celestial_bodies: celestial,
  shockwaves,
  chains,
};
