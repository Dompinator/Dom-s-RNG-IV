import * as THREE from 'three';
import { getProceduralTexture } from '../aura/textures';
import type { AuraLayer, OrbiterShape } from '../aura/types';
import type { R6Rig } from './r6Character';
import {
  createDistortionShaderMaterial,
  createEnergySphereShaderMaterial,
  createGlowShellShaderMaterial,
  createLightBeamShaderMaterial,
  createParticleShaderMaterial,
  createRibbonShaderMaterial,
  createRingShaderMaterial,
} from './shaders';

// Reusable scratch math objects (zero per-frame GC)
const _dummy = new THREE.Object3D();
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorMix = new THREE.Color();

export interface CompiledLayerRuntime {
  layerId: string;
  signature: string;
  group: THREE.Group;
  update: (dt: number, elapsed: number, layer: AuraLayer, pixelRatio: number) => void;
  dispose: () => void;
}

/**
 * Returns a structural signature; if unchanged, sliders/colors update smoothly in-place
 * without rebuilding Three.js buffers or resetting particle positions.
 */
export function getLayerStructuralSignature(layer: AuraLayer): string {
  const s = layer.settings;
  return [
    layer.type,
    layer.anchor,
    layer.textureRef,
    layer.blendMode,
    s.particleCount,
    s.arcCount,
    s.segments,
    s.emissionShape,
    s.orbiterShape,
    s.wireframe ? 1 : 0,
    s.doubleSided ? 1 : 0,
  ].join('|');
}

function getBlending(layer: AuraLayer): THREE.Blending {
  return layer.blendMode === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
}

function computeAnimModulation(elapsed: number, layer: AuraLayer): number {
  const { mode, speed, amplitude, frequency } = layer.animation;
  const t = elapsed * Math.max(0.05, speed) * frequency;
  switch (mode) {
    case 'pulse':
      return 1 + Math.sin(t * 2.0) * amplitude;
    case 'burst': {
      const saw = (t * 0.6) % 1;
      const spike = Math.exp(-saw * 5.0) * 1.4;
      return 1 + spike * amplitude;
    }
    case 'wave':
      return 1 + (Math.sin(t) * 0.6 + Math.cos(t * 1.7) * 0.4) * amplitude;
    case 'chaos':
      return (
        1 +
        (Math.sin(t * 3.1) * 0.5 + Math.cos(t * 7.3) * 0.35 + Math.sin(t * 13.7) * 0.15) *
          amplitude
      );
    case 'smooth':
    default:
      return 1 + Math.sin(t * 0.6) * amplitude * 0.25;
  }
}

function createOrbiterGeometry(shape: OrbiterShape): THREE.BufferGeometry {
  switch (shape) {
    case 'sphere':
      return new THREE.SphereGeometry(0.28, 20, 16);
    case 'octahedron':
      return new THREE.OctahedronGeometry(0.35, 0);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(0.32, 0);
    case 'cube':
      return new THREE.BoxGeometry(0.42, 0.42, 0.42);
    case 'torus_knot':
      return new THREE.TorusKnotGeometry(0.22, 0.07, 40, 8);
    case 'shard': {
      const geo = new THREE.ConeGeometry(0.18, 0.78, 5);
      geo.rotateX(Math.PI * 0.5);
      return geo;
    }
    case 'crystal':
    default: {
      const geo = new THREE.OctahedronGeometry(0.28, 0);
      geo.scale(0.65, 1.45, 0.65);
      return geo;
    }
  }
}

