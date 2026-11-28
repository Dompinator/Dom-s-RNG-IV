/**
 * Entry point for the extra Effect Stack content. `buildLayerRuntime` routes
 * new layer types and non-classic styles here; everything else keeps using the
 * original renderers.
 */
import * as THREE from 'three';
import { getProceduralTexture } from '../../aura/textures';
import type { AuraLayer } from '../../aura/types';
import { getLayerVariant, isExtraType } from '../../aura/variants';
import {
  computeAnimModulation, computeMusicSpeedScale, getLayerStructuralSignature,
  type CompiledLayerRuntime,
} from '../layerBuilder';
import type { R6Rig } from '../r6Character';
import type { Kit } from './kit';
import { NEW_TYPE_BUILDERS } from './newTypes';
import { styleBuilder } from './styles';

/**
 * In these classic layers `size` is the particle size and starts well below 1.
 * Styles scale the whole layer instead, relative to that starting value.
 */
const SIZE_BASE: Partial<Record<AuraLayer['type'], number>> = {
  orbiting_objects: 0.42,
  particle_systems: 0.34,
  floating_sparks: 0.24,
};

export const usesExtraRenderer = (layer: AuraLayer) =>
  isExtraType(layer.type) || getLayerVariant(layer) !== 'classic';

export function buildExtraLayerRuntime(
  layer: AuraLayer,
  rig: R6Rig,
  maxAnisotropy: number,
): CompiledLayerRuntime {
  const group = new THREE.Group();
  group.name = `AuraLayer_${layer.id}`;
  (rig.anchors[layer.anchor] || rig.anchors.root).add(group);

  const disposables: { dispose: () => void }[] = [];
  const kit: Kit = {
    group,
    layer,
    texture: getProceduralTexture(layer.textureRef, maxAnisotropy),
    track: (item) => {
      disposables.push(item);
      return item;
    },
  };
  const builder = isExtraType(layer.type)
    ? NEW_TYPE_BUILDERS[layer.type]
    : styleBuilder(layer.type, getLayerVariant(layer), rig);
  const render = builder!(kit);

  let clock = 0;
  return {
    layerId: layer.id,
    signature: getLayerStructuralSignature(layer),
    group,
    update: (dt, elapsed, l, _pixelRatio, music) => {
      const mod = computeAnimModulation(elapsed, l, music);
      const s = l.settings;
      group.visible = l.visible;
      group.position.set(l.position.x, l.position.y, l.position.z);
      group.rotation.set(l.rotation.x, l.rotation.y, l.rotation.z);
      const isSkin = l.type === 'glowing_materials';
      group.scale.setScalar(isSkin ? 1 : Math.max(0.05, (s.size / (SIZE_BASE[l.type] ?? 1)) * (0.94 + mod * 0.06)));

      const direction = s.reverseDirection ? -1 : 1;
      const step = dt * l.animation.speed * computeMusicSpeedScale(l, music) * direction;
      clock += step;
      // The clock is offset so cyclic effects are already populated at start.
      const frame = {
        t: clock + 20,
        dt: step,
        mod,
        layer: l,
        s,
        objScale: Math.max(0.15, s.objectScale ?? 1),
        gain: Math.max(0, s.intensity * (0.5 + s.glow * 0.36) * (0.85 + mod * 0.15)),
      };
      // Skins live on the body meshes, so they update even while hidden.
      if (l.visible || isSkin) render(frame);
    },
    dispose: () => {
      group.removeFromParent();
      disposables.forEach((d) => d.dispose());
    },
  };
}
