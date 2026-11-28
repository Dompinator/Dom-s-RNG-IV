/**
 * Catalogue of extra Effect Stack content: new layer types, style variants for
 * every layer type, and the optional customization values shared by all layers.
 * `classic` always means the original renderer, so existing auras are unchanged.
 */
import type { AuraLayer, BlendMode, EffectType, LayerEffectSettings, TextureRef } from './types';

export interface VariantDef {
  id: string;
  label: string;
  color?: string;
  secondaryColor?: string;
  textureRef?: TextureRef;
  blendMode?: BlendMode;
  settings?: Partial<LayerEffectSettings>;
}

const v = (
  id: string,
  label: string,
  color?: string,
  secondaryColor?: string,
  extra: Omit<VariantDef, 'id' | 'label' | 'color' | 'secondaryColor'> = {},
): VariantDef => ({ id, label, color, secondaryColor, ...extra });

const classic = v('classic', 'Classic');

export const LAYER_VARIANTS: Record<EffectType, VariantDef[]> = {
  // ------------------------------------------------ original types + new styles
  energy_spheres: [
    classic,
    v('void_core', 'Void Core', '#a855f7', '#12001f', { blendMode: 'normal', settings: { radius: 1.1, opacity: 0.95 } }),
    v('hex_shield', 'Hex Shield', '#22d3ee', '#2563eb', { settings: { radius: 1.8 } }),
    v('plasma_storm', 'Plasma Storm', '#f0abfc', '#6d28d9', { settings: { radius: 1.6, turbulence: 0.9 } }),
    v('crystal_shell', 'Crystal Shell', '#a5f3fc', '#0e7490', { settings: { opacity: 0.5, radius: 1.7 } }),
    v('atom_core', 'Atom Core', '#fde047', '#f97316', { settings: { radius: 1.4, arcCount: 4 } }),
    v('bubble', 'Soap Bubble', '#f9a8d4', '#67e8f9', { settings: { opacity: 0.5, radius: 1.9, turbulence: 0.35 } }),
  ],
  rotating_rings: [
    classic,
    v('gyroscope', 'Gyroscope', '#fbbf24', '#fef3c7', { settings: { arcCount: 4, radius: 1.9 } }),
    v('rune_halo', 'Rune Halo', '#c084fc', '#f5d0fe', { settings: { arcCount: 2, radius: 2.1 } }),
    v('tech_dashes', 'Tech Dashes', '#22d3ee', '#0ea5e9', { settings: { arcCount: 4, radius: 2.0 } }),
    v('clockwork', 'Clockwork', '#fcd34d', '#92400e', { settings: { arcCount: 3, radius: 2.0 } }),
    v('saturn_disc', 'Saturn Disc', '#fde68a', '#b45309', { settings: { arcCount: 1, radius: 2.4, tilt: 0.35 } }),
    v('portal_rings', 'Portal Rings', '#818cf8', '#e0e7ff', { settings: { arcCount: 5, radius: 1.8 } }),
  ],
  orbiting_objects: [
    classic,
    v('comet_trails', 'Comet Trails', '#7dd3fc', '#e879f9', { settings: { particleCount: 6, radius: 2.0 } }),
    v('double_helix', 'Double Helix', '#4ade80', '#22d3ee', { settings: { particleCount: 22, radius: 1.5, spread: 3.2 } }),
    v('asteroid_belt', 'Asteroid Belt', '#a8a29e', '#f59e0b', { blendMode: 'normal', settings: { particleCount: 40, radius: 2.3, orbiterShape: 'icosahedron' } }),
    v('swarm', 'Chaotic Swarm', '#f43f5e', '#fbbf24', { settings: { particleCount: 28, radius: 2.0, orbiterShape: 'shard' } }),
  ],
  particle_systems: [
    classic,
    v('galaxy', 'Spiral Galaxy', '#c4b5fd', '#38bdf8', { settings: { particleCount: 900, radius: 2.4, arcCount: 3 } }),
    v('implosion', 'Implosion', '#a855f7', '#f472b6', { settings: { particleCount: 400, radius: 2.8 } }),
    v('fountain', 'Fountain', '#67e8f9', '#2563eb', { settings: { particleCount: 400, radius: 1.8, spread: 3.2 } }),
    v('shockburst', 'Burst Pulse', '#fde047', '#ef4444', { settings: { particleCount: 360, radius: 2.8 } }),
    v('pixel_dust', 'Pixel Glitch', '#22d3ee', '#f0abfc', { textureRef: 'pixel_block', settings: { particleCount: 220, radius: 1.8 } }),
    v('sakura_swirl', 'Petal Swirl', '#f9a8d4', '#fb7185', { textureRef: 'petal', settings: { particleCount: 200, radius: 2.0, spread: 3 } }),
  ],
  lightning_effects: [
    classic,
    v('ground_strikes', 'Sky Strikes', '#bae6fd', '#3b82f6', { settings: { arcCount: 5, radius: 2.4, spread: 5 } }),
    v('tesla_coil', 'Tesla Coil', '#c4b5fd', '#6d28d9', { settings: { arcCount: 8, radius: 2.1 } }),
    v('storm_cage', 'Storm Cage', '#67e8f9', '#0369a1', { settings: { arcCount: 10, radius: 1.9, spread: 3.4 } }),
    v('ball_lightning', 'Ball Lightning', '#fef9c3', '#f59e0b', { settings: { arcCount: 5, radius: 2.0 } }),
    v('crackle_ground', 'Ground Crackle', '#fca5a5', '#dc2626', { settings: { arcCount: 12, radius: 2.5 } }),
  ],
  energy_ribbons: [
    classic,
    v('tornado', 'Tornado', '#a5f3fc', '#0ea5e9', { settings: { arcCount: 7, radius: 1.9, spread: 3.6 } }),
    v('aurora', 'Aurora Curtain', '#4ade80', '#a855f7', { settings: { arcCount: 3, radius: 2.2, spread: 2.6, thickness: 0.4 } }),
    v('serpents', 'Spirit Serpents', '#f97316', '#fde047', { settings: { arcCount: 2, radius: 1.8, spread: 2.8, thickness: 0.28 } }),
    v('comet_orbits', 'Comet Orbits', '#f0abfc', '#38bdf8', { settings: { arcCount: 5, radius: 1.9, thickness: 0.16 } }),
    v('flowing_cape', 'Energy Cape', '#ef4444', '#450a0a', { settings: { spread: 3.2, thickness: 0.3, arcCount: 8, radius: 1.6, } }),
    v('infinity_loop', 'Infinity Loop', '#fef08a', '#f472b6', { settings: { arcCount: 2, radius: 2.2, thickness: 0.16 } }),
  ],
  floating_sparks: [
    classic,
    v('fireflies', 'Fireflies', '#d9f99d', '#84cc16', { textureRef: 'soft_orb', settings: { particleCount: 70, radius: 2.2, spread: 3 } }),
    v('meteor_shower', 'Meteor Shower', '#fed7aa', '#ea580c', { settings: { particleCount: 50, radius: 2.8, spread: 5 } }),
    v('stardust', 'Twinkling Stardust', '#ffffff', '#93c5fd', { textureRef: 'starburst', settings: { particleCount: 160, radius: 2.4, spread: 3.4 } }),
    v('ember_storm', 'Ember Storm', '#fdba74', '#dc2626', { settings: { particleCount: 300, radius: 2.0, spread: 3.6 } }),
    v('warp_streaks', 'Warp Streaks', '#e0f2fe', '#6366f1', { settings: { particleCount: 130, radius: 2.8 } }),
  ],
  distortion_effects: [
    classic,
    v('sonic_rings', 'Sonic Rings', '#e0f2fe', '#38bdf8', { settings: { radius: 2.2, arcCount: 4 } }),
    v('vortex_warp', 'Vortex Warp', '#a855f7', '#22d3ee', { settings: { radius: 2.0 } }),
    v('heat_waves', 'Heat Waves', '#fdba74', '#ef4444', { settings: { radius: 1.6, spread: 3.4 } }),
    v('glitch_field', 'Glitch Field', '#22d3ee', '#f43f5e', { settings: { radius: 1.8, spread: 3.2, arcCount: 14 } }),
  ],
  glowing_materials: [
    classic,
    v('flame_skin', 'Flame Skin', '#fbbf24', '#ef4444'),
    v('electric_skin', 'Electric Skin', '#e0f2fe', '#2563eb'),
    v('galaxy_skin', 'Galaxy Skin', '#a78bfa', '#0f172a', { blendMode: 'normal', settings: { size: 1.0, opacity: 0.95 } }),
    v('hologram', 'Hologram', '#67e8f9', '#0891b2'),
    v('lava_cracks', 'Lava Cracks', '#fb923c', '#1c0a00', { blendMode: 'normal', settings: { size: 1.0, opacity: 0.95 } }),
    v('frost', 'Frost Coat', '#f0f9ff', '#38bdf8'),
    v('rainbow_chrome', 'Prism Chrome', '#f472b6', '#22d3ee'),
    v('silhouette', 'Outline Halo', '#fef08a', '#f59e0b', { settings: { size: 1.35 } }),
  ],
  light_beams: [
    classic,
    v('sunburst', 'Sunburst', '#fef08a', '#f59e0b', { settings: { arcCount: 14, radius: 1.0, spread: 3.4 } }),
    v('sky_strikes', 'Heaven Strikes', '#ffffff', '#93c5fd', { settings: { intensity: 0.85, opacity: 0.7, arcCount: 7, radius: 2.4, spread: 7 } }),
    v('laser_cage', 'Laser Cage', '#f43f5e', '#fb7185', { settings: { arcCount: 12, radius: 1.8, spread: 4 } }),
    v('divine_pillar', 'Divine Pillar', '#fefce8', '#fbbf24', { settings: { intensity: 0.6, opacity: 0.45, arcCount: 3, radius: 1.2, spread: 8 } }),
    v('searchlights', 'Searchlights', '#a5b4fc', '#4f46e5', { settings: { arcCount: 6, radius: 1.6, spread: 6 } }),
  ],

  // ------------------------------------------------ brand new layer types
  aura_wings: [
    v('angel', 'Angel Wings', '#ffffff', '#fde68a', { settings: { intensity: 0.65, opacity: 0.7, radius: 2.2, particleCount: 14 } }),
    v('demon', 'Demon Wings', '#ef4444', '#1a0306', { blendMode: 'normal', settings: { radius: 2.3, opacity: 0.95 } }),
    v('butterfly', 'Butterfly Wings', '#f0abfc', '#22d3ee', { settings: { radius: 1.9 } }),
    v('crystal', 'Crystal Wings', '#a5f3fc', '#6366f1', { settings: { radius: 2.3, particleCount: 8 } }),
    v('energy', 'Energy Wings', '#38bdf8', '#a855f7', { settings: { radius: 2.5, particleCount: 12 } }),
    v('mechanical', 'Mecha Wings', '#fbbf24', '#475569', { blendMode: 'normal', settings: { radius: 2.2, particleCount: 6, opacity: 0.98 } }),
    v('phoenix', 'Phoenix Wings', '#fde047', '#dc2626', { settings: { radius: 2.6, particleCount: 16 } }),
  ],
  halo_crowns: [
    v('halo', 'Angel Halo', '#fef08a', '#f59e0b', { settings: { radius: 0.55 } }),
    v('triple_halo', 'Triple Halo', '#bae6fd', '#818cf8', { settings: { radius: 0.6 } }),
    v('spike_crown', 'Spiked Crown', '#fbbf24', '#b45309', { settings: { radius: 0.48, particleCount: 10 } }),
    v('horns', 'Demon Horns', '#f87171', '#1c0508', { blendMode: 'normal', settings: { radius: 0.4, opacity: 1 } }),
    v('sun_disc', 'Sun Disc', '#fde047', '#ea580c', { settings: { radius: 0.9, particleCount: 18 } }),
    v('floating_crown', 'Gem Crown', '#67e8f9', '#a855f7', { settings: { radius: 0.62, particleCount: 8 } }),
    v('thorns', 'Thorn Ring', '#a3e635', '#365314', { blendMode: 'normal', settings: { radius: 0.5, particleCount: 20, opacity: 1 } }),
  ],
  magic_circles: [
    v('arcane', 'Arcane Circle', '#c084fc', '#22d3ee'),
    v('summoning', 'Summoning Star', '#ef4444', '#fbbf24'),
    v('hex_array', 'Hex Array', '#22d3ee', '#3b82f6'),
    v('lotus', 'Lotus Bloom', '#f9a8d4', '#a855f7'),
    v('clock_face', 'Time Dial', '#fde68a', '#d97706'),
    v('pulse_grid', 'Radar Pulse', '#4ade80', '#14b8a6'),
    v('abyss_pool', 'Abyss Pool', '#7c3aed', '#050008', { blendMode: 'normal', settings: { opacity: 0.95 } }),
  ],
  floating_weapons: [
    v('swords', 'Spirit Swords', '#e0f2fe', '#38bdf8'),
    v('daggers', 'Shadow Daggers', '#c084fc', '#2e1065', { settings: { particleCount: 12 } }),
    v('spears', 'Holy Spears', '#fef08a', '#f59e0b'),
    v('scythes', 'Reaper Scythes', '#4ade80', '#052e16', { settings: { particleCount: 4 } }),
    v('axes', 'War Axes', '#fb923c', '#7f1d1d', { settings: { particleCount: 5 } }),
    v('arrows', 'Arrow Volley', '#a7f3d0', '#10b981', { settings: { particleCount: 18 } }),
  ],
  singularity: [
    v('black_hole', 'Black Hole', '#fb923c', '#7c3aed', { settings: { radius: 2.0 } }),
    v('portal', 'Dimension Portal', '#22d3ee', '#6d28d9', { settings: { intensity: 0.75, opacity: 0.8, radius: 2.1 } }),
    v('spiral_galaxy', 'Galaxy Disc', '#c4b5fd', '#1d4ed8', { settings: { radius: 2.8, tilt: 0.35 } }),
    v('wormhole', 'Wormhole', '#f472b6', '#4338ca', { settings: { radius: 1.8, spread: 3.2 } }),
    v('eclipse', 'Eclipse', '#fde68a', '#ea580c', { settings: { radius: 1.6 } }),
  ],
  aura_flames: [
    v('power_flame', 'Power Flame', '#fde047', '#f97316'),
    v('soul_fire', 'Soul Fire', '#67e8f9', '#1d4ed8'),
    v('dark_flame', 'Dark Flame', '#a855f7', '#09000f', { blendMode: 'normal' }),
    v('smoke', 'Billowing Smoke', '#94a3b8', '#0f172a', { blendMode: 'normal', textureRef: 'smoke_puff' }),
    v('mist', 'Ground Mist', '#e0f2fe', '#64748b', { textureRef: 'smoke_puff', settings: { radius: 2.4, opacity: 0.4 } }),
    v('surge', 'Power Surge', '#ffffff', '#facc15', { settings: { intensity: 0.8, spread: 4 } }),
  ],
  weather: [
    v('rain', 'Rain', '#bae6fd', '#3b82f6', { settings: { particleCount: 350 } }),
    v('snow', 'Snowfall', '#ffffff', '#bae6fd', { textureRef: 'snowflake', settings: { particleCount: 220 } }),
    v('petals', 'Cherry Blossoms', '#fbcfe8', '#f472b6', { textureRef: 'petal', settings: { particleCount: 130 } }),
    v('leaves', 'Falling Leaves', '#a3e635', '#ca8a04', { textureRef: 'leaf', blendMode: 'normal', settings: { particleCount: 90, opacity: 0.95 } }),
    v('ash', 'Ashfall', '#a8a29e', '#f97316', { blendMode: 'normal', settings: { particleCount: 240 } }),
    v('bubbles', 'Rising Bubbles', '#a5f3fc', '#c4b5fd', { textureRef: 'bubble', settings: { particleCount: 80 } }),
    v('confetti', 'Confetti', '#f43f5e', '#22d3ee', { textureRef: 'pixel_block', blendMode: 'normal', settings: { particleCount: 220, opacity: 1 } }),
    v('digital_rain', 'Digital Rain', '#4ade80', '#14532d', { textureRef: 'pixel_block', settings: { particleCount: 260 } }),
  ],
  floating_symbols: [
    v('runes', 'Ancient Runes', '#c084fc', '#22d3ee'),
    v('hearts', 'Hearts', '#fb7185', '#f9a8d4'),
    v('stars', 'Stars', '#fde047', '#ffffff'),
    v('music', 'Music Notes', '#67e8f9', '#a855f7'),
    v('skulls', 'Skulls', '#e2e8f0', '#4ade80'),
    v('binary', 'Binary Code', '#4ade80', '#065f46'),
    v('zodiac', 'Zodiac', '#fcd34d', '#fb923c'),
    v('custom', 'Your Own Text', '#ffffff', '#38bdf8', { settings: { symbolText: 'DOM' } }),
  ],
  ground_eruption: [
    v('crystal_spikes', 'Crystal Spikes', '#a5f3fc', '#6366f1'),
    v('floating_rocks', 'Levitating Rocks', '#a8a29e', '#f97316', { blendMode: 'normal', settings: { opacity: 1 } }),
    v('ice_shards', 'Ice Shards', '#f0f9ff', '#38bdf8'),
    v('obsidian', 'Obsidian Pillars', '#a855f7', '#0a0310', { blendMode: 'normal', settings: { opacity: 1 } }),
    v('magma', 'Magma Spires', '#fb923c', '#450a0a', { blendMode: 'normal', settings: { opacity: 1 } }),
    v('floating_cubes', 'Voxel Debris', '#22d3ee', '#1e3a8a'),
  ],
  celestial_bodies: [
    v('solar_system', 'Solar System', '#fbbf24', '#38bdf8', { settings: { tilt: 0.45, particleCount: 6, radius: 2.4 } }),
    v('moons', 'Orbiting Moons', '#e2e8f0', '#64748b', { blendMode: 'normal', settings: { particleCount: 3, radius: 2.0, opacity: 1 } }),
    v('ringed_planets', 'Ringed Planets', '#fdba74', '#a855f7', { settings: { particleCount: 3, radius: 2.3 } }),
    v('constellation', 'Constellation', '#ffffff', '#60a5fa', { textureRef: 'starburst', settings: { particleCount: 24, radius: 2.4 } }),
    v('dying_stars', 'Pulsar Stars', '#fef08a', '#ef4444', { textureRef: 'starburst', settings: { particleCount: 7, radius: 2.2 } }),
  ],
  shockwaves: [
    v('ground_pulse', 'Ground Pulse', '#38bdf8', '#e0f2fe'),
    v('dome', 'Expanding Dome', '#a855f7', '#f0abfc'),
    v('stacked', 'Rising Waves', '#4ade80', '#a7f3d0'),
    v('hex_burst', 'Hex Burst', '#fbbf24', '#ef4444'),
    v('implode', 'Imploding Rings', '#f43f5e', '#7c3aed'),
  ],
  chains: [
    v('orbit', 'Orbiting Chains', '#cbd5e1', '#38bdf8', { settings: { intensity: 0.6, arcCount: 3, radius: 1.8 } }),
    v('binding', 'Sealing Bind', '#fbbf24', '#b45309', { settings: { intensity: 0.6, arcCount: 4, radius: 1.25 } }),
    v('anchored', 'Ground Anchors', '#a855f7', '#1e1033', { settings: { intensity: 0.6, arcCount: 5, radius: 2.4, spread: 2.4 } }),
    v('hanging', 'Hanging Chains', '#f87171', '#450a0a', { settings: { intensity: 0.6, arcCount: 8, radius: 2.0, spread: 4 } }),
  ],
};

