import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, type User } from '../firebase';
import { sanitizeAuraDocId } from './firestoreRollPool';

export type PlayerPose = 'idle' | 'walk' | 'jump' | 'levitate' | 'levitate_walk';

export interface LocalPlayerTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pose: PlayerPose;
  moveSpeed: number;
  equippedAuraId: string;
}

export interface RemotePlayerState extends LocalPlayerTransform {
  sessionId: string;
  ownerUid: string;
  displayName: string;
  updatedAtMs: number;
}

const PLAYERS_COLLECTION = 'players';
const SESSION_KEY = 'dom_rng_iv_mp_session_v1';
const NICKNAME_KEY = 'dom_rng_iv_mp_nickname_v1';
const VALID_POSES = new Set<PlayerPose>([
  'idle',
  'walk',
  'jump',
  'levitate',
  'levitate_walk',
]);

export const STALE_PLAYER_TIMEOUT_MS = 28_000;
const INITIAL_STALE_AGE_MS = 45_000;

export function getOrCreateSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      return sanitizeAuraDocId(existing);
    }
    const created = `p_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const safe = sanitizeAuraDocId(created);
    window.sessionStorage.setItem(SESSION_KEY, safe);
    return safe;
  } catch {
    return sanitizeAuraDocId(
      `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
    );
  }
}

export function loadSavedNickname(): string {
  try {
    return (window.localStorage.getItem(NICKNAME_KEY) ?? '').trim().slice(0, 24);
  } catch {
    return '';
  }
}

