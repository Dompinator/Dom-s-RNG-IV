import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddLayerModal } from './components/AddLayerModal';
import { AuraRegistryModal } from './components/AuraRegistryModal';
import { BaseplatePlayView } from './components/BaseplatePlayView';
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
import type {
  AuraEnvironment,
  AuraLayer,
  AuraProject,
  EffectType,
  LayerAnimationSettings,
  LayerEffectSettings,
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
  googleProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from './firebase';
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const updateTimersRef = useRef<Map<string, number>>(new Map());
  const catalogRef = useRef<CatalogAuraEntry[]>(catalog);
  catalogRef.current = catalog;

  const showToast = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), kind, text });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 4200);
  }, []);

  // Track Google Auth & admin status
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const admin = await checkUserIsAdmin(user.uid, user.email, user.emailVerified);
        setIsAdmin(admin);
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore Roll Pool subscription (automatically updates for ALL users on ALL devices)
  useEffect(() => {
    const unsub = subscribeToRollPool(
      (cloudEntries) => {
        setCloudConnected(true);
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
      () => {
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

  // When creator admin signs in, automatically push any local draft auras into Firestore
  useEffect(() => {
    if (!isAdmin || !authUser) return;
    const localDrafts = catalogRef.current.filter((c) => c.source !== 'global');
    if (localDrafts.length === 0) return;
    Promise.all(
      localDrafts.map((entry) => upsertRollPoolAura(entry, authUser.uid)),
    )
      .then(() => {
        showToast(
          `Synced ${localDrafts.length} local aura${localDrafts.length === 1 ? '' : 's'} to live cloud Roll Pool.`,
        );
      })
      .catch(() => {
        // Handled by Firestore error logger
      });
  }, [isAdmin, authUser, showToast]);

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in with Google.');
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'auth/popup-closed-by-user') return;
      if (code === 'auth/unauthorized-domain') {
        showToast(
          `Add "${window.location.hostname}" to Firebase Console > Authentication > Authorized domains to sign in from this URL.`,
          'error',
        );
        return;
      }
      showToast(
        err instanceof Error ? err.message : 'Google sign-in failed.',
        'error',
      );
    }
  }, [showToast]);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
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
        const updatedList = saveProjectToLibrary(project);
        setSavedProjects(updatedList);
        setHasUnsavedChanges(false);
        showToast(`Saved "${project.name}" to studio library.`);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, handleUndo, handleRedo, project, showToast]);

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

  // Studio File I/O
  const handleSaveProject = () => {
    const updatedList = saveProjectToLibrary(project);
    setSavedProjects(updatedList);
    setHasUnsavedChanges(false);
    showToast(`Saved "${project.name}" to studio library.`);
  };

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
    showToast('Removed project from local library.');
  };

  // Send Studio Aura directly into the Roll Pool (auto-syncs to Firestore when signed in as creator)
  const handlePublishToRollPool = () => {
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
          showToast(
            `"${prepared.name}" synced live to all users (${prepared.rarity.classification}).`,
          );
        })
        .catch(() => {
          showToast('Saved locally; cloud sync encountered an error.', 'error');
        });
    } else {
      showToast(
        `"${prepared.name}" added to local Roll Pool. Sign in in Roll Pool Manager to sync to all users.`,
      );
    }
  };

  // Game Registry / Storage / Equip Handlers
  const handleRecordRoll = useCallback((rolledProject: AuraProject) => {
    const now = new Date().toISOString();
    setStorage((prev) => {
      const idx = prev.findIndex((s) => s.auraId === rolledProject.id);
      let next: StoredAuraEntry[];
      if (idx >= 0) {
        next = prev.map((s, i) =>
          i === idx ? { ...s, count: s.count + 1, lastObtainedAt: now } : s,
        );
      } else {
        next = [
          {
            auraId: rolledProject.id,
            count: 1,
            firstObtainedAt: now,
            lastObtainedAt: now,
          },
          ...prev,
        ];
      }
      saveStorage(next);
      return next;
    });

    setTotalRolls((r) => {
      const next = r + 1;
      saveTotalRolls(next);
      return next;
    });
  }, []);

  const handleEquipAura = useCallback(
    (auraId: string | null) => {
      setEquippedAuraId(auraId);
      saveEquippedAuraId(auraId);
      if (auraId) {
        const found = catalog.find((c) => c.project.id === auraId);
        if (found) showToast(`Equipped "${found.project.name}".`);
      } else {
        showToast('Unequipped aura.');
      }
    },
    [catalog, showToast],
  );

  const handleDiscardStored = useCallback(
    (auraId: string) => {
      setStorage((prev) => {
        const next = prev.filter((s) => s.auraId !== auraId);
        saveStorage(next);
        return next;
      });
      if (equippedAuraId === auraId) {
        setEquippedAuraId(null);
        saveEquippedAuraId(null);
      }
      showToast('Removed aura from Storage.');
    },
    [equippedAuraId, showToast],
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
          void upsertRollPoolAura(entrySnapshot, authUser.uid);
        }, 350);
        updateTimersRef.current.set(auraId, timerId);
      }
    },
    [isAdmin, authUser],
  );

  const handleDeleteCatalogEntry = useCallback(
    (auraId: string) => {
      setCatalog((prev) => {
        const next = prev.filter((c) => c.project.id !== auraId);
        saveCatalog(next);
        return next;
      });
      setStorage((prev) => {
        const next = prev.filter((s) => s.auraId !== auraId);
        saveStorage(next);
        return next;
      });
      if (equippedAuraId === auraId) {
        setEquippedAuraId(null);
        saveEquippedAuraId(null);
      }

      if (isAdmin && authUser) {
        void deleteRollPoolAura(auraId).then(() => {
          showToast('Removed aura from live Roll Pool.');
        });
      } else {
        showToast('Removed aura from local Roll Pool.');
      }
    },
    [equippedAuraId, isAdmin, authUser, showToast],
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
    setEquippedAuraId(null);
    saveEquippedAuraId(null);

    if (isAdmin && authUser) {
      void Promise.all(currentIds.map((id) => deleteRollPoolAura(id))).then(() => {
        showToast('Cleared all auras from live Roll Pool.');
      });
    } else {
      showToast('Cleared all local auras from Roll Pool.');
    }
  }, [isAdmin, authUser, showToast]);

  const handleOpenInStudio = useCallback((target: AuraProject) => {
    setProject(JSON.parse(JSON.stringify(target)));
    setSelectedLayerId(target.layers[0]?.id ?? null);
    setPast([]);
    setFuture([]);
    setHasUnsavedChanges(false);
    setMode('studio');
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090b10] text-slate-100 overflow-hidden">
      <TopToolbar
        mode={mode}
        onChangeMode={setMode}
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
        {mode === 'play' ? (
          <BaseplatePlayView
            catalog={catalog}
            storage={storage}
            equippedAuraId={equippedAuraId}
            totalRolls={totalRolls}
            onOpenStorage={() => setStorageOpen(true)}
            onOpenRegistry={() => setRegistryOpen(true)}
            onRecordRoll={handleRecordRoll}
            onEquipAura={handleEquipAura}
          />
        ) : (
          <>
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
              />
            )}

            <ViewportCanvas
              project={project}
              zenMode={zenMode}
              onToggleZenMode={() => setZenMode((z) => !z)}
            />

            {!zenMode && (
              <InspectorPanel
                layer={selectedLayer}
                onUpdateLayer={handleUpdateLayer}
                onUpdateSettings={handleUpdateSettings}
                onUpdateAnimation={handleUpdateAnimation}
              />
            )}
          </>
        )}
      </main>

      <AddLayerModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSelectType={handleAddLayer}
      />

      <ProjectLibraryModal
        open={libraryOpen}
        activeProjectId={project.id}
        savedProjects={savedProjects}
        onClose={() => setLibraryOpen(false)}
        onCreateBlank={handleCreateBlank}
        onLoadProject={handleLoadProject}
        onDeleteSaved={handleDeleteSaved}
      />

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
        onSignIn={handleSignIn}
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
