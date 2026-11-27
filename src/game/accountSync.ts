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
import type { AuraProject } from '../aura/types';
import { validateAuraProject } from '../aura/validator';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { buildSanitizedProject, sanitizeAuraDocId } from './firestoreRollPool';
import type { StoredAuraEntry } from './gameRegistry';

const ACCOUNTS_COLLECTION = 'accounts';
const PROJECTS_SUBCOLLECTION = 'projects';

export interface UserAccountSave {
  uid: string;
  username: string;
  equippedAuraId: string | null;
  totalRolls: number;
  storage: StoredAuraEntry[];
}

// Per-uid write queue so rapid rolls / equip changes never overwrite each other out of order
const accountWriteQueues = new Map<string, Promise<void>>();

function enqueueAccountWrite(uid: string, task: () => Promise<void>): Promise<void> {
  const prev = accountWriteQueues.get(uid) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  accountWriteQueues.set(uid, next);
  return next;
}

function sanitizeStorageList(raw: unknown): StoredAuraEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredAuraEntry[] = [];
  const nowIso = new Date().toISOString();

  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const rawId = typeof rec.auraId === 'string' ? rec.auraId.trim() : '';
    if (!rawId) continue;
    const safeId = sanitizeAuraDocId(rawId);
    const count =
      typeof rec.count === 'number' && Number.isFinite(rec.count)
        ? Math.min(100_000_000, Math.max(1, Math.round(rec.count)))
        : 1;
    const firstObtainedAt =
      typeof rec.firstObtainedAt === 'string'
        ? rec.firstObtainedAt.slice(0, 64)
        : nowIso;
    const lastObtainedAt =
      typeof rec.lastObtainedAt === 'string'
        ? rec.lastObtainedAt.slice(0, 64)
        : nowIso;

    out.push({
      auraId: safeId,
      count,
      firstObtainedAt,
      lastObtainedAt,
    });
  }

  return out;
}

export function subscribeToUserAccount(
  uid: string,
  onUpdate: (result: { exists: boolean; account: UserAccountSave | null }) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const safeUid = sanitizeAuraDocId(uid);
  const docPath = `${ACCOUNTS_COLLECTION}/${safeUid}`;
  const ref = doc(db, ACCOUNTS_COLLECTION, safeUid);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate({ exists: false, account: null });
        return;
      }
      const data = snap.data();
      const username =
        typeof data?.username === 'string' && data.username.trim()
          ? data.username.trim().slice(0, 24)
          : 'Player';
      const equippedAuraId =
        typeof data?.equippedAuraId === 'string' && data.equippedAuraId.trim()
          ? sanitizeAuraDocId(data.equippedAuraId.trim())
          : null;
      const totalRolls =
        typeof data?.totalRolls === 'number' && Number.isFinite(data.totalRolls)
          ? Math.max(0, Math.min(1_000_000_000, Math.round(data.totalRolls)))
          : 0;
      const storage = sanitizeStorageList(data?.storage);

      onUpdate({
        exists: true,
        account: {
          uid: safeUid,
          username,
          equippedAuraId,
          totalRolls,
          storage,
        },
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, docPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export function saveUserAccountState(
  uid: string,
  state: {
    username: string;
    equippedAuraId: string | null;
    totalRolls: number;
    storage: StoredAuraEntry[];
  },
): Promise<void> {
  const safeUid = sanitizeAuraDocId(uid);
  const docPath = `${ACCOUNTS_COLLECTION}/${safeUid}`;

  return enqueueAccountWrite(safeUid, async () => {
    const ref = doc(db, ACCOUNTS_COLLECTION, safeUid);
    const safeUsername = state.username.trim().slice(0, 24) || 'Player';
    const safeEquipped =
      state.equippedAuraId && state.equippedAuraId.trim()
        ? sanitizeAuraDocId(state.equippedAuraId.trim())
        : '';
    const safeRolls = Math.max(
      0,
      Math.min(1_000_000_000, Math.round(state.totalRolls || 0)),
    );
    const safeStorage = sanitizeStorageList(state.storage);

    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          username: safeUsername,
          equippedAuraId: safeEquipped,
          totalRolls: safeRolls,
          storage: safeStorage,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          uid: safeUid,
          username: safeUsername,
          equippedAuraId: safeEquipped,
          totalRolls: safeRolls,
          storage: safeStorage,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  });
}

export function subscribeToUserProjects(
  uid: string,
  onUpdate: (projects: AuraProject[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const safeUid = sanitizeAuraDocId(uid);
  const colPath = `${ACCOUNTS_COLLECTION}/${safeUid}/${PROJECTS_SUBCOLLECTION}`;
  const projectsQuery = query(
    collection(db, ACCOUNTS_COLLECTION, safeUid, PROJECTS_SUBCOLLECTION),
    limit(200),
  );

  return onSnapshot(
    projectsQuery,
    (snapshot) => {
      const items: { project: AuraProject; updatedMs: number }[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const val = validateAuraProject(data?.project);
        if (!val.ok) return;
        const ts = data?.updatedAt;
        const updatedMs =
          ts && typeof ts.toMillis === 'function'
            ? ts.toMillis()
            : Date.parse(val.project.updatedAt) || 0;
        items.push({
          project: {
            ...val.project,
            id: docSnap.id,
          },
          updatedMs,
        });
      });

      items.sort((a, b) => b.updatedMs - a.updatedMs);
      onUpdate(items.map((i) => i.project));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, colPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export async function saveUserProject(
  uid: string,
  project: AuraProject,
  fallbackUsername = 'Player',
): Promise<AuraProject> {
  const safeUid = sanitizeAuraDocId(uid);
  const safeProjectId = sanitizeAuraDocId(project.id);
  const docPath = `${ACCOUNTS_COLLECTION}/${safeUid}/${PROJECTS_SUBCOLLECTION}/${safeProjectId}`;
  const sanitized = buildSanitizedProject(project, safeProjectId);

  try {
    // Ensure parent /accounts/{uid} exists so Master Gate exists() rule always passes
    const accountRef = doc(db, ACCOUNTS_COLLECTION, safeUid);
    const accountSnap = await getDoc(accountRef);
    if (!accountSnap.exists()) {
      await setDoc(accountRef, {
        uid: safeUid,
        username: fallbackUsername.trim().slice(0, 24) || 'Player',
        equippedAuraId: '',
        totalRolls: 0,
        storage: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const projRef = doc(
      db,
      ACCOUNTS_COLLECTION,
      safeUid,
      PROJECTS_SUBCOLLECTION,
      safeProjectId,
    );
    const existingSnap = await getDoc(projRef);
    if (existingSnap.exists()) {
      await updateDoc(projRef, {
        name: sanitized.name,
        description: sanitized.description,
        classification: sanitized.rarity.classification,
        baseOdds: sanitized.rarity.baseOdds,
        project: sanitized,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(projRef, {
        id: safeProjectId,
        ownerUid: safeUid,
        name: sanitized.name,
        description: sanitized.description,
        classification: sanitized.rarity.classification,
        baseOdds: sanitized.rarity.baseOdds,
        project: sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return sanitized;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteUserProject(
  uid: string,
  projectId: string,
): Promise<void> {
  const safeUid = sanitizeAuraDocId(uid);
  const safeProjectId = sanitizeAuraDocId(projectId);
  const docPath = `${ACCOUNTS_COLLECTION}/${safeUid}/${PROJECTS_SUBCOLLECTION}/${safeProjectId}`;
  try {
    await deleteDoc(
      doc(db, ACCOUNTS_COLLECTION, safeUid, PROJECTS_SUBCOLLECTION, safeProjectId),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
