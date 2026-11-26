import JSZip from 'jszip';
import { collectUsedTextures } from './presets';
import { formatOdds } from './rarity';
import { renderTextureToPngBlob } from './textures';
import type { AuraProject } from './types';
import { validateAuraProject } from './validator';

const STORAGE_KEY = 'doms_rng_iv_aura_studio_projects_v1';
const ACTIVE_ID_KEY = 'doms_rng_iv_aura_studio_active_id_v1';

export function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled-aura'
  );
}

export function loadSavedProjects(): AuraProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: AuraProject[] = [];
    for (const item of parsed) {
      const res = validateAuraProject(item);
      if (res.ok) valid.push(res.project);
    }
    return valid;
  } catch {
    return [];
  }
}

export function saveProjectToLibrary(project: AuraProject): AuraProject[] {
  const prepared: AuraProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    textures: collectUsedTextures(project.layers),
  };
  const list = loadSavedProjects();
  const idx = list.findIndex((p) => p.id === prepared.id);
  if (idx >= 0) {
    list[idx] = prepared;
  } else {
    list.unshift(prepared);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  localStorage.setItem(ACTIVE_ID_KEY, prepared.id);
  return list;
}

export function deleteProjectFromLibrary(id: string): AuraProject[] {
  const list = loadSavedProjects().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

export function getLastActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function setLastActiveProjectId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_ID_KEY, id);
  } catch {
    // ignore storage quota errors
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadProjectJson(project: AuraProject): void {
  const prepared: AuraProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    textures: collectUsedTextures(project.layers),
  };
  const json = JSON.stringify(prepared, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(blob, `${slugifyName(prepared.name)}.aura.json`);
}

export async function exportAuraPackageZip(project: AuraProject): Promise<string> {
  const slug = slugifyName(project.name);
  const usedTextures = collectUsedTextures(project.layers);
  const prepared: AuraProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    textures: usedTextures,
  };

  const zip = new JSZip();
  const rootFolder = zip.folder(slug)!;
  const assetsFolder = rootFolder.folder('assets')!;
  const texturesFolder = assetsFolder.folder('textures')!;

  const textureManifest: Record<string, string> = {};
  for (const texRef of usedTextures) {
    const pngBlob = await renderTextureToPngBlob(texRef);
    const relPath = `assets/textures/${texRef}.png`;
    texturesFolder.file(`${texRef}.png`, pngBlob);
    textureManifest[texRef] = relPath;
  }

  let audioAssetPath: string | null = null;
  if (prepared.audio?.dataUrl) {
    try {
      const res = await fetch(prepared.audio.dataUrl);
      const audioBlob = await res.blob();
      const extMatch = prepared.audio.fileName.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'audio';
      const audioFile = `${slug}-theme.${ext}`;
      audioAssetPath = `assets/audio/${audioFile}`;
      rootFolder.folder('assets')!.folder('audio')!.file(audioFile, audioBlob);
    } catch {
      audioAssetPath = null;
    }
  }

  rootFolder.file('aura.json', JSON.stringify(prepared, null, 2));

  const manifest = {
    packageFormat: 'aether-aura-package',
    formatVersion: prepared.formatVersion,
    engine: prepared.engine,
    auraId: prepared.id,
    name: prepared.name,
    slug,
    exportedAt: new Date().toISOString(),
    rarity: prepared.rarity,
    layerCount: prepared.layers.length,
    effectTypes: Array.from(new Set(prepared.layers.map((l) => l.type))),
    textures: textureManifest,
    audio: audioAssetPath
      ? {
          path: audioAssetPath,
          fileName: prepared.audio?.fileName,
          volume: prepared.audio?.volume,
          loop: prepared.audio?.loop,
          refDistance: prepared.audio?.refDistance,
          maxDistance: prepared.audio?.maxDistance,
          rolloffFactor: prepared.audio?.rolloffFactor,
        }
      : null,
    entryConfig: 'aura.json',
  };
  rootFolder.file('manifest.json', JSON.stringify(manifest, null, 2));

  const readme = [
    `DOM'S RNG IV — AETHER AURA PACKAGE`,
    `==================================`,
    `Name: ${prepared.name}`,
    `Author: ${prepared.author}`,
    `Base Odds: ${formatOdds(prepared.rarity.baseOdds)}`,
    `Classification: ${prepared.rarity.classification}`,
    `Global Announcement (Mythic): ${prepared.rarity.globalAnnouncement ? 'Yes' : 'No'}`,
    `Layers: ${prepared.layers.length}`,
    `Theme Song: ${prepared.audio ? prepared.audio.fileName : 'None'}`,
    ``,
    `Description:`,
    `${prepared.description}`,
    ``,
    `Contents:`,
    `- aura.json: Validated declarative aura configuration for AETHER runtime`,
    `- manifest.json: Asset & effect inventory`,
    `- assets/textures/: Procedural PNG textures referenced by layers`,
    `- assets/audio/: Spatial audio file (if attached)`,
  ].join('\n');
  rootFolder.file('README.txt', readme);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const filename = `${slug}-aura-package.zip`;
  triggerDownload(zipBlob, filename);
  return filename;
}

export async function importAuraFromFile(
  file: File,
): Promise<{ ok: true; project: AuraProject; warnings: string[] } | { ok: false; error: string }> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.zip')) {
    try {
      const zip = await JSZip.loadAsync(file);
      // Look for aura.json at root or inside a single top-level folder
      const candidates = Object.keys(zip.files).filter(
        (path) => !zip.files[path].dir && /(^|\/)aura\.json$/i.test(path),
      );
      if (candidates.length === 0) {
        return {
          ok: false,
          error: 'Zip archive does not contain an aura.json configuration file.',
        };
      }
      const text = await zip.files[candidates[0]].async('string');
      const parsed = JSON.parse(text);
      return validateAuraProject(parsed);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? `Failed to read zip package: ${err.message}` : 'Invalid zip package.',
      };
    }
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    return validateAuraProject(parsed);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Invalid JSON file: ${err.message}` : 'Could not parse aura JSON file.',
    };
  }
}
