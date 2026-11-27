import { Film, Layers } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddLayerModal } from './components/AddLayerModal';
import { AuraRegistryModal } from './components/AuraRegistryModal';
import { AuthModal } from './components/AuthModal';
import { BaseplatePlayView } from './components/BaseplatePlayView';
import { CutsceneEditorWorkspace } from './components/CutsceneEditorWorkspace';
import { InspectorPanel } from './components/InspectorPanel';
import { LayerPanel } from './components/LayerPanel';
import { ProjectLibraryModal } from './components/ProjectLibraryModal';
import { StorageModal } from './components/StorageModal';
import { TopToolbar, type AppMode } from './components/TopToolbar';
import { ViewportCanvas } from './components/ViewportCanvas';
import {
  cloneProjectWithNewId,
  collectUsedTextures,
  createBlankProject,
  createDefaultLayer,
  PRESET_AURAS,
} from './aura/presets';
import { classifyBaseOdds } from './aura/rarity';
import {
  deleteProjectFromLibrary,
  downloadProjectJson,
  exportAuraPackageZip,
  getLastActiveProjectId,
  importAuraFromFile,
  loadSavedProjects,
  saveProjectToLibrary,
  setLastActiveProjectId,
} from './aura/storage';
import {
  POSE_PRESET_META,
  type AnimationMode,
  type AuraAudioConfig,
  type AuraCutsceneConfig,
  type AuraEnvironment,
  type AuraLayer,
  type AuraPosePreset,
  type AuraProject,
  type EffectType,
  type LayerAnimationSettings,
  type LayerEffectSettings,
} from './aura/types';
import {
  getDefaultCatalog,
  loadGameState,
  saveCatalog,
  saveEquippedAuraId,
  saveStorage,
  saveTotalRolls,
  type CatalogAuraEntry,
  type StoredAuraEntry,
} from './game/gameRegistry';
import {
  auth,
  createUserWithEmailAndPassword,
  googleProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from './firebase';
import {
  deleteUserProject,
  saveUserAccountState,
  saveUserProject,
  subscribeToUserAccount,
  subscribeToUserProjects,
} from './game/accountSync';
import {
  checkUserIsAdmin,
  deleteRollPoolAura,
  sanitizeAuraDocId,
  subscribeToRollPool,
  upsertRollPoolAura,
} from './game/firestoreRollPool';
import {
  fetchGlobalRollPool,
  mergeGlobalIntoCatalog,
} from './game/globalPoolSync';

function formatFirebaseAuthError(err: unknown): string | null {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  switch (code) {
    case 'auth/popup-closed-by-user':
      return null;
    case 'auth/operation-not-allowed':
      return 'Email/Password Sign-In is not enabled yet in Firebase Console. Enable it under Authentication > Sign-in method.';
    case 'auth/unauthorized-domain':
      return `Add "${window.location.hostname}" to Firebase Console > Authentication > Settings > Authorized domains to sign in from this URL.`;
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Switch to Log In instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed.';
  }
}

interface ToastMessage {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

function getInitialStudioState(): {
  project: AuraProject;
  saved: AuraProject[];
} {
  const saved = loadSavedProjects();
  const lastId = getLastActiveProjectId();
  if (lastId) {
    const found = saved.find((p) => p.id === lastId);
    if (found) return { project: found, saved };
  }
  if (saved.length > 0) {
    return { project: saved[0], saved };
  }
  return {
    project: cloneProjectWithNewId(PRESET_AURAS[0]),
    saved,
  };
}

export default function App() {
  const initialStudio = useMemo(() => getInitialStudioState(), []);
  const initialGame = useMemo(() => loadGameState(), []);

  // Default to Baseplate Play mode so user immediately sees the playable baseplate & ROLL button,
  // with instant 1-click switch to Aura Studio!
  const [mode, setMode] = useState<AppMode>('play');

  // Studio State
  const [project, setProject] = useState<AuraProject>(initialStudio.project);
  const [savedProjects, setSavedProjects] = useState<AuraProject[]>(initialStudio.saved);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    initialStudio.project.layers[0]?.id ?? null,
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [past, setPast] = useState<AuraProject[]>([]);
  const [future, setFuture] = useState<AuraProject[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [studioTab, setStudioTab] = useState<'3d' | 'cutscene'>('3d');
  const [isExporting, setIsExporting] = useState(false);

  // Playable Game State (Roll Pool, Storage, Equip)
  const [catalog, setCatalog] = useState<CatalogAuraEntry[]>(initialGame.catalog);
  const [storage, setStorage] = useState<StoredAuraEntry[]>(initialGame.storage);
  const [equippedAuraId, setEquippedAuraId] = useState<string | null>(
    initialGame.equippedAuraId,
  );
  const [totalRolls, setTotalRolls] = useState<number>(initialGame.totalRolls);
  const [storageOpen, setStorageOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authRevision, setAuthRevision] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accountUsername, setAccountUsername] = useState('Player');
  const [accountLoaded, setAccountLoaded] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const updateTimersRef = useRef<Map<string, number>>(new Map());
  const catalogRef = useRef<CatalogAuraEntry[]>(catalog);
  catalogRef.current = catalog;

  const storageRef = useRef<StoredAuraEntry[]>(storage);
  storageRef.current = storage;
  const equippedAuraIdRef = useRef<string | null>(equippedAuraId);
  equippedAuraIdRef.current = equippedAuraId;
  const totalRollsRef = useRef<number>(totalRolls);
  totalRollsRef.current = totalRolls;
  const accountUsernameRef = useRef<string>(accountUsername);
  accountUsernameRef.current = accountUsername;
  const savedProjectsRef = useRef<AuraProject[]>(savedProjects);
  savedProjectsRef.current = savedProjects;
  const migratedUidsRef = useRef<Set<string>>(new Set());
  const migratedProjectUidsRef = useRef<Set<string>>(new Set());

  const effectiveMode: AppMode = isAdmin ? mode : 'play';

  const showToast = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), kind, text });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 5200);
  }, []);

  // Lock Aura Studio strictly to Dompinator admin account
  useEffect(() => {
    if (!isAdmin) {
      setMode('play');
      setAddModalOpen(false);
      setLibraryOpen(false);
    }
  }, [isAdmin]);

  // Track Auth & admin status
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthError(null);
      if (user) {
        const defaultName =
          user.displayName?.trim().split(/\s+/)[0]?.slice(0, 24) ||
          user.email?.split('@')[0]?.trim().slice(0, 24) ||
          'Player';
        setAccountUsername(defaultName);
        const admin = await checkUserIsAdmin(user.uid, user.email, user.emailVerified);
        setIsAdmin(admin);
      } else {
        setIsAdmin(false);
        setAccountLoaded(false);
        setAccountUsername('Player');
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to verified user's cloud account save (/accounts/{uid})
  useEffect(() => {
    if (!authUser || !authUser.emailVerified) {
      setAccountLoaded(false);
      return;
    }

    const uid = authUser.uid;
    const unsub = subscribeToUserAccount(
      uid,
      ({ exists, account }) => {
        if (!exists) {
          if (!migratedUidsRef.current.has(uid)) {
            migratedUidsRef.current.add(uid);
            const fallbackName =
              authUser.displayName?.trim().split(/\s+/)[0]?.slice(0, 24) ||
              authUser.email?.split('@')[0]?.trim().slice(0, 24) ||
              'Player';
            void saveUserAccountState(uid, {
              username: fallbackName,
              equippedAuraId: equippedAuraIdRef.current,
              totalRolls: totalRollsRef.current,
              storage: storageRef.current,
            }).catch((err) => {
              const msg = err instanceof Error ? err.message : 'Account save init failed.';
              setCloudError(msg);
            });
            saveStorage([]);
            saveEquippedAuraId(null);
            saveTotalRolls(0);
            setAccountUsername(fallbackName);
            setAccountLoaded(true);
          }
          return;
        }

        if (account) {
          saveStorage([]);
          saveEquippedAuraId(null);
          saveTotalRolls(0);
          setStorage(account.storage);
          setEquippedAuraId(account.equippedAuraId);
          setTotalRolls(account.totalRolls);
          setAccountUsername(account.username);
          setAccountLoaded(true);
        }
      },
      (err) => {
        setCloudError(err.message);
      },
    );

    return () => unsub();
  }, [authUser, authRevision]);

  // Subscribe to verified admin's cloud Studio Projects (/accounts/{uid}/projects)
  useEffect(() => {
    if (!authUser || !authUser.emailVerified || !isAdmin) {
      return;
    }

    const uid = authUser.uid;
    const unsub = subscribeToUserProjects(
      uid,
      (cloudProjects) => {
        const cloudIds = new Set(cloudProjects.map((p) => p.id));

        if (!migratedProjectUidsRef.current.has(uid)) {
          migratedProjectUidsRef.current.add(uid);
          const localOnly = savedProjectsRef.current.filter(
            (p) => !cloudIds.has(sanitizeAuraDocId(p.id)),
          );
          if (localOnly.length > 0) {
            void Promise.all(
              localOnly.map((proj) =>
                saveUserProject(uid, proj, accountUsernameRef.current),
              ),
            ).catch((err) => {
              const msg =
                err instanceof Error
                  ? err.message
                  : 'Failed to sync local Studio projects.';
              setCloudError(msg);
            });
          }
          const merged = [...cloudProjects, ...localOnly];
          setSavedProjects(merged);
          return;
        }

        setSavedProjects(cloudProjects);
      },
      (err) => {
        setCloudError(err.message);
      },
    );

    return () => unsub();
  }, [authUser, authRevision, isAdmin]);

  // Real-time Firestore Roll Pool subscription (automatically updates for ALL users on ALL devices)
  useEffect(() => {
    const unsub = subscribeToRollPool(
      (cloudEntries) => {
        setCloudConnected(true);
        setCloudError(null);
        setCatalog((prev) => {
          const cloudIds = new Set(cloudEntries.map((c) => c.project.id));
          const localDrafts = prev.filter(
            (c) => c.source !== 'global' && !cloudIds.has(c.project.id),
          );
          const merged = [...cloudEntries, ...localDrafts];
          saveCatalog(merged);
          return merged;
        });
      },
      (err) => {
        setCloudError(err.message);
        // Fallback to static roll-pool.json if offline or blocked
        fetchGlobalRollPool().then((fallbackEntries) => {
          if (fallbackEntries.length === 0) return;
          setCatalog((prev) => {
            const merged = mergeGlobalIntoCatalog(prev, fallbackEntries);
            saveCatalog(merged);
            return merged;
          });
        });
      },
    );
    return () => unsub();
  }, []);

  const handleSyncLocalToCloud = useCallback(async () => {
    if (!isAdmin || !authUser) {
      showToast('Sign in with the Dompinator account to sync to cloud.', 'error');
      return;
    }
    const localDrafts = catalogRef.current.filter((c) => c.source !== 'global');
    if (localDrafts.length === 0) return;
    try {
      await Promise.all(
        localDrafts.map((entry) => upsertRollPoolAura(entry, authUser.uid)),
      );
      setCloudError(null);
      setCatalog((prev) => {
        const syncedIds = new Set(localDrafts.map((d) => d.project.id));
        const next = prev.map((c) =>
          syncedIds.has(c.project.id) ? { ...c, source: 'global' as const } : c,
        );
        saveCatalog(next);
        return next;
      });
      showToast(
        `Synced ${localDrafts.length} local aura${localDrafts.length === 1 ? '' : 's'} to live cloud Roll Pool.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cloud sync failed.';
      setCloudError(msg);
      showToast('Failed to sync local auras to Firestore. Check console/rules.', 'error');
    }
  }, [isAdmin, authUser, showToast]);

  // When creator admin signs in, automatically push any local draft auras into Firestore
  useEffect(() => {
    if (!isAdmin || !authUser) return;
    const localDrafts = catalogRef.current.filter((c) => c.source !== 'global');
    if (localDrafts.length === 0) return;
    void handleSyncLocalToCloud();
  }, [isAdmin, authUser, handleSyncLocalToCloud]);

  const handleGoogleSignIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setAuthModalOpen(false);
      showToast('Signed in with Google. Account cloud save active.');
    } catch (err: unknown) {
      const msg = formatFirebaseAuthError(err);
      if (!msg) return;
      setAuthError(msg);
      setCloudError(msg);
      showToast(msg, 'error');
    }
  }, [showToast]);

  const handleEmailLogin = useCallback(
    async (emailInput: string, passwordInput: string) => {
      setAuthError(null);
      try {
        const cred = await signInWithEmailAndPassword(
          auth,
          emailInput,
          passwordInput,
        );
        if (cred.user.emailVerified) {
          setAuthModalOpen(false);
          showToast('Logged in! Loading your saved auras.');
        } else {
          showToast('Logged in — please verify your email to unlock Cloud Save.');
        }
      } catch (err: unknown) {
        const msg = formatFirebaseAuthError(err) ?? 'Log in failed.';
        setAuthError(msg);
        throw new Error(msg);
      }
    },
    [showToast],
  );

  const handleEmailSignUp = useCallback(
    async (usernameInput: string, emailInput: string, passwordInput: string) => {
      setAuthError(null);
      try {
        const cleanName = usernameInput.trim().slice(0, 24) || 'Player';
        const cred = await createUserWithEmailAndPassword(
          auth,
          emailInput,
          passwordInput,
        );
        await updateProfile(cred.user, { displayName: cleanName });
        await sendEmailVerification(cred.user);
        setAccountUsername(cleanName);
        showToast(`Verification email sent to ${emailInput}.`);
      } catch (err: unknown) {
        const msg = formatFirebaseAuthError(err) ?? 'Sign up failed.';
        setAuthError(msg);
        throw new Error(msg);
      }
    },
    [showToast],
  );

  const handleResendVerification = useCallback(async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    try {
      await sendEmailVerification(auth.currentUser);
      showToast(`Verification link resent to ${auth.currentUser.email}.`);
    } catch (err: unknown) {
      const msg = formatFirebaseAuthError(err) ?? 'Failed to resend email.';
      setAuthError(msg);
      showToast(msg, 'error');
    }
  }, [showToast]);

  const handleRefreshVerification = useCallback(async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    try {
      await reload(auth.currentUser);
      const refreshed = auth.currentUser;
      setAuthUser(refreshed);
      setAuthRevision((r) => r + 1);
      if (refreshed?.emailVerified) {
        const admin = await checkUserIsAdmin(
          refreshed.uid,
          refreshed.email,
          refreshed.emailVerified,
        );
        setIsAdmin(admin);
        setAuthModalOpen(false);
        showToast('Email verified! Account cloud save & multiplayer unlocked.');
      } else {
        setAuthError(
          'Email not verified yet — please click the link in your inbox, then try again.',
        );
      }
    } catch (err: unknown) {
      const msg = formatFirebaseAuthError(err) ?? 'Failed to refresh status.';
      setAuthError(msg);
    }
  }, [showToast]);

  const handleUpdateUsername = useCallback(
    async (newName: string) => {
      const clean = newName.trim().slice(0, 24) || 'Player';
      accountUsernameRef.current = clean;
      setAccountUsername(clean);
      if (authUser && authUser.emailVerified) {
        try {
          await updateProfile(authUser, { displayName: clean });
        } catch {
          // Display name update on auth profile is optional
        }
        try {
          await saveUserAccountState(authUser.uid, {
            username: clean,
            equippedAuraId: equippedAuraIdRef.current,
            totalRolls: totalRollsRef.current,
            storage: storageRef.current,
          });
          showToast(`Updated username to "${clean}".`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to save username.';
          setAuthError(msg);
          showToast(msg, 'error');
        }
      }
    },
    [authUser, showToast],
  );

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    migratedUidsRef.current.clear();
    migratedProjectUidsRef.current.clear();
    storageRef.current = [];
    equippedAuraIdRef.current = null;
    totalRollsRef.current = 0;
    setStorage([]);
    setEquippedAuraId(null);
    setTotalRolls(0);
    setAccountUsername('Player');
    setAccountLoaded(false);
    setIsAdmin(false);
    setMode('play');
    saveStorage([]);
    saveEquippedAuraId(null);
    saveTotalRolls(0);
    showToast('Signed out.');
  }, [showToast]);

  // Studio History & Edits
  const commitChange = useCallback((updater: (prev: AuraProject) => AuraProject) => {
    setProject((prev) => {
      const next = updater(prev);
      setPast((h) => [...h.slice(-24), prev]);
      setFuture([]);
      setHasUnsavedChanges(true);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setPast((h) => {
      if (h.length === 0) return h;
      const previous = h[h.length - 1];
      setProject((curr) => {
        setFuture((f) => [curr, ...f.slice(0, 24)]);
        return previous;
      });
      setHasUnsavedChanges(true);
      return h.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setProject((curr) => {
        setPast((h) => [...h.slice(-24), curr]);
        return next;
      });
      setHasUnsavedChanges(true);
      return f.slice(1);
    });
  }, []);

  const handleSaveProject = useCallback(() => {
    const safeId = sanitizeAuraDocId(project.id);
    const prepared: AuraProject = {
      ...project,
      id: safeId,
      updatedAt: new Date().toISOString(),
      textures: collectUsedTextures(project.layers),
    };
    const updatedList = saveProjectToLibrary(prepared);
    setProject(prepared);
    setSavedProjects(updatedList);
    setHasUnsavedChanges(false);

    if (authUser && authUser.emailVerified) {
      void saveUserProject(authUser.uid, prepared, accountUsernameRef.current)
        .then(() => {
          setCloudError(null);
          showToast(`Saved "${prepared.name}" to your account.`);
        })
        .catch((err) => {
          const msg =
            err instanceof Error ? err.message : 'Failed to save project to account.';
          setCloudError(msg);
          showToast('Saved locally; account cloud save failed.', 'error');
        });
    } else {
      showToast(`Saved "${prepared.name}" to studio library.`);
    }
  }, [authUser, project, showToast]);

  useEffect(() => {
    if (mode !== 'studio') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      } else if (key === 's') {
        e.preventDefault();
        handleSaveProject();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, handleUndo, handleRedo, handleSaveProject]);

  const selectedLayer = useMemo(
    () => project.layers.find((l) => l.id === selectedLayerId) ?? null,
    [project.layers, selectedLayerId],
  );

  // Studio Layer Handlers
  const handleAddLayer = (type: EffectType) => {
    const newLayer = createDefaultLayer(type);
    commitChange((prev) => {
      const layers = [newLayer, ...prev.layers];
      return { ...prev, layers, textures: collectUsedTextures(layers) };
    });
    setSelectedLayerId(newLayer.id);
  };

  const handleToggleVisibility = (id: string) => {
    commitChange((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    }));
  };

  const handleDuplicateLayer = (id: string) => {
    const target = project.layers.find((l) => l.id === id);
    if (!target) return;
    const copy: AuraLayer = {
      ...JSON.parse(JSON.stringify(target)),
      id: `lyr_${Math.random().toString(36).slice(2, 9)}`,
      name: `${target.name} Copy`,
    };
    commitChange((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id);
      const layers = [...prev.layers];
      layers.splice(idx + 1, 0, copy);
      return { ...prev, layers, textures: collectUsedTextures(layers) };
    });
    setSelectedLayerId(copy.id);
  };

  const handleDeleteLayer = (id: string) => {
    commitChange((prev) => {
      const layers = prev.layers.filter((l) => l.id !== id);
      return { ...prev, layers, textures: collectUsedTextures(layers) };
    });
    if (selectedLayerId === id) {
      const remaining = project.layers.filter((l) => l.id !== id);
      setSelectedLayerId(remaining[0]?.id ?? null);
    }
  };

  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    commitChange((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.layers.length) return prev;
      const layers = [...prev.layers];
      const [item] = layers.splice(idx, 1);
      layers.splice(targetIdx, 0, item);
      return { ...prev, layers };
    });
  };

  const handleUpdateLayer = (id: string, patch: Partial<AuraLayer>) => {
    commitChange((prev) => {
      const layers = prev.layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
      return { ...prev, layers, textures: collectUsedTextures(layers) };
    });
  };

  const handleUpdateSettings = (id: string, patch: Partial<LayerEffectSettings>) => {
    commitChange((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, settings: { ...l.settings, ...patch } } : l,
      ),
    }));
  };

  const handleUpdateAnimation = (id: string, patch: Partial<LayerAnimationSettings>) => {
    commitChange((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, animation: { ...l.animation, ...patch } } : l,
      ),
    }));
  };

  const handleUpdateProjectMeta = (
    patch: Partial<Pick<AuraProject, 'name' | 'description' | 'author'>>,
  ) => {
    commitChange((prev) => ({ ...prev, ...patch }));
  };

  const handleUpdateBaseOdds = (baseOdds: number) => {
    commitChange((prev) => ({
      ...prev,
      rarity: classifyBaseOdds(baseOdds),
    }));
  };

  const handleUpdateEnvironment = (patch: Partial<AuraEnvironment>) => {
    commitChange((prev) => ({
      ...prev,
      environment: { ...prev.environment, ...patch },
    }));
  };

  const handleUpdateAudio = (audio: AuraAudioConfig | undefined) => {
    commitChange((prev) => {
      const next = { ...prev };
      if (audio) {
        next.audio = audio;
      } else {
        delete next.audio;
      }
      return next;
    });
  };

  const handleSetPosePreset = (posePreset: AuraPosePreset) => {
    commitChange((prev) => ({
      ...prev,
      posePreset,
      levitate: POSE_PRESET_META[posePreset].floats,
    }));
  };

  const handleUpdateCutscene = (cutscene: AuraCutsceneConfig | undefined) => {
    commitChange((prev) => {
      const next = { ...prev };
      if (cutscene) {
        next.cutscene = cutscene;
      } else {
        delete next.cutscene;
      }
      return next;
    });
  };

  const handleSyncAllToMusic = (subMode: AnimationMode) => {
    commitChange((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => ({
        ...l,
        animation: { ...l.animation, syncToMusic: true, mode: subMode },
      })),
    }));
    showToast(`Synced all layers to Music > ${subMode}.`);
  };

  const handleToggleAllMusicSync = (enabled: boolean) => {
    commitChange((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => ({
        ...l,
        animation: { ...l.animation, syncToMusic: enabled },
      })),
    }));
    showToast(
      enabled
        ? 'All layers now follow the aura song.'
        : 'Music sync turned off across layers.',
    );
  };

  // Studio File I/O (delegates to cloud-synced handleSaveProject)

  const handleDownloadJson = () => {
    downloadProjectJson(project);
    showToast(`Downloaded ${project.name}.aura.json`);
  };

  const handleExportPackage = async () => {
    setIsExporting(true);
    try {
      const filename = await exportAuraPackageZip(project);
      showToast(`Exported AETHER package: ${filename}`);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to export aura package.',
        'error',
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const result = await importAuraFromFile(file);
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }

    const imported = cloneProjectWithNewId(result.project);
    setProject(imported);
    setSelectedLayerId(imported.layers[0]?.id ?? null);
    setPast([]);
    setFuture([]);
    setHasUnsavedChanges(true);
    setLastActiveProjectId(imported.id);
    showToast(`Imported "${imported.name}" into Aura Studio.`);
  };

  const handleLoadProject = (target: AuraProject, asClone = false) => {
    const next = asClone ? cloneProjectWithNewId(target) : target;
    setProject(next);
    setSelectedLayerId(next.layers[0]?.id ?? null);
    setPast([]);
    setFuture([]);
    setHasUnsavedChanges(asClone);
    setLastActiveProjectId(next.id);
    showToast(`Loaded "${next.name}".`);
  };

  const handleCreateBlank = () => {
    const blank = createBlankProject('New Custom Aura');
    setProject(blank);
    setSelectedLayerId(blank.layers[0]?.id ?? null);
    setPast([]);
    setFuture([]);
    setHasUnsavedChanges(true);
    showToast('Created new blank aura project.');
  };

  const handleDeleteSaved = (id: string) => {
    const list = deleteProjectFromLibrary(id);
    setSavedProjects(list);
    if (authUser && authUser.emailVerified) {
      void deleteUserProject(authUser.uid, id)
        .then(() => {
          showToast('Removed project from your account.');
        })
        .catch((err) => {
          const msg =
            err instanceof Error ? err.message : 'Failed to delete cloud project.';
          setCloudError(msg);
          showToast('Removed locally; failed to delete from cloud.', 'error');
        });
    } else {
      showToast('Removed project from local library.');
    }
  };

  // Send Studio Aura directly into the Roll Pool (auto-syncs to Firestore when signed in as Dompinator)
  const handlePublishToRollPool = () => {
    if (!isAdmin) return;
    const safeId = sanitizeAuraDocId(project.id);
    const prepared: AuraProject = {
      ...JSON.parse(JSON.stringify(project)),
      id: safeId,
      updatedAt: new Date().toISOString(),
      textures: collectUsedTextures(project.layers),
    };
    const nextEntry: CatalogAuraEntry = {
      project: prepared,
      enabled: true,
      source: isAdmin ? 'global' : 'studio',
      addedAt: new Date().toISOString(),
    };

    setCatalog((prev) => {
      const idx = prev.findIndex((c) => c.project.id === prepared.id);
      const next = [...prev];
      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          project: prepared,
          enabled: true,
          source: isAdmin ? 'global' : 'studio',
        };
      } else {
        next.unshift(nextEntry);
      }
      saveCatalog(next);
      return next;
    });

    if (isAdmin && authUser) {
      upsertRollPoolAura(nextEntry, authUser.uid)
        .then(() => {
          setCloudError(null);
          const audioNote =
            prepared.audio && prepared.audio.dataUrl.length > 920_000
              ? ' (audio exceeded ~650KB cloud limit and was omitted)'
              : '';
          showToast(
            `"${prepared.name}" synced live to all players (${prepared.rarity.classification})${audioNote}.`,
          );
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Cloud sync failed.';
          setCloudError(msg);
          showToast('Saved locally; cloud sync encountered an error.', 'error');
        });
    } else {
      showToast(
        `"${prepared.name}" added to local Roll Pool. Sign in in Roll Pool Manager to sync to all users.`,
      );
    }
  };

  // Game Registry / Storage / Equip Handlers (persisted to Cloud Account when verified-signed-in, else localStorage)
  const persistAccountProgression = useCallback(
    (
      nextStorage: StoredAuraEntry[],
      nextEquipped: string | null,
      nextRolls: number,
    ) => {
      if (authUser && authUser.emailVerified) {
        void saveUserAccountState(authUser.uid, {
          username: accountUsernameRef.current,
          equippedAuraId: nextEquipped,
          totalRolls: nextRolls,
          storage: nextStorage,
        }).catch((err) => {
          const msg =
            err instanceof Error ? err.message : 'Failed to save progression to account.';
          setCloudError(msg);
        });
      } else {
        saveStorage(nextStorage);
        saveEquippedAuraId(nextEquipped);
        saveTotalRolls(nextRolls);
      }
    },
    [authUser],
  );

  const handleRecordRoll = useCallback(
    (rolledProject: AuraProject) => {
      const now = new Date().toISOString();
      const prevStorage = storageRef.current;
      const idx = prevStorage.findIndex((s) => s.auraId === rolledProject.id);
      const nextStorage: StoredAuraEntry[] =
        idx >= 0
          ? prevStorage.map((s, i) =>
              i === idx ? { ...s, count: s.count + 1, lastObtainedAt: now } : s,
            )
          : [
              {
                auraId: rolledProject.id,
                count: 1,
                firstObtainedAt: now,
                lastObtainedAt: now,
              },
              ...prevStorage,
            ];
      const nextRolls = totalRollsRef.current + 1;

      storageRef.current = nextStorage;
      totalRollsRef.current = nextRolls;
      setStorage(nextStorage);
      setTotalRolls(nextRolls);
      persistAccountProgression(nextStorage, equippedAuraIdRef.current, nextRolls);
    },
    [persistAccountProgression],
  );

  const handleEquipAura = useCallback(
    (auraId: string | null) => {
      equippedAuraIdRef.current = auraId;
      setEquippedAuraId(auraId);
      persistAccountProgression(storageRef.current, auraId, totalRollsRef.current);
      if (auraId) {
        const found = catalog.find((c) => c.project.id === auraId);
        if (found) showToast(`Equipped "${found.project.name}".`);
      } else {
        showToast('Unequipped aura.');
      }
    },
    [catalog, persistAccountProgression, showToast],
  );

  const handleDiscardStored = useCallback(
    (auraId: string) => {
      const nextStorage = storageRef.current.filter((s) => s.auraId !== auraId);
      const nextEquipped =
        equippedAuraIdRef.current === auraId ? null : equippedAuraIdRef.current;
      storageRef.current = nextStorage;
      setStorage(nextStorage);
      if (nextEquipped !== equippedAuraIdRef.current) {
        equippedAuraIdRef.current = nextEquipped;
        setEquippedAuraId(nextEquipped);
      }
      persistAccountProgression(nextStorage, nextEquipped, totalRollsRef.current);
      showToast('Removed aura from Storage.');
    },
    [persistAccountProgression, showToast],
  );

  const handleImportCatalogEntries = useCallback(
    (projects: AuraProject[], warnings: string[]) => {
      const now = new Date().toISOString();
      const addedEntries: CatalogAuraEntry[] = [];

      setCatalog((prev) => {
        const next = [...prev];
        for (const proj of projects) {
          const baseId = sanitizeAuraDocId(proj.id);
          const uniqueId = next.some((c) => c.project.id === baseId)
            ? `imp_${Math.random().toString(36).slice(2, 9)}`
            : baseId;
          const safeProj: AuraProject = {
            ...proj,
            id: uniqueId,
            textures: collectUsedTextures(proj.layers),
          };
          const entry: CatalogAuraEntry = {
            project: safeProj,
            enabled: true,
            source: isAdmin ? 'global' : 'imported',
            addedAt: now,
          };
          addedEntries.push(entry);
          next.unshift(entry);
        }
        saveCatalog(next);
        return next;
      });

      if (isAdmin && authUser) {
        Promise.all(
          addedEntries.map((entry) => upsertRollPoolAura(entry, authUser.uid)),
        )
          .then(() => {
            const warnText = warnings.length > 0 ? ` (${warnings[0]})` : '';
            showToast(
              `Added ${projects.length} aura${projects.length > 1 ? 's' : ''} live to Roll Pool for all users${warnText}.`,
            );
          })
          .catch(() => {
            showToast('Imported locally; cloud sync failed.', 'error');
          });
      } else {
        const warnText = warnings.length > 0 ? ` (${warnings[0]})` : '';
        showToast(
          `Added ${projects.length} aura${projects.length > 1 ? 's' : ''} locally${warnText}. Sign in to sync to all users.`,
        );
      }
    },
    [isAdmin, authUser, showToast],
  );

  const handleUpdateCatalogEntry = useCallback(
    (
      auraId: string,
      patch: {
        name?: string;
        description?: string;
        baseOdds?: number;
        enabled?: boolean;
      },
    ) => {
      let updatedEntry: CatalogAuraEntry | null = null;

      setCatalog((prev) => {
        const next = prev.map((entry) => {
          if (entry.project.id !== auraId) return entry;
          const nextProject: AuraProject = {
            ...entry.project,
            name: patch.name !== undefined ? patch.name : entry.project.name,
            description:
              patch.description !== undefined
                ? patch.description
                : entry.project.description,
            rarity:
              patch.baseOdds !== undefined
                ? classifyBaseOdds(patch.baseOdds)
                : entry.project.rarity,
          };
          updatedEntry = {
            ...entry,
            source: isAdmin ? 'global' : entry.source === 'global' ? 'studio' : entry.source,
            enabled: patch.enabled !== undefined ? patch.enabled : entry.enabled,
            project: nextProject,
          };
          return updatedEntry;
        });
        saveCatalog(next);
        return next;
      });

      if (isAdmin && authUser && updatedEntry) {
        const entrySnapshot = updatedEntry;
        const existingTimer = updateTimersRef.current.get(auraId);
        if (existingTimer) window.clearTimeout(existingTimer);
        const timerId = window.setTimeout(() => {
          updateTimersRef.current.delete(auraId);
          void upsertRollPoolAura(entrySnapshot, authUser.uid).catch((err) => {
            const msg = err instanceof Error ? err.message : 'Cloud update failed.';
            setCloudError(msg);
            showToast('Failed to sync edit to cloud Roll Pool.', 'error');
          });
        }, 350);
        updateTimersRef.current.set(auraId, timerId);
      }
    },
    [isAdmin, authUser, showToast],
  );

  const handleDeleteCatalogEntry = useCallback(
    (auraId: string) => {
      setCatalog((prev) => {
        const next = prev.filter((c) => c.project.id !== auraId);
        saveCatalog(next);
        return next;
      });
      const nextStorage = storageRef.current.filter((s) => s.auraId !== auraId);
      const nextEquipped =
        equippedAuraIdRef.current === auraId ? null : equippedAuraIdRef.current;
      storageRef.current = nextStorage;
      equippedAuraIdRef.current = nextEquipped;
      setStorage(nextStorage);
      setEquippedAuraId(nextEquipped);
      persistAccountProgression(nextStorage, nextEquipped, totalRollsRef.current);

      if (isAdmin && authUser) {
        void deleteRollPoolAura(auraId)
          .then(() => {
            showToast('Removed aura from live Roll Pool.');
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : 'Cloud delete failed.';
            setCloudError(msg);
          });
      } else {
        showToast('Removed aura from local Roll Pool.');
      }
    },
    [isAdmin, authUser, persistAccountProgression, showToast],
  );

  const handleGrantToStorage = useCallback(
    (auraId: string) => {
      const target = catalog.find((c) => c.project.id === auraId);
      if (!target) return;
      handleRecordRoll(target.project);
      showToast(`Added "${target.project.name}" to Storage.`);
    },
    [catalog, handleRecordRoll, showToast],
  );

  const handleResetCatalogDefaults = useCallback(() => {
    const currentIds = catalogRef.current.map((c) => c.project.id);
    const empty = getDefaultCatalog();
    setCatalog(empty);
    saveCatalog(empty);
    equippedAuraIdRef.current = null;
    setEquippedAuraId(null);
    persistAccountProgression(storageRef.current, null, totalRollsRef.current);

    if (isAdmin && authUser) {
      void Promise.all(currentIds.map((id) => deleteRollPoolAura(id)))
        .then(() => {
          showToast('Cleared all auras from live Roll Pool.');
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : 'Cloud clear failed.';
          setCloudError(msg);
        });
    } else {
      showToast('Cleared all local auras from Roll Pool.');
    }
  }, [isAdmin, authUser, persistAccountProgression, showToast]);

  const handleOpenInStudio = useCallback(
    (target: AuraProject) => {
      if (!isAdmin) return;
      setProject(JSON.parse(JSON.stringify(target)));
      setSelectedLayerId(target.layers[0]?.id ?? null);
      setPast([]);
      setFuture([]);
      setHasUnsavedChanges(false);
      setMode('studio');
    },
    [isAdmin],
  );

  const handleChangeMode = useCallback(
    (nextMode: AppMode) => {
      if (nextMode === 'studio' && !isAdmin) return;
      setMode(nextMode);
    },
    [isAdmin],
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090b10] text-slate-100 overflow-hidden">
      <TopToolbar
        mode={effectiveMode}
        onChangeMode={handleChangeMode}
        isAdmin={isAdmin}
        authUser={authUser}
        accountUsername={accountUsername}
        onOpenAuth={() => setAuthModalOpen(true)}
        project={project}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        hasUnsavedChanges={hasUnsavedChanges}
        isExporting={isExporting}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenLibrary={() => setLibraryOpen(true)}
        onSaveProject={handleSaveProject}
        onDownloadJson={handleDownloadJson}
        onTriggerImport={() => fileInputRef.current?.click()}
        onExportPackage={handleExportPackage}
        onPublishToRollPool={handlePublishToRollPool}
        onOpenRegistry={() => setRegistryOpen(true)}
        onOpenStorage={() => setStorageOpen(true)}
        rollPoolCount={catalog.length}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.aura.json,.zip"
        onChange={handleFileImport}
        className="hidden"
      />

      <main className="flex-1 min-h-0 flex overflow-hidden relative">
        {effectiveMode === 'play' ? (
          <BaseplatePlayView
            catalog={catalog}
            storage={storage}
            equippedAuraId={equippedAuraId}
            totalRolls={totalRolls}
            isAdmin={isAdmin}
            authUser={authUser}
            accountUsername={accountUsername}
            onOpenAuth={() => setAuthModalOpen(true)}
            onSignOut={handleSignOut}
            onOpenStorage={() => setStorageOpen(true)}
            onOpenRegistry={() => setRegistryOpen(true)}
            onRecordRoll={handleRecordRoll}
            onEquipAura={handleEquipAura}
          />
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Studio Sub-Navigation: 3D Aura Editor vs Cutscene Editor */}
            <div className="h-10 shrink-0 bg-[#0b0e15] border-b border-white/[0.07] px-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStudioTab('3d')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    studioTab === '3d'
                      ? 'bg-[#1a2030] text-white border border-white/[0.12]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>3D Aura Layers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudioTab('cutscene')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    studioTab === 'cutscene'
                      ? 'bg-[#1a2030] text-white border border-white/[0.12]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Film className="w-3.5 h-3.5 text-amber-400" />
                  <span>Cutscene Editor</span>
                  {project.cutscene?.enabled && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
                <span>
                  {studioTab === 'cutscene'
                    ? 'Custom Sol\'s RNG-inspired roll cutscene & synthesized impact audio'
                    : 'Build 3D aura layers, character pose presets, and spatial audio'}
                </span>
              </div>
            </div>

            {studioTab === 'cutscene' ? (
              <CutsceneEditorWorkspace
                project={project}
                zenMode={zenMode}
                onUpdateCutscene={handleUpdateCutscene}
                onNotify={showToast}
              />
            ) : (
              <div className="flex-1 min-h-0 flex overflow-hidden">
                {!zenMode && (
                  <LayerPanel
                    project={project}
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={setSelectedLayerId}
                    onOpenAddModal={() => setAddModalOpen(true)}
                    onToggleVisibility={handleToggleVisibility}
                    onDuplicateLayer={handleDuplicateLayer}
                    onDeleteLayer={handleDeleteLayer}
                    onMoveLayer={handleMoveLayer}
                    onUpdateProjectMeta={handleUpdateProjectMeta}
                    onUpdateBaseOdds={handleUpdateBaseOdds}
                    onUpdateEnvironment={handleUpdateEnvironment}
                    onUpdateAudio={handleUpdateAudio}
                    onSetPosePreset={handleSetPosePreset}
                    onToggleAllMusicSync={handleToggleAllMusicSync}
                    onNotify={showToast}
                  />
                )}

                <ViewportCanvas
                  project={project}
                  zenMode={zenMode}
                  onToggleZenMode={() => setZenMode((z) => !z)}
                  onSetPosePreset={handleSetPosePreset}
                />

                {!zenMode && (
                  <InspectorPanel
                    layer={selectedLayer}
                    hasAudio={Boolean(project.audio)}
                    onUpdateLayer={handleUpdateLayer}
                    onUpdateSettings={handleUpdateSettings}
                    onUpdateAnimation={handleUpdateAnimation}
                    onSyncAllToMusic={handleSyncAllToMusic}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {isAdmin && (
        <>
          <AddLayerModal
            open={addModalOpen}
            onClose={() => setAddModalOpen(false)}
            onSelectType={handleAddLayer}
          />

          <ProjectLibraryModal
            open={libraryOpen}
            activeProjectId={project.id}
            savedProjects={savedProjects}
            cloudSynced={Boolean(authUser && authUser.emailVerified)}
            onClose={() => setLibraryOpen(false)}
            onCreateBlank={handleCreateBlank}
            onLoadProject={handleLoadProject}
            onDeleteSaved={handleDeleteSaved}
          />
        </>
      )}

      <StorageModal
        open={storageOpen}
        catalog={catalog}
        storage={storage}
        equippedAuraId={equippedAuraId}
        onClose={() => setStorageOpen(false)}
        onEquip={handleEquipAura}
        onDiscard={handleDiscardStored}
      />

      <AuraRegistryModal
        open={registryOpen}
        catalog={catalog}
        userEmail={authUser?.email ?? null}
        isAdmin={isAdmin}
        cloudConnected={cloudConnected}
        cloudError={cloudError}
        onSyncLocalToCloud={handleSyncLocalToCloud}
        onOpenAuth={() => setAuthModalOpen(true)}
        onSignOut={handleSignOut}
        onClose={() => setRegistryOpen(false)}
        onImportEntries={handleImportCatalogEntries}
        onUpdateEntry={handleUpdateCatalogEntry}
        onDeleteEntry={handleDeleteCatalogEntry}
        onGrantToStorage={handleGrantToStorage}
        onOpenInStudio={handleOpenInStudio}
        onResetDefaults={handleResetCatalogDefaults}
        onNotify={showToast}
      />

      <AuthModal
        open={authModalOpen}
        authUser={authUser}
        isAdmin={isAdmin}
        accountUsername={accountUsername}
        totalRolls={totalRolls}
        uniqueOwnedCount={storage.length}
        accountLoaded={accountLoaded}
        authError={authError}
        onClose={() => setAuthModalOpen(false)}
        onGoogleSignIn={handleGoogleSignIn}
        onEmailLogin={handleEmailLogin}
        onEmailSignUp={handleEmailSignUp}
        onResendVerification={handleResendVerification}
        onRefreshVerification={handleRefreshVerification}
        onUpdateUsername={handleUpdateUsername}
        onSignOut={handleSignOut}
      />

      {toast && (
        <div
          className={`fixed bottom-16 right-5 z-50 px-4 py-2.5 rounded-lg border text-xs font-medium shadow-xl transition-opacity ${
            toast.kind === 'error'
              ? 'bg-rose-950/95 border-rose-500/40 text-rose-200'
              : 'bg-[#121723]/95 border-white/[0.12] text-slate-100'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
