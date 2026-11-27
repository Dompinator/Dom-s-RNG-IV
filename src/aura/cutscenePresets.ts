import type {
  AuraCutsceneConfig,
  CutsceneElement,
  CutsceneShapeType,
  CutsceneTier,
} from './types';
import { CUTSCENE_SHAPE_LABELS } from './types';

function makeElId(): string {
  return `cut_${Math.random().toString(36).slice(2, 9)}`;
}

export function createCutsceneElement(
  shape: CutsceneShapeType,
  overrides: Partial<CutsceneElement> = {},
): CutsceneElement {
  return {
    id: makeElId(),
    name: overrides.name ?? CUTSCENE_SHAPE_LABELS[shape],
    shape,
    visible: true,
    phase: 'all',
    motion:
      shape === 'shockwave_ring'
        ? 'expand'
        : shape === 'shard_burst' || shape === 'lightning_crack'
          ? 'shatter'
          : shape === 'orb_core' || shape === 'cross_flare'
            ? 'pulse'
            : 'spin_cw',
    color: '#fbbf24',
    secondaryColor: '#38bdf8',
    x: 0,
    y: 0,
    size: 1.0,
    speed: 1.2,
    opacity: 0.92,
    glow: 1.4,
    count: shape === 'shard_burst' ? 12 : shape === 'lightning_crack' ? 8 : 6,
    rotation: 0,
    ...overrides,
  };
}

export function createDefaultCutscene(
  tier: CutsceneTier = 'legendary_mythic',
  primaryColor = '#fbbf24',
  secondaryColor = '#38bdf8',
): AuraCutsceneConfig {
  if (tier === 'epic') {
    return {
      enabled: true,
      tier: 'epic',
      duration: 2.5,
      primaryColor,
      secondaryColor,
      backgroundColor: '#04060d',
      headlineText: 'A shimmering force manifests...',
      shakeIntensity: 0.75,
      flashIntensity: 1.0,
      audioPreset: 'epic_chime',
      audioVolume: 0.85,
      elements: [
        createCutsceneElement('four_point_star', {
          name: 'Epic Star Core',
          phase: 'all',
          motion: 'pulse',
          color: primaryColor,
          secondaryColor,
          size: 1.15,
          speed: 1.5,
          glow: 1.6,
        }),
        createCutsceneElement('arcane_ring', {
          name: 'Inner Sigil Ring',
          phase: 'buildup',
          motion: 'spin_cw',
          color: secondaryColor,
          secondaryColor: primaryColor,
          size: 0.95,
          speed: 1.6,
          opacity: 0.8,
        }),
        createCutsceneElement('shockwave_ring', {
          name: 'Impact Wave',
          phase: 'climax',
          motion: 'expand',
          color: primaryColor,
          secondaryColor: '#ffffff',
          size: 1.6,
          speed: 1.9,
          glow: 1.8,
        }),
        createCutsceneElement('cross_flare', {
          name: 'Flash Slash',
          phase: 'reveal',
          motion: 'pulse',
          color: '#ffffff',
          secondaryColor: primaryColor,
          size: 1.25,
          speed: 1.1,
          glow: 1.5,
        }),
      ],
    };
  }

  return {
    enabled: true,
    tier: 'legendary_mythic',
    duration: 5.6,
    primaryColor,
    secondaryColor,
    backgroundColor: '#020308',
    headlineText: 'The heavens fracture before your power...',
    shakeIntensity: 1.6,
    flashIntensity: 1.5,
    audioPreset: 'cosmic_sub_drop',
    audioVolume: 0.9,
    elements: [
      createCutsceneElement('orb_core', {
        name: 'Singularity Core',
        phase: 'all',
        motion: 'pulse',
        color: primaryColor,
        secondaryColor: '#ffffff',
        size: 1.05,
        speed: 1.3,
        glow: 1.9,
      }),
      createCutsceneElement('spiral_vortex', {
        name: 'Converging Vortex',
        phase: 'buildup',
        motion: 'converge',
        color: secondaryColor,
        secondaryColor: primaryColor,
        size: 1.5,
        speed: 1.8,
        count: 8,
        glow: 1.4,
      }),
      createCutsceneElement('arcane_ring', {
        name: 'Outer Celestial Seal',
        phase: 'all',
        motion: 'spin_cw',
        color: primaryColor,
        secondaryColor,
        size: 1.45,
        speed: 0.9,
        opacity: 0.85,
        glow: 1.5,
      }),
      createCutsceneElement('sacred_triangle', {
        name: 'Counter-Seal Triad',
        phase: 'buildup',
        motion: 'spin_ccw',
        color: secondaryColor,
        secondaryColor: '#ffffff',
        size: 1.1,
        speed: 1.4,
        glow: 1.4,
      }),
      createCutsceneElement('lightning_crack', {
        name: 'Dimensional Fracture',
        phase: 'climax',
        motion: 'shatter',
        color: '#ffffff',
        secondaryColor: primaryColor,
        size: 1.75,
        speed: 2.2,
        count: 10,
        glow: 2.0,
      }),
      createCutsceneElement('shockwave_ring', {
        name: 'Supernova Shockwave',
        phase: 'climax',
        motion: 'expand',
        color: primaryColor,
        secondaryColor: '#ffffff',
        size: 2.0,
        speed: 1.6,
        glow: 2.0,
      }),
      createCutsceneElement('eight_point_star', {
        name: 'Sovereign Starburst',
        phase: 'reveal',
        motion: 'spin_cw',
        color: primaryColor,
        secondaryColor: '#ffffff',
        size: 1.35,
        speed: 0.65,
        glow: 1.8,
      }),
      createCutsceneElement('shard_burst', {
        name: 'Crystal Fallout',
        phase: 'reveal',
        motion: 'shatter',
        color: secondaryColor,
        secondaryColor: primaryColor,
        size: 1.4,
        speed: 1.1,
        count: 14,
        glow: 1.3,
      }),
    ],
  };
}

