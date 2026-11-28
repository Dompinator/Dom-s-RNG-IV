import {
  EXTRA_EFFECT_TYPES,
  type ColorMode,
  type WeaponFormation,
} from './variants';

export const AURA_FORMAT_VERSION = '1.0.0' as const;
export const AURA_TARGET_ENGINE = 'doms-rng-iv-aether' as const;

export const EFFECT_TYPES = [
  'energy_spheres',
  'rotating_rings',
  'orbiting_objects',
  'particle_systems',
  'lightning_effects',
  'energy_ribbons',
  'floating_sparks',
  'distortion_effects',
  'glowing_materials',
  'light_beams',
  ...EXTRA_EFFECT_TYPES,
] as const;

export type EffectType = (typeof EFFECT_TYPES)[number];

export const ANCHOR_POINTS = [
  'root',
  'ground',
  'torso',
  'head',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
] as const;

export type AnchorPoint = (typeof ANCHOR_POINTS)[number];

export const BLEND_MODES = ['additive', 'normal'] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export const ANIMATION_MODES = [
  'smooth',
  'pulse',
  'burst',
  'wave',
  'chaos',
] as const;
export type AnimationMode = (typeof ANIMATION_MODES)[number];

export const TEXTURE_REFS = [
  'soft_orb',
  'starburst',
  'arcane_rune',
  'hex_grid',
  'plasma_noise',
  'spark_streak',
  'vortex_ring',
  'crystal_facet',
  'petal',
  'leaf',
  'snowflake',
  'bubble',
  'smoke_puff',
  'pixel_block',
  'heart',
  'star_five',
  'flame_wisp',
  'halo_ring',
  'cross_sparkle',
  'crescent',
] as const;

export type TextureRef = (typeof TEXTURE_REFS)[number];

export const EMISSION_SHAPES = [
  'sphere',
  'cylinder',
  'torus',
  'cone',
  'vortex',
] as const;

export type EmissionShape = (typeof EMISSION_SHAPES)[number];

export const ORBITER_SHAPES = [
  'sphere',
  'crystal',
  'octahedron',
  'icosahedron',
  'shard',
  'cube',
  'torus_knot',
  'star',
  'heart',
  'diamond',
  'pyramid',
  'ring',
  'coin',
  'crescent',
  'sword',
  'cross',
  'dodecahedron',
] as const;

export type OrbiterShape = (typeof ORBITER_SHAPES)[number];

export type RarityTier =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Epic'
  | 'Legendary'
  | 'Mythic';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LayerAnimationSettings {
  mode: AnimationMode;
  syncToMusic?: boolean;
  speed: number;
  amplitude: number;
  frequency: number;
  rotationSpeed: Vec3;
}

export interface LayerEffectSettings {
  // Shared numeric parameters
  size: number;
  objectScale?: number;
  intensity: number;
  opacity: number;
  glow: number;
  radius: number;
  thickness: number;
  spread: number;
  turbulence: number;

  // Particle / spark / orbiter / lightning parameters
  particleCount: number;
  lifetime: number;
  arcCount: number;
  segments: number;

  // Shape / pattern selectors
  emissionShape: EmissionShape;
  orbiterShape: OrbiterShape;
  wireframe: boolean;
  doubleSided: boolean;
  reverseDirection: boolean;
  tilt: number;

  // Optional customization (absent on older auras)
  variant?: string;
  formation?: WeaponFormation;
  symbolText?: string;
  colorMode?: ColorMode;
  colorSpeed?: number;
  flicker?: number;
  floatBob?: number;
  floatSpeed?: number;
  stretchX?: number;
  stretchY?: number;
  stretchZ?: number;
  layerOrbitRadius?: number;
  layerOrbitSpeed?: number;
  fadeCycle?: number;
}

export interface AuraLayer {
  id: string;
  name: string;
  type: EffectType;
  visible: boolean;
  anchor: AnchorPoint;
  blendMode: BlendMode;
  color: string;
  secondaryColor: string;
  position: Vec3;
  rotation: Vec3;
  textureRef: TextureRef;
  animation: LayerAnimationSettings;
  settings: LayerEffectSettings;
}

export interface AuraEnvironment {
  backgroundColor: string;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  ambientRimColor: string;
}

export interface AuraRarityInfo {
  baseOdds: number;
  classification: RarityTier;
  globalAnnouncement: boolean;
}

export interface AuraAudioConfig {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  volume: number;
  loop: boolean;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
}

export const AURA_POSE_PRESETS = [
  'idle',
  'levitate',
  'meditate',
  'crossed_arms',
  'sword_stance',
  'ascension',
  'throne',
] as const;

export type AuraPosePreset = (typeof AURA_POSE_PRESETS)[number];

