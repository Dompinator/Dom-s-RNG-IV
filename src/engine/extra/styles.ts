/** New styles for the ten original layer types. */
import * as THREE from 'three';
import { getProceduralTexture } from '../../aura/textures';
import { createOrbiterGeometry } from '../layerBuilder';
import type { R6Rig } from '../r6Character';
import {
  TAU, addMesh, applyCommon, clamp01, createSolids, createSprites, createStrips,
  fadeInOut, fract, rand, surfaceMaterial, type Builder, type Frame, type Kit,
} from './kit';

const v3 = () => new THREE.Vector3();
const int = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));

function onSphere(i: number, k: number, r: number, out: THREE.Vector3) {
  const y = rand(i, k) * 2 - 1;
  const a = rand(i, k + 1) * TAU;
  const s = Math.sqrt(1 - y * y);
  return out.set(Math.cos(a) * s * r, y * r, Math.sin(a) * s * r);
}

// ============================================================ energy spheres
const SPHERE_FRAGMENTS: Record<string, string> = {
  void_core: `
    float n = fbm(vPos * 3.0 + vec3(uTime * 0.4, -uTime * 0.7, 0.0));
    float edge = pow(1.0 - facing, 1.4) * (0.5 + n * 1.2);
    color = mix(uColorB * 0.15, uColorA * 1.5, clamp(edge, 0.0, 1.0));
    alpha = mix(0.96, 1.0, edge) * smoothstep(0.0, 0.2, facing + n * 0.25 - 0.1);`,
  hex_shield: `
    vec2 p = vec2(atan(vPos.z, vPos.x) / 6.28318 * 22.0, vPos.y * 6.4 + uTime * 0.25);
    vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(p, s) - s * 0.5, b = mod(p - s * 0.5, s) - s * 0.5;
    vec2 g = abs(dot(a, a) < dot(b, b) ? a : b);
    float edge = 0.5 - max(g.x, dot(g, s * 0.5));
    float line = 1.0 - smoothstep(0.02, 0.08, edge);
    float flash = smoothstep(0.68, 0.9, noise3(vec3(floor(p) * 0.7, floor(uTime * 3.0))));
    float rim = pow(1.0 - facing, 2.0);
    color = mix(uColorB, uColorA, line);
    alpha = (line * (0.3 + rim) + flash * 0.25 + rim * 0.5) * smoothstep(1.0, 0.7, abs(vPos.y));`,
  plasma_storm: `
    vec3 q = vPos * 2.4;
    vec3 w = vec3(fbm(q + uTime * 0.6), fbm(q + 4.0 - uTime * 0.5), fbm(q + 8.0));
    float n = fbm(q + w * 2.4 - vec3(0.0, uTime, 0.0));
    float arc = pow(clamp(1.0 - abs(n - 0.5) * 7.0, 0.0, 1.0), 2.0);
    float rim = pow(1.0 - facing, 2.2);
    color = mix(uColorB, uColorA, arc) + vec3(pow(arc, 5.0));
    alpha = arc * 0.95 + rim * 0.7;`,
  crystal_shell: `
    vec3 flatN = normalize(cross(dFdx(vView), dFdy(vView)));
    float light = abs(dot(flatN, normalize(vec3(0.4, 0.8, 0.45))));
    float glint = pow(0.5 + 0.5 * sin(dot(flatN, vec3(9.0, 13.0, 7.0)) + uTime * 2.4), 10.0);
    float rim = pow(1.0 - abs(dot(flatN, normalize(vView))), 2.0);
    color = mix(uColorB, uColorA, light) + glint;
    alpha = 0.12 + light * 0.22 + rim * 0.5 + glint * 0.6;`,
  atom_core: `
    float rim = pow(1.0 - facing, 1.2);
    float n = fbm(vPos * 4.0 - uTime);
    color = mix(uColorA, uColorB, rim) + (1.0 - rim) * 0.8;
    alpha = (0.55 + n * 0.5) * (0.35 + facing);`,
  bubble: `
    float rim = pow(1.0 - facing, 2.4);
    float film = fbm(vPos * 1.6 + vec3(uTime * 0.25, uTime * 0.15, 0.0));
    color = mix(uColorA, uColorB, 0.5 + 0.5 * sin(film * 14.0 + facing * 8.0));
    color += 0.35 * cos(6.28318 * (film * 2.0 + vec3(0.0, 0.33, 0.66)));
    float spot = pow(max(dot(normalize(vNormalV), normalize(vec3(-0.45, 0.6, 0.66))), 0.0), 40.0);
    color += spot;
    alpha = rim * 0.85 + 0.05 + spot;`,
};

const spheres = (variant: string): Builder => (kit) => {
  const detail = variant === 'crystal_shell' ? 2 : 5;
  const geometry = new THREE.IcosahedronGeometry(1, detail * (variant === 'crystal_shell' ? 1 : 3));
  const material = surfaceMaterial(kit, {
    fragment: SPHERE_FRAGMENTS[variant],
    side: variant === 'void_core' ? THREE.FrontSide : THREE.DoubleSide,
    vertex: /* glsl */ `
      vUv = uv; vPos = position;
      float amp = ${variant === 'bubble' ? '0.14' : variant === 'plasma_storm' ? '0.22' : variant === 'void_core' ? '0.12' : '0.0'};
      float n = fbm(position * 2.0 + vec3(uTime * 0.6, -uTime * 0.4, uTime * 0.3));
      vec3 p = position * (1.0 + (n - 0.5) * uTurbulence * amp * 2.5);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vView = -mv.xyz; vNormalV = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mv;
    `,
  });
  const body = addMesh(kit, geometry, material);
  const isAtom = variant === 'atom_core';
  const rings = isAtom ? int(kit.layer.settings.arcCount, 1, 8) : 0;
  const trails = rings ? createStrips(kit, rings, 64) : null;
  const electrons = rings ? createSprites(kit, rings, getProceduralTexture('soft_orb')) : null;
  const orbit = (i: number, a: number, r: number, out: THREE.Vector3) => {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.42;
    const roll = (i / Math.max(1, rings)) * Math.PI;
    return out.set(x * Math.cos(roll), x * Math.sin(roll), z);
  };
  return (f) => {
    const r = f.s.radius * f.objScale * (0.9 + f.mod * 0.1);
    body.scale.setScalar(isAtom ? r * 0.32 : r);
    body.rotation.x += f.layer.animation.rotationSpeed.x * f.dt;
    body.rotation.y += f.layer.animation.rotationSpeed.y * f.dt;
    body.rotation.z += f.layer.animation.rotationSpeed.z * f.dt;
    applyCommon(material, f);
    trails?.update(f, (i, u, out) => orbit(i, f.t * (2 + i * 0.4) - u * 3.4, r, out), (_i, u) => 0.07 * f.objScale * (1 - u));
    electrons?.update(f, (i, p) => {
      const o = orbit(i, f.t * (2 + i * 0.4), r, v3());
      p.x = o.x; p.y = o.y; p.z = o.z; p.size = 0.32 * f.objScale; p.mix = 0.2;
    });
  };
};

