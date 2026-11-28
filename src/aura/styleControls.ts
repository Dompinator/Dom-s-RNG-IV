/** Which sliders each new layer type / style actually uses. */
import type { AuraLayer, LayerEffectSettings } from './types';
import { getLayerVariant, isExtraType } from './variants';

export type ControlKey =
  | 'particleCount' | 'arcCount' | 'segments' | 'radius' | 'spread'
  | 'thickness' | 'turbulence' | 'lifetime' | 'tilt';

export interface StyleControl {
  key: ControlKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

const c = (key: ControlKey, label: string, min: number, max: number, step = 0.05): StyleControl =>
  ({ key, label, min, max, step });
const count = (label: string, min: number, max: number) => c('particleCount', label, min, max, 1);
const arcs = (label: string, min: number, max: number) => c('arcCount', label, min, max, 1);
const radius = (label = 'Radius') => c('radius', label, 0.2, 6);
const spread = (label = 'Vertical Spread') => c('spread', label, 0.1, 10, 0.1);
const noise = (label = 'Turbulence / Noise') => c('turbulence', label, 0, 2);
const tilt = (label = 'Tilt Angle (rad)') => c('tilt', label, -1.57, 1.57, 0.03);
const thick = (label = 'Thickness', max = 0.65) => c('thickness', label, 0.01, max, 0.01);
const life = (label = 'Lifetime (s)', min = 0.3, max = 6) => c('lifetime', label, min, max, 0.02);

/** Returns null for the original renderers, which keep their original controls. */
export function getStyleControls(layer: Pick<AuraLayer, 'type' | 'settings'>): StyleControl[] | null {
  const v = getLayerVariant(layer);
  if (!isExtraType(layer.type) && v === 'classic') return null;
  const is = (...ids: string[]) => ids.includes(v);
  const list: (StyleControl | false)[] = (() => {
    switch (layer.type) {
      case 'energy_spheres':
        return [is('atom_core') && arcs('Electrons', 1, 8), radius(), is('plasma_storm', 'bubble', 'void_core') && noise()];
      case 'rotating_rings':
        return [arcs('Rings', 1, 8), radius(), is('rune_halo', 'tech_dashes', 'saturn_disc', 'portal_rings') && spread('Ring Spacing'),
          is('gyroscope', 'rune_halo', 'tech_dashes', 'saturn_disc') && tilt()];
      case 'orbiting_objects':
        return [count('Object Count', 1, 64), radius('Orbit Radius'), spread(), is('asteroid_belt') && tilt()];
      case 'particle_systems':
        return [count('Particle Count', 10, 3000), is('galaxy') && arcs('Spiral Arms', 2, 8), radius(),
          is('fountain', 'pixel_dust', 'sakura_swirl') && spread(), life(), !is('pixel_dust') && noise(), is('galaxy') && tilt()];
      case 'lightning_effects':
        return [arcs('Arc Bolts', 1, 16), radius(), is('ground_strikes', 'storm_cage') && spread('Height'), thick(),
          noise('Jaggedness'), life('Flicker Interval (s)', 0.06, 0.6), c('segments', 'Bolt Detail', 8, 32, 1)];
      case 'energy_ribbons':
        return [arcs('Ribbon Strands', 1, 12), radius(), is('tornado', 'aurora', 'serpents', 'flowing_cape') && spread(),
          thick('Ribbon Width'), noise(), c('segments', 'Smoothness', 24, 96, 4)];
      case 'floating_sparks':
        return [count('Spark Count', 8, 1000), radius(), is('fireflies', 'meteor_shower', 'stardust', 'ember_storm') && spread('Height'),
          life(), is('meteor_shower', 'ember_storm') && noise()];
      case 'distortion_effects':
        return [is('sonic_rings') && arcs('Rings', 1, 8), is('glitch_field') && arcs('Glitch Bars', 3, 24), radius(),
          is('heat_waves', 'glitch_field') && spread('Height'), !is('glitch_field') && noise()];
      case 'glowing_materials':
        return [];
      case 'light_beams':
        return [arcs('Beam Count', 1, 24), radius(), spread('Beam Height')];
      case 'aura_wings':
        return [!is('demon', 'butterfly') && count('Feathers per Wing', 3, 32), radius('Wingspan'), noise('Flap Strength'), tilt()];
      case 'halo_crowns':
        return [is('spike_crown', 'sun_disc', 'floating_crown', 'thorns') && count('Points / Gems', 3, 32), radius('Size'), !is('sun_disc', 'horns') && tilt()];
      case 'magic_circles':
        return [radius(), tilt()];
      case 'floating_weapons':
        return [count('Weapon Count', 1, 48), radius('Formation Radius'), spread('Rain Height / Wave'), noise('Hover Motion'), tilt()];
      case 'singularity':
        return [count('Infalling Particles', 1, 600), radius(), is('wormhole') && spread('Tunnel Depth'), is('black_hole', 'spiral_galaxy') && tilt()];
      case 'aura_flames':
        return [count('Embers / Puffs', 8, 600), radius(), spread('Height'), life(), !is('smoke', 'mist') && noise('Flame Chaos')];
      case 'weather':
        return [count('Amount', 5, 1500), radius('Area Radius'), spread('Height'), noise('Wind Sway')];
      case 'floating_symbols':
        return [count('Symbol Count', 1, 120), radius(), spread(), life('Rise Time', 0.5, 8), noise('Wobble')];
      case 'ground_eruption':
        return [count('Pieces', 3, 120), radius(), spread('Height'), noise('Motion'), !is('floating_rocks', 'floating_cubes') && tilt('Outward Lean')];
      case 'celestial_bodies':
        return [count('Bodies', 1, 48), radius('Orbit Radius'), is('constellation', 'dying_stars') && spread(), !is('constellation', 'dying_stars') && tilt('Orbit Tilt')];
      case 'shockwaves':
        return [arcs('Waves', 1, 8), radius('Reach'), life('Wave Duration (s)', 0.3, 6), is('stacked') && spread('Rise Height'), !is('dome', 'hex_burst') && noise('Ragged Edge')];
      case 'chains':
        return [arcs('Chains', 1, 12), c('segments', 'Links per Chain', 8, 64, 1), radius(), is('anchored', 'hanging') && spread('Length'),
          is('anchored', 'hanging') && noise('Sway'), is('orbit', 'binding') && tilt()];
      default:
        return [];
    }
  })();
  return list.filter(Boolean) as StyleControl[];
}

export type StylePatch = Partial<Pick<LayerEffectSettings, ControlKey>>;