export const POSE_PRESET_META: Record<
  AuraPosePreset,
  { label: string; desc: string; floats: boolean }
> = {
  idle: {
    label: 'Standing Idle',
    desc: 'Classic grounded breathing & subtle sway',
    floats: false,
  },
  levitate: {
    label: 'Levitate',
    desc: 'Mid-air hover with relaxed limbs',
    floats: true,
  },
  meditate: {
    label: 'Meditation Float',
    desc: 'Cross-legged serene floating stance',
    floats: true,
  },
  crossed_arms: {
    label: 'Crossed Arms',
    desc: 'Dominant folded-arms commander stance',
    floats: false,
  },
  sword_stance: {
    label: 'Blade Ready',
    desc: 'Angled combat-ready weapon hover pose',
    floats: false,
  },
  ascension: {
    label: 'Ascension',
    desc: 'High-altitude arms-wide celestial hover',
    floats: true,
  },
  throne: {
    label: 'Overlord Throne',
    desc: 'Elevated seated sovereign pose',
    floats: true,
  },
};

export const CUTSCENE_TIERS = [
  'under_epic',
  'epic',
  'legendary',
  'mythic',
] as const;
export type CutsceneTier = (typeof CUTSCENE_TIERS)[number];

export const CUTSCENE_TIER_META: Record<
  CutsceneTier,
  { label: string; shortDesc: string; defaultDuration: number; climaxRatio: number }
> = {
  under_epic: {
    label: '<Epic Cutscene',
    shortDesc: 'Simple & short (~2.5s)',
    defaultDuration: 2.5,
    climaxRatio: 0.4,
  },
  epic: {
    label: 'Epic Cutscene',
    shortDesc: 'Multi-phase flash (~5.6s)',
    defaultDuration: 5.6,
    climaxRatio: 0.48,
  },
  legendary: {
    label: 'Legendary Cutscene',
    shortDesc: 'Grand 3-act sequence (~10.5s)',
    defaultDuration: 10.5,
    climaxRatio: 0.54,
  },
  mythic: {
    label: 'Mythic Cutscene',
    shortDesc: 'Colossal 20s cosmic event',
    defaultDuration: 20.0,
    climaxRatio: 0.68,
  },
};

export const CUTSCENE_SHAPES = [
  'four_point_star',
  'eight_point_star',
  'arcane_ring',
  'hex_portal',
  'shockwave_ring',
  'sacred_triangle',
  'crescent_moon',
  'cross_flare',
  'shard_burst',
  'spiral_vortex',
  'lightning_crack',
  'orb_core',
  'custom_text',
] as const;
export type CutsceneShapeType = (typeof CUTSCENE_SHAPES)[number];

export const CUTSCENE_SHAPE_LABELS: Record<CutsceneShapeType, string> = {
  four_point_star: '4-Point Star',
  eight_point_star: '8-Point Starburst',
  arcane_ring: 'Arcane Rune Ring',
  hex_portal: 'Hex Portal',
  shockwave_ring: 'Shockwave Blast',
  sacred_triangle: 'Sacred Seal',
  crescent_moon: 'Eclipse Crescent',
  cross_flare: 'Anamorphic Slash',
  shard_burst: 'Crystal Shards',
  spiral_vortex: 'Spiral Vortex',
  lightning_crack: 'Reality Fracture',
  orb_core: 'Singularity Core',
  custom_text: 'On-Screen Text',
};

export const CUTSCENE_PHASES = ['all', 'buildup', 'climax', 'reveal'] as const;
export type CutscenePhase = (typeof CUTSCENE_PHASES)[number];

export const CUTSCENE_MOTIONS = [
  'fade',
  'typewriter',
  'slam',
  'rise',
  'zoom_in',
  'shake',
  'flicker',
  'pulse',
  'spin_cw',
  'spin_ccw',
  'expand',
  'converge',
  'shatter',
  'static',
] as const;
export type CutsceneMotion = (typeof CUTSCENE_MOTIONS)[number];

export const CUTSCENE_FONT_STYLES = ['display', 'serif', 'mono'] as const;
export type CutsceneFontStyle = (typeof CUTSCENE_FONT_STYLES)[number];

export const CUTSCENE_AUDIO_PRESETS = [
  'cosmic_sub_drop',
  'void_shatter',
  'celestial_choir',
  'infernal_brass',
  'hyper_glitch',
  'epic_chime',
  'none',
] as const;
export type CutsceneAudioPreset = (typeof CUTSCENE_AUDIO_PRESETS)[number];

export const CUTSCENE_AUDIO_LABELS: Record<
  CutsceneAudioPreset,
  { label: string; desc: string }