// ============================================================ rotating rings
const RING_PATTERNS: Record<string, string> = {
  gyroscope: `alpha = line(r - 0.9, 0.025) + line(r - 0.82, 0.006) + glowAt(r - 0.9, 0.05) * 0.4;
    color = mix(uColorB, uColorA, line(r - 0.9, 0.03));`,
  rune_halo: `
    float cells = 22.0; float c = a01 * cells; vec2 g = vec2((fract(c) - 0.18) / 0.64, (r - 0.72) / 0.18);
    float glyph = 0.0;
    if (g.x > 0.0 && g.x < 1.0 && g.y > 0.0 && g.y < 1.0) {
      vec2 k = g * vec2(3.0, 4.0); vec2 cell = floor(k); vec2 d = abs(fract(k) - 0.5);
      float seed = floor(c) * 17.0 + cell.x * 3.0 + cell.y * 11.0;
      float on = step(0.45, h31(vec3(seed)));
      glyph = on * (h31(vec3(seed + 5.0)) > 0.5 ? 1.0 - smoothstep(0.12, 0.2, d.y) : 1.0 - smoothstep(0.12, 0.2, d.x));
    }
    alpha = glyph + line(r - 0.95, 0.008) + line(r - 0.67, 0.008) + glowAt(r - 0.81, 0.14) * 0.18;
    color = mix(uColorA, uColorB, glyph);`,
  tech_dashes: `
    float seg = 36.0; float c = fract(a01 * seg); float id = floor(a01 * seg);
    float dash = step(0.12, c) * step(c, 0.7);
    alpha = line(r - 0.9, 0.05) * dash + line(r - 0.78, 0.008)
          + line(r - 0.69, 0.025) * step(0.55, h31(vec3(id, 3.0, 1.0)))
          + line(r - 0.9, 0.09) * step(a01, 0.16) * 0.5;
    color = mix(uColorB, uColorA, step(0.84, r));`,
  clockwork: `
    float teeth = step(0.5, fract(a01 * 32.0));
    float gear = smoothstep(0.74, 0.75, r) * smoothstep(0.87 + teeth * 0.07, 0.86 + teeth * 0.07, r);
    float spoke = line(sin(ang * 4.0) * r, 0.025) * step(r, 0.74) * step(0.2, r);
    float tick = line(fract(a01 * 60.0) - 0.5, 0.1) * step(0.62, r) * step(r, 0.69);
    alpha = gear * 0.75 + spoke * 0.8 + tick + line(r - 0.2, 0.02) + line(r - 0.58, 0.008);
    color = mix(uColorB, uColorA, gear + tick);`,
  saturn_disc: `
    float bands = noise3(vec3(r * 42.0, 0.0, 0.0)) * 0.8 + noise3(vec3(r * 140.0, 1.0, 0.0)) * 0.4;
    float dust = noise3(vec3(cos(ang) * r * 30.0, sin(ang) * r * 30.0, uTime * 0.4));
    float gap = 1.0 - line(r - 0.74, 0.018);
    alpha = smoothstep(0.5, 0.56, r) * smoothstep(1.0, 0.9, r) * bands * (0.7 + dust * 0.6) * gap;
    color = mix(uColorA, uColorB, smoothstep(0.55, 0.98, r));`,
  portal_rings: `
    float n = fbm(vec3(cos(ang) * 3.0, sin(ang) * 3.0, uTime * 1.2 + r * 5.0));
    float d = r - 0.84 + (n - 0.5) * 0.16;
    alpha = line(d, 0.012) + glowAt(d, 0.06) * n * 1.3;
    color = mix(uColorA, uColorB, line(d, 0.02));`,
};

