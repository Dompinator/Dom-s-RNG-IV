/** Starting values for the new layer types and for picking a style. */
import type { AuraLayer, EffectType, LayerEffectSettings } from './types';
import { isExtraType, LAYER_VARIANTS, type ExtraEffectType, type VariantDef } from './variants';

type Defaults = {
  anchor: AuraLayer['anchor'];
  y?: number;
  z?: number;
  spin?: number;
  settings: Partial<LayerEffectSettings>;
  textureRef?: AuraLayer['textureRef'];
};

const NEW_TYPE_DEFAULTS: Record<ExtraEffectType, Defaults> = {
  aura_wings: { anchor: 'torso', y: 0.2, z: -0.32, spin: 0, settings: { radius: 2.2, particleCount: 14, turbulence: 0.5, tilt: 0, intensity: 1.1, opacity: 0.95 } },
  halo_crowns: { anchor: 'head', y: 0.72, spin: 0.8, settings: { radius: 0.55, particleCount: 10, tilt: 0.12, intensity: 1.4 } },
  magic_circles: { anchor: 'ground', y: 0.05, spin: 0.6, settings: { radius: 2.6, tilt: 0, intensity: 1.3, opacity: 0.95 } },
  floating_weapons: { anchor: 'torso', spin: 0.7, settings: { particleCount: 8, radius: 1.8, spread: 1.6, turbulence: 0.4, formation: 'back_fan', intensity: 1.3, opacity: 1, tilt: 0 } },
  singularity: { anchor: 'torso', y: 0.2, z: -1.1, spin: 0.5, settings: { radius: 2.0, spread: 3, particleCount: 120, tilt: 0.05, intensity: 1.3, opacity: 0.95 } },
  aura_flames: { anchor: 'ground', spin: 0, settings: { radius: 1.15, spread: 3.4, particleCount: 120, lifetime: 1.4, turbulence: 0.7, intensity: 1.2, opacity: 0.8 } },
  weather: { anchor: 'ground', spin: 0, settings: { particleCount: 200, radius: 2.8, spread: 2.4, turbulence: 0.5, intensity: 1.1, opacity: 0.9 } },
  floating_symbols: { anchor: 'torso', spin: 0.6, settings: { particleCount: 18, radius: 1.9, spread: 2.8, lifetime: 2.5, turbulence: 0.5, intensity: 1.3 } },
  ground_eruption: { anchor: 'ground', spin: 0, settings: { particleCount: 22, radius: 2.2, spread: 1.5, turbulence: 0.5, tilt: 0, intensity: 1.15, opacity: 0.9 } },
  celestial_bodies: { anchor: 'torso', y: 0.3, spin: 0.8, settings: { particleCount: 6, radius: 2.3, spread: 2.2, tilt: 0.18, intensity: 1.2, opacity: 1 } },
  shockwaves: { anchor: 'ground', y: 0.07, spin: 0, settings: { arcCount: 3, radius: 3.2, spread: 2.6, lifetime: 2.0, turbulence: 0.6, intensity: 1.4, opacity: 0.9 } },
  chains: { anchor: 'torso', spin: 0.5, settings: { arcCount: 3, segments: 40, radius: 1.8, spread: 2.4, turbulence: 0.5, tilt: 0, intensity: 1.2, opacity: 1 } },
};

export function createNewTypeLayer(base: AuraLayer, type: EffectType, customName?: string): AuraLayer {
  if (!isExtraType(type)) return { ...base, name: customName || base.name };
  const d = NEW_TYPE_DEFAULTS[type];
  const first = LAYER_VARIANTS[type][0];
  return {
    ...base,
    name: customName || first.label,
    anchor: d.anchor,
    textureRef: d.textureRef ?? base.textureRef,
    position: { x: 0, y: d.y ?? 0, z: d.z ?? 0 },
    animation: {
      mode: 'smooth',
      speed: 1,
      amplitude: 0.2,
      frequency: 1.5,
      rotationSpeed: { x: 0, y: d.spin ?? 0.6, z: 0 },
    },
    settings: { ...base.settings, ...d.settings },
  };
}

/** Apply a style's suggested name, colors and values to a freshly made layer. */
export function applyLayerVariant(layer: AuraLayer, variantId?: string, customName?: string): AuraLayer {
  const list = LAYER_VARIANTS[layer.type];
  const def: VariantDef | undefined = list.find((v) => v.id === variantId)
    ?? (isExtraType(layer.type) ? list[0] : undefined);
  if (!def || def.id === 'classic') return layer;
  return {
    ...layer,
    name: customName || def.label,
    color: def.color ?? layer.color,
    secondaryColor: def.secondaryColor ?? layer.secondaryColor,
    textureRef: def.textureRef ?? layer.textureRef,
    blendMode: def.blendMode ?? layer.blendMode,
    settings: { ...layer.settings, ...def.settings, variant: def.id },
  };
}

/**
 * Change only the style of an existing layer. The user's colors and sizes are
 * kept; a style-specific texture or blend mode is applied so it reads correctly.
 */
export function variantSwitchPatch(layer: AuraLayer, variantId: string): Partial<AuraLayer> {
  const def = LAYER_VARIANTS[layer.type].find((v) => v.id === variantId);
  return {
    ...(def?.textureRef ? { textureRef: def.textureRef } : {}),
    ...(def?.blendMode ? { blendMode: def.blendMode } : {}),
    settings: { ...layer.settings, variant: variantId },
  };
}
