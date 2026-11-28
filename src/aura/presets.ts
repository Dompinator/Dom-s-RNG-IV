import { applyLayerVariant, createNewTypeLayer } from './extraDefaults';
import { classifyBaseOdds } from './rarity';
import {
  AURA_FORMAT_VERSION,
  AURA_TARGET_ENGINE,
  type AuraLayer,
  type AuraProject,
  type EffectType,
} from './types';

function makeId(prefix = 'layer'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultLayer(
  type: EffectType,
  customName?: string,
  variant?: string,
): AuraLayer {
  const layer = createBaseLayer(type, customName);
  return applyLayerVariant(layer, variant, customName);
}

function createBaseLayer(type: EffectType, customName?: string): AuraLayer {
  const base: AuraLayer = {
    id: makeId('lyr'),
    name: customName || 'New Layer',
    type,
    visible: true,
    anchor: 'root',
    blendMode: 'additive',
    color: '#38bdf8',
    secondaryColor: '#a855f7',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    textureRef: 'soft_orb',
    animation: {
      mode: 'smooth',
      speed: 1.0,
      amplitude: 0.25,
      frequency: 1.5,
      rotationSpeed: { x: 0, y: 0.8, z: 0 },
    },
    settings: {
      size: 1.0,
      objectScale: 1.0,
      intensity: 1.35,
      opacity: 0.85,
      glow: 1.4,
      radius: 1.8,
      thickness: 0.14,
      spread: 1.5,
      turbulence: 0.6,
      particleCount: 220,
      lifetime: 2.2,
      arcCount: 5,
      segments: 32,
      emissionShape: 'cylinder',
      orbiterShape: 'crystal',
      wireframe: false,
      doubleSided: true,
      reverseDirection: false,
      tilt: 0.2,
    },
  };

  switch (type) {
    case 'energy_spheres':
      return {
        ...base,
        name: customName || 'Energy Sphere',
        anchor: 'torso',
        color: '#f59e0b',
        secondaryColor: '#ef4444',
        textureRef: 'plasma_noise',
        animation: {
          mode: 'pulse',
          speed: 1.4,
          amplitude: 0.12,
          frequency: 2.0,
          rotationSpeed: { x: 0.1, y: 0.4, z: 0.05 },
        },
        settings: {
          ...base.settings,
          radius: 1.55,
          intensity: 1.6,
          opacity: 0.72,
          turbulence: 0.45,
          segments: 48,
        },
      };

    case 'rotating_rings':
      return {
        ...base,
        name: customName || 'Rotating Ring',
        anchor: 'ground',
        color: '#38bdf8',
        secondaryColor: '#e0f2fe',
        textureRef: 'arcane_rune',
        position: { x: 0, y: 0.12, z: 0 },
        animation: {
          mode: 'smooth',
          speed: 1.0,
          amplitude: 0.08,
          frequency: 1.2,
          rotationSpeed: { x: 0, y: 1.1, z: 0 },
        },
        settings: {
          ...base.settings,
          radius: 2.1,
          thickness: 0.12,
          tilt: 0.15,
          segments: 64,
          opacity: 0.9,
        },
      };

    case 'orbiting_objects':
      return {
        ...base,
        name: customName || 'Orbiting Shards',
        anchor: 'torso',
        color: '#a855f7',
        secondaryColor: '#22d3ee',
        blendMode: 'normal',
        textureRef: 'crystal_facet',
        animation: {
          mode: 'wave',
          speed: 1.2,
          amplitude: 0.3,
          frequency: 1.8,
          rotationSpeed: { x: 0.5, y: 1.4, z: 0.3 },
        },
        settings: {
          ...base.settings,
          particleCount: 8,
          radius: 2.0,
          size: 0.42,
          spread: 0.7,
          intensity: 1.8,
          opacity: 0.95,
          orbiterShape: 'crystal',
        },
      };

    case 'particle_systems':
      return {
        ...base,
        name: customName || 'Particle Vortex',
        anchor: 'root',
        color: '#fbbf24',
        secondaryColor: '#f97316',
        textureRef: 'soft_orb',
        position: { x: 0, y: 1.4, z: 0 },
        animation: {
          mode: 'smooth',
          speed: 1.2,
          amplitude: 0.35,
          frequency: 1.4,
          rotationSpeed: { x: 0, y: 0.9, z: 0 },
        },
        settings: {
          ...base.settings,
          particleCount: 360,
          size: 0.34,
          radius: 1.8,
          spread: 2.8,
          lifetime: 2.5,
          turbulence: 0.65,
          emissionShape: 'vortex',
          opacity: 0.9,
        },
      };

    case 'lightning_effects':
      return {
        ...base,
        name: customName || 'Arc Lightning',
        anchor: 'torso',
        color: '#38bdf8',
        secondaryColor: '#ffffff',
        textureRef: 'spark_streak',
        animation: {
          mode: 'chaos',
          speed: 2.4,
          amplitude: 0.35,
          frequency: 10.0,
          rotationSpeed: { x: 0, y: 0.5, z: 0 },
        },
        settings: {
          ...base.settings,
          arcCount: 6,
          radius: 1.75,
          thickness: 0.045,
          spread: 1.4,
          turbulence: 0.75,
          lifetime: 0.14,
          segments: 14,
          intensity: 2.2,
          opacity: 0.95,
        },
      };

    case 'energy_ribbons':
      return {
        ...base,
        name: customName || 'Energy Ribbons',
        anchor: 'root',
        color: '#ec4899',
        secondaryColor: '#8b5cf6',
        textureRef: 'vortex_ring',
        position: { x: 0, y: 1.35, z: 0 },
        animation: {
          mode: 'wave',
          speed: 1.6,
          amplitude: 0.3,
          frequency: 2.0,
          rotationSpeed: { x: 0, y: 1.3, z: 0 },
        },
        settings: {
          ...base.settings,
          arcCount: 3,
          radius: 1.65,
          thickness: 0.22,
          spread: 2.2,
          segments: 72,
          intensity: 1.7,
          opacity: 0.85,
        },
      };

    case 'floating_sparks':
      return {
        ...base,
        name: customName || 'Floating Sparks',
        anchor: 'ground',
        color: '#fb923c',
        secondaryColor: '#fef08a',
        textureRef: 'spark_streak',
        position: { x: 0, y: 0.2, z: 0 },
        animation: {
          mode: 'burst',
          speed: 1.4,
          amplitude: 0.4,
          frequency: 2.2,
          rotationSpeed: { x: 0, y: 0.3, z: 0 },
        },
        settings: {
          ...base.settings,
          particleCount: 160,
          size: 0.24,
          radius: 2.1,
          spread: 3.4,
          lifetime: 1.8,
          turbulence: 0.55,
          intensity: 1.9,
          opacity: 0.92,
        },
      };

    case 'distortion_effects':
      return {
        ...base,
        name: customName || 'Spatial Distortion',
        anchor: 'torso',
        color: '#c084fc',
        secondaryColor: '#22d3ee',
        textureRef: 'plasma_noise',
        animation: {
          mode: 'pulse',
          speed: 1.8,
          amplitude: 0.22,
          frequency: 2.6,
          rotationSpeed: { x: 0.2, y: -0.6, z: 0.15 },
        },
        settings: {
          ...base.settings,
          radius: 1.9,
          turbulence: 0.85,
          intensity: 1.5,
          opacity: 0.55,
          segments: 48,
        },
      };

    case 'glowing_materials':
      return {
        ...base,
        name: customName || 'Body Rim Glow',
        anchor: 'torso',
        color: '#22d3ee',
        secondaryColor: '#3b82f6',
        textureRef: 'hex_grid',
        animation: {
          mode: 'pulse',
          speed: 1.6,
          amplitude: 0.35,
          frequency: 2.4,
          rotationSpeed: { x: 0, y: 0, z: 0 },
        },
        settings: {
          ...base.settings,
          size: 1.04,
          intensity: 2.0,
          opacity: 0.8,
          turbulence: 0.4,
        },
      };

    case 'light_beams':
      return {
        ...base,
        name: customName || 'Light Beams',
        anchor: 'ground',
        color: '#fde68a',
        secondaryColor: '#f59e0b',
        textureRef: 'soft_orb',
        position: { x: 0, y: 0.05, z: 0 },
        animation: {
          mode: 'pulse',
          speed: 0.9,
          amplitude: 0.2,
          frequency: 1.2,
          rotationSpeed: { x: 0, y: 0.25, z: 0 },
        },
        settings: {
          ...base.settings,
          arcCount: 4,
          radius: 1.15,
          spread: 5.2,
          tilt: 0.18,
          intensity: 1.4,
          opacity: 0.45,
        },
      };

    default:
      return createNewTypeLayer(base, type, customName);
  }
}

export function collectUsedTextures(layers: AuraLayer[]) {
  return Array.from(new Set(layers.map((l) => l.textureRef)));
}

export const PRESET_AURAS: AuraProject[] = [
  (() => {
    const layers: AuraLayer[] = [
      {
        ...createDefaultLayer('light_beams', 'Solar Pillar'),
        color: '#fde047',
        secondaryColor: '#f97316',
        settings: {
          ...createDefaultLayer('light_beams').settings,
          arcCount: 5,
          radius: 1.35,
          spread: 5.6,
          tilt: 0.12,
          intensity: 1.45,
          opacity: 0.38,
        },
      },
      {
        ...createDefaultLayer('energy_spheres', 'Corona Shell'),
        color: '#fb923c',
        secondaryColor: '#fef08a',
        settings: {
          ...createDefaultLayer('energy_spheres').settings,
          radius: 1.45,
          intensity: 1.55,
          opacity: 0.48,
          turbulence: 0.55,
        },
      },
      {
        ...createDefaultLayer('energy_ribbons', 'Helical Flares'),
        color: '#f59e0b',
        secondaryColor: '#ef4444',
        settings: {
          ...createDefaultLayer('energy_ribbons').settings,
          arcCount: 3,
          radius: 1.75,
          thickness: 0.2,
          spread: 2.5,
          intensity: 1.85,
          opacity: 0.85,
        },
      },
      {
        ...createDefaultLayer('floating_sparks', 'Rising Embers'),
        color: '#fbbf24',
        secondaryColor: '#ef4444',
        settings: {
          ...createDefaultLayer('floating_sparks').settings,
          particleCount: 220,
          size: 0.25,
          radius: 2.2,
          spread: 3.8,
          lifetime: 2.0,
          intensity: 2.1,
        },
      },
      {
        ...createDefaultLayer('glowing_materials', 'Solar Armor Rim'),
        anchor: 'root',
        color: '#fbbf24',
        secondaryColor: '#f97316',
        textureRef: 'plasma_noise',
        settings: {
          ...createDefaultLayer('glowing_materials').settings,
          intensity: 1.9,
          opacity: 0.78,
        },
      },
    ];
    return {
      formatVersion: AURA_FORMAT_VERSION,
      engine: AURA_TARGET_ENGINE,
      id: 'preset_solar_sovereign',
      name: 'Solar Sovereign',
      description: 'Radiant coronal plasma, rising solar embers, helical flare ribbons, and vertical god-ray pillars.',
      author: 'Studio Preset',
      updatedAt: new Date().toISOString(),
      rarity: classifyBaseOdds(25_000_000),
      environment: {
        backgroundColor: '#090b10',
        bloomStrength: 0.85,
        bloomRadius: 0.55,
        bloomThreshold: 0.62,
        ambientRimColor: '#f59e0b',
      },
      layers,
      textures: collectUsedTextures(layers),
    };
  })(),

  (() => {
    const layers: AuraLayer[] = [
      {
        ...createDefaultLayer('distortion_effects', 'Event Horizon'),
        color: '#7c3aed',
        secondaryColor: '#22d3ee',
        settings: {
          ...createDefaultLayer('distortion_effects').settings,
          radius: 1.75,
          turbulence: 0.95,
          intensity: 1.8,
          opacity: 0.62,
        },
      },
      {
        ...createDefaultLayer('lightning_effects', 'Void Arcs'),
        color: '#a855f7',
        secondaryColor: '#67e8f9',
        settings: {
          ...createDefaultLayer('lightning_effects').settings,
          arcCount: 8,
          radius: 1.9,
          thickness: 0.04,
          turbulence: 0.85,
          lifetime: 0.11,
          intensity: 2.4,
        },
      },
      {
        ...createDefaultLayer('orbiting_objects', 'Obsidian Monoliths'),
        color: '#312e81',
        secondaryColor: '#c084fc',
        settings: {
          ...createDefaultLayer('orbiting_objects').settings,
          particleCount: 10,
          radius: 2.25,
          size: 0.45,
          spread: 0.9,
          orbiterShape: 'shard',
          intensity: 2.0,
        },
      },
      {
        ...createDefaultLayer('particle_systems', 'Accretion Dust'),
        color: '#c084fc',
        secondaryColor: '#06b6d4',
        settings: {
          ...createDefaultLayer('particle_systems').settings,
          particleCount: 450,
          emissionShape: 'torus',
          radius: 2.35,
          spread: 1.0,
          size: 0.28,
          turbulence: 0.8,
        },
      },
      {
        ...createDefaultLayer('rotating_rings', 'Singularity Seal'),
        color: '#a855f7',
        secondaryColor: '#22d3ee',
        textureRef: 'arcane_rune',
        settings: {
          ...createDefaultLayer('rotating_rings').settings,
          radius: 2.4,
          thickness: 0.14,
          tilt: 0.28,
        },
      },
    ];
    return {
      formatVersion: AURA_FORMAT_VERSION,
      engine: AURA_TARGET_ENGINE,
      id: 'preset_void_singularity',
      name: 'Void Singularity',
      description: 'Gravitational distortion field with obsidian shard satellites, void lightning, and an arcane accretion disk.',
      author: 'Studio Preset',
      updatedAt: new Date().toISOString(),
      rarity: classifyBaseOdds(250_000_000),
      environment: {
        backgroundColor: '#07080d',
        bloomStrength: 0.95,
        bloomRadius: 0.65,
        bloomThreshold: 0.58,
        ambientRimColor: '#8b5cf6',
      },
      layers,
      textures: collectUsedTextures(layers),
    };
  })(),

  (() => {
    const layers: AuraLayer[] = [
      {
        ...createDefaultLayer('lightning_effects', 'Right Gauntlet Arcs'),
        anchor: 'rightArm',
        color: '#38bdf8',
        secondaryColor: '#e0f2fe',
        settings: {
          ...createDefaultLayer('lightning_effects').settings,
          arcCount: 5,
          radius: 0.85,
          thickness: 0.032,
          spread: 0.9,
          lifetime: 0.1,
          intensity: 2.3,
        },
      },
      {
        ...createDefaultLayer('lightning_effects', 'Left Gauntlet Arcs'),
        anchor: 'leftArm',
        color: '#38bdf8',
        secondaryColor: '#e0f2fe',
        settings: {
          ...createDefaultLayer('lightning_effects').settings,
          arcCount: 5,
          radius: 0.85,
          thickness: 0.032,
          spread: 0.9,
          lifetime: 0.1,
          intensity: 2.3,
        },
      },
      {
        ...createDefaultLayer('particle_systems', 'Cyclone Swirl'),
        color: '#0ea5e9',
        secondaryColor: '#bae6fd',
        settings: {
          ...createDefaultLayer('particle_systems').settings,
          particleCount: 420,
          emissionShape: 'vortex',
          radius: 2.0,
          spread: 3.1,
          size: 0.3,
          turbulence: 0.9,
        },
      },
      {
        ...createDefaultLayer('energy_ribbons', 'Jetstream Trails'),
        color: '#38bdf8',
        secondaryColor: '#818cf8',
        settings: {
          ...createDefaultLayer('energy_ribbons').settings,
          arcCount: 4,
          radius: 1.9,
          thickness: 0.16,
          spread: 2.8,
        },
      },
    ];
    return {
      formatVersion: AURA_FORMAT_VERSION,
      engine: AURA_TARGET_ENGINE,
      id: 'preset_stormfront_tempest',
      name: 'Stormfront Tempest',
      description: 'High-voltage lightning bound to both arms inside a fast cyclonic vortex.',
      author: 'Studio Preset',
      updatedAt: new Date().toISOString(),
      rarity: classifyBaseOdds(2_500_000),
      environment: {
        backgroundColor: '#080b12',
        bloomStrength: 0.8,
        bloomRadius: 0.5,
        bloomThreshold: 0.65,
        ambientRimColor: '#38bdf8',
      },
      layers,
      textures: collectUsedTextures(layers),
    };
  })(),

  (() => {
    const layers: AuraLayer[] = [
      {
        ...createDefaultLayer('orbiting_objects', 'Emerald Crystals'),
        anchor: 'torso',
        color: '#10b981',
        secondaryColor: '#5eead4',
        settings: {
          ...createDefaultLayer('orbiting_objects').settings,
          particleCount: 7,
          radius: 1.75,
          size: 0.36,
          spread: 0.6,
          orbiterShape: 'octahedron',
        },
      },
      {
        ...createDefaultLayer('energy_ribbons', 'Aurora Silk'),
        color: '#34d399',
        secondaryColor: '#2dd4bf',
        settings: {
          ...createDefaultLayer('energy_ribbons').settings,
          arcCount: 2,
          radius: 1.55,
          thickness: 0.24,
          spread: 2.0,
          opacity: 0.72,
        },
      },
      {
        ...createDefaultLayer('floating_sparks', 'Luminous Motes'),
        color: '#6ee7b7',
        secondaryColor: '#a7f3d0',
        textureRef: 'starburst',
        settings: {
          ...createDefaultLayer('floating_sparks').settings,
          particleCount: 120,
          size: 0.28,
          radius: 1.9,
          spread: 2.9,
          lifetime: 2.4,
          turbulence: 0.35,
        },
      },
    ];
    return {
      formatVersion: AURA_FORMAT_VERSION,
      engine: AURA_TARGET_ENGINE,
      id: 'preset_celestial_bloom',
      name: 'Celestial Bloom',
      description: 'Tranquil emerald-teal aurora silk ribbons with drifting starburst motes and orbiting octahedra.',
      author: 'Studio Preset',
      updatedAt: new Date().toISOString(),
      rarity: classifyBaseOdds(120_000),
      environment: {
        backgroundColor: '#080d0d',
        bloomStrength: 0.72,
        bloomRadius: 0.55,
        bloomThreshold: 0.68,
        ambientRimColor: '#34d399',
      },
      layers,
      textures: collectUsedTextures(layers),
    };
  })(),
];

export function createBlankProject(name = 'Untitled Aura'): AuraProject {
  const layers = [createDefaultLayer('energy_spheres', 'Core Field')];
  return {
    formatVersion: AURA_FORMAT_VERSION,
    engine: AURA_TARGET_ENGINE,
    id: makeId('aura'),
    name,
    description: 'Custom 3D aura created in Dom\'s RNG IV Aura Studio.',
    author: 'Creator',
    updatedAt: new Date().toISOString(),
    rarity: classifyBaseOdds(1_000_000),
    environment: {
      backgroundColor: '#090b10',
      bloomStrength: 0.8,
      bloomRadius: 0.5,
      bloomThreshold: 0.64,
      ambientRimColor: '#f59e0b',
    },
    layers,
    textures: collectUsedTextures(layers),
  };
}

export function cloneProjectWithNewId(project: AuraProject): AuraProject {
  const cloned: AuraProject = JSON.parse(JSON.stringify(project));
  cloned.id = makeId('aura');
  cloned.updatedAt = new Date().toISOString();
  cloned.layers = cloned.layers.map((l) => ({ ...l, id: makeId('lyr') }));
  return cloned;
}