const rings = (variant: string): Builder => (kit) => {
  const count = int(kit.layer.settings.arcCount, 1, 8);
  const material = surfaceMaterial(kit, {
    fragmentPars: /* glsl */ `
      float line(float d, float w) { float aa = fwidth(d) + 0.0008; return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
      float glowAt(float d, float w) { return exp(-abs(d) / w); }`,
    fragment: `
      vec2 p = vUv * 2.0 - 1.0; float r = length(p); float ang = atan(p.y, p.x); float a01 = ang / 6.28318 + 0.5;
      if (r > 1.0) discard;
      ${RING_PATTERNS[variant]}
      alpha *= 0.75 + 0.45 * pow(0.5 + 0.5 * cos(ang * 2.0 - uTime * 1.5), 3.0);`,
  });
  const plane = kit.track(new THREE.PlaneGeometry(2, 2));
  const meshes = Array.from({ length: count }, () => {
    const holder = new THREE.Group();
    const mesh = new THREE.Mesh(plane, material);
    mesh.frustumCulled = false;
    mesh.rotation.x = -Math.PI / 2;
    holder.add(mesh);
    kit.group.add(holder);
    return { holder, mesh };
  });
  return (f) => {
    const radius = f.s.radius * f.objScale * (0.95 + f.mod * 0.05);
    const tilt = f.s.tilt;
    meshes.forEach(({ holder, mesh }, i) => {
      const dir = i % 2 ? -1 : 1;
      const mid = i - (count - 1) / 2;
      holder.position.set(0, 0, 0);
      holder.rotation.set(0, 0, 0);
      let r = radius;
      if (variant === 'gyroscope') {
        r *= 1 - i * 0.09;
        holder.rotation.set(tilt + f.t * 0.7 * dir + i * 0.8, i * 1.3 + f.t * 0.3, f.t * 0.4 * dir + i);
      } else if (variant === 'portal_rings') {
        r *= 1 - i * 0.07;
        holder.rotation.x = Math.PI / 2;
        holder.position.z = -0.5 - i * 0.3 * f.s.spread * 0.5;
        // The layer sits at ground level, so lift the upright portal above the floor.
        holder.position.y = radius * 0.85;
      } else if (variant === 'clockwork') {
        r *= i ? 0.62 - i * 0.04 : 1;
        const a = i * 2.2;
        if (i) holder.position.set(Math.cos(a) * radius, 0.03 * i, Math.sin(a) * radius);
      } else {
        r *= 1 - Math.abs(mid) * 0.12;
        holder.position.y = mid * 0.35 * f.s.spread;
        holder.rotation.set(Math.sin(f.t + i) * 0.08 + (variant === 'saturn_disc' ? tilt : 0), 0, variant === 'saturn_disc' ? tilt * 0.5 : tilt * dir * 0.4);
      }
      holder.scale.setScalar(Math.max(0.05, r));
      mesh.rotation.z = f.t * f.layer.animation.rotationSpeed.y * dir * (variant === 'clockwork' && i ? 1.8 : 0.6);
    });
    applyCommon(material, f);
  };
};

// ============================================================ orbiting objects
const orbiters = (variant: string): Builder => (kit) => {
  const s = kit.layer.settings;
  const count = int(s.particleCount, 1, 64);
  const geometry = createOrbiterGeometry(s.orbiterShape);
  geometry.scale(0.65, 0.65, 0.65);
  const solids = createSolids(kit, geometry, count, s.orbiterShape !== 'sphere');
  const trailCount = variant === 'comet_trails' || variant === 'swarm' ? Math.min(count, 24) : 0;
  const trails = trailCount ? createStrips(kit, trailCount, 28) : null;
  const pos = (i: number, t: number, f: Frame, out: THREE.Vector3) => {
    const r = f.s.radius;
    const a = (i / count) * TAU + t * (f.layer.animation.rotationSpeed.y || 1);
    if (variant === 'double_helix') {
      const strand = i % 2;
      const h = fract(i / count + t * 0.07);
      const ang = h * TAU * 2.5 + strand * Math.PI + t * 0.8;
      return out.set(Math.cos(ang) * r, (h - 0.5) * f.s.spread, Math.sin(ang) * r);
    }
    if (variant === 'asteroid_belt') {
      const rr = r * (0.82 + rand(i, 1) * 0.38);
      const aa = rand(i, 2) * TAU + t * (0.35 + rand(i, 3) * 0.4);
      return out.set(Math.cos(aa) * rr, (rand(i, 4) - 0.5) * f.s.spread * 0.4 + Math.sin(aa) * f.s.tilt * rr, Math.sin(aa) * rr);
    }
    if (variant === 'swarm') {
      const k = t * (0.7 + rand(i, 1));
      return out.set(
        Math.sin(k * 1.3 + rand(i, 2) * 9) * r,
        Math.sin(k * 1.9 + rand(i, 3) * 9) * f.s.spread * 0.8,
        Math.cos(k * 1.1 + rand(i, 4) * 9) * r,
      );
    }
    const incline = (rand(i, 5) - 0.5) * 1.6;
    const x = Math.cos(a * 1.3) * r;
    const z = Math.sin(a * 1.3) * r;
    return out.set(x, z * Math.sin(incline) * 0.7 + (rand(i, 6) - 0.5) * f.s.spread * 0.4, z * Math.cos(incline));
  };
  const p = v3();
  return (f) => {
    solids.update(f, (i, o) => {
      pos(i, f.t, f, o.position);
      const wrap = variant === 'double_helix' ? fadeInOut(fract(i / count + f.t * 0.07), 0.12) : 1;
      o.rotation.set(f.t * 1.3 + i, f.t * 0.9 + i * 2, i);
      o.scale.setScalar(f.objScale * (0.55 + rand(i, 7) * 0.75) * wrap * (0.8 + f.mod * 0.2));
    });
    trails?.update(f, (i, u, out) => out.copy(pos(i, f.t - u * 0.8, f, p)), (_i, u) => 0.1 * f.objScale * (1 - u));
  };
};

