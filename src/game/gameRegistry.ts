import { createDefaultLayer, PRESET_AURAS } from '../aura/presets';
import { classifyBaseOdds } from '../aura/rarity';
import {
  AURA_FORMAT_VERSION,
  AURA_TARGET_ENGINE,
  type AuraProject,
} from '../aura/types';
import { validateAuraProject } from '../aura/validator';

export interface CatalogAuraEntry {
  project: AuraProject;
  enabled: boolean;
  source: 'starter' | 'studio' | 'imported';
  addedAt: string;
}

export interface StoredAuraEntry {
  auraId: string;
  count: number;
  firstObtainedAt: string;
  lastObtainedAt: string;
}

export interface GameSaveState {
  catalog: CatalogAuraEntry[];
  storage: StoredAuraEntry[];
  equippedAuraId: string | null;
  totalRolls: number;
}

const CATALOG_KEY = 'doms_rng_iv_game_catalog_v1';
const STORAGE_KEY = 'doms_rng_iv_game_storage_v1';
const EQUIPPED_KEY = 'doms_rng_iv_game_equipped_v1';
const STATS_KEY = 'doms_rng_iv_game_stats_v1';

function buildStarterCommonAuras(): AuraProject[] {
  const glimmerLayer = {
    ...createDefaultLayer('floating_sparks', 'Soft Glimmer'),
    color: '#e2e8f0',
    secondaryColor: '#94a3b8',
    settings: {
      ...createDefaultLayer('floating_sparks').settings,
      particleCount: 45,
      size: 0.2,
      radius: 1.4,
      spread: 2.0,
      intensity: 1.1,
      opacity: 0.75,
    },
  };

  const emberLayer = {
    ...createDefaultLayer('particle_systems', 'Ember Motes'),
    color: '#fb923c',
    secondaryColor: '#f59e0b',
    settings: {
      ...createDefaultLayer('particle_systems').settings,
      particleCount: 90,
      emissionShape: 'cylinder' as const,
      radius: 1.5,
      spread: 2.2,
      size: 0.25,
      intensity: 1.35,
    },
  };

  const frostRing = {
    ...createDefaultLayer('rotating_rings', 'Frost Ring'),
    color: '#67e8f9',
    secondaryColor: '#a5f3fc',
    settings: {
      ...createDefaultLayer('rotating_rings').settings,
      radius: 1.7,
      thickness: 0.1,
      arcCount: 1,
    },
  };

  const frostSparks = {
    ...createDefaultLayer('floating_sparks', 'Ice Flakes'),
    color: '#a5f3fc',
    secondaryColor: '#ffffff',
    settings: {
      ...createDefaultLayer('floating_sparks').settings,
      particleCount: 85,
      radius: 1.75,
      spread: 2.5,
    },
  };

  const now = new Date().toISOString();
  return [
    {
      formatVersion: AURA_FORMAT_VERSION,
      engine: AURA_TARGET_ENGINE,
      id: 'starter_glimmer',
      name: 'Glimmer',
      description: 'Subtle silver motes drifting around the character.',
      author: 'Dom\'s RNG IV',
      updatedAt: now,
      rarity: classifyBaseOdds(2),
      environment: {
        backgroundColor: '#090b10',
        bloomStrength: 0.7,
        bloomRadius: 0.45,
        bloomThreshold: 0.68,
        ambientRimColor: '#94a3b8',
      },
      layers: [glimmerLayer],
      textures: [glimmerLayer.textureRef],
    },
    {
      formatVersion: AURA_FORMAT_VERSION,
      engine: AURA_TARGET_ENGINE,
      id: 'starter_ember_wisp',
      name: 'Ember Wisp',
      description: 'Warm rising sparks and gentle cinders.',
      author: 'Dom\'s RNG IV',
      updatedAt: now,
      rarity: classifyBaseOdds(16),
      environment: {
        backgroundColor: '#090b10',
        bloomStrength: 0.75,
        bloomRadius: 0.5,
        bloomThreshold: 0.65,
        ambientRimColor: '#f97316',
      },
      layers: [emberLayer],
      textures: [emberLayer.textureRef],
    },
    {
      formatVersion: AURA_FORMAT_VERSION,
      engine: AURA_TARGET_ENGINE,
      id: 'starter_frost_halo',
      name: 'Frost Halo',
      description: 'Crystalline rotating ice ring with drifting frost particles.',
      author: 'Dom\'s RNG IV',
      updatedAt: now,
      rarity: classifyBaseOdds(1_500),
      environment: {
        backgroundColor: '#090b10',
        bloomStrength: 0.75,
        bloomRadius: 0.5,
        bloomThreshold: 0.66,
        ambientRimColor: '#67e8f9',
      },
      layers: [frostRing, frostSparks],
      textures: [frostRing.textureRef, frostSparks.textureRef],
    },
  ];
}

