import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { sanitizeAuraDocId } from './firestoreRollPool';
import type { StoredAuraEntry } from './gameRegistry';

const ACCOUNTS_COLLECTION = 'accounts';

export interface UserAccountSave {
  uid: string;
  username: string;
  equippedAuraId: string | null;
  totalRolls: number;
  storage: StoredAuraEntry[];
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

export async function saveUserAccountState(
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
}
