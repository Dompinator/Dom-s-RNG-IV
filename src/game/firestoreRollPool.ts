import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { collectUsedTextures } from '../aura/presets';
import { classifyBaseOdds } from '../aura/rarity';
import type { AuraProject } from '../aura/types';
import { validateAuraProject } from '../aura/validator';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { CatalogAuraEntry } from './gameRegistry';

export const ADMIN_EMAIL = 'codompic@gmail.com';
const COLLECTION_PATH = 'rollPool';

export function sanitizeAuraDocId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `aura_${Date.now()}`;
}

export function isCreatorAdminEmail(email: string | null | undefined, emailVerified?: boolean): boolean {
  return Boolean(emailVerified && email?.toLowerCase() === ADMIN_EMAIL);
}

export async function checkUserIsAdmin(
  uid: string | null | undefined,
  email: string | null | undefined,
  emailVerified?: boolean,
): Promise<boolean> {
  if (!uid || !emailVerified) return false;
  if (isCreatorAdminEmail(email, emailVerified)) return true;
  try {
    const snap = await getDoc(doc(db, 'admins', sanitizeAuraDocId(uid)));
    return snap.exists();
  } catch {
    return false;
  }
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function buildSanitizedProject(project: AuraProject, safeId: string): AuraProject {
  const cleanName = project.name.trim().slice(0, 64) || 'Untitled Aura';
  const cleanDesc = (project.description ?? '').slice(0, 240);
  const layers = project.layers.slice(0, 64);
  const rarity = classifyBaseOdds(project.rarity.baseOdds);

  const safeAudio =
    project.audio &&
    typeof project.audio.dataUrl === 'string' &&
    project.audio.dataUrl.length <= 920_000
      ? {
          ...project.audio,
          fileName: project.audio.fileName.slice(0, 96) || 'aura-theme.audio',
        }
      : undefined;

  let safeCutscene = project.cutscene;
  if (safeCutscene) {
    const audioLen = safeAudio?.dataUrl.length ?? 0;
    const maxCutsceneCustom = Math.min(350_000, Math.max(0, 880_000 - audioLen));
    const hasSafeCustomAudio =
      safeCutscene.customAudio &&
      typeof safeCutscene.customAudio.dataUrl === 'string' &&
      safeCutscene.customAudio.dataUrl.length > 0 &&
      safeCutscene.customAudio.dataUrl.length <= maxCutsceneCustom;

    safeCutscene = {
      ...safeCutscene,
      duration: Math.max(1, Math.min(30, safeCutscene.duration || 5.6)),
      headlineText: (safeCutscene.headlineText ?? '').slice(0, 80),
      elements: (safeCutscene.elements ?? []).slice(0, 24).map((el) => ({
        ...el,
        ...(typeof el.text === 'string' ? { text: el.text.slice(0, 80) } : {}),
        ...(typeof el.startTime === 'number'
          ? { startTime: Math.max(0, Math.min(30, el.startTime)) }
          : {}),
        ...(typeof el.duration === 'number'
          ? { duration: Math.max(0.1, Math.min(30, el.duration)) }
          : {}),
      })),
      ...(hasSafeCustomAudio
        ? {
            customAudio: {
              ...safeCutscene.customAudio!,
              fileName:
                safeCutscene.customAudio!.fileName.slice(0, 96) ||
                'cutscene-sfx.audio',
            },
          }
        : { customAudio: undefined }),
    };
  }

  const safeTitle = project.titleConfig
    ? {
        ...project.titleConfig,
        enabled: Boolean(project.titleConfig.enabled),
        text: (project.titleConfig.text ?? '').slice(0, 48),
        size: Math.max(0.5, Math.min(3.0, Number(project.titleConfig.size) || 1.0)),
        heightOffset: Math.max(
          -1.0,
          Math.min(4.0, Number.isFinite(project.titleConfig.heightOffset) ? project.titleConfig.heightOffset : 0.55),
        ),
        color: (project.titleConfig.color ?? '#ffffff').slice(0, 16),
        glowColor: (project.titleConfig.glowColor ?? '#fbbf24').slice(0, 16),
      }
    : undefined;

  return stripUndefinedDeep({
    ...project,
    id: safeId,
    name: cleanName,
    description: cleanDesc,
    rarity,
    layers,
    textures: collectUsedTextures(layers),
    ...(safeAudio ? { audio: safeAudio } : { audio: undefined }),
    ...(typeof project.levitate === 'boolean' ? { levitate: project.levitate } : {}),
    ...(project.posePreset ? { posePreset: project.posePreset } : {}),
    ...(safeCutscene ? { cutscene: safeCutscene } : { cutscene: undefined }),
    ...(safeTitle ? { titleConfig: safeTitle } : { titleConfig: undefined }),
  });
}

export function subscribeToRollPool(
  onUpdate: (entries: CatalogAuraEntry[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const poolQuery = query(collection(db, COLLECTION_PATH), limit(500));

  return onSnapshot(
    poolQuery,
    (snapshot) => {
      const entries: CatalogAuraEntry[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const candidate = data?.project;
        const val = validateAuraProject(candidate);
        if (!val.ok) return;

        const createdAtTs = data?.createdAt;
        const addedAt =
          createdAtTs && typeof createdAtTs.toDate === 'function'
            ? createdAtTs.toDate().toISOString()
            : new Date().toISOString();

        entries.push({
          project: {
            ...val.project,
            id: docSnap.id,
          },
          enabled: typeof data?.enabled === 'boolean' ? data.enabled : true,
          source: 'global',
          addedAt,
        });
      });

      onUpdate(entries);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, COLLECTION_PATH);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export async function upsertRollPoolAura(
  entry: CatalogAuraEntry,
  uid: string,
): Promise<void> {
  const safeId = sanitizeAuraDocId(entry.project.id);
  const docPath = `${COLLECTION_PATH}/${safeId}`;
  const ref = doc(db, COLLECTION_PATH, safeId);
  const sanitizedProject = buildSanitizedProject(entry.project, safeId);

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, {
        name: sanitizedProject.name,
        description: sanitizedProject.description,
        enabled: Boolean(entry.enabled),
        baseOdds: sanitizedProject.rarity.baseOdds,
        classification: sanitizedProject.rarity.classification,
        project: sanitizedProject,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: safeId,
        name: sanitizedProject.name,
        description: sanitizedProject.description,
        enabled: Boolean(entry.enabled),
        baseOdds: sanitizedProject.rarity.baseOdds,
        classification: sanitizedProject.rarity.classification,
        authorUid: sanitizeAuraDocId(uid),
        project: sanitizedProject,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteRollPoolAura(auraId: string): Promise<void> {
  const safeId = sanitizeAuraDocId(auraId);
  const docPath = `${COLLECTION_PATH}/${safeId}`;
  try {
    await deleteDoc(doc(db, COLLECTION_PATH, safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