export function buildLayerRuntime(
  layer: AuraLayer,
  rig: R6Rig,
  maxAnisotropy: number,
): CompiledLayerRuntime {
  const group = new THREE.Group();
  group.name = `AuraLayer_${layer.id}`;

  const anchorObj = rig.anchors[layer.anchor] || rig.anchors.root;
  anchorObj.add(group);

  const disposables: { dispose: () => void }[] = [];
  const tex = getProceduralTexture(layer.textureRef, maxAnisotropy);
  const blending = getBlending(layer);
  const side = layer.settings.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  const sig = getLayerStructuralSignature(layer);

  // Common transform sync helper
  const syncBaseTransform = (l: AuraLayer, mod: number) => {
    group.visible = l.visible;
    group.position.set(l.position.x, l.position.y, l.position.z);
    group.scale.setScalar(
      l.type === 'glowing_materials' ? 1 : Math.max(0.05, l.settings.size * (0.92 + mod * 0.08)),
    );
  };

  // =========================================================================
  // 1. ENERGY SPHERES
  // =========================================================================
  if (layer.type === 'energy_spheres') {
    const segs = Math.max(16, Math.min(64, layer.settings.segments));
    const outerGeo = new THREE.SphereGeometry(1, segs, segs);
    const innerGeo = new THREE.SphereGeometry(0.68, Math.max(12, segs / 2), Math.max(12, segs / 2));
    disposables.push(outerGeo, innerGeo);

    const outerMat = createEnergySphereShaderMaterial(tex);
    outerMat.blending = blending;
    outerMat.side = side;
    outerMat.wireframe = layer.settings.wireframe;
    disposables.push(outerMat);

    const innerMat = new THREE.MeshBasicMaterial({
      color: layer.secondaryColor,
      transparent: true,
      opacity: 0.25,
      blending,
      depthWrite: false,
      wireframe: true,
    });
    disposables.push(innerMat);

    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    group.add(outerMesh, innerMesh);

    return {
      layerId: layer.id,
      signature: sig,
      group,
      update: (dt, elapsed, l) => {
        const mod = computeAnimModulation(elapsed, l);
        syncBaseTransform(l, mod);
        if (!l.visible) return;

        const r = l.settings.radius * mod;
        outerMesh.scale.setScalar(r);
        innerMesh.scale.setScalar(r * 0.92);

        const dir = l.settings.reverseDirection ? -1 : 1;
        const spd = l.animation.speed * dir;
        outerMesh.rotation.x += l.animation.rotationSpeed.x * spd * dt;
        outerMesh.rotation.y += l.animation.rotationSpeed.y * spd * dt;
        outerMesh.rotation.z += l.animation.rotationSpeed.z * spd * dt;
        innerMesh.rotation.y -= l.animation.rotationSpeed.y * spd * dt * 1.3;

        outerMat.uniforms.uTime.value = elapsed * Math.max(0.1, l.animation.speed);
        outerMat.uniforms.uColorA.value.set(l.color);
        outerMat.uniforms.uColorB.value.set(l.secondaryColor);
        outerMat.uniforms.uIntensity.value = l.settings.intensity * l.settings.glow * mod;
        outerMat.uniforms.uOpacity.value = l.settings.opacity;
        outerMat.uniforms.uTurbulence.value = l.settings.turbulence;

        innerMat.color.set(l.secondaryColor);
        innerMat.opacity = l.settings.opacity * 0.22;
      },
      dispose: () => {
        group.removeFromParent();
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  // =========================================================================
  // 2. ROTATING RINGS
  // =========================================================================
  if (layer.type === 'rotating_rings') {
    const segs = Math.max(24, Math.min(128, layer.settings.segments));
    // Build a flat UV-mapped annulus + glowing rim torus
    const bandGeo = new THREE.RingGeometry(0.76, 1.0, segs, 1);
    // Remap ring UVs so u wraps around circumference [0..1] and v goes radially [0..1]
    const posAttr = bandGeo.attributes.position;
    const uvAttr = bandGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const angle = (Math.atan2(y, x) + Math.PI) / (Math.PI * 2);
      const dist = Math.hypot(x, y);
      const v = THREE.MathUtils.clamp((dist - 0.76) / 0.24, 0, 1);
      uvAttr.setXY(i, angle, v);
    }
    bandGeo.rotateX(-Math.PI / 2);

    const rimGeo = new THREE.TorusGeometry(0.99, 0.018, 12, segs);
    rimGeo.rotateX(Math.PI / 2);
    disposables.push(bandGeo, rimGeo);

    const bandMat = createRingShaderMaterial(tex);
    bandMat.blending = blending;
    bandMat.side = side;
    bandMat.wireframe = layer.settings.wireframe;
    disposables.push(bandMat);

    const rimMat = new THREE.MeshBasicMaterial({
      color: layer.secondaryColor,
      transparent: true,
      opacity: 0.85,
      blending,
      depthWrite: false,
    });
    disposables.push(rimMat);

    const ringCount = Math.max(1, Math.min(5, layer.settings.arcCount > 0 ? Math.min(3, Math.ceil(layer.settings.arcCount / 2)) : 1));
    const subRings: THREE.Group[] = [];
    for (let i = 0; i < ringCount; i++) {
      const sub = new THREE.Group();
      const bandMesh = new THREE.Mesh(bandGeo, bandMat);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      sub.add(bandMesh, rimMesh);
      group.add(sub);
      subRings.push(sub);
    }

    return {
      layerId: layer.id,
      signature: sig,
      group,
      update: (dt, elapsed, l) => {
        const mod = computeAnimModulation(elapsed, l);
        syncBaseTransform(l, mod);
        if (!l.visible) return;

        group.rotation.set(l.rotation.x, group.rotation.y, l.rotation.z + l.settings.tilt);
        const dir = l.settings.reverseDirection ? -1 : 1;
        const spd = l.animation.speed * dir;
        group.rotation.y += l.animation.rotationSpeed.y * spd * dt;
        group.rotation.x += l.animation.rotationSpeed.x * spd * dt * 0.35;

        const isSphereCage = l.settings.emissionShape === 'sphere';
        subRings.forEach((sub, idx) => {
          const factor = isSphereCage ? 1 - idx * 0.06 : 1 - idx * 0.22;
          sub.scale.set(
            l.settings.radius * factor,
            1 + l.settings.thickness * 3.0,
            l.settings.radius * factor,
          );
          if (isSphereCage) {
            sub.position.y = 0;
            sub.rotation.x = idx * (Math.PI / Math.max(2, subRings.length)) + l.settings.tilt;
            sub.rotation.z = idx * 0.7;
            sub.rotation.y += (idx % 2 === 0 ? 1 : -1.2) * spd * dt * 0.75;
          } else {
            sub.position.y = idx * 0.08 * l.settings.spread;
            sub.rotation.x = 0;
            sub.rotation.y += (idx % 2 === 0 ? 1 : -1.4) * spd * dt * 0.6;
            sub.rotation.z = idx * l.settings.tilt * 0.6;
          }
        });

        bandMat.uniforms.uTime.value = elapsed * Math.max(0.1, l.animation.speed);
        bandMat.uniforms.uColorA.value.set(l.color);
        bandMat.uniforms.uColorB.value.set(l.secondaryColor);
        bandMat.uniforms.uIntensity.value = l.settings.intensity * l.settings.glow * mod;
        bandMat.uniforms.uOpacity.value = l.settings.opacity;
        bandMat.uniforms.uDirection.value = dir;

        rimMat.color.set(l.secondaryColor);
        rimMat.opacity = l.settings.opacity * 0.75;
      },
      dispose: () => {
        group.removeFromParent();
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  // =========================================================================
  // 3. ORBITING OBJECTS
  // =========================================================================
  if (layer.type === 'orbiting_objects') {
    const count = Math.max(1, Math.min(64, Math.round(layer.settings.particleCount)));
    const geo = createOrbiterGeometry(layer.settings.orbiterShape);
    disposables.push(geo);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(layer.color),
      emissiveIntensity: layer.settings.intensity,
      roughness: 0.22,
      metalness: 0.75,
      transparent: true,
      opacity: layer.settings.opacity,
      wireframe: layer.settings.wireframe,
      map: tex,
    });
    disposables.push(mat);

    const instanced = new THREE.InstancedMesh(geo, mat, count);
    instanced.frustumCulled = false;
    group.add(instanced);

    const phases = new Float32Array(count);
    const inclinations = new Float32Array(count);
    const radiiJitter = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      phases[i] = (i / count) * Math.PI * 2;
      inclinations[i] = ((i % 5) - 2) * 0.22;
      radiiJitter[i] = 0.85 + ((i * 73) % 30) / 100;
      _colorA.set(layer.color);
      _colorB.set(layer.secondaryColor);
      _colorMix.copy(_colorA).lerp(_colorB, i / Math.max(1, count - 1));
      instanced.setColorAt(i, _colorMix);
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;

    return {
      layerId: layer.id,
      signature: sig,
      group,
      update: (_dt, elapsed, l) => {
        const mod = computeAnimModulation(elapsed, l);
        syncBaseTransform(l, mod);
        if (!l.visible) return;

        group.rotation.set(l.rotation.x, l.rotation.y, l.rotation.z + l.settings.tilt);
        const dir = l.settings.reverseDirection ? -1 : 1;
        const t = elapsed * l.animation.speed * dir;

        _colorA.set(l.color);
        _colorB.set(l.secondaryColor);
        mat.emissive.copy(_colorA);
        mat.emissiveIntensity = l.settings.intensity * l.settings.glow * 0.9 * mod;
        mat.opacity = l.settings.opacity;

        const isSphereOrbit = l.settings.emissionShape === 'sphere';
        for (let i = 0; i < count; i++) {
          const angle = phases[i] + t * l.animation.rotationSpeed.y;
          const r = l.settings.radius * radiiJitter[i];

          if (isSphereOrbit) {
            const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
            const theta = angle + i * 2.39996;
            _dummy.position.set(
              Math.sin(phi) * Math.cos(theta) * r,
              Math.cos(phi) * r,
              Math.sin(phi) * Math.sin(theta) * r,
            );
          } else {
            const incl = inclinations[i] * l.settings.spread;
            const yBob = Math.sin(angle * 2 + i) * 0.35 * l.settings.spread;
            _dummy.position.set(
              Math.cos(angle) * r,
              yBob + Math.sin(angle) * incl * r,
              Math.sin(angle) * r,
            );
          }

          _dummy.rotation.set(
            t * l.animation.rotationSpeed.x + i,
            -angle + t * 0.5,
            t * l.animation.rotationSpeed.z + i * 0.4,
          );
          const s = 0.65 + 0.35 * mod;
          _dummy.scale.setScalar(s);
          _dummy.updateMatrix();
          instanced.setMatrixAt(i, _dummy.matrix);

          _colorMix.copy(_colorA).lerp(_colorB, i / Math.max(1, count - 1));
          instanced.setColorAt(i, _colorMix);
        }
        instanced.instanceMatrix.needsUpdate = true;
        if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
      },
      dispose: () => {
        group.removeFromParent();
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  // =========================================================================
  // 4. PARTICLE SYSTEMS
  // =========================================================================
  if (layer.type === 'particle_systems') {
    const count = Math.max(10, Math.min(3000, Math.round(layer.settings.particleCount)));
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const ages = new Float32Array(count);
    const lifetimes = new Float32Array(count);
    const scales = new Float32Array(count);
    const lifeNorm = new Float32Array(count);

    const spawnParticle = (i: number, l: AuraLayer, randomAge = false) => {
      const shape = l.settings.emissionShape;
      const r = l.settings.radius;
      const spr = l.settings.spread;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      let x = 0;
      let y = 0;
      let z = 0;
      let vx = 0;
      let vy = 0;
      let vz = 0;

      if (shape === 'sphere') {
        const rr = r * (0.4 + Math.random() * 0.6);
        x = rr * Math.sin(phi) * Math.cos(theta);
        y = rr * Math.cos(phi);
        z = rr * Math.sin(phi) * Math.sin(theta);
        vx = x * 0.35;
        vy = y * 0.35 + 0.25;
        vz = z * 0.35;
      } else if (shape === 'torus') {
        const ringR = r;
        const tubeR = 0.28 * spr;
        const a = Math.random() * Math.PI * 2;
        x = (ringR + tubeR * Math.cos(a)) * Math.cos(theta);
        y = tubeR * Math.sin(a);
        z = (ringR + tubeR * Math.cos(a)) * Math.sin(theta);
        vx = -Math.sin(theta) * 0.6;
        vy = (Math.random() - 0.5) * 0.25;
        vz = Math.cos(theta) * 0.6;
      } else if (shape === 'cone') {
        const h = Math.random() * spr;
        const cr = (h / Math.max(0.1, spr)) * r;
        x = Math.cos(theta) * cr;
        y = h - spr * 0.5;
        z = Math.sin(theta) * cr;
        vx = Math.cos(theta) * 0.25;
        vy = 0.9 + Math.random() * 0.6;
        vz = Math.sin(theta) * 0.25;
      } else if (shape === 'vortex') {
        const rr = r * (0.25 + Math.random() * 0.85);
        x = Math.cos(theta) * rr;
        y = (Math.random() - 0.5) * spr;
        z = Math.sin(theta) * rr;
        vx = -Math.sin(theta) * 1.4;
        vy = 0.55 + Math.random() * 0.6;
        vz = Math.cos(theta) * 1.4;
      } else {
        // cylinder
        const rr = r * (0.5 + Math.random() * 0.5);
        x = Math.cos(theta) * rr;
        y = (Math.random() - 0.5) * spr;
        z = Math.sin(theta) * rr;
        vx = (Math.random() - 0.5) * 0.3;
        vy = 0.5 + Math.random() * 0.7;
        vz = (Math.random() - 0.5) * 0.3;
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      velocities[i * 3] = vx;
      velocities[i * 3 + 1] = vy;
      velocities[i * 3 + 2] = vz;

      const lt = Math.max(0.2, l.settings.lifetime * (0.65 + Math.random() * 0.7));
      lifetimes[i] = lt;
      ages[i] = randomAge ? Math.random() * lt : 0;
      scales[i] = 0.5 + Math.random() * 0.9;
      lifeNorm[i] = ages[i] / lt;
    };

    for (let i = 0; i < count; i++) {
      spawnParticle(i, layer, true);
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const lifeAttr = new THREE.BufferAttribute(lifeNorm, 1);
    const scaleAttr = new THREE.BufferAttribute(scales, 1);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aLife', lifeAttr);
    geo.setAttribute('aScale', scaleAttr);
    disposables.push(geo);

    const mat = createParticleShaderMaterial(tex);
    mat.blending = blending;
    disposables.push(mat);

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);

    return {
      layerId: layer.id,
      signature: sig,
      group,
      update: (dt, elapsed, l, pixelRatio) => {
        const mod = computeAnimModulation(elapsed, l);
        group.visible = l.visible;
        group.position.set(l.position.x, l.position.y, l.position.z);
        group.rotation.set(l.rotation.x, group.rotation.y, l.rotation.z + l.settings.tilt);
        if (!l.visible) return;

        const dir = l.settings.reverseDirection ? -1 : 1;
        const spd = l.animation.speed * dir;
        group.rotation.y += l.animation.rotationSpeed.y * spd * dt * 0.4;

        const turb = l.settings.turbulence;
        const stepDt = dt * Math.max(0.05, l.animation.speed);
        const isVortex = l.settings.emissionShape === 'vortex';

        for (let i = 0; i < count; i++) {
          ages[i] += stepDt;
          if (ages[i] >= lifetimes[i]) {
            spawnParticle(i, l, false);
          }

          let px = positions[i * 3];
          let py = positions[i * 3 + 1];
          let pz = positions[i * 3 + 2];

          let vx = velocities[i * 3];
          let vy = velocities[i * 3 + 1];
          let vz = velocities[i * 3 + 2];

          if (isVortex) {
            const angSpeed = 1.8 * dir * stepDt;
            const cosA = Math.cos(angSpeed);
            const sinA = Math.sin(angSpeed);
            const nx = px * cosA - pz * sinA;
            const nz = px * sinA + pz * cosA;
            px = nx;
            pz = nz;
            py += vy * stepDt * dir;
          } else {
            px += vx * stepDt * dir;
            py += vy * stepDt * dir;
            pz += vz * stepDt * dir;
          }

          if (turb > 0.01) {
            px += Math.sin(elapsed * 2.5 + i * 0.37) * turb * stepDt * 0.8;
            pz += Math.cos(elapsed * 2.1 + i * 0.53) * turb * stepDt * 0.8;
          }

          positions[i * 3] = px;
          positions[i * 3 + 1] = py;
          positions[i * 3 + 2] = pz;
          lifeNorm[i] = Math.min(1, ages[i] / lifetimes[i]);
        }

        posAttr.needsUpdate = true;
        lifeAttr.needsUpdate = true;

        mat.uniforms.uColorA.value.set(l.color);
        mat.uniforms.uColorB.value.set(l.secondaryColor);
        mat.uniforms.uSize.value = l.settings.size * 26.0;
        mat.uniforms.uIntensity.value = l.settings.intensity * l.settings.glow * mod;
        mat.uniforms.uOpacity.value = l.settings.opacity;
        mat.uniforms.uPixelRatio.value = pixelRatio;
      },
      dispose: () => {
        group.removeFromParent();
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  // =========================================================================
  // 5. LIGHTNING EFFECTS (Procedural multi-branch 3D electric ribbons)
  // =========================================================================
  if (layer.type === 'lightning_effects') {
    const arcCount = Math.max(1, Math.min(16, Math.round(layer.settings.arcCount)));
    const segs = Math.max(6, Math.min(32, Math.round(layer.settings.segments)));
    // Each arc has main bolt + 1 fork branch = segs + floor(segs/2) quads (4 verts, 2 tris per segment)
    const branchSegs = Math.max(3, Math.floor(segs / 2));
    const totalQuadsPerArc = segs + branchSegs;
    const totalVerts = arcCount * totalQuadsPerArc * 4;
    const totalIndices = arcCount * totalQuadsPerArc * 6;

    const positions = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const colors = new Float32Array(totalVerts * 3);
    const indices = new Uint16Array(totalIndices);

    let idxPtr = 0;
    for (let q = 0; q < arcCount * totalQuadsPerArc; q++) {
      const v0 = q * 4;
      indices[idxPtr++] = v0;
      indices[idxPtr++] = v0 + 1;
      indices[idxPtr++] = v0 + 2;
      indices[idxPtr++] = v0 + 1;
      indices[idxPtr++] = v0 + 3;
      indices[idxPtr++] = v0 + 2;

      uvs[v0 * 2] = 0;
      uvs[v0 * 2 + 1] = 0;
      uvs[(v0 + 1) * 2] = 0;
      uvs[(v0 + 1) * 2 + 1] = 1;
      uvs[(v0 + 2) * 2] = 1;
      uvs[(v0 + 2) * 2 + 1] = 0;
      uvs[(v0 + 3) * 2] = 1;
      uvs[(v0 + 3) * 2 + 1] = 1;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('color', colAttr);
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    disposables.push(geo);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: layer.settings.opacity,
      blending,
      depthWrite: false,
      side: THREE.DoubleSide,
      map: tex,
    });
    disposables.push(mat);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);

    const ptsMain: THREE.Vector3[] = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
    const ptsBranch: THREE.Vector3[] = Array.from(
      { length: branchSegs + 1 },
      () => new THREE.Vector3(),
    );

    const writeStrip = (
      quadOffset: number,
      pts: THREE.Vector3[],
      countSegs: number,
      halfWidth: number,
      cA: THREE.Color,
      cB: THREE.Color,
      intensity: number,
    ) => {
      for (let s = 0; s < countSegs; s++) {
        const p0 = pts[s];
        const p1 = pts[s + 1];
        _tangent.subVectors(p1, p0).normalize();
        _side.crossVectors(_tangent, _up);
        if (_side.lengthSq() < 0.001) _side.set(1, 0, 0);
        _side.normalize();

        const taper0 = Math.sin((s / countSegs) * Math.PI) * 0.7 + 0.3;
        const taper1 = Math.sin(((s + 1) / countSegs) * Math.PI) * 0.7 + 0.3;
        const w0 = halfWidth * taper0;
        const w1 = halfWidth * taper1;

        const v = (quadOffset + s) * 4;
        positions[v * 3] = p0.x - _side.x * w0;
        positions[v * 3 + 1] = p0.y - _side.y * w0;
        positions[v * 3 + 2] = p0.z - _side.z * w0;

        positions[(v + 1) * 3] = p0.x + _side.x * w0;
        positions[(v + 1) * 3 + 1] = p0.y + _side.y * w0;
        positions[(v + 1) * 3 + 2] = p0.z + _side.z * w0;

        positions[(v + 2) * 3] = p1.x - _side.x * w1;
        positions[(v + 2) * 3 + 1] = p1.y - _side.y * w1;
        positions[(v + 2) * 3 + 2] = p1.z - _side.z * w1;

        positions[(v + 3) * 3] = p1.x + _side.x * w1;
        positions[(v + 3) * 3 + 1] = p1.y + _side.y * w1;
        positions[(v + 3) * 3 + 2] = p1.z + _side.z * w1;

        _colorMix.copy(cA).lerp(cB, (s / countSegs) * 0.65).multiplyScalar(intensity);
        for (let k = 0; k < 4; k++) {
          colors[(v + k) * 3] = _colorMix.r;
          colors[(v + k) * 3 + 1] = _colorMix.g;
          colors[(v + k) * 3 + 2] = _colorMix.b;
        }
      }
    };

    const regenerateBolts = (l: AuraLayer, intensityMod: number) => {
      const r = l.settings.radius;
      const spr = l.settings.spread;
      const jitter = l.settings.turbulence * 0.35;
      const w = Math.max(0.01, l.settings.thickness);
      _colorA.set(l.color);
      _colorB.set(l.secondaryColor);

      const isSphere = l.settings.emissionShape === 'sphere';
      for (let a = 0; a < arcCount; a++) {
        if (isSphere) {
          const th1 = Math.random() * Math.PI * 2;
          const ph1 = Math.acos(2 * Math.random() - 1);
          const th2 = th1 + (Math.random() - 0.5) * 2.0;
          const ph2 = Math.max(0.1, Math.min(Math.PI - 0.1, ph1 + (Math.random() - 0.5) * 1.4));
          _vecA.set(
            Math.sin(ph1) * Math.cos(th1) * r,
            Math.cos(ph1) * r,
            Math.sin(ph1) * Math.sin(th1) * r,
          );
          _vecB.set(
            Math.sin(ph2) * Math.cos(th2) * r,
            Math.cos(ph2) * r,
            Math.sin(ph2) * Math.sin(th2) * r,
          );
        } else {
          const theta1 = Math.random() * Math.PI * 2;
          const theta2 = theta1 + (Math.random() - 0.5) * 2.2;
          const r1 = r * (0.35 + Math.random() * 0.65);
          const r2 = r * (0.45 + Math.random() * 0.55);

          _vecA.set(Math.cos(theta1) * r1, (Math.random() - 0.5) * spr, Math.sin(theta1) * r1);
          _vecB.set(Math.cos(theta2) * r2, (Math.random() - 0.5) * spr, Math.sin(theta2) * r2);
        }

        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          ptsMain[s].lerpVectors(_vecA, _vecB, t);
          if (s > 0 && s < segs) {
            const env = Math.sin(t * Math.PI);
            ptsMain[s].x += (Math.random() - 0.5) * jitter * env;
            ptsMain[s].y += (Math.random() - 0.5) * jitter * env;
            ptsMain[s].z += (Math.random() - 0.5) * jitter * env;
          }
        }

        const branchRootIdx = Math.max(1, Math.floor(segs * 0.4));
        _vecC.copy(ptsMain[branchRootIdx]);
        const endBranch = _vecC
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * r * 0.9,
              (Math.random() - 0.5) * spr * 0.6,
              (Math.random() - 0.5) * r * 0.9,
            ),
          );
        for (let s = 0; s <= branchSegs; s++) {
          const t = s / branchSegs;
          ptsBranch[s].lerpVectors(_vecC, endBranch, t);
          if (s > 0 && s < branchSegs) {
            ptsBranch[s].x += (Math.random() - 0.5) * jitter * 0.7;
            ptsBranch[s].y += (Math.random() - 0.5) * jitter * 0.7;
            ptsBranch[s].z += (Math.random() - 0.5) * jitter * 0.7;
          }
        }

        const baseQuad = a * totalQuadsPerArc;
        writeStrip(baseQuad, ptsMain, segs, w, _colorA, _colorB, intensityMod);
        writeStrip(baseQuad + segs, ptsBranch, branchSegs, w * 0.65, _colorA, _colorB, intensityMod * 0.85);
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    };

    let timer = 999;
    regenerateBolts(layer, layer.settings.intensity);

    return {
      layerId: layer.id,
      signature: sig,
      group,
      update: (dt, elapsed, l) => {
        const mod = computeAnimModulation(elapsed, l);
        syncBaseTransform(l, mod);
        if (!l.visible) return;

        group.rotation.set(l.rotation.x, group.rotation.y, l.rotation.z);
        const dir = l.settings.reverseDirection ? -1 : 1;
        group.rotation.y += l.animation.rotationSpeed.y * l.animation.speed * dir * dt * 0.5;

        const interval = Math.max(0.03, l.settings.lifetime / Math.max(0.25, l.animation.speed));
        timer += dt;
        if (timer >= interval) {
          timer = 0;
          regenerateBolts(l, l.settings.intensity * l.settings.glow * mod);
        }

        mat.opacity = l.settings.opacity;
      },
      dispose: () => {
        group.removeFromParent();
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  // =========================================================================
  // 6. ENERGY RIBBONS & TRAILS
  // =========================================================================
  if (layer.type === 'energy_ribbons') {
    const ribbonCount = Math.max(1, Math.min(8, Math.round(layer.settings.arcCount)));
    const segs = Math.max(24, Math.min(128, Math.round(layer.settings.segments)));

    const mat = createRibbonShaderMaterial(tex);
    mat.blending = blending;
    mat.side = side;
    mat.wireframe = layer.settings.wireframe;
    disposables.push(mat);

    const ribbonMeshes: {
      mesh: THREE.Mesh;
      posAttr: THREE.BufferAttribute;
      phaseOffset: number;
    }[] = [];

    for (let rIdx = 0; rIdx < ribbonCount; rIdx++) {
      const vertCount = (segs + 1) * 2;
      const pos = new Float32Array(vertCount * 3);
      const uvs = new Float32Array(vertCount * 2);
      const indices = new Uint16Array(segs * 6);

      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        uvs[i * 4] = u;
        uvs[i * 4 + 1] = 0;
        uvs[i * 4 + 2] = u;
        uvs[i * 4 + 3] = 1;
      }
      for (let i = 0; i < segs; i++) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        const p = i * 6;
        indices[p] = a;
        indices[p + 1] = b;
        indices[p + 2] = c;
        indices[p + 3] = b;
        indices[p + 4] = d;
        indices[p + 5] = c;
      }

      const geo = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(pos, 3);
      geo.setAttribute('position', posAttr);
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      disposables.push(geo);

      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
      ribbonMeshes.push({
        mesh,
        posAttr,
        phaseOffset: (rIdx / ribbonCount) * Math.PI * 2,
      });
    }

    return {
      layerId: layer.id,
      signature: sig,
      group,
      update: (dt, elapsed, l) => {
        const mod = computeAnimModulation(elapsed, l);
        syncBaseTransform(l, mod);
        if (!l.visible) return;

        group.rotation.set(l.rotation.x, group.rotation.y, l.rotation.z + l.settings.tilt);
        const dir = l.settings.reverseDirection ? -1 : 1;
        const t = elapsed * l.animation.speed * dir;
        group.rotation.y += l.animation.rotationSpeed.y * l.animation.speed * dir * dt * 0.4;

        const radius = l.settings.radius;
        const spread = l.settings.spread;
        const halfW = Math.max(0.02, l.settings.thickness);
        const turb = l.settings.turbulence;

        const isSphereRibbon = l.settings.emissionShape === 'sphere';
        for (let rIdx = 0; rIdx < ribbonMeshes.length; rIdx++) {
          const item = ribbonMeshes[rIdx];
          const arr = item.posAttr.array as Float32Array;
          const phase = item.phaseOffset + t * 1.6;
          const tiltAngle = (rIdx / Math.max(1, ribbonMeshes.length)) * Math.PI;

          for (let i = 0; i <= segs; i++) {
            const u = i / segs;
            const theta = phase + u * Math.PI * 3.2;
            const wave = Math.sin(u * Math.PI * 4 + t * 2.0 + rIdx) * 0.22 * turb;

            if (isSphereRibbon) {
              const rr = radius + wave * 0.7;
              const lat = Math.sin(theta * 0.5) * Math.cos(tiltAngle);
              const x0 = Math.cos(theta) * rr;
              const y0 = Math.sin(theta) * Math.sin(tiltAngle + 0.45) * rr + lat * 0.25 * rr;
              const z0 = Math.sin(theta) * Math.cos(tiltAngle + 0.45) * rr;
              _vecA.set(x0, y0, z0);

              const thetaNext = theta + 0.08;
              const latN = Math.sin(thetaNext * 0.5) * Math.cos(tiltAngle);
              _vecB.set(
                Math.cos(thetaNext) * rr,
                Math.sin(thetaNext) * Math.sin(tiltAngle + 0.45) * rr + latN * 0.25 * rr,
                Math.sin(thetaNext) * Math.cos(tiltAngle + 0.45) * rr,
              );
            } else {
              const rr = radius * (0.75 + 0.25 * Math.sin(u * Math.PI)) + wave;
              _vecA.set(
                Math.cos(theta) * rr,
                (u - 0.5) * spread + Math.cos(theta * 2 + t) * 0.25 * turb,
                Math.sin(theta) * rr,
              );

              const thetaNext = theta + 0.08;
              _vecB.set(
                Math.cos(thetaNext) * rr,
                (u + 0.01 - 0.5) * spread + Math.cos(thetaNext * 2 + t) * 0.25 * turb,
                Math.sin(thetaNext) * rr,
              );
            }

            _tangent.subVectors(_vecB, _vecA).normalize();
            _side.crossVectors(_tangent, _vecA).normalize();
            if (_side.lengthSq() < 0.001) _side.set(0, 1, 0);

            const v0 = i * 2;
            arr[v0 * 3] = _vecA.x - _side.x * halfW;
            arr[v0 * 3 + 1] = _vecA.y - _side.y * halfW;
            arr[v0 * 3 + 2] = _vecA.z - _side.z * halfW;

            arr[(v0 + 1) * 3] = _vecA.x + _side.x * halfW;
            arr[(v0 + 1) * 3 + 1] = _vecA.y + _side.y * halfW;
            arr[(v0 + 1) * 3 + 2] = _vecA.z + _side.z * halfW;
          }
          item.posAttr.needsUpdate = true;
        }

        mat.uniforms.uTime.value = elapsed * Math.max(0.1, l.animation.speed);
        mat.uniforms.uColorA.value.set(l.color);
        mat.uniforms.uColorB.value.set(l.secondaryColor);
        mat.uniforms.uIntensity.value = l.settings.intensity * l.settings.glow * mod;
        mat.uniforms.uOpacity.value = l.settings.opacity;
        mat.uniforms.uDirection.value = dir;
      },
      dispose: () => {
        group.removeFromParent();
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  // =========================================================================
  // 7. FLOATING SPARKS
  // =========================================================================
  if (layer.type === 'floating_sparks') {
    const count = Math.max(8, Math.min(1000, Math.round(layer.settings.particleCount)));
    // Elongated 3D diamond spark geometry stretched along Y
    const sparkGeo = new THREE.OctahedronGeometry(0.16, 0);
    sparkGeo.scale(0.32, 2.2, 0.32);
    disposables.push(sparkGeo);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: layer.settings.opacity,
      blending,
      depthWrite: false,
    });
    disposables.push(mat);

    const instanced = new THREE.InstancedMesh(sparkGeo, mat, count);
    instanced.frustumCulled = false;
    group.add(instanced);

    const px = new Float32Array(count);
    const py = new Float32Array(count);
    const pz = new Float32Array(count);
    const vx = new Float32Array(count);
    const vy = new Float32Array(count);
    const vz = new Float32Array(count);
    const age = new Float32Array(count);
    const life = new Float32Array(count);
    const seed = new Float32Array(count);

    const resetSpark = (i: number, l: AuraLayer, randAge = false) => {
      const a = Math.random() * Math.PI * 2;
      if (l.settings.emissionShape === 'sphere') {
        const phi = Math.acos(2 * Math.random() - 1);
        const rr = l.settings.radius * (0.35 + Math.random() * 0.65);
        px[i] = rr * Math.sin(phi) * Math.cos(a);
        py[i] = rr * Math.cos(phi) + 1.0;
        pz[i] = rr * Math.sin(phi) * Math.sin(a);
        vx[i] = (px[i] / Math.max(0.1, rr)) * 0.85;
        vy[i] = ((py[i] - 1.0) / Math.max(0.1, rr)) * 0.85 + 0.35;
        vz[i] = (pz[i] / Math.max(0.1, rr)) * 0.85;
      } else {
        const r = l.settings.radius * (0.2 + Math.random() * 0.8);
        px[i] = Math.cos(a) * r;
        py[i] = Math.random() * 0.3;
        pz[i] = Math.sin(a) * r;
        vx[i] = (Math.random() - 0.5) * 0.55;
        vy[i] = (0.7 + Math.random() * 1.1) * Math.max(0.25, l.settings.spread * 0.45);
        vz[i] = (Math.random() - 0.5) * 0.55;
      }
      life[i] = Math.max(0.2, l.settings.lifetime * (0.6 + Math.random() * 0.8));
      age[i] = randAge ? Math.random() * life[i] : 0;
      seed[i] = Math.random() * 100;
    };

    for (let i = 0; i < count; i++) resetSpark(i, layer, true);

    return {
      layerId: layer.id,
      signature: sig,
      group,
      update: (dt, elapsed, l) => {
        const mod = computeAnimModulation(elapsed, l);
        syncBaseTransform(l, mod);
        if (!l.visible) return;

        group.rotation.set(l.rotation.x, l.rotation.y, l.rotation.z + l.settings.tilt);
        const dir = l.settings.reverseDirection ? -1 : 1;
        const stepDt = dt * Math.max(0.05, l.animation.speed);
        const turb = l.settings.turbulence;

        _colorA.set(l.color);
        _colorB.set(l.secondaryColor);
        mat.opacity = l.settings.opacity;

        for (let i = 0; i < count; i++) {
          age[i] += stepDt;
          if (age[i] >= life[i]) resetSpark(i, l, false);

          const swX = Math.sin(elapsed * 4.0 + seed[i]) * turb * 0.6;
          const swZ = Math.cos(elapsed * 3.5 + seed[i]) * turb * 0.6;
          const dvx = vx[i] + swX;
          const dvy = vy[i] * dir;
          const dvz = vz[i] + swZ;

          px[i] += dvx * stepDt;
          py[i] += dvy * stepDt;
          pz[i] += dvz * stepDt;

          const normAge = age[i] / life[i];
          const flicker = 0.65 + 0.35 * Math.sin(elapsed * 18.0 + seed[i]);
          const s = Math.sin(normAge * Math.PI) * flicker;

          _dummy.position.set(px[i], py[i], pz[i]);
          _vecA.set(dvx, dvy, dvz).normalize();
          _dummy.quaternion.setFromUnitVectors(_up, _vecA);
          _dummy.scale.set(s, s * (1 + l.settings.intensity * 0.35), s);
          _dummy.updateMatrix();
          instanced.setMatrixAt(i, _dummy.matrix);

          _colorMix
            .copy(_colorA)
            .lerp(_colorB, normAge)
            .multiplyScalar(l.settings.intensity * l.settings.glow * mod);
          instanced.setColorAt(i, _colorMix);
        }
        instanced.instanceMatrix.needsUpdate = true;
        if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
      },
      dispose: () => {
        group.removeFromParent();
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  // =========================================================================
  // 8. DISTORTION EFFECTS
  // =========================================================================
  if (layer.type === 'distortion_effects') {
    const segs = Math.max(24, Math.min(64, layer.settings.segments));
    const sphereGeo = new THREE.IcosahedronGeometry(1, Math.min(4, Math.max(2, Math.floor(segs / 12))));
    const shockGeo = new THREE.RingGeometry(0.65, 1.0, segs, 1);
    shockGeo.rotateX(-Math.PI / 2);
    disposables.push(sphereGeo, shockGeo);

    const sphereMat = createDistortionShaderMaterial(tex);
    sphereMat.blending = blending;
    sphereMat.side = side;
    sphereMat.wireframe = layer.settings.wireframe;
    disposables.push(sphereMat);

    const shockMat = createRingShaderMaterial(tex);
    shockMat.blending = blending;
    disposables.push(shockMat);

    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    const shockMesh = new THREE.Mesh(shockGeo, shockMat);
    shockMesh.position.y = -0.8;
    group.add(sphereMesh, shockMesh);

    return {
      layerId: layer.id,
      signature: sig,
      group,
      update: (dt, elapsed, l) => {
        const mod = computeAnimModulation(elapsed, l);
        syncBaseTransform(l, mod);
        if (!l.visible) return;

        const r = l.settings.radius * (0.95 + mod * 0.08);
        sphereMesh.scale.setScalar(r);

        const waveCycle = (elapsed * Math.max(0.2, l.animation.speed) * 0.7) % 1;
        shockMesh.scale.setScalar(r * (0.4 + waveCycle * 1.35));

        const dir = l.settings.reverseDirection ? -1 : 1;
        sphereMesh.rotation.y += l.animation.rotationSpeed.y * l.animation.speed * dir * dt;
        sphereMesh.rotation.x += l.animation.rotationSpeed.x * l.animation.speed * dir * dt;

        sphereMat.uniforms.uTime.value = elapsed * Math.max(0.1, l.animation.speed);
        sphereMat.uniforms.uColorA.value.set(l.color);
        sphereMat.uniforms.uColorB.value.set(l.secondaryColor);
        sphereMat.uniforms.uIntensity.value = l.settings.intensity * l.settings.glow * mod;
        sphereMat.uniforms.uOpacity.value = l.settings.opacity;
        sphereMat.uniforms.uTurbulence.value = l.settings.turbulence;

        shockMat.uniforms.uTime.value = elapsed * l.animation.speed;
        shockMat.uniforms.uColorA.value.set(l.secondaryColor);
        shockMat.uniforms.uColorB.value.set(l.color);
        shockMat.uniforms.uIntensity.value = l.settings.intensity * (1 - waveCycle);
        shockMat.uniforms.uOpacity.value = l.settings.opacity * (1 - waveCycle) * 0.75;
      },
      dispose: () => {
        group.removeFromParent();
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  // =========================================================================
  // 9. ANIMATED GLOWING MATERIALS (Attached directly onto R6 body parts!)
  // =========================================================================
  if (layer.type === 'glowing_materials') {
    const glowMat = createGlowShellShaderMaterial(tex);
    glowMat.blending = blending;
    glowMat.wireframe = layer.settings.wireframe;
    disposables.push(glowMat);

    // Map anchor to specific R6 body meshes or full body if root/ground/torso
    const partMap: Record<string, string[]> = {
      head: ['Head'],
      leftArm: ['LeftArm'],
      rightArm: ['RightArm'],
      leftLeg: ['LeftLeg'],
      rightLeg: ['RightLeg'],
      torso: ['Torso'],
      root: ['Torso', 'Head', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'],
      ground: ['Torso', 'Head', 'LeftArm', 'RightArm', 'LeftLeg', 'RightLeg'],
    };
    const allowedNames = partMap[layer.anchor] || partMap.root;
    const shellMeshes: THREE.Mesh[] = [];

    for (const bodyMesh of rig.bodyMeshes) {
      if (!allowedNames.includes(bodyMesh.name)) continue;
      const shell = new THREE.Mesh(bodyMesh.geometry, glowMat);
      shell.name = `GlowShell_${bodyMesh.name}_${layer.id}`;
      shell.scale.setScalar(1.045);
      bodyMesh.add(shell);
      shellMeshes.push(shell);
    }

    return {
      layerId: layer.id,
      signature: sig,
      group,
      update: (_dt, elapsed, l) => {
        const mod = computeAnimModulation(elapsed, l);
        group.visible = l.visible;

        const shellScale = Math.max(1.01, Math.min(1.35, 1.02 + (l.settings.size - 1.0) * 0.15));
        for (const s of shellMeshes) {
          s.visible = l.visible;
          s.scale.setScalar(shellScale);
        }

        if (!l.visible) return;
        glowMat.uniforms.uTime.value = elapsed * Math.max(0.1, l.animation.speed);
        glowMat.uniforms.uColorA.value.set(l.color);
        glowMat.uniforms.uColorB.value.set(l.secondaryColor);
        glowMat.uniforms.uIntensity.value = l.settings.intensity * l.settings.glow * mod;
        glowMat.uniforms.uOpacity.value = l.settings.opacity;
        glowMat.uniforms.uTurbulence.value = l.settings.turbulence;
      },
      dispose: () => {
        shellMeshes.forEach((s) => s.removeFromParent());
        group.removeFromParent();
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  // =========================================================================
  // 10. LIGHT BEAMS
  // =========================================================================
  const beamCount = Math.max(1, Math.min(12, Math.round(layer.settings.arcCount)));
  const coneGeo = new THREE.CylinderGeometry(1.0, 0.35, 1.0, 24, 1, true);
  coneGeo.translate(0, 0.5, 0); // Base at y = 0, shoots upward +Y
  disposables.push(coneGeo);

  const beamMat = createLightBeamShaderMaterial(tex);
  beamMat.blending = blending;
  beamMat.wireframe = layer.settings.wireframe;
  disposables.push(beamMat);

  const beams: THREE.Mesh[] = [];
  for (let i = 0; i < beamCount; i++) {
    const m = new THREE.Mesh(coneGeo, beamMat);
    group.add(m);
    beams.push(m);
  }

  return {
    layerId: layer.id,
    signature: sig,
    group,
    update: (dt, elapsed, l) => {
      const mod = computeAnimModulation(elapsed, l);
      syncBaseTransform(l, mod);
      if (!l.visible) return;

      group.rotation.set(l.rotation.x, group.rotation.y, l.rotation.z);
      const dir = l.settings.reverseDirection ? -1 : 1;
      group.rotation.y += l.animation.rotationSpeed.y * l.animation.speed * dir * dt;

      const r = l.settings.radius;
      const height = Math.max(0.5, l.settings.spread);
      const tilt = l.settings.tilt;

      const isSphereBeams = l.settings.emissionShape === 'sphere';
      beams.forEach((m, idx) => {
        if (isSphereBeams) {
          const phi = Math.acos(1 - (2 * (idx + 0.5)) / beamCount);
          const theta = idx * 2.39996;
          _vecA.set(
            Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta),
          ).normalize();
          m.position.set(0, 1.2, 0);
          m.quaternion.setFromUnitVectors(_up, _vecA);
          m.scale.set(r * 0.38, height * 0.75, r * 0.38);
        } else if (beamCount === 1) {
          m.position.set(0, 0, 0);
          m.rotation.set(tilt, 0, 0);
          m.scale.set(r, height, r);
        } else {
          const angle = (idx / beamCount) * Math.PI * 2;
          m.position.set(Math.cos(angle) * r * 0.28, 0, Math.sin(angle) * r * 0.28);
          m.rotation.set(0, -angle, -tilt);
          m.scale.set(r * 0.42, height, r * 0.42);
        }
      });

      beamMat.uniforms.uTime.value = elapsed * Math.max(0.1, l.animation.speed);
      beamMat.uniforms.uColorA.value.set(l.color);
      beamMat.uniforms.uColorB.value.set(l.secondaryColor);
      beamMat.uniforms.uIntensity.value = l.settings.intensity * l.settings.glow * mod;
      beamMat.uniforms.uOpacity.value = l.settings.opacity;
    },
    dispose: () => {
      group.removeFromParent();
      disposables.forEach((d) => d.dispose());
    },
  };
}