// ============================================================ particle systems
const particles = (variant: string): Builder => (kit) => {
  const count = int(kit.layer.settings.particleCount, 10, 3000);
  const sprites = createSprites(kit, count);
  const arms = int(kit.layer.settings.arcCount, 2, 8);
  return (f) => {
    const { radius: r, spread, lifetime, turbulence } = f.s;
    const base = 0.16 * f.objScale;
    sprites.update(f, (i, p) => {
      const life = Math.max(0.2, lifetime * (0.6 + rand(i, 1) * 0.8));
      const cycle = f.t / life + rand(i, 2);
      const age = fract(cycle);
      const k = Math.floor(cycle);
      const a = rand(i, 3 + (k % 7)) * TAU;
      const q = rand(i, 11 + (k % 5));
      p.size = base * (0.5 + rand(i, 4));
      p.alpha = fadeInOut(age, 0.2);
      p.mix = age;
      if (variant === 'galaxy') {
        const d = Math.pow(rand(i, 5), 0.7);
        const ang = (i % arms) / arms * TAU + d * 4.2 + (rand(i, 6) - 0.5) * (0.8 - d * 0.35) + f.t * 0.35 * (1.5 - d);
        p.x = Math.cos(ang) * d * r;
        p.z = Math.sin(ang) * d * r;
        p.y = (rand(i, 7) - 0.5) * 0.25 * (1 - d) + p.x * f.s.tilt * 0.6;
        p.size = base * (0.25 + rand(i, 4) * 0.7 + (1 - d) * 0.5);
        p.alpha = 0.45 + 0.55 * Math.abs(Math.sin(f.t * 2 + i));
        p.mix = d;
      } else if (variant === 'implosion') {
        const pull = 1 - age * age;
        const y = q * 2 - 1;
        const s = Math.sqrt(1 - y * y);
        const swirl = a + age * 3;
        p.x = Math.cos(swirl) * s * r * pull;
        p.y = y * r * pull;
        p.z = Math.sin(swirl) * s * r * pull;
        p.size *= 0.4 + age;
      } else if (variant === 'fountain') {
        const out = (0.2 + q * 0.8) * r;
        p.x = Math.cos(a) * out * age;
        p.z = Math.sin(a) * out * age;
        p.y = spread * (age * 2.6 - age * age * 2.6) * (0.7 + rand(i, 8) * 0.5);
        p.dy = (1 - 2 * age) * 0.22;
      } else if (variant === 'shockburst') {
        const phase = fract(f.t / Math.max(0.4, lifetime) + (i % 3) / 3);
        const y = rand(i, 6) * 2 - 1;
        const s = Math.sqrt(1 - y * y);
        const dist = (1 - Math.pow(1 - phase, 3)) * r * (0.8 + rand(i, 7) * 0.3);
        const ang = rand(i, 3) * TAU;
        p.x = Math.cos(ang) * s * dist;
        p.y = y * dist;
        p.z = Math.sin(ang) * s * dist;
        p.alpha = Math.pow(1 - phase, 1.5);
        p.mix = phase;
      } else if (variant === 'pixel_dust') {
        const jump = Math.floor(f.t * 7 + rand(i, 8) * 7);
        p.x = Math.round(((rand(i, jump % 13) - 0.5) * 2 * r) / 0.22) * 0.22;
        p.z = Math.round(((rand(i, (jump % 11) + 20) - 0.5) * 2 * r) / 0.22) * 0.22;
        p.y = (rand(i, 6) - 0.5) * spread + age * 0.8;
        p.size = 0.2 * f.objScale * (rand(i, jump % 5) > 0.25 ? 1 : 0.2);
        p.mix = rand(i, 9) > 0.5 ? 1 : 0;
      } else {
        const rr = r * (0.35 + q * 0.7);
        const ang = a + f.t * (1.4 + rand(i, 5));
        p.x = Math.cos(ang) * rr;
        p.z = Math.sin(ang) * rr;
        p.y = (age - 0.5) * spread + Math.sin(f.t * 2 + i) * 0.15;
        p.rot = f.t * (rand(i, 7) - 0.5) * 6 + i;
        p.size = base * 1.3 * (0.6 + rand(i, 4) * 0.7);
      }
      if (variant !== 'pixel_dust') {
        p.x += Math.sin(f.t * 2.1 + i * 1.7) * turbulence * 0.12;
        p.z += Math.cos(f.t * 1.8 + i * 2.3) * turbulence * 0.12;
      }
      p.size *= 0.85 + f.mod * 0.15;
    });
  };
};

// ============================================================ lightning
const lightning = (variant: string): Builder => (kit) => {
  const bolts = int(kit.layer.settings.arcCount, 1, 16);
  const segments = int(kit.layer.settings.segments, 8, 32);
  const strips = createStrips(kit, bolts, segments, 1);
  const orbs = variant === 'ball_lightning' || variant === 'tesla_coil'
    ? createSprites(kit, bolts + 1, getProceduralTexture('soft_orb')) : null;
  const from = Array.from({ length: bolts }, v3);
  const to = Array.from({ length: bolts }, v3);
  const ball = (i: number, t: number, r: number, out: THREE.Vector3) => {
    const a = (i / bolts) * TAU + t * 0.9;
    return out.set(Math.cos(a) * r, Math.sin(t * 1.4 + i * 2) * 0.8, Math.sin(a) * r);
  };
  return (f) => {
    const { radius: r, spread, turbulence, lifetime } = f.s;
    const step = Math.floor(f.t / Math.max(0.04, lifetime));
    const local = fract(f.t / Math.max(0.04, lifetime));
    for (let i = 0; i < bolts; i++) {
      const k = step * 31 + i;
      if (variant === 'ground_strikes') {
        const a = rand(k, 1) * TAU;
        const d = r * (0.35 + rand(k, 2) * 0.65);
        to[i].set(Math.cos(a) * d, -1.45, Math.sin(a) * d);
        from[i].set(to[i].x + (rand(k, 3) - 0.5) * 1.6, -1.45 + spread, to[i].z + (rand(k, 4) - 0.5) * 1.6);
      } else if (variant === 'tesla_coil') {
        from[i].set(0, 1.5, 0);
        onSphere(k, 5, r, to[i]);
      } else if (variant === 'storm_cage') {
        const a = (i / bolts) * TAU + f.t * 0.25;
        from[i].set(Math.cos(a) * r, -spread / 2, Math.sin(a) * r);
        to[i].set(Math.cos(a + 0.45) * r, spread / 2, Math.sin(a + 0.45) * r);
      } else if (variant === 'ball_lightning') {
        ball(i, f.t, r, from[i]);
        if (i % 2) ball((i + 1) % bolts, f.t, r, to[i]);
        else to[i].set((rand(k, 1) - 0.5) * 0.6, (rand(k, 2) - 0.5) * 1.4, 0);
      } else {
        const a = rand(k, 1) * TAU;
        from[i].set(Math.cos(a) * r * 0.2, -1.42, Math.sin(a) * r * 0.2);
        to[i].set(Math.cos(a + rand(k, 2) - 0.5) * r, -1.42, Math.sin(a + rand(k, 2) - 0.5) * r);
      }
    }
    const jitter = turbulence * 0.35 * (variant === 'storm_cage' ? 0.8 : 1);
    strips.update(
      f,
      (i, u, out) => {
        const seg = Math.round(u * segments);
        const env = Math.sin(u * Math.PI);
        const k = step * 97 + i * 53;
        out.lerpVectors(from[i], to[i], u);
        // Two noise octaves give jagged forks without losing the overall path.
        out.x += ((rand(k, seg) - 0.5) + (rand(k, seg >> 2) - 0.5) * 1.8) * jitter * env;
        out.y += ((rand(k, seg + 50) - 0.5) + (rand(k, (seg >> 2) + 50) - 0.5) * 1.8) * jitter * env * (variant === 'crackle_ground' ? 0.1 : 1);
        out.z += ((rand(k, seg + 90) - 0.5) + (rand(k, (seg >> 2) + 90) - 0.5) * 1.8) * jitter * env;
      },
      (_i, u) => f.s.thickness * 2.4 * f.objScale * (0.45 + Math.sin(u * Math.PI) * 0.55),
      (i) => (rand(step * 13 + i, 7) > 0.18 ? (1 - local * 0.55) * Math.min(1.6, f.mod) : 0),
    );
    orbs?.update(f, (i, p) => {
      if (i === bolts) {
        if (variant === 'tesla_coil') { p.y = 1.5; p.size = 0.9 * f.objScale; } else p.size = 0;
      } else {
        const at = variant === 'ball_lightning' ? from[i] : to[i];
        p.x = at.x; p.y = at.y; p.z = at.z;
        p.size = (variant === 'ball_lightning' ? 0.75 : 0.28) * f.objScale * (0.8 + rand(step, i) * 0.4);
        p.mix = 0.3;
      }
    });
  };
};

