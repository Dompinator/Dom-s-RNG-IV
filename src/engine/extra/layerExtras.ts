/**
 * Optional customization available on every layer: color modes, flicker, fade
 * cycle, bobbing, per-axis stretch and orbiting the whole layer. When none are
 * set the original runtime receives the untouched layer.
 */
import * as THREE from 'three';
import type { AuraLayer } from '../../aura/types';
import type { CompiledLayerRuntime } from '../layerBuilder';

const a = new THREE.Color();
const b = new THREE.Color();

function modulateColors(layer: AuraLayer, t: number): { color: string; secondaryColor: string } | null {
  const mode = layer.settings.colorMode ?? 'static';
  if (mode === 'static') return null;
  a.set(layer.color);
  b.set(layer.secondaryColor);
  if (mode === 'swap') {
    const k = 0.5 - 0.5 * Math.cos(t * 2);
    const first = a.clone();
    a.lerp(b, k);
    b.lerp(first, k);
  } else if (mode === 'rainbow') {
    const hue = (t * 0.18) % 1;
    a.setHSL(hue, 0.95, 0.6);
    b.setHSL((hue + 0.28) % 1, 0.95, 0.55);
  } else if (mode === 'hue_drift') {
    const shift = Math.sin(t * 0.9) * 0.1;
    a.offsetHSL(shift, 0, 0);
    b.offsetHSL(-shift, 0, 0);
  } else if (mode === 'strobe') {
    if (Math.floor(t * 4) % 2) {
      const first = a.clone();
      a.copy(b);
      b.copy(first);
    }
  } else {
    const k = 0.7 + 0.45 * Math.sin(t * 2.2);
    a.multiplyScalar(k);
    b.multiplyScalar(k);
    // Keep within the representable hex range.
    for (const c of [a, b]) c.setRGB(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));
  }
  return { color: `#${a.getHexString()}`, secondaryColor: `#${b.getHexString()}` };
}

export function withLayerExtras(runtime: CompiledLayerRuntime): CompiledLayerRuntime {
  let clock = 0;
  const inner = runtime.update;
  return {
    ...runtime,
    update: (dt, elapsed, layer, pixelRatio, music) => {
      clock += dt;
      const s = layer.settings;
      const colors = modulateColors(layer, clock * (s.colorSpeed ?? 1));
      let opacity = 1;
      if (s.flicker) {
        const noise = Math.abs(Math.sin(Math.floor(clock * 16) * 91.345) * 47453.5453) % 1;
        opacity *= 1 - s.flicker * noise;
      }
      if (s.fadeCycle) opacity *= 1 - s.fadeCycle * (0.5 - 0.5 * Math.cos(clock * 1.8));

      const effective = colors || opacity !== 1
        ? { ...layer, ...colors, settings: { ...s, opacity: s.opacity * opacity } }
        : layer;
      inner(dt, elapsed, effective, pixelRatio, music);

      // Skins are bound to the body, so spatial extras do not apply to them.
      if (layer.type === 'glowing_materials') return;
      // Every runtime rewrites position and scale in its own update, so these
      // offsets never accumulate.
      const { group } = runtime;
      if (s.floatBob) group.position.y += Math.sin(clock * (s.floatSpeed ?? 1.5)) * s.floatBob * 0.5;
      if (s.layerOrbitRadius) {
        const angle = clock * (s.layerOrbitSpeed ?? 1);
        group.position.x += Math.cos(angle) * s.layerOrbitRadius;
        group.position.z += Math.sin(angle) * s.layerOrbitRadius;
      }
      group.scale.x *= s.stretchX ?? 1;
      group.scale.y *= s.stretchY ?? 1;
      group.scale.z *= s.stretchZ ?? 1;
    },
  };
}
