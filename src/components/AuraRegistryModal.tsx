import {
  ArchiveRestore,
  Brush,
  PlusCircle,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useRef } from 'react';
import { classifyBaseOdds, formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import { importAuraFromFile } from '../aura/storage';
import type { AuraProject } from '../aura/types';
import type { CatalogAuraEntry } from '../game/gameRegistry';

interface AuraRegistryModalProps {
  open: boolean;
  catalog: CatalogAuraEntry[];
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

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imported: AuraProject[] = [];
    const warnings: string[] = [];

    for (const file of Array.from(files)) {
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
        className="w-full max-w-4xl bg-[#10141e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[86vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Aura Registry &amp; Roll Pool Manager
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Import exported auras (.aura.json or .zip), set their name and base rarity odds, and roll them immediately.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetDefaults}
              title="Restore Starter Auras"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/[0.07] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Restore Starters</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Exported Auras</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

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

        {/* Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFilesSelected(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className="mx-5 mt-4 p-4 border border-dashed border-white/[0.16] hover:border-amber-500/60 bg-[#141925] rounded-lg text-center cursor-pointer transition-colors"
        >
          <div className="text-xs font-medium text-slate-200">
            Drop exported <span className="font-mono-num text-amber-400">.aura.json</span> or{' '}
            <span className="font-mono-num text-amber-400">.zip</span> aura packages here, or click to browse
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Imported auras are automatically wired to the Roll table, Storage, and Equip system.
          </div>
        </div>

        {/* Registry List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {sortedCatalog.map((entry) => {
            const p = entry.project;
            const liveRarity = classifyBaseOdds(p.rarity.baseOdds);
            const style = RARITY_COLOR_STYLES[liveRarity.classification];
            const c1 = p.layers[0]?.color ?? '#f59e0b';
            const c2 = p.layers[0]?.secondaryColor ?? '#38bdf8';

            return (
              <div
                key={p.id}
                className="p-4 rounded-lg bg-[#141924] border border-white/[0.07] space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
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
                      className="bg-[#0e121b] border border-white/[0.08] focus:border-amber-500/70 rounded px-2.5 py-1 text-sm font-semibold text-white outline-none flex-1 min-w-0"
                    />
                    <span className={`text-xs font-semibold ${style.text} whitespace-nowrap`}>
                      {liveRarity.classification}
                    </span>
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
                      title="Edit Visuals in Aura Studio"
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 transition-colors cursor-pointer"
                    >
                      <Brush className="w-3.5 h-3.5 text-amber-400" />
                      <span>Studio</span>
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

                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span>{p.layers.length} layers</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">Source: {entry.source}</span>
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
          })}
        </div>
      </div>
    </div>
  );
}