export const EXTRA_EFFECT_TYPES = [
  'aura_wings',
  'halo_crowns',
  'magic_circles',
  'floating_weapons',
  'singularity',
  'aura_flames',
  'weather',
  'floating_symbols',
  'ground_eruption',
  'celestial_bodies',
  'shockwaves',
  'chains',
] as const;
export type ExtraEffectType = (typeof EXTRA_EFFECT_TYPES)[number];

export const isExtraType = (type: EffectType): type is ExtraEffectType =>
  (EXTRA_EFFECT_TYPES as readonly string[]).includes(type);

/** The active style of a layer; missing or unknown values fall back to the first. */
export function getLayerVariant(layer: Pick<AuraLayer, 'type' | 'settings'>): string {
  const list = LAYER_VARIANTS[layer.type];
  const wanted = layer.settings.variant;
  return wanted && list.some((d) => d.id === wanted) ? wanted : list[0].id;
}

// ------------------------------------------------------------ shared extras
export const COLOR_MODES = ['static', 'swap', 'rainbow', 'hue_drift', 'strobe', 'breathe'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  static: 'Static colors',
  swap: 'Fade between colors',
  rainbow: 'Rainbow cycle',
  hue_drift: 'Gentle hue drift',
  strobe: 'Color strobe',
  breathe: 'Breathing brightness',
};

export const WEAPON_FORMATIONS = ['back_fan', 'orbit', 'guard_ring', 'sword_rain', 'overhead'] as const;
export type WeaponFormation = (typeof WEAPON_FORMATIONS)[number];
export const WEAPON_FORMATION_LABELS: Record<WeaponFormation, string> = {
  back_fan: 'Fan behind back',
  orbit: 'Spinning orbit',
  guard_ring: 'Ground guard ring',
  sword_rain: 'Falling rain',
  overhead: 'Overhead halo',
};

export const SYMBOL_TEXT_MAX = 24;

/** Optional numeric customization shared by all layers: [min, max, neutral]. */
export const EXTRA_NUMBER_LIMITS = {
  colorSpeed: [0, 6, 1],
  flicker: [0, 1, 0],
  floatBob: [0, 2, 0],
  floatSpeed: [0, 8, 1.5],
  stretchX: [0.2, 3, 1],
  stretchY: [0.2, 3, 1],
  stretchZ: [0.2, 3, 1],
  layerOrbitRadius: [0, 6, 0],
  layerOrbitSpeed: [-6, 6, 1],
  fadeCycle: [0, 1, 0],
} as const;
export type ExtraNumberKey = keyof typeof EXTRA_NUMBER_LIMITS;
