import { collectUsedTextures } from '../aura/presets';
import { validateAuraProject } from '../aura/validator';
import type { CatalogAuraEntry } from './gameRegistry';

const GITHUB_OWNER = 'Dompinator';
const GITHUB_REPO = 'Dom-s-RNG-IV';
const GH_TOKEN_STORAGE_KEY = 'doms_rng_iv_gh_publish_token';

export interface GlobalPoolEntryPayload {
  project: CatalogAuraEntry['project'];
  enabled: boolean;
  addedAt: string;
}

export async function fetchGlobalRollPool(): Promise<CatalogAuraEntry[]> {
  try {
    const res = await fetch(`./roll-pool.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];

    const results: CatalogAuraEntry[] = [];
    for (const item of raw) {
      // Accept either { project, enabled, addedAt } wrapper or raw AuraProject
      const candidate =
        item && typeof item === 'object' && 'project' in item
          ? (item as Record<string, unknown>).project
          : item;
      const val = validateAuraProject(candidate);
      if (val.ok) {
        const enabled =
          item && typeof item === 'object' && typeof (item as Record<string, unknown>).enabled === 'boolean'
            ? Boolean((item as Record<string, unknown>).enabled)
            : true;
        const addedAt =
          item && typeof item === 'object' && typeof (item as Record<string, unknown>).addedAt === 'string'
            ? String((item as Record<string, unknown>).addedAt)
            : new Date().toISOString();

        results.push({
          project: val.project,
          enabled,
          source: 'global',
          addedAt,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function mergeGlobalIntoCatalog(
  localCatalog: CatalogAuraEntry[],
  globalEntries: CatalogAuraEntry[],
): CatalogAuraEntry[] {
  const byId = new Map<string, CatalogAuraEntry>();

  // Keep non-global local entries (studio/imported) and existing global entries
  for (const entry of localCatalog) {
    byId.set(entry.project.id, entry);
  }

  // Upsert global entries so all devices receive published updates
  for (const g of globalEntries) {
    const existing = byId.get(g.project.id);
    if (!existing || existing.source === 'global') {
      byId.set(g.project.id, g);
    }
  }

  return Array.from(byId.values());
}

export function serializeCatalogForGlobalPool(catalog: CatalogAuraEntry[]): string {
  const payload: GlobalPoolEntryPayload[] = catalog.map((entry) => ({
    project: {
      ...entry.project,
      textures: collectUsedTextures(entry.project.layers),
    },
    enabled: entry.enabled,
    addedAt: entry.addedAt,
  }));
  return JSON.stringify(payload, null, 2);
}

export function downloadGlobalRollPoolJson(catalog: CatalogAuraEntry[]): void {
  const json = serializeCatalogForGlobalPool(catalog);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'roll-pool.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getSavedGitHubToken(): string {
  try {
    return localStorage.getItem(GH_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveGitHubToken(token: string): void {
  try {
    if (token.trim()) localStorage.setItem(GH_TOKEN_STORAGE_KEY, token.trim());
    else localStorage.removeItem(GH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function upsertGitHubFile(
  token: string,
  branch: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const headers: Record<string, string> = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  let sha: string | undefined;
  const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
  if (getRes.ok) {
    const data = await getRes.json();
    if (data && typeof data.sha === 'string') {
      sha = data.sha;
    }
  }

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message,
      content: utf8ToBase64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const errBody = await putRes.json().catch(() => ({}));
    throw new Error(
      errBody?.message || `GitHub API error (${putRes.status}) on ${branch}/${path}`,
    );
  }
}

/**
 * Publishes the Roll Pool directly to both `main` (public/roll-pool.json) and
 * `gh-pages` (roll-pool.json) so every visitor on any device immediately gets
 * the updated rollable auras on GitHub Pages.
 */
export async function publishRollPoolToGitHub(
  token: string,
  catalog: CatalogAuraEntry[],
): Promise<void> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('Please enter a GitHub Personal Access Token with repo access.');
  }
  const content = serializeCatalogForGlobalPool(catalog);
  const msg = `Publish global Roll Pool (${catalog.length} auras)`;

  await upsertGitHubFile(cleanToken, 'main', 'public/roll-pool.json', content, msg);
  await upsertGitHubFile(cleanToken, 'gh-pages', 'roll-pool.json', content, msg);
}
