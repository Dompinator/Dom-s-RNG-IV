import type { AuraProject } from '../aura/types';
import { validateAuraProject } from '../aura/validator';

export interface CatalogAuraEntry {
  project: AuraProject;
  enabled: boolean;
  source: 'studio' | 'imported';
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

const CATALOG_KEY = 'doms_rng_iv_game_catalog_v2';
const STORAGE_KEY = 'doms_rng_iv_game_storage_v2';
const EQUIPPED_KEY = 'doms_rng_iv_game_equipped_v2';
const STATS_KEY = 'doms_rng_iv_game_stats_v2';

export function getDefaultCatalog(): CatalogAuraEntry[] {
  return [];
}

export function loadGameState(): GameSaveState {
  const catalog: CatalogAuraEntry[] = [];
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
                source: item.source === 'studio' ? 'studio' : 'imported',
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
    // start with empty roll pool
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

  return sortedRarestFirst[sortedRarestFirst.length - 1];
}