> = {
  cosmic_sub_drop: {
    label: 'Cosmic Sub Drop',
    desc: 'Deep rising sub-bass tension into earth-shaking drop',
  },
  void_shatter: {
    label: 'Void Shatter',
    desc: 'Dark ticking buildup into dimensional glass-break impact',
  },
  celestial_choir: {
    label: 'Celestial Choir',
    desc: 'Heavenly shimmer chords + radiant bell climax',
  },
  infernal_brass: {
    label: 'Infernal Brass',
    desc: 'Aggressive distorted synth horn & thunder impact',
  },
  hyper_glitch: {
    label: 'Hyper Glitch',
    desc: 'Fast arpeggiated cyber-chirps & digital overload drop',
  },
  epic_chime: {
    label: 'Epic Star Chime',
    desc: 'Crisp short buildup + bright star chime impact',
  },
  none: {
    label: 'Silent',
    desc: 'No cutscene audio',
  },
};

export interface CutsceneCustomAudio {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  volume: number;
}

export interface CutsceneElement {
  id: string;
  name: string;
  shape: CutsceneShapeType;
  visible: boolean;
  phase: CutscenePhase;
  motion: CutsceneMotion;
  color: string;
  secondaryColor: string;
  x: number; // -50 to 50 (% of viewport width from center)
  y: number; // -50 to 50 (% of viewport height from center)
  size: number; // 0.2 to 3.0
  speed: number; // 0 to 4.0
  opacity: number; // 0.1 to 1.0
  glow: number; // 0 to 2.5
  count: number; // 1 to 24 (spokes/shards/arms)
  rotation: number; // -180 to 180 degrees
  text?: string;
  fontStyle?: CutsceneFontStyle;
  startTime?: number; // Exact start time in seconds (0 to cutscene.duration)
  duration?: number; // Exact length in seconds (0.2 to cutscene.duration)
}

export const AURA_TITLE_ANIMATIONS = ['float', 'pulse', 'shimmer', 'none'] as const;
export type AuraTitleAnimation = (typeof AURA_TITLE_ANIMATIONS)[number];

export interface AuraTitleConfig {
  enabled: boolean;
  text: string;
  size: number; // 0.5 to 3.0
  heightOffset: number; // -1.0 to 4.0
  color: string;
  glowColor: string;
  fontStyle: CutsceneFontStyle;
  animation: AuraTitleAnimation;
}

export interface AuraCutsceneConfig {
  enabled: boolean;
  tier: CutsceneTier;
  duration: number;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  headlineText: string;
  showHeadlineText?: boolean;
  showRevealText?: boolean;
  shakeIntensity: number;
  flashIntensity: number;
  audioPreset: CutsceneAudioPreset;
  audioVolume: number;
  customAudio?: CutsceneCustomAudio;
  elements: CutsceneElement[];
}

export interface AuraProject {
  formatVersion: string;
  engine: string;
  id: string;
  name: string;
  description: string;
  author: string;
  updatedAt: string;
  rarity: AuraRarityInfo;
  environment: AuraEnvironment;
  layers: AuraLayer[];
  textures: TextureRef[];
  audio?: AuraAudioConfig;
  levitate?: boolean;
  posePreset?: AuraPosePreset;
  cutscene?: AuraCutsceneConfig;
  titleConfig?: AuraTitleConfig;
}

export type CharacterPoseMode = AuraPosePreset | 'tpose' | 'paused';
export type CameraPreset = 'hero' | 'front' | 'closeup' | 'top' | 'low';

export interface EffectCatalogEntry {
  type: EffectType;
  label: string;
  shortDesc: string;
  defaultTexture: TextureRef;
}

