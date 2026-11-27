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
    phase: shape === 'custom_text' ? 'buildup' : 'all',
    motion:
      shape === 'shockwave_ring'
        ? 'expand'
        : shape === 'shard_burst' || shape === 'lightning_crack'
          ? 'shatter'
          : shape === 'orb_core' || shape === 'cross_flare'
            ? 'pulse'
            : shape === 'custom_text'
              ? 'slam'
              : 'spin_cw',
    color: shape === 'custom_text' ? '#ffffff' : '#fbbf24',
    secondaryColor: shape === 'custom_text' ? '#fbbf24' : '#38bdf8',
    x: 0,
    y: shape === 'custom_text' ? 22 : 0,
    size: shape === 'custom_text' ? 1.1 : 1.0,
    speed: 1.2,
    opacity: 0.92,
    glow: 1.4,
    count: shape === 'shard_burst' ? 12 : shape === 'lightning_crack' ? 8 : 6,
    rotation: 0,
    ...(shape === 'custom_text'
      ? { text: 'THE HEAVENS TREMBLE...', fontStyle: 'display' as const }
      : {}),
    ...overrides,
  };
}

export function createDefaultCutscene(
  tier: CutsceneTier = 'epic',
  primaryColor = '#fbbf24',
  secondaryColor = '#38bdf8',
): AuraCutsceneConfig {
  if (tier === 'under_epic') {
    return {
      enabled: true,
      tier: 'under_epic',
      duration: 2.5,
      primaryColor,
      secondaryColor,
      backgroundColor: '#04060d',
      headlineText: '',
      showHeadlineText: false,
      showRevealText: true,
      shakeIntensity: 0.75,
      flashIntensity: 1.0,
      audioPreset: 'epic_chime',
      audioVolume: 0.85,
      elements: [
        createCutsceneElement('four_point_star', {
          name: '<Epic Star Core',
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

  if (tier === 'epic') {
    return {
      enabled: true,
      tier: 'epic',
      duration: 5.6,
      primaryColor,
      secondaryColor,
      backgroundColor: '#020308',
      headlineText: 'A shimmering force fractures the sky...',
      showHeadlineText: false,
      showRevealText: true,
      shakeIntensity: 1.5,
      flashIntensity: 1.45,
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
          name: 'Epic Starburst',
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

  if (tier === 'legendary') {
    return {
      enabled: true,
      tier: 'legendary',
      duration: 10.5,
      primaryColor,
      secondaryColor,
      backgroundColor: '#020209',
      headlineText: 'An ancient seal breaks across dimensions...',
      showHeadlineText: true,
      showRevealText: true,
      shakeIntensity: 1.75,
      flashIntensity: 1.65,
      audioPreset: 'celestial_choir',
      audioVolume: 0.92,
      elements: [
        createCutsceneElement('orb_core', {
          name: 'Legendary Heart',
          phase: 'all',
          motion: 'pulse',
          color: primaryColor,
          secondaryColor: '#ffffff',
          size: 1.15,
          speed: 1.4,
          glow: 2.0,
        }),
        createCutsceneElement('hex_portal', {
          name: 'Grand Gate',
          phase: 'all',
          motion: 'spin_cw',
          color: primaryColor,
          secondaryColor,
          size: 1.55,
          speed: 0.8,
          glow: 1.7,
        }),
        createCutsceneElement('arcane_ring', {
          name: 'Outer Seal',
          phase: 'buildup',
          motion: 'spin_ccw',
          color: secondaryColor,
          secondaryColor: primaryColor,
          size: 1.85,
          speed: 1.2,
          count: 12,
          glow: 1.6,
        }),
        createCutsceneElement('spiral_vortex', {
          name: 'Energy Implosion',
          phase: 'buildup',
          motion: 'converge',
          color: secondaryColor,
          secondaryColor: '#ffffff',
          size: 1.9,
          speed: 2.0,
          count: 10,
          glow: 1.5,
        }),
        createCutsceneElement('lightning_crack', {
          name: 'Reality Rift',
          phase: 'climax',
          motion: 'shatter',
          color: '#ffffff',
          secondaryColor: primaryColor,
          size: 2.2,
          speed: 2.4,
          count: 14,
          glow: 2.2,
        }),
        createCutsceneElement('shockwave_ring', {
          name: 'Climax Shockwave',
          phase: 'climax',
          motion: 'expand',
          color: primaryColor,
          secondaryColor: '#ffffff',
          size: 2.4,
          speed: 1.7,
          glow: 2.2,
        }),
        createCutsceneElement('eight_point_star', {
          name: 'Crown Starburst',
          phase: 'reveal',
          motion: 'spin_cw',
          color: primaryColor,
          secondaryColor: '#ffffff',
          size: 1.5,
          speed: 0.7,
          glow: 2.0,
        }),
        createCutsceneElement('cross_flare', {
          name: 'Horizon Flare',
          phase: 'reveal',
          motion: 'pulse',
          color: '#ffffff',
          secondaryColor: primaryColor,
          size: 1.8,
          speed: 1.1,
          glow: 1.9,
        }),
        createCutsceneElement('shard_burst', {
          name: 'Radiant Shards',
          phase: 'reveal',
          motion: 'shatter',
          color: secondaryColor,
          secondaryColor: primaryColor,
          size: 1.6,
          speed: 1.2,
          count: 18,
          glow: 1.5,
        }),
      ],
    };
  }

  // Mythic Cutscene (20 seconds)
  return {
    enabled: true,
    tier: 'mythic',
    duration: 20.0,
    primaryColor,
    secondaryColor,
    backgroundColor: '#010105',
    headlineText: 'All stars fall silent before what awakens...',
    showHeadlineText: true,
    showRevealText: true,
    shakeIntensity: 2.1,
    flashIntensity: 2.0,
    audioPreset: 'cosmic_sub_drop',
    audioVolume: 0.96,
    elements: [
      createCutsceneElement('orb_core', {
        name: 'Mythic Singularity',
        phase: 'all',
        motion: 'pulse',
        color: primaryColor,
        secondaryColor: '#ffffff',
        size: 1.25,
        speed: 1.5,
        glow: 2.3,
      }),
      createCutsceneElement('crescent_moon', {
        name: 'Astral Eclipse',
        phase: 'buildup',
        motion: 'spin_ccw',
        color: primaryColor,
        secondaryColor,
        size: 1.45,
        speed: 0.55,
        glow: 1.9,
      }),
      createCutsceneElement('arcane_ring', {
        name: 'Celestial Sanctuary Ring',
        phase: 'all',
        motion: 'spin_cw',
        color: primaryColor,
        secondaryColor,
        size: 1.95,
        speed: 0.7,
        count: 16,
        glow: 1.8,
      }),
      createCutsceneElement('hex_portal', {
        name: 'Dimensional Gate',
        phase: 'buildup',
        motion: 'spin_ccw',
        color: secondaryColor,
        secondaryColor: primaryColor,
        size: 1.6,
        speed: 1.15,
        glow: 1.7,
      }),
      createCutsceneElement('spiral_vortex', {
        name: 'Cosmic Collapse',
        phase: 'buildup',
        motion: 'converge',
        color: secondaryColor,
        secondaryColor: '#ffffff',
        size: 2.2,
        speed: 2.2,
        count: 12,
        glow: 1.8,
      }),
      createCutsceneElement('lightning_crack', {
        name: 'World Shatter',
        phase: 'climax',
        motion: 'shatter',
        color: '#ffffff',
        secondaryColor: primaryColor,
        size: 2.5,
        speed: 2.8,
        count: 16,
        glow: 2.4,
      }),
      createCutsceneElement('shockwave_ring', {
        name: 'Supernova Blast',
        phase: 'climax',
        motion: 'expand',
        color: primaryColor,
        secondaryColor: '#ffffff',
        size: 2.8,
        speed: 1.8,
        glow: 2.4,
      }),
      createCutsceneElement('eight_point_star', {
        name: 'Mythic Sovereign Star',
        phase: 'reveal',
        motion: 'spin_cw',
        color: primaryColor,
        secondaryColor: '#ffffff',
        size: 1.75,
        speed: 0.55,
        glow: 2.2,
      }),
      createCutsceneElement('cross_flare', {
        name: 'Infinite Horizon Flash',
        phase: 'reveal',
        motion: 'pulse',
        color: '#ffffff',
        secondaryColor: primaryColor,
        size: 2.2,
        speed: 1.0,
        glow: 2.0,
      }),
      createCutsceneElement('shard_burst', {
        name: 'Starlight Fallout',
        phase: 'reveal',
        motion: 'shatter',
        color: secondaryColor,
        secondaryColor: primaryColor,
        size: 1.9,
        speed: 1.3,
        count: 22,
        glow: 1.8,
      }),
      createCutsceneElement('custom_text', {
        name: 'Mythic Omen Text',
        phase: 'buildup',
        motion: 'flicker',
        color: '#ffffff',
        secondaryColor: primaryColor,
        x: 0,
        y: -26,
        size: 0.95,
        speed: 0.9,
        text: 'MYTHIC MANIFESTATION',
        fontStyle: 'mono',
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
    id: 'under_epic_flash',
    label: '<Epic Quick Flash',
    tier: 'under_epic',
    build: (p, s) => createDefaultCutscene('under_epic', p, s),
  },
  {
    id: 'epic_sovereign',
    label: 'Epic Shatter (5.6s)',
    tier: 'epic',
    build: (p, s) => createDefaultCutscene('epic', p, s),
  },
  {
    id: 'legendary_ascension',
    label: 'Legendary Seal (10.5s)',
    tier: 'legendary',
    build: (p, s) => createDefaultCutscene('legendary', p, s),
  },
  {
    id: 'mythic_awakening',
    label: 'Mythic Awakening (20s)',
    tier: 'mythic',
    build: (p, s) => createDefaultCutscene('mythic', p, s),
  },
  {
    id: 'abyssal_mythic',
    label: 'Abyssal Mythic (20s)',
    tier: 'mythic',
    build: (p, s) => {
      const base = createDefaultCutscene('mythic', p, s);
      return {
        ...base,
        backgroundColor: '#020106',
        headlineText: 'From the deepest abyss, reality tears open...',
        audioPreset: 'void_shatter',
        shakeIntensity: 2.2,
      };
    },
  },
  {
    id: 'infernal_legendary',
    label: 'Infernal Overdrive (10.5s)',
    tier: 'legendary',
    build: (p, s) => {
      const base = createDefaultCutscene('legendary', p, s);
      return {
        ...base,
        backgroundColor: '#070203',
        headlineText: 'A blazing star ignites the heavens...',
        audioPreset: 'infernal_brass',
        flashIntensity: 1.85,
      };
    },
  },
];