// ============================================================ energy ribbons
const ribbons = (variant: string): Builder => (kit) => {
  const count = int(kit.layer.settings.arcCount, 1, 12);
  const segments = int(kit.layer.settings.segments, 24, 96);
  const strips = createStrips(kit, count, segments);
  const heads = variant === 'serpents' ? createSprites(kit, count, getProceduralTexture('soft_orb')) : null;
  const path = (f: Frame, i: number, u: number, out: THREE.Vector3) => {
    const { radius: r, spread, turbulence } = f.s;
    const t = f.t;
    const phase = (i / count) * TAU;
    if (variant === 'tornado') {
      const h = fract(t * 0.12 * (0.7 + rand(i, 1) * 0.6) + rand(i, 2));
      const hh = clamp01(h * 1.35 - u * 0.35);
      const a = t * 2.6 - u * 5 + phase;
      const rr = r * (0.22 + hh);
      out.set(Math.cos(a) * rr, (hh - 0.5) * spread, Math.sin(a) * rr);
    } else if (variant === 'aurora') {
      const a = phase + u * 3.6 + t * 0.18;
      const wave = Math.sin(u * 9 + t * 1.3 + i * 2) * 0.28;
      out.set(Math.cos(a) * (r + wave), (i - count / 2) * 0.35 + Math.sin(u * 5 - t + i) * spread * 0.2, Math.sin(a) * (r + wave));
    } else if (variant === 'serpents') {
      const s = t * 1.2 - u * 2.6 + phase;
      const wiggle = Math.sin(s * 5 - t * 2) * 0.18 * (0.3 + u);
      out.set(Math.cos(s) * (r + wiggle), Math.sin(s * 1.5 + phase) * spread * 0.45 + wiggle, Math.sin(s) * (r + wiggle));
    } else if (variant === 'comet_orbits') {
      const a = t * (1.4 + rand(i, 1)) - u * 2.8 + phase;
      const tx = (rand(i, 2) - 0.5) * 2.6;
      const y = Math.sin(a) * Math.sin(tx) * r;
      out.set(Math.cos(a) * r, y, Math.sin(a) * Math.cos(tx) * r).applyAxisAngle(new THREE.Vector3(0, 1, 0), rand(i, 3) * TAU);
    } else if (variant === 'flowing_cape') {
      const x = count > 1 ? i / (count - 1) - 0.5 : 0;
      const w = Math.sin(u * 6 - t * 3.4 + x * 3) * u * (0.2 + turbulence * 0.25);
      out.set(x * (0.9 + u * r), 0.45 - u * spread * (0.8 + rand(i, 1) * 0.25), -0.38 - u * u * 0.9 + w);
    } else {
      const a = t * 1.5 - u * 3.2 + i * (TAU / count);
      const d = 1 + Math.sin(a) * Math.sin(a);
      out.set((Math.cos(a) * r) / d, Math.sin(a * 2) * 0.35 + i * 0.12, (Math.sin(a) * Math.cos(a) * r * 1.6) / d);
    }
    if (variant !== 'flowing_cape' && turbulence > 0) {
      out.y += Math.sin(u * 14 + t * 3 + i) * turbulence * 0.1 * u;
      out.x += Math.cos(u * 11 - t * 2 + i) * turbulence * 0.08 * u;
    }
  };
  const tmp = v3();
  return (f) => {
    const w = f.s.thickness * f.objScale * (0.85 + f.mod * 0.15);
    strips.update(
      f,
      (i, u, out) => path(f, i, u, out),
      (_i, u) => w * (variant === 'aurora' ? Math.sin(u * Math.PI) * 1.3 : variant === 'flowing_cape' ? 0.5 + u * 0.8 : Math.sin(Math.min(1, u * 0.94 + 0.05) * Math.PI)),
      (i) => (variant === 'tornado' ? fadeInOut(fract(f.t * 0.12 * (0.7 + rand(i, 1) * 0.6) + rand(i, 2)), 0.15) : 1),
    );
    heads?.update(f, (i, p) => {
      path(f, i, 0.03, tmp);
      p.x = tmp.x; p.y = tmp.y; p.z = tmp.z; p.size = w * 3.2;
    });
  };
};