export function getDefaultCatalog(): CatalogAuraEntry[] {
  const starters = [...buildStarterCommonAuras(), ...PRESET_AURAS];
  const now = new Date().toISOString();
  return starters.map((project) => ({
    project,
    enabled: true,
    source: 'starter',
    addedAt: now,
  }));
}

export function loadGameState(): GameSaveState {
  let catalog: CatalogAuraEntry[] = [];
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            const val = validateAuraProject(item.project);
            if (val.ok) {
              catalog.push({
                project: val.project,
                enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
                source:
                  item.source === 'studio' || item.source === 'imported'
                    ? item.source
                    : 'starter',
                addedAt:
                  typeof item.addedAt === 'string'
                    ? item.addedAt
                    : new Date().toISOString(),
              });
            }
          }
        }
      }
    }
  } catch {
    catalog = [];
  }

  if (catalog.length === 0) {
    catalog = getDefaultCatalog();
    saveCatalog(catalog);
  }

  let storage: StoredAuraEntry[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        storage = parsed.filter(
          (s) =>
            s &&
            typeof s.auraId === 'string' &&
            typeof s.count === 'number' &&
            s.count > 0,
        );
      }
    }
  } catch {
    storage = [];
  }

  let equippedAuraId: string | null = null;
  try {
    equippedAuraId = localStorage.getItem(EQUIPPED_KEY);
  } catch {
    equippedAuraId = null;
  }

  let totalRolls = 0;
  try {
    const rawStats = localStorage.getItem(STATS_KEY);
    if (rawStats) {
      const parsed = JSON.parse(rawStats);
      if (typeof parsed?.totalRolls === 'number') {
        totalRolls = parsed.totalRolls;
      }
    }
  } catch {
    totalRolls = 0;
  }

  return { catalog, storage, equippedAuraId, totalRolls };
}

export function saveCatalog(catalog: CatalogAuraEntry[]): void {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    // ignore quota errors
  }
}

export function saveStorage(storage: StoredAuraEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch {
    // ignore
  }
}

export function saveEquippedAuraId(id: string | null): void {
  try {
    if (id) localStorage.setItem(EQUIPPED_KEY, id);
    else localStorage.removeItem(EQUIPPED_KEY);
  } catch {
    // ignore
  }
}

export function saveTotalRolls(totalRolls: number): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify({ totalRolls }));
  } catch {
    // ignore
  }
}

function secureRandomFloat(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  }
  return Math.random();
}

/**
 * Rolls one aura from the enabled Roll Pool strictly using each aura's baseOdds.
 * Evaluates rarest -> most common (`1 / baseOdds` chance), falling back to the
 * most common enabled aura so every roll awards an aura.
 */
export function rollAuraFromCatalog(
  catalog: CatalogAuraEntry[],
): CatalogAuraEntry | null {
  const pool = catalog.filter((entry) => entry.enabled);
  if (pool.length === 0) return null;

  const sortedRarestFirst = [...pool].sort(
    (a, b) => b.project.rarity.baseOdds - a.project.rarity.baseOdds,
  );

  for (const entry of sortedRarestFirst) {
    const odds = Math.max(1, entry.project.rarity.baseOdds);
    if (secureRandomFloat() < 1 / odds) {
      return entry;
    }
  }

  // Fallback to the most common enabled aura
  return sortedRarestFirst[sortedRarestFirst.length - 1];
}