export interface CutsceneTemplate {
  id: string;
  label: string;
  tier: CutsceneTier;
  build: (primaryColor: string, secondaryColor: string) => AuraCutsceneConfig;
}

export const CUTSCENE_TEMPLATES: CutsceneTemplate[] = [
  {
    id: 'sols_epic',
    label: "Sol's Epic Flash",
    tier: 'epic',
    build: (p, s) => createDefaultCutscene('epic', p, s),
  },
  {
    id: 'celestial_sovereign',
    label: 'Celestial Sovereign',
    tier: 'legendary_mythic',
    build: (p, s) => createDefaultCutscene('legendary_mythic', p, s),
  },
  {
    id: 'abyssal_shatter',
    label: 'Abyssal Shatter',
    tier: 'legendary_mythic',
    build: (p, s) => ({
      enabled: true,
      tier: 'legendary_mythic',
      duration: 5.8,
      primaryColor: p,
      secondaryColor: s,
      backgroundColor: '#020106',
      headlineText: 'From the deepest abyss, reality tears open...',
      shakeIntensity: 1.9,
      flashIntensity: 1.65,
      audioPreset: 'void_shatter',
      audioVolume: 0.95,
      elements: [
        createCutsceneElement('crescent_moon', {
          name: 'Crimson Eclipse',
          phase: 'all',
          motion: 'spin_ccw',
          color: p,
          secondaryColor: s,
          size: 1.3,
          speed: 0.8,
          glow: 1.8,
        }),
        createCutsceneElement('spiral_vortex', {
          name: 'Void Singularity',
          phase: 'buildup',
          motion: 'converge',
          color: s,
          secondaryColor: p,
          size: 1.7,
          speed: 2.1,
          count: 10,
        }),
        createCutsceneElement('lightning_crack', {
          name: 'Abyssal Tear',
          phase: 'climax',
          motion: 'shatter',
          color: '#ffffff',
          secondaryColor: p,
          size: 2.1,
          speed: 2.5,
          count: 12,
          glow: 2.2,
        }),
        createCutsceneElement('four_point_star', {
          name: 'Abyss Core Flare',
          phase: 'reveal',
          motion: 'pulse',
          color: p,
          secondaryColor: '#ffffff',
          size: 1.4,
          speed: 1.2,
          glow: 2.0,
        }),
        createCutsceneElement('cross_flare', {
          name: 'Horizon Slash',
          phase: 'reveal',
          motion: 'flicker',
          color: '#ffffff',
          secondaryColor: s,
          size: 1.9,
          speed: 1.4,
          glow: 1.7,
        }),
      ],
    }),
  },
  {
    id: 'solar_overdrive',
    label: 'Solar Overdrive',
    tier: 'legendary_mythic',
    build: (p, s) => ({
      enabled: true,
      tier: 'legendary_mythic',
      duration: 5.4,
      primaryColor: p,
      secondaryColor: s,
      backgroundColor: '#070304',
      headlineText: 'A blazing star ignites the sky...',
      shakeIntensity: 1.7,
      flashIntensity: 1.8,
      audioPreset: 'infernal_brass',
      audioVolume: 0.92,
      elements: [
        createCutsceneElement('hex_portal', {
          name: 'Solar Gate',
          phase: 'all',
          motion: 'spin_cw',
          color: p,
          secondaryColor: s,
          size: 1.45,
          speed: 1.1,
          glow: 1.7,
        }),
        createCutsceneElement('eight_point_star', {
          name: 'Hyper Corona',
          phase: 'all',
          motion: 'spin_ccw',
          color: '#ffffff',
          secondaryColor: p,
          size: 1.25,
          speed: 1.3,
          glow: 2.0,
        }),
        createCutsceneElement('shockwave_ring', {
          name: 'Blaze Pulse 1',
          phase: 'climax',
          motion: 'expand',
          color: p,
          secondaryColor: '#ffffff',
          size: 2.2,
          speed: 1.8,
          glow: 2.1,
        }),
        createCutsceneElement('shard_burst', {
          name: 'Solar Spikes',
          phase: 'reveal',
          motion: 'spin_cw',
          color: p,
          secondaryColor: s,
          size: 1.6,
          speed: 1.2,
          count: 18,
          glow: 1.6,
        }),
      ],
    }),
  },
];
