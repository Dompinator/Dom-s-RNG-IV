import {
  ArchiveRestore,
  Brush,
  Cloud,
  Download,
  LogIn,
  LogOut,
  Music,
  PlusCircle,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useRef } from 'react';
import { isLikelyLegacyTruncatedAudio } from '../aura/audioEncoder';
import { classifyBaseOdds, formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import { importAuraFromFile } from '../aura/storage';
import type { AuraProject } from '../aura/types';
import { validateAuraProject } from '../aura/validator';
import type { CatalogAuraEntry } from '../game/gameRegistry';
import { downloadGlobalRollPoolJson } from '../game/globalPoolSync';

interface AuraRegistryModalProps {
  open: boolean;
  catalog: CatalogAuraEntry[];
  userEmail: string | null;
  isAdmin: boolean;
  cloudConnected: boolean;
  cloudError: string | null;
  onSyncLocalToCloud: () => Promise<void>;
  onOpenAuth: () => void;
  onSignOut: () => Promise<void>;
  onClose: () => void;
  onImportEntries: (projects: AuraProject[], warnings: string[]) => void;
  onUpdateEntry: (
    auraId: string,
    patch: {
      name?: string;
      description?: string;
      baseOdds?: number;
      enabled?: boolean;
    },
  ) => void;
  onDeleteEntry: (auraId: string) => void;
  onGrantToStorage: (auraId: string) => void;
  onOpenInStudio: (project: AuraProject) => void;
  onResetDefaults: () => void;
  onNotify: (text: string, kind?: 'info' | 'error') => void;
}

const QUICK_ODDS = [
  { label: '1 in 10', value: 10 },
  { label: '1 in 1K', value: 1_000 },
  { label: '1 in 100K', value: 100_000 },
  { label: '1M Epic', value: 1_000_000 },
  { label: '10M Leg.', value: 10_000_000 },
  { label: '100M Myth.', value: 100_000_000 },
];

export function AuraRegistryModal({
  open,
  catalog,
  userEmail,
  isAdmin,
  cloudConnected,
  cloudError,
  onSyncLocalToCloud,
  onOpenAuth,
  onSignOut,
  onClose,
  onImportEntries,
  onUpdateEntry,
  onDeleteEntry,
  onGrantToStorage,
  onOpenInStudio,
  onResetDefaults,
  onNotify,
}: AuraRegistryModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const cloudCount = catalog.filter((c) => c.source === 'global').length;
  const localCount = catalog.length - cloudCount;

  const handleFilesSelected = async (files: FileList | null) => {
    if (!isAdmin || !files || files.length === 0) return;
    const imported: AuraProject[] = [];
    const warnings: string[] = [];

    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith('.json')) {
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            let countAdded = 0;
            for (const item of parsed) {
              const candidate =
                item && typeof item === 'object' && 'project' in item
                  ? (item as Record<string, unknown>).project
                  : item;
              const val = validateAuraProject(candidate);
              if (val.ok) {
                imported.push(val.project);
                countAdded++;
              }
            }
            if (countAdded === 0) {
              onNotify(`${file.name}: No valid auras found in array.`, 'error');
            }
            continue;
          }
        } catch {
          // Fall through to standard importer
        }
      }

      const res = await importAuraFromFile(file);
      if (res.ok) {
        imported.push(res.project);
        if (res.warnings.length > 0) warnings.push(...res.warnings);
      } else {
        onNotify(`${file.name}: ${res.error}`, 'error');
      }
    }

    if (imported.length > 0) {
      onImportEntries(imported, warnings);
    }
  };

  const sortedCatalog = [...catalog].sort(
    (a, b) => a.project.rarity.baseOdds - b.project.rarity.baseOdds,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl bg-[#10141e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.08]">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              {isAdmin ? 'Roll Pool Manager' : 'Roll Pool Index'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAdmin
                ? 'View, open in Aura Studio, and edit all rollable auras. Changes sync live to all players across devices.'
                : 'Browse every aura in the Roll Pool and see their drop odds.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && catalog.length > 0 && (
              <button
                type="button"
                onClick={() => downloadGlobalRollPoolJson(catalog)}
                title="Download backup roll-pool.json"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/[0.07] transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Backup JSON</span>
              </button>
            )}

            {isAdmin && catalog.length > 0 && (
              <button
                type="button"
                onClick={onResetDefaults}
                title="Clear Roll Pool"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/[0.07] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Pool</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Auras</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Cloud Sync / Account Status Bar */}
        <div className="mx-5 mt-4 px-4 py-2.5 rounded-lg bg-[#141a28] border border-white/[0.08] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <Cloud
                className={`w-4 h-4 shrink-0 ${
                  isAdmin
                    ? 'text-emerald-400'
                    : cloudConnected
                      ? 'text-sky-400'
                      : 'text-slate-400'
                }`}
              />
              {isAdmin ? (
                <span className="text-slate-200">
                  Creator Cloud Sync active ({userEmail}) ·{' '}
                  <strong className="text-emerald-300">{cloudCount} shared</strong>
                  {localCount > 0 && (
                    <span className="text-amber-300"> · {localCount} local pending</span>
                  )}
                </span>
              ) : userEmail ? (
                <span className="text-slate-300">
                  Signed in as {userEmail} · {cloudCount} shared rollable auras.
                </span>
              ) : (
                <span className="text-slate-300">
                  {cloudConnected
                    ? `Live Cloud Roll Pool (${cloudCount} auras).`
                    : 'Connecting to shared Cloud Roll Pool...'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && localCount > 0 && (
                <button
                  type="button"
                  onClick={() => void onSyncLocalToCloud()}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Sync {localCount} to Cloud</span>
                </button>
              )}

              {userEmail ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Log In / Sign Up</span>
                </button>
              )}
            </div>
          </div>

          {cloudError && (
            <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2.5 py-1.5 break-words">
              Cloud status: {cloudError}
            </div>
          )}
        </div>

        {isAdmin && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".json,.aura.json,.zip"
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />

            {/* Admin-only Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesSelected(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="mx-5 mt-3 p-3.5 border border-dashed border-white/[0.16] hover:border-amber-500/60 bg-[#141925] rounded-lg text-center cursor-pointer transition-colors"
            >
              <div className="text-xs font-medium text-slate-200">
                Drop exported <span className="font-mono-num text-amber-400">.aura.json</span>,{' '}
                <span className="font-mono-num text-amber-400">.zip</span> packages, or{' '}
                <span className="font-mono-num text-amber-400">roll-pool.json</span> here, or click to browse
              </div>
            </div>
          </>
        )}

        {/* Registry List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {sortedCatalog.length === 0 ? (
            <div className="border border-dashed border-white/[0.1] rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-slate-200">
                Roll Pool is currently empty
              </p>
              <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
                {isAdmin
                  ? 'Import exported .aura.json or .zip aura packages above, or create an aura in Aura Studio and click Send to Roll Pool.'
                  : 'Waiting for Dompinator to publish auras into the Roll Pool.'}
              </p>
            </div>
          ) : (
            sortedCatalog.map((entry) => {
              const p = entry.project;
              const liveRarity = classifyBaseOdds(p.rarity.baseOdds);
              const style = RARITY_COLOR_STYLES[liveRarity.classification];
              const c1 = p.layers[0]?.color ?? '#f59e0b';
              const c2 = p.layers[0]?.secondaryColor ?? '#38bdf8';

              if (!isAdmin) {
                return (
                  <div
                    key={p.id}
                    className="p-4 rounded-lg bg-[#141924] border border-white/[0.07] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/20"
                          style={{
                            background: `linear-gradient(135deg, ${c1}, ${c2})`,
                          }}
                        />
                        <span className="text-sm font-semibold text-white truncate">
                          {p.name}
                        </span>
                        {!entry.enabled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">
                            Vaulted
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${style.text}`}>
                          {liveRarity.classification}
                        </span>
                        <span className="text-slate-600 text-xs" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs font-mono-num text-slate-200">
                          {formatOdds(p.rarity.baseOdds)}
                        </span>
                      </div>
                    </div>

                    {p.description && (
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {p.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span>{p.layers.length} layers</span>
                      {p.audio && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-sky-400 flex items-center gap-1">
                            <Music className="w-3 h-3" />
                            Theme Audio
                          </span>
                        </>
                      )}
                      {p.levitate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-300">Levitate</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={p.id}
                  className="p-4 rounded-lg bg-[#141924] border border-white/[0.07] space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
                      <span
                        className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/20"
                        style={{
                          background: `linear-gradient(135deg, ${c1}, ${c2})`,
                        }}
                      />
                      <input
                        type="text"
                        value={p.name}
                        maxLength={64}
                        onChange={(e) =>
                          onUpdateEntry(p.id, { name: e.target.value })
                        }
                        className="bg-[#0e121b] border border-white/[0.08] focus:border-amber-500/70 rounded px-2.5 py-1 text-sm font-semibold text-white outline-none flex-1 min-w-[150px]"
                      />
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${style.text}`}>
                          {liveRarity.classification}
                        </span>
                        <span className="text-slate-600 text-xs" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-xs font-mono-num text-slate-300">
                          {formatOdds(p.rarity.baseOdds)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer bg-[#0e121b] border border-white/[0.07] rounded px-2.5 py-1">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={(e) =>
                            onUpdateEntry(p.id, { enabled: e.target.checked })
                          }
                          className="accent-amber-500"
                        />
                        <span>Rollable</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => onGrantToStorage(p.id)}
                        title="Add directly to Storage for quick Equip testing"
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 transition-colors cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Add to Storage</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenInStudio(p);
                          onClose();
                        }}
                        title="Open and edit this aura in Aura Studio"
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                      >
                        <Brush className="w-3.5 h-3.5" />
                        <span>Open in Studio</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteEntry(p.id)}
                        title="Remove from Roll Pool"
                        className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-5">
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={p.description}
                        maxLength={240}
                        onChange={(e) =>
                          onUpdateEntry(p.id, { description: e.target.value })
                        }
                        className="w-full bg-[#0e121b] border border-white/[0.08] focus:border-amber-500/70 rounded px-2.5 py-1 text-xs text-slate-200 outline-none"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Base Odds (1 in N) · {formatOdds(p.rarity.baseOdds)}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1000000000000}
                        value={p.rarity.baseOdds}
                        onChange={(e) =>
                          onUpdateEntry(p.id, {
                            baseOdds: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-full bg-[#0e121b] border border-white/[0.08] focus:border-amber-500/70 rounded px-2.5 py-1 text-xs font-mono-num text-white outline-none"
                      />
                    </div>

                    <div className="md:col-span-4 flex flex-wrap gap-1 pt-3 md:pt-4">
                      {QUICK_ODDS.map((q) => (
                        <button
                          key={q.value}
                          type="button"
                          onClick={() => onUpdateEntry(p.id, { baseOdds: q.value })}
                          className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 border border-white/[0.06] cursor-pointer"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span>{p.layers.length} layers</span>
                    {p.audio && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-sky-400 flex items-center gap-1">
                          <Music className="w-3 h-3" />
                          {p.audio.fileName}
                        </span>
                        {isLikelyLegacyTruncatedAudio(p.audio) && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-medium text-amber-300">
                            Old ~26s clip — Replace Song in Studio
                          </span>
                        )}
                      </>
                    )}
                    {p.levitate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-300">Levitate</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      {entry.source === 'global'
                        ? 'Shared Cloud Roll Pool'
                        : `Local Draft (${entry.source})`}
                    </span>
                    {liveRarity.globalAnnouncement && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-rose-400 flex items-center gap-1">
                          <ArchiveRestore className="w-3 h-3" />
                          Mythic Global Announcement Eligible
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}



