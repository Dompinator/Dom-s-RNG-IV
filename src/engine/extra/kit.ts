/** Building blocks shared by the extra layer renderers. */
import * as THREE from 'three';
import type { AuraLayer } from '../../aura/types';

export interface Frame {
  /** Layer clock: respects speed, reverse and music sync. */
  t: number;
  dt: number;
  /** Pulse/burst/wave/chaos modulation, ~1. */
  mod: number;
  layer: AuraLayer;
  s: AuraLayer['settings'];
  objScale: number;
  /** HDR brightness multiplier. */
  gain: number;
}

export interface Kit {
  group: THREE.Group;
  layer: AuraLayer;
  texture: THREE.Texture;
  track: <T extends { dispose: () => void }>(item: T) => T;
}

export type BuildResult = (frame: Frame) => void;
export type Builder = (kit: Kit) => BuildResult;

export const TAU = Math.PI * 2;

/** Deterministic 0..1 value for index i / channel k. */
export function rand(i: number, k = 0): number {
  const x = Math.sin(i * 127.1 + k * 311.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
}
export const fract = (x: number) => x - Math.floor(x);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const fadeInOut = (a: number, edge = 0.15) => clamp01(Math.min(a / edge, (1 - a) / edge));

const NOISE = /* glsl */ `
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise3(p); p = p * 2.05 + 7.3; a *= 0.5; } return v; }
`;

const COMMON_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uIntensity;
uniform float uOpacity;
uniform float uTurbulence;
uniform sampler2D uMap;
`;

function baseUniforms(map: THREE.Texture): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color() },
    uColorB: { value: new THREE.Color() },
    uIntensity: { value: 1 },
    uOpacity: { value: 1 },
    uTurbulence: { value: 0 },
    uMap: { value: map },
  };
}

export function applyCommon(material: THREE.ShaderMaterial, f: Frame, opacity = 1) {
  const u = material.uniforms;
  u.uTime.value = f.t;
  u.uColorA.value.set(f.layer.color);
  u.uColorB.value.set(f.layer.secondaryColor);
  u.uIntensity.value = f.gain;
  u.uOpacity.value = f.s.opacity * opacity;
  u.uTurbulence.value = f.s.turbulence;
}

export function blendingOf(layer: AuraLayer): THREE.Blending {
  return layer.blendMode === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
}

export interface ShaderOptions {
  vertex?: string;
  /** Body of main(); must write `color` (vec3) and `alpha` (float). */
  fragment: string;
  pars?: string;
  /** Helpers that only compile in the fragment shader (e.g. use fwidth). */
  fragmentPars?: string;
  uniforms?: Record<string, THREE.IUniform>;
  side?: THREE.Side;
  depthWrite?: boolean;
}

const DEFAULT_VERTEX = /* glsl */ `
  vUv = uv;
  vPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
`;

/** Surface shader with standard varyings: vUv, vPos, vNormalV, vView. */
export function surfaceMaterial(kit: Kit, options: ShaderOptions): THREE.ShaderMaterial {
  const varyings = 'varying vec2 vUv; varying vec3 vPos; varying vec3 vNormalV; varying vec3 vView;';
  const material = new THREE.ShaderMaterial({
    uniforms: { ...baseUniforms(kit.texture), ...options.uniforms },
    vertexShader: `${COMMON_UNIFORMS}${varyings}${NOISE}${options.pars ?? ''}
      void main() { ${options.vertex ?? DEFAULT_VERTEX} }`,
    fragmentShader: `${COMMON_UNIFORMS}${varyings}${NOISE}${options.pars ?? ''}${options.fragmentPars ?? ''}
      void main() {
        vec3 color = uColorA; float alpha = 1.0;
        float facing = abs(dot(normalize(vNormalV), normalize(vView)));
        ${options.fragment}
        alpha = clamp(alpha * uOpacity, 0.0, 1.0);
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(color * uIntensity, alpha);
      }`,
    transparent: true,
    depthWrite: options.depthWrite ?? false,
    side: options.side ?? THREE.DoubleSide,
    blending: blendingOf(kit.layer),
    wireframe: kit.layer.settings.wireframe,
  });
  return kit.track(material);
}

export function addMesh(kit: Kit, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = kit.group) {
  const mesh = new THREE.Mesh(kit.track(geometry), material);
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

// ------------------------------------------------------------ billboards
export interface Sprite {
  x: number; y: number; z: number;
  size: number;
  /** Radians, in screen space. */
  rot: number;
  /** 0 = primary color, 1 = secondary color. */
  mix: number;
  alpha: number;
  /** Optional world-space streak direction (length = extra stretch). */
  dx: number; dy: number; dz: number;
}

/** Camera-facing textured quads, positioned from the CPU each frame. */
export function createSprites(kit: Kit, count: number, map: THREE.Texture = kit.texture) {
  const geometry = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(1, 1);
  geometry.index = plane.index;
  geometry.setAttribute('position', plane.attributes.position);
  geometry.setAttribute('uv', plane.attributes.uv);
  const make = (size: number) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const offset = make(4); // xyz + size
  const look = make(3); // rotation, mix, alpha
  const dir = make(3);
  geometry.setAttribute('aOffset', offset);
  geometry.setAttribute('aLook', look);
  geometry.setAttribute('aDir', dir);
  geometry.instanceCount = count;
  plane.dispose();

  const material = surfaceMaterial(kit, {
    uniforms: { uMap: { value: map } },
    pars: 'varying float vMix; varying float vAlpha;',
    vertex: /* glsl */ `
      vUv = uv; vPos = position; vNormalV = vec3(0.0, 0.0, 1.0);
      vMix = aLook.y; vAlpha = aLook.z;
      vec4 mv = modelViewMatrix * vec4(aOffset.xyz, 1.0);
      float scale = length(modelMatrix[0].xyz);
      vec3 d = (modelViewMatrix * vec4(aDir, 0.0)).xyz;
      float len = length(d.xy);
      vec2 corner = position.xy;
      if (len > 0.0001) {
        vec2 along = d.xy / len;
        vec2 across = vec2(along.y, -along.x);
        corner = across * corner.x + along * corner.y * (1.0 + len / max(aOffset.w * scale, 0.001));
      } else {
        float c = cos(aLook.x), s = sin(aLook.x);
        corner = mat2(c, s, -s, c) * corner;
      }
      mv.xy += corner * aOffset.w * scale;
      vView = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    `,
    fragment: /* glsl */ `
      vec4 tex = texture2D(uMap, vUv);
      color = mix(uColorA, uColorB, vMix) * tex.rgb;
      alpha = tex.a * vAlpha;
    `,
  });
  material.vertexShader = `attribute vec4 aOffset; attribute vec3 aLook; attribute vec3 aDir;\n${material.vertexShader}`;
  const mesh = addMesh(kit, geometry, material);

  const sprite: Sprite = { x: 0, y: 0, z: 0, size: 0.2, rot: 0, mix: 0, alpha: 1, dx: 0, dy: 0, dz: 0 };
  return {
    count,
    mesh,
    update(f: Frame, place: (i: number, out: Sprite) => void, opacity = 1) {
      for (let i = 0; i < count; i++) {
        sprite.x = sprite.y = sprite.z = sprite.rot = sprite.mix = sprite.dx = sprite.dy = sprite.dz = 0;
        sprite.size = 0.2;
        sprite.alpha = 1;
        place(i, sprite);
        offset.setXYZW(i, sprite.x, sprite.y, sprite.z, Math.max(0, sprite.size));
        look.setXYZ(i, sprite.rot, sprite.mix, sprite.alpha);
        dir.setXYZ(i, sprite.dx, sprite.dy, sprite.dz);
      }
      offset.needsUpdate = look.needsUpdate = dir.needsUpdate = true;
      applyCommon(material, f, opacity);
    },
  };
}

// ------------------------------------------------------------ ribbons / bolts
export type PathFn = (strip: number, u: number, out: THREE.Vector3) => void;

/**
 * Camera-facing strips along arbitrary paths (ribbons, trails, lightning).
 * `style`: 0 soft flowing energy, 1 hard electric core.
 */
export function createStrips(kit: Kit, strips: number, segments: number, style: 0 | 1 = 0) {
  const points = segments + 1;
  const total = strips * points * 2;
  const geometry = new THREE.BufferGeometry();
  const make = (size: number) => {
    const a = new THREE.BufferAttribute(new Float32Array(total * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const position = make(3);
  const tangent = make(3);
  const data = make(4); // u, side, halfWidth, brightness
  geometry.setAttribute('position', position);
  geometry.setAttribute('aTangent', tangent);
  geometry.setAttribute('aData', data);
  const index: number[] = [];
  for (let r = 0; r < strips; r++) {
    for (let s = 0; s < segments; s++) {
      const a = (r * points + s) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geometry.setIndex(index);

  const material = surfaceMaterial(kit, {
    pars: 'varying float vBright;',
    uniforms: { uStyle: { value: style } },
    vertex: /* glsl */ `
      vUv = vec2(aData.x, aData.y); vPos = position; vNormalV = vec3(0.0, 0.0, 1.0); vBright = aData.w;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 t = (modelViewMatrix * vec4(aTangent, 0.0)).xyz;
      vec3 side = cross(t, -mv.xyz);
      side = length(side) > 1e-6 ? normalize(side) : vec3(0.0);
      mv.xyz += side * aData.y * aData.z * length(modelMatrix[0].xyz);
      vView = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    `,
    fragment: /* glsl */ `
      float x = abs(vUv.y);
      if (uStyle < 0.5) {
        float soft = pow(max(1.0 - x, 0.0), 1.6);
        float flow = 0.65 + 0.7 * noise3(vec3(vUv.x * 9.0 - uTime * 3.0, vUv.y * 2.5, 0.0));
        color = mix(uColorA, uColorB, vUv.x) + pow(soft, 5.0) * 0.35;
        alpha = soft * flow * smoothstep(0.0, 0.07, vUv.x) * (1.0 - vUv.x * vUv.x) * vBright;
      } else {
        float core = smoothstep(0.4, 0.08, x);
        float halo = pow(max(1.0 - x, 0.0), 2.0) * 0.55;
        color = mix(uColorB, uColorA, core) + core * 0.5;
        alpha = (core + halo) * vBright;
      }
    `,
  });
  material.uniforms.uStyle = { value: style };
  material.fragmentShader = `uniform float uStyle;\n${material.fragmentShader}`;
  material.vertexShader = `attribute vec3 aTangent; attribute vec4 aData;\n${material.vertexShader}`;
  const mesh = addMesh(kit, geometry, material);

  const cache = Array.from({ length: points }, () => new THREE.Vector3());
  const t = new THREE.Vector3();
  return {
    strips,
    segments,
    mesh,
    update(
      f: Frame,
      path: PathFn,
      width: (strip: number, u: number) => number,
      bright: (strip: number) => number = () => 1,
    ) {
      for (let r = 0; r < strips; r++) {
        for (let s = 0; s < points; s++) path(r, s / segments, cache[s]);
        const b = bright(r);
        for (let s = 0; s < points; s++) {
          const u = s / segments;
          t.subVectors(cache[Math.min(s + 1, segments)], cache[Math.max(s - 1, 0)]);
          const w = width(r, u);
          for (let k = 0; k < 2; k++) {
            const v = (r * points + s) * 2 + k;
            position.setXYZ(v, cache[s].x, cache[s].y, cache[s].z);
            tangent.setXYZ(v, t.x, t.y, t.z);
            data.setXYZW(v, u, k ? 1 : -1, w, b);
          }
        }
      }
      position.needsUpdate = tangent.needsUpdate = data.needsUpdate = true;
      applyCommon(material, f);
    },
  };
}

// ------------------------------------------------------------ lit solids
/** Instanced solid objects with glowing rim lighting (weapons, rocks, links). */
export function createSolids(kit: Kit, geometry: THREE.BufferGeometry, count: number, flat = true) {
  let source = geometry;
  if (flat && geometry.index) {
    source = geometry.toNonIndexed();
    geometry.dispose();
  }
  if (flat) source.computeVertexNormals();
  const material = surfaceMaterial(kit, {
    pars: 'varying float vMix;',
    depthWrite: kit.layer.blendMode === 'normal',
    side: kit.layer.settings.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    vertex: /* glsl */ `
      vUv = uv; vPos = position;
      vMix = instanceColor.r;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      vView = -mv.xyz;
      vNormalV = normalize(normalMatrix * mat3(instanceMatrix) * normal);
      gl_Position = projectionMatrix * mv;
    `,
    fragment: /* glsl */ `
      vec3 n = normalize(vNormalV) * (gl_FrontFacing ? 1.0 : -1.0);
      float light = max(dot(n, normalize(vec3(0.4, 0.75, 0.55))), 0.0);
      float rim = pow(1.0 - facing, 2.0);
      float vein = pow(noise3(vPos * 6.0 + vec3(0.0, uTime * 0.6, 0.0)), 3.0);
      color = mix(uColorB, uColorA, clamp(light * 0.75 + vMix * 0.35, 0.0, 1.0)) * (0.2 + light * 0.55)
            + uColorA * (rim * 0.85 + vein * uTurbulence * 0.8);
      alpha = 0.75 + rim * 0.25;
    `,
  });
  kit.track(source);
  const mesh = new THREE.InstancedMesh(source, material, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) mesh.setColorAt(i, color.setRGB(rand(i, 9), 0, 0));
  kit.track(mesh);
  kit.group.add(mesh);
  const dummy = new THREE.Object3D();
  return {
    count,
    mesh,
    update(f: Frame, place: (i: number, o: THREE.Object3D) => void) {
      for (let i = 0; i < count; i++) {
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        place(i, dummy);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      applyCommon(material, f);
    },
  };
}

/** Merge simple geometries (position/normal/uv) into one. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const position: number[] = [];
  const uv: number[] = [];
  for (const part of parts) {
    const g = part.index ? part.toNonIndexed() : part;
    position.push(...(g.attributes.position.array as Float32Array));
    uv.push(...(g.attributes.uv.array as Float32Array));
    if (g !== part) g.dispose();
    part.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.computeVertexNormals();
  return merged;
}

export function shapeGeometry(points: [number, number][], depth = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  if (!depth) return new THREE.ShapeGeometry(shape);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}