export const EFFECT_CATALOG: EffectCatalogEntry[] = [
  {
    type: 'energy_spheres',
    label: 'Energy Spheres',
    shortDesc: 'Fresnel plasma shells with animated FBM noise displacement',
    defaultTexture: 'plasma_noise',
  },
  {
    type: 'rotating_rings',
    label: 'Rotating Rings',
    shortDesc: 'Tilted orbital bands and procedural rune circles',
    defaultTexture: 'arcane_rune',
  },
  {
    type: 'orbiting_objects',
    label: 'Orbiting Objects',
    shortDesc: 'Instanced 3D crystals, shards, and polyhedra in orbital paths',
    defaultTexture: 'crystal_facet',
  },
  {
    type: 'particle_systems',
    label: 'Particle Systems',
    shortDesc: 'GPU-driven swirling particle fields in 5 emission volumes',
    defaultTexture: 'soft_orb',
  },
  {
    type: 'lightning_effects',
    label: 'Lightning Effects',
    shortDesc: 'Multi-branch procedural 3D electric arcs with dynamic flicker',
    defaultTexture: 'spark_streak',
  },
  {
    type: 'energy_ribbons',
    label: 'Energy Ribbons & Trails',
    shortDesc: 'Flowing helical 3D ribbon trails with animated UV energy shaders',
    defaultTexture: 'vortex_ring',
  },
  {
    type: 'floating_sparks',
    label: 'Floating Sparks',
    shortDesc: 'Velocity-stretched rising embers and glowing spark streaks',
    defaultTexture: 'spark_streak',
  },
  {
    type: 'distortion_effects',
    label: 'Distortion Effects',
    shortDesc: 'Refractive heat-haze waves, shockwaves, and chromatic ripples',
    defaultTexture: 'plasma_noise',
  },
  {
    type: 'glowing_materials',
    label: 'Animated Glowing Materials',
    shortDesc: 'Procedural rim-glow & energy coating directly on R6 body parts',
    defaultTexture: 'hex_grid',
  },
  {
    type: 'light_beams',
    label: 'Light Beams',
    shortDesc: 'Volumetric god-ray pillars and angled radiance cones',
    defaultTexture: 'soft_orb',
  },
  {
    type: 'aura_wings',
    label: 'Wings',
    shortDesc: 'Angel, demon, butterfly, crystal, energy, mecha and phoenix wings',
    defaultTexture: 'soft_orb',
  },
  {
    type: 'halo_crowns',
    label: 'Halos & Crowns',
    shortDesc: 'Halos, crowns, horns and sun discs above the head',
    defaultTexture: 'soft_orb',
  },
  {
    type: 'magic_circles',
    label: 'Magic Circles',
    shortDesc: 'Procedural ground sigils, summoning stars and dials',
    defaultTexture: 'arcane_rune',
  },
  {
    type: 'floating_weapons',
    label: 'Floating Weapons',
    shortDesc: 'Swords, daggers, spears, scythes in five formations',
    defaultTexture: 'soft_orb',
  },
  {
    type: 'singularity',
    label: 'Singularity & Portals',
    shortDesc: 'Black holes, portals, galaxies, wormholes and eclipses',
    defaultTexture: 'plasma_noise',
  },
  {
    type: 'aura_flames',
    label: 'Flames & Smoke',
    shortDesc: 'Body-wrapping fire, dark flame, smoke and mist',
    defaultTexture: 'soft_orb',
  },
  {
    type: 'weather',
    label: 'Weather & Ambience',
    shortDesc: 'Rain, snow, petals, leaves, bubbles, confetti and more',
    defaultTexture: 'soft_orb',
  },
  {
    type: 'floating_symbols',
    label: 'Floating Symbols',
    shortDesc: 'Runes, hearts, music notes, zodiac or your own text',
    defaultTexture: 'soft_orb',
  },
  {
    type: 'ground_eruption',
    label: 'Eruptions & Debris',
    shortDesc: 'Crystal spikes, pillars and levitating rocks',
    defaultTexture: 'crystal_facet',
  },
  {
    type: 'celestial_bodies',
    label: 'Celestial Bodies',
    shortDesc: 'Planets, moons, constellations and pulsars',
    defaultTexture: 'starburst',
  },
  {
    type: 'shockwaves',
    label: 'Shockwaves',
    shortDesc: 'Pulsing ground waves, domes and hex bursts',
    defaultTexture: 'vortex_ring',
  },
  {
    type: 'chains',
    label: 'Chains',
    shortDesc: 'Orbiting, binding, anchored and hanging chains',
    defaultTexture: 'soft_orb',
  },
];

export const ANCHOR_LABELS: Record<AnchorPoint, string> = {
  root: 'Character Root',
  ground: 'Ground / Feet',
  torso: 'Torso',
  head: 'Head',
  leftArm: 'Left Arm',
  rightArm: 'Right Arm',
  leftLeg: 'Left Leg',
  rightLeg: 'Right Leg',
};

export const TEXTURE_LABELS: Record<TextureRef, string> = {
  soft_orb: 'Soft Radial Orb',
  starburst: 'Starburst Flare',
  arcane_rune: 'Arcane Rune Band',
  hex_grid: 'Hex Energy Grid',
  plasma_noise: 'Turbulent Plasma',
  spark_streak: 'Directional Spark',
  vortex_ring: 'Energy Stream',
  crystal_facet: 'Crystal Facet',
  petal: 'Blossom Petal',
  leaf: 'Leaf',
  snowflake: 'Snowflake',
  bubble: 'Bubble',
  smoke_puff: 'Smoke Puff',
  pixel_block: 'Pixel Block',
  heart: 'Heart',
  star_five: 'Five-Point Star',
  flame_wisp: 'Flame Wisp',
  halo_ring: 'Soft Ring',
  cross_sparkle: 'Cross Sparkle',
  crescent: 'Crescent Moon',
};
