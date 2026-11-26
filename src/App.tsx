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

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), kind, text });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3600);
  }, []);

  // Load published cross-device Roll Pool on mount
  useEffect(() => {
    let active = true;
    fetchGlobalRollPool().then((globalEntries) => {
      if (!active || globalEntries.length === 0) return;
      setCatalog((prev) => {
        const merged = mergeGlobalIntoCatalog(prev, globalEntries);
        saveCatalog(merged);
        return merged;
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSyncGlobalPool = useCallback(async () => {
    const globalEntries = await fetchGlobalRollPool();
    if (globalEntries.length === 0) {
      showToast('No published global auras found on GitHub Pages yet.');
      return;
    }
    setCatalog((prev) => {
      const merged = mergeGlobalIntoCatalog(prev, globalEntries);
      saveCatalog(merged);
      return merged;
    });
    showToast(
      `Synced ${globalEntries.length} published aura${globalEntries.length === 1 ? '' : 's'} from GitHub Pages.`,
    );
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

  // Publish Studio Aura directly into the Baseplate Roll Pool
  const handlePublishToRollPool = () => {
    const prepared: AuraProject = {
      ...JSON.parse(JSON.stringify(project)),
      updatedAt: new Date().toISOString(),
      textures: collectUsedTextures(project.layers),
    };

    setCatalog((prev) => {
      const idx = prev.findIndex((c) => c.project.id === prepared.id);
      const next = [...prev];
      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          project: prepared,
          enabled: true,
          source: 'studio',
        };
      } else {
        next.unshift({
          project: prepared,
          enabled: true,
          source: 'studio',
          addedAt: new Date().toISOString(),
        });
      }
      saveCatalog(next);
      return next;
    });
    showToast(`"${prepared.name}" updated in Roll Pool (${prepared.rarity.classification}).`);
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
      setCatalog((prev) => {
        const next = [...prev];
        for (const proj of projects) {
          const safeProj: AuraProject = {
            ...proj,
            id:
              next.some((c) => c.project.id === proj.id)
                ? `imp_${Math.random().toString(36).slice(2, 9)}`
                : proj.id,
            textures: collectUsedTextures(proj.layers),
          };
          next.unshift({
            project: safeProj,
            enabled: true,
            source: 'imported',
            addedAt: now,
          });
        }
        saveCatalog(next);
        return next;
      });

      const warnText = warnings.length > 0 ? ` (${warnings[0]})` : '';
      showToast(
        `Added ${projects.length} exported aura${projects.length > 1 ? 's' : ''} to Roll Pool & Storage system${warnText}.`,
      );
    },
    [showToast],
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
          return {
            ...entry,
            source: entry.source === 'global' ? 'studio' : entry.source,
            enabled: patch.enabled !== undefined ? patch.enabled : entry.enabled,
            project: nextProject,
          };
        });
        saveCatalog(next);
        return next;
      });
    },
    [],
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
      showToast('Removed aura from Roll Pool.');
    },
    [equippedAuraId, showToast],
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
    const empty = getDefaultCatalog();
    setCatalog(empty);
    saveCatalog(empty);
    setEquippedAuraId(null);
    saveEquippedAuraId(null);
    showToast('Cleared all auras from Roll Pool.');
  }, [showToast]);

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
        onClose={() => setRegistryOpen(false)}
        onImportEntries={handleImportCatalogEntries}
        onUpdateEntry={handleUpdateCatalogEntry}
        onDeleteEntry={handleDeleteCatalogEntry}
        onGrantToStorage={handleGrantToStorage}
        onOpenInStudio={handleOpenInStudio}
        onResetDefaults={handleResetCatalogDefaults}
        onSyncGlobalPool={handleSyncGlobalPool}
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