// ============================================================ floating sparks
const sparks = (variant: string): Builder => (kit) => {
  const count = int(kit.layer.settings.particleCount, 8, 1000);
  const sprites = createSprites(kit, count);
  return (f) => {
    const { radius: r, spread, lifetime, turbulence } = f.s;
    const base = 0.15 * f.objScale;
    sprites.update(f, (i, p) => {
      const life = Math.max(0.25, lifetime * (0.6 + rand(i, 1) * 0.8));
      const cycle = f.t / life + rand(i, 2);
      const age = fract(cycle);
      const k = Math.floor(cycle) % 17;
      const a = rand(i, 3 + k) * TAU;
      const d = r * Math.sqrt(rand(i, 40 + k));
      p.alpha = fadeInOut(age, 0.18);
      p.mix = age;
      p.size = base * (0.5 + rand(i, 4));
      if (variant === 'fireflies') {
        const rr = r * (0.45 + rand(i, 5) * 0.6);
        p.x = Math.cos(rand(i, 6) * TAU + f.t * (rand(i, 7) - 0.5)) * rr + Math.sin(f.t * 1.7 + i) * 0.25;
        p.z = Math.sin(rand(i, 6) * TAU + f.t * (rand(i, 7) - 0.5)) * rr + Math.cos(f.t * 1.3 + i * 2) * 0.25;
        p.y = 0.3 + rand(i, 8) * spread + Math.sin(f.t * 1.1 + i * 3) * 0.3;
        const blink = Math.max(0, Math.sin(f.t * (1.5 + rand(i, 9) * 2) + i));
        p.alpha = blink * blink;
        p.size = base * 1.5;
        p.mix = rand(i, 10);
      } else if (variant === 'meteor_shower') {
        const fall = 1 - age;
        p.x = Math.cos(a) * d + fall * 2.2;
        p.z = Math.sin(a) * d;
        p.y = fall * spread;
        p.dx = -0.35; p.dy = -0.7 - turbulence * 0.2;
        p.size = base * 0.9;
      } else if (variant === 'stardust') {
        p.x = Math.cos(rand(i, 5) * TAU + f.t * 0.12) * r * (0.4 + rand(i, 6) * 0.7);
        p.z = Math.sin(rand(i, 5) * TAU + f.t * 0.12) * r * (0.4 + rand(i, 6) * 0.7);
        p.y = rand(i, 7) * spread;
        const tw = Math.pow(Math.max(0, Math.sin(f.t * (2 + rand(i, 8) * 3) + i * 7)), 6);
        p.alpha = 0.15 + tw;
        p.size = base * (0.7 + tw * 2.2);
        p.mix = rand(i, 9);
      } else if (variant === 'ember_storm') {
        const swirl = a + age * (2 + turbulence * 2);
        const rr = d * (0.6 + age * 0.8);
        p.x = Math.cos(swirl) * rr;
        p.z = Math.sin(swirl) * rr;
        p.y = age * spread;
        p.dx = -Math.sin(swirl) * 0.25; p.dz = Math.cos(swirl) * 0.25; p.dy = 0.2;
        p.size = base * 0.65;
      } else {
        const y = rand(i, 12 + k) * 2 - 1;
        const s = Math.sqrt(1 - y * y);
        const dist = 0.4 + age * age * r * 1.4;
        p.x = Math.cos(a) * s * dist; p.y = y * dist; p.z = Math.sin(a) * s * dist;
        const stretch = (0.1 + age * 0.9) / dist;
        p.dx = p.x * stretch; p.dy = p.y * stretch; p.dz = p.z * stretch;
        p.size = base * 0.45;
      }
      p.size *= 0.8 + f.mod * 0.2;
    });
  };
};

// ============================================================ distortion
// These are translucent overlay effects (no screen-space refraction).
const distortion = (variant: string): Builder => (kit) => {
  if (variant === 'sonic_rings') {
    const count = int(kit.layer.settings.arcCount, 1, 8);
    const geometry = kit.track(new THREE.PlaneGeometry(2, 2));
    const items = Array.from({ length: count }, () => {
      const material = surfaceMaterial(kit, {
        fragment: `float r = length(vUv * 2.0 - 1.0); float d = r - 0.86;
          float n = noise3(vec3(vUv * 18.0, uTime * 3.0));
          alpha = exp(-abs(d + (n - 0.5) * 0.05 * uTurbulence) * 28.0) * step(r, 1.0);
          color = mix(uColorB, uColorA, smoothstep(-0.1, 0.05, d));`,
      });
      const mesh = new THREE.Mesh(geometry, material);
      kit.group.add(mesh);
      return { mesh, material };
    });
    const camQ = new THREE.Quaternion();
    const parentQ = new THREE.Quaternion();
    for (const it of items) {
      it.mesh.onBeforeRender = (_r, _s, camera) => {
        // Face the camera so the shockwave reads as a lens ripple.
        camera.getWorldQuaternion(camQ);
        it.mesh.parent!.getWorldQuaternion(parentQ).invert();
        it.mesh.quaternion.copy(parentQ).multiply(camQ);
        it.mesh.updateMatrixWorld();
        it.mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, it.mesh.matrixWorld);
      };
    }
    return (f) => {
      items.forEach(({ mesh, material }, i) => {
        const age = fract(f.t * 0.45 + i / count);
        mesh.scale.setScalar(Math.max(0.05, f.s.radius * f.objScale * (0.2 + age * 1.1)));
        applyCommon(material, f, Math.pow(1 - age, 1.4));
      });
    };
  }
  if (variant === 'glitch_field') {
    const count = int(kit.layer.settings.arcCount, 3, 24);
    const geometry = kit.track(new THREE.PlaneGeometry(1, 1));
    const bars = Array.from({ length: count }, () => {
      const material = surfaceMaterial(kit, {
        fragment: `float blocks = step(0.42, noise3(vec3(floor(vUv.x * 14.0), floor(uTime * 12.0), vPos.y)));
          float scan = 0.6 + 0.4 * sin(vUv.y * 40.0);
          color = mix(uColorA, uColorB, step(0.5, noise3(vec3(floor(vUv.x * 5.0), floor(uTime * 7.0), 2.0))));
          alpha = blocks * scan;`,
      });
      const mesh = new THREE.Mesh(geometry, material);
      kit.group.add(mesh);
      return { mesh, material };
    });
    return (f) => {
      bars.forEach(({ mesh, material }, i) => {
        const k = Math.floor(f.t * 9 + i * 3) % 101;
        const a = rand(i, k) * TAU;
        const r = f.s.radius * (0.55 + rand(i, k + 1) * 0.5);
        mesh.position.set(Math.cos(a) * r, (rand(i, k + 2) - 0.5) * f.s.spread, Math.sin(a) * r);
        mesh.rotation.y = -a + Math.PI / 2;
        mesh.scale.set((0.3 + rand(i, k + 3) * 1.2) * f.objScale, (0.03 + rand(i, k + 4) * 0.14) * f.objScale, 1);
        mesh.visible = rand(i, k + 5) > 0.3;
        applyCommon(material, f);
      });
    };
  }
  const vortex = variant === 'vortex_warp';
  const geometry = vortex
    ? new THREE.SphereGeometry(1, 48, 32)
    : new THREE.CylinderGeometry(1, 0.8, 1, 48, 24, true);
  const material = surfaceMaterial(kit, {
    vertex: /* glsl */ `
      vUv = uv; vPos = position;
      vec3 p = position;
      ${vortex
        ? `float twist = p.y * 2.2 + uTime * 0.8; float c = cos(twist), s = sin(twist); p.xz = mat2(c, s, -s, c) * p.xz;
           p *= 1.0 + sin(p.y * 7.0 - uTime * 3.0) * 0.07 * uTurbulence;`
        : `p.xz *= 1.0 + sin(p.y * 16.0 - uTime * 5.0 + uv.x * 18.0) * 0.09 * uTurbulence;`}
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vView = -mv.xyz; vNormalV = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mv;
    `,
    fragment: vortex
      ? `float a = atan(vPos.z, vPos.x);
         float arm = pow(0.5 + 0.5 * sin(a * 5.0 + vPos.y * 9.0 - uTime * 3.0), 5.0);
         float rim = pow(1.0 - facing, 1.6);
         color = mix(uColorA, uColorB, arm); alpha = arm * 0.5 + rim * 0.55;`
      : `float n = fbm(vec3(vUv.x * 14.0, vUv.y * 5.0 - uTime * 2.2, uTime * 0.3));
         float wave = pow(clamp(1.0 - abs(n - 0.5) * 6.0, 0.0, 1.0), 2.0);
         color = mix(uColorB, uColorA, vUv.y); alpha = wave * (1.0 - vUv.y) * smoothstep(0.0, 0.15, vUv.y) * (0.3 + facing);`,
  });
  const mesh = addMesh(kit, geometry, material);
  return (f) => {
    const r = f.s.radius * f.objScale;
    if (vortex) mesh.scale.setScalar(r);
    else mesh.scale.set(r * 0.75, f.s.spread * f.objScale, r * 0.75);
    mesh.rotation.y += f.layer.animation.rotationSpeed.y * f.dt;
    applyCommon(material, f);
  };
};