export function saveNickname(name: string): void {
  try {
    const clean = name.trim().slice(0, 24);
    if (clean) {
      window.localStorage.setItem(NICKNAME_KEY, clean);
    } else {
      window.localStorage.removeItem(NICKNAME_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function resolveDisplayName(user: User | null, customNick: string): string {
  const nick = customNick.trim().slice(0, 24);
  if (nick) return nick;
  const fromProfile = user?.displayName?.trim().split(/\s+/)[0]?.slice(0, 24);
  if (fromProfile) return fromProfile;
  const fromEmailPrefix = user?.email?.split('@')[0]?.trim().slice(0, 24);
  if (fromEmailPrefix) return fromEmailPrefix;
  return 'Player';
}

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function normalizeYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) return 0;
  let y = yaw % (Math.PI * 2);
  if (y > Math.PI) y -= Math.PI * 2;
  if (y < -Math.PI) y += Math.PI * 2;
  return clampFinite(y, -10, 10, 0);
}

export function sanitizeTransformForWrite(
  sessionId: string,
  ownerUid: string,
  displayName: string,
  transform: LocalPlayerTransform,
) {
  const safeSessionId = sanitizeAuraDocId(sessionId);
  const safeOwnerUid = sanitizeAuraDocId(ownerUid);
  const safeName = displayName.trim().slice(0, 24) || 'Player';
  const safePose: PlayerPose = VALID_POSES.has(transform.pose)
    ? transform.pose
    : 'idle';
  const safeAuraId =
    typeof transform.equippedAuraId === 'string' && transform.equippedAuraId.trim()
      ? sanitizeAuraDocId(transform.equippedAuraId.trim())
      : '';

  return {
    sessionId: safeSessionId,
    ownerUid: safeOwnerUid,
    displayName: safeName,
    x: Number(clampFinite(transform.x, -80, 80, 0).toFixed(3)),
    y: Number(clampFinite(transform.y, -5, 60, 0).toFixed(3)),
    z: Number(clampFinite(transform.z, -80, 80, 0).toFixed(3)),
    yaw: Number(normalizeYaw(transform.yaw).toFixed(4)),
    pose: safePose,
    moveSpeed: Number(clampFinite(transform.moveSpeed, 0, 3, 1).toFixed(3)),
    equippedAuraId: safeAuraId,
  };
}

export async function publishPlayerState(
  sessionId: string,
  ownerUid: string,
  displayName: string,
  transform: LocalPlayerTransform,
): Promise<void> {
  const payload = sanitizeTransformForWrite(
    sessionId,
    ownerUid,
    displayName,
    transform,
  );
  const docPath = `${PLAYERS_COLLECTION}/${payload.sessionId}`;
  try {
    await setDoc(doc(db, PLAYERS_COLLECTION, payload.sessionId), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function removePlayerPresence(sessionId: string): Promise<void> {
  const safeId = sanitizeAuraDocId(sessionId);
  const docPath = `${PLAYERS_COLLECTION}/${safeId}`;
  try {
    await deleteDoc(doc(db, PLAYERS_COLLECTION, safeId));
  } catch (error) {
    // Only surface unexpected failures; deleting an already-removed session doc is harmless
    if (error instanceof Error && /permission/i.test(error.message)) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  }
}

export interface ServerPlayersSubscription {
  unsubscribe: Unsubscribe;
  getFreshRemotePlayers: () => RemotePlayerState[];
}

export function subscribeToServerPlayers(
  localSessionId: string,
  onUpdate: (remotePlayers: RemotePlayerState[]) => void,
  onError?: (err: Error) => void,
): ServerPlayersSubscription {
  const safeLocalId = sanitizeAuraDocId(localSessionId);
  const colRef = collection(db, PLAYERS_COLLECTION);

  const latestBySession = new Map<
    string,
    { state: RemotePlayerState; serverMs: number; localSeenMs: number }
  >();

  const getFreshRemotePlayers = (): RemotePlayerState[] => {
    const now = Date.now();
    const active: RemotePlayerState[] = [];
    for (const [id, entry] of latestBySession.entries()) {
      if (now - entry.localSeenMs <= STALE_PLAYER_TIMEOUT_MS) {
        active.push(entry.state);
      } else {
        latestBySession.delete(id);
      }
    }
    active.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return active;
  };

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const now = Date.now();
      const presentIds = new Set<string>();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data || typeof data.sessionId !== 'string') return;
        if (docSnap.id === safeLocalId || data.sessionId === safeLocalId) return;

        const ts = data.updatedAt;
        const serverMs =
          ts && typeof ts.toMillis === 'function' ? ts.toMillis() : now;

        const prev = latestBySession.get(docSnap.id);
        // On first sight of a doc, skip abandoned ghost sessions older than 45s
        if (!prev && now - serverMs > INITIAL_STALE_AGE_MS) {
          return;
        }

        const pose: PlayerPose = VALID_POSES.has(data.pose) ? data.pose : 'idle';
        const state: RemotePlayerState = {
          sessionId: docSnap.id,
          ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
          displayName:
            typeof data.displayName === 'string' && data.displayName.trim()
              ? data.displayName.trim().slice(0, 24)
              : 'Player',
          x: clampFinite(data.x, -80, 80, 0),
          y: clampFinite(data.y, -5, 60, 0),
          z: clampFinite(data.z, -80, 80, 0),
          yaw: clampFinite(data.yaw, -10, 10, 0),
          pose,
          moveSpeed: clampFinite(data.moveSpeed, 0, 3, 1),
          equippedAuraId:
            typeof data.equippedAuraId === 'string' ? data.equippedAuraId : '',
          updatedAtMs: serverMs,
        };

        presentIds.add(docSnap.id);
        const serverAdvanced = !prev || serverMs !== prev.serverMs;
        latestBySession.set(docSnap.id, {
          state,
          serverMs,
          localSeenMs: serverAdvanced ? now : prev.localSeenMs,
        });
      });

      for (const existingId of latestBySession.keys()) {
        if (!presentIds.has(existingId)) {
          latestBySession.delete(existingId);
        }
      }

      onUpdate(getFreshRemotePlayers());
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, PLAYERS_COLLECTION);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );

  return {
    unsubscribe,
    getFreshRemotePlayers,
  };
}