// ============================================================ body materials
const SKIN_FRAGMENTS: Record<string, string> = {
  flame_skin: `float n = fbm(q * vec3(3.0, 1.9, 3.0) + vec3(0.0, -uTime * 2.6, 0.0));
    float f = smoothstep(0.36, 0.72, n);
    color = mix(uColorB, uColorA, f) * (1.0 + f * 0.8); alpha = f * 0.9 + pow(1.0 - facing, 2.0) * 0.5;`,
  electric_skin: `float n = fbm(q * 3.6 + vec3(0.0, 0.0, floor(uTime * 14.0) * 0.61));
    float arc = pow(clamp(1.0 - abs(n - 0.5) * 12.0, 0.0, 1.0), 2.0);
    color = mix(uColorB, uColorA, arc) + pow(arc, 5.0); alpha = arc + pow(1.0 - facing, 3.0) * 0.4;`,
  galaxy_skin: `float n = fbm(q * 1.7 + vec3(uTime * 0.15, -uTime * 0.1, 0.0));
    vec3 cell = floor(q * 22.0); float h = h31(cell);
    float star = step(0.955, h) * smoothstep(0.55, 0.05, length(fract(q * 22.0) - 0.5)) * (0.6 + 0.4 * sin(uTime * 4.0 + h * 90.0));
    color = mix(uColorB, uColorA, smoothstep(0.32, 0.75, n)) + star * 2.5; alpha = 0.96;`,
  hologram: `float line = pow(0.5 + 0.5 * sin(vWorldY * 70.0 - uTime * 8.0), 4.0);
    float sweep = pow(0.5 + 0.5 * sin(vWorldY * 4.0 - uTime * 2.4), 16.0);
    float glitch = step(0.9, h31(vec3(floor(vWorldY * 14.0), floor(uTime * 9.0), 1.0)));
    color = mix(uColorA, uColorB, glitch) + sweep;
    alpha = 0.12 + line * 0.35 + sweep * 0.7 + glitch * 0.35 + pow(1.0 - facing, 2.0) * 0.6;`,
  lava_cracks: `float n = fbm(q * 2.6 + vec3(0.0, uTime * 0.18, 0.0));
    float crack = pow(clamp(1.0 - abs(n - 0.5) * 9.0, 0.0, 1.0), 1.5);
    float heat = 0.75 + 0.25 * sin(uTime * 2.5 + n * 20.0);
    color = mix(uColorB, uColorA * 2.0, crack * heat) + crack * crack * 0.4; alpha = 0.94;`,
  frost: `float n = fbm(q * 5.0);
    vec3 cell = floor(q * 28.0); float h = h31(cell);
    float glint = step(0.96, h) * pow(0.5 + 0.5 * sin(uTime * 3.0 + h * 120.0), 8.0);
    color = mix(uColorB, uColorA, n) + glint * 2.0;
    alpha = smoothstep(0.35, 0.75, n) * 0.6 + pow(1.0 - facing, 1.5) * 0.7 + glint;`,
  rainbow_chrome: `float band = fbm(q * 1.4 + vec3(0.0, -uTime * 0.4, 0.0)) * 2.0 + facing * 1.2;
    color = 0.55 + 0.45 * cos(6.28318 * (band + vec3(0.0, 0.33, 0.66)));
    color = mix(color, mix(uColorA, uColorB, facing), 0.3); alpha = 0.55 + pow(1.0 - facing, 2.0) * 0.45;`,
  silhouette: `color = mix(uColorB, uColorA, facing);
    float flick = 0.75 + 0.25 * noise3(q * 3.0 + vec3(0.0, -uTime * 3.0, 0.0));
    alpha = smoothstep(0.0, 0.75, facing) * flick * 0.9;`,
};

const PART_NAMES: Record<string, string[]> = {
  head: ['Head'], leftArm: ['LeftArm'], rightArm: ['RightArm'], leftLeg: ['LeftLeg'], rightLeg: ['RightLeg'], torso: ['Torso'],
};

const skins = (variant: string, rig: R6Rig): Builder => (kit: Kit) => {
  const outline = variant === 'silhouette';
  const material = surfaceMaterial(kit, {
    pars: 'varying vec3 q; varying float vWorldY;',
    side: outline ? THREE.BackSide : THREE.FrontSide,
    vertex: /* glsl */ `
      vUv = uv; vPos = position;
      vec4 world = modelMatrix * vec4(position, 1.0);
      q = world.xyz; vWorldY = world.y;
      vec4 mv = viewMatrix * world;
      vView = -mv.xyz; vNormalV = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mv;
    `,
    fragment: SKIN_FRAGMENTS[variant],
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  const names = PART_NAMES[kit.layer.anchor];
  const shells = rig.bodyMeshes
    .filter((m) => !names || names.includes(m.name))
    .map((body) => {
      const shell = new THREE.Mesh(body.geometry, material);
      shell.name = `GlowShell_${body.name}_${kit.layer.id}`;
      body.add(shell);
      return shell;
    });
  kit.track({ dispose: () => shells.forEach((s) => s.removeFromParent()) });
  return (f) => {
    const grow = Math.max(1.012, Math.min(1.6, 1.025 + (f.s.size * f.objScale - 1) * (outline ? 0.4 : 0.15)));
    for (const s of shells) {
      s.visible = f.layer.visible;
      s.scale.setScalar(grow);
    }
    applyCommon(material, f);
  };
};

// ============================================================ light beams
const beams = (variant: string): Builder => (kit) => {
  const count = int(kit.layer.settings.arcCount, 1, 24);
  const geometry = kit.track(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true));
  geometry.translate(0, 0.5, 0);
  const laser = variant === 'laser_cage';
  const items = Array.from({ length: count }, (_, i) => {
    const material = surfaceMaterial(kit, {
      fragment: `
        float soft = pow(facing, ${laser ? '0.6' : '2.2'});
        float fade = smoothstep(0.0, ${variant === 'sky_strikes' ? '0.02' : '0.1'}, vUv.y) * pow(1.0 - vUv.y, ${laser ? '0.35' : '1.2'});
        float streak = 0.65 + 0.6 * noise3(vec3(vUv.x * 18.0, vUv.y * 3.0 - uTime * 2.4, ${i.toFixed(1)}));
        color = mix(uColorA, uColorB, vUv.y) + ${laser ? 'pow(facing, 3.0) * 0.6' : '0.0'};
        alpha = soft * fade * streak;`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    kit.group.add(mesh);
    return { mesh, material };
  });
  const dir = v3();
  const up = new THREE.Vector3(0, 1, 0);
  return (f) => {
    const r = f.s.radius * f.objScale;
    const h = f.s.spread * f.objScale;
    items.forEach(({ mesh, material }, i) => {
      const a = (i / count) * TAU + f.t * f.layer.animation.rotationSpeed.y;
      let opacity = 1;
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      if (variant === 'sunburst') {
        dir.set(Math.cos(a), Math.sin(a), 0);
        mesh.position.set(0, 1.55, -0.65 - i * 0.002);
        mesh.quaternion.setFromUnitVectors(up, dir);
        const len = h * (0.55 + 0.45 * rand(i, 1) + Math.sin(f.t * 3 + i * 2) * 0.1);
        mesh.scale.set(r * 0.16 * (0.6 + rand(i, 2)), len, r * 0.16);
      } else if (variant === 'sky_strikes') {
        const cycle = f.t * (0.45 + rand(i, 1) * 0.5) + rand(i, 2);
        const k = Math.floor(cycle) % 97;
        const age = fract(cycle);
        const aa = rand(i, k) * TAU;
        const d = r * (0.3 + rand(i, k + 1) * 0.8);
        mesh.position.set(Math.cos(aa) * d, 0, Math.sin(aa) * d);
        mesh.scale.set(0.3 * f.objScale * (1 - age * 0.7), h, 0.3 * f.objScale * (1 - age * 0.7));
        opacity = fadeInOut(age, 0.12) * (1 - age * 0.5);
      } else if (laser) {
        mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        dir.set(-Math.cos(a) * 0.12, 1, -Math.sin(a) * 0.12).normalize();
        mesh.quaternion.setFromUnitVectors(up, dir);
        mesh.scale.set(0.035 * f.objScale, h, 0.035 * f.objScale);
        opacity = 0.75 + 0.25 * Math.sin(f.t * 9 + i * 3);
      } else if (variant === 'divine_pillar') {
        const k = (i + 1) / count;
        mesh.scale.set(r * (0.35 + k * 0.9), h * (1.15 - k * 0.25), r * (0.35 + k * 0.9));
        mesh.rotation.y = f.t * (i % 2 ? -0.5 : 0.7);
        opacity = 1 - k * 0.45;
      } else {
        const sway = 0.55 + Math.sin(f.t * 0.9 + i * 1.7) * 0.35;
        dir.set(Math.cos(a) * sway, 1, Math.sin(a) * sway).normalize();
        mesh.position.set(Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5);
        mesh.quaternion.setFromUnitVectors(up, dir);
        mesh.scale.set(0.38 * f.objScale, h, 0.38 * f.objScale);
      }
      applyCommon(material, f, opacity);
    });
  };
};

export function styleBuilder(type: string, variant: string, rig: R6Rig): Builder | null {
  switch (type) {
    case 'energy_spheres': return spheres(variant);
    case 'rotating_rings': return rings(variant);
    case 'orbiting_objects': return orbiters(variant);
    case 'particle_systems': return particles(variant);
    case 'lightning_effects': return lightning(variant);
    case 'energy_ribbons': return ribbons(variant);
    case 'floating_sparks': return sparks(variant);
    case 'distortion_effects': return distortion(variant);
    case 'glowing_materials': return skins(variant, rig);
    case 'light_beams': return beams(variant);
    default: return null;
  }
}
