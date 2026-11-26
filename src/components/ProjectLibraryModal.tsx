import { FilePlus2, Trash2, X } from 'lucide-react';
import { PRESET_AURAS } from '../aura/presets';
import { formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import type { AuraProject } from '../aura/types';

interface ProjectLibraryModalProps {
  open: boolean;
  activeProjectId: string;
  savedProjects: AuraProject[];
  onClose: () => void;
  onCreateBlank: () => void;
  onLoadProject: (project: AuraProject, asClone?: boolean) => void;
  onDeleteSaved: (id: string) => void;
}

export function ProjectLibraryModal({
  open,
  activeProjectId,
  savedProjects,
  onClose,
  onCreateBlank,
  onLoadProject,
  onDeleteSaved,
}: ProjectLibraryModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#10141e] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Aura Projects &amp; Studio Presets
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Load a saved aura from local storage, start fresh, or inspect reference presets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onCreateBlank();
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>New Blank Aura</span>
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

        <div className="p-5 overflow-y-auto space-y-6">
          {/* Saved Projects */}
          <section>
            <h3 className="text-xs font-semibold text-slate-300 mb-2.5">
              Saved Projects ({savedProjects.length})
            </h3>
            {savedProjects.length === 0 ? (
              <div className="border border-white/[0.07] bg-[#141925] rounded-lg p-4 text-xs text-slate-400">
                No saved projects yet. Click &ldquo;Save&rdquo; in the top toolbar to store your current aura locally.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {savedProjects.map((proj) => {
                  const style = RARITY_COLOR_STYLES[proj.rarity.classification];
                  const isActive = proj.id === activeProjectId;
                  return (
                    <div
                      key={proj.id}
                      className={`p-3.5 rounded-lg border transition-colors flex items-start justify-between gap-3 ${
                        isActive
                          ? 'bg-[#1a2030] border-amber-500/60'
                          : 'bg-[#151a26] border-white/[0.07] hover:border-white/[0.16]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onLoadProject(proj, false);
                          onClose();
                        }}
                        className="text-left flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="text-sm font-medium text-white truncate">
                          {proj.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                          <span className={style.text}>{proj.rarity.classification}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num">{formatOdds(proj.rarity.baseOdds)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{proj.layers.length} layers</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSaved(proj.id)}
                        title="Delete Saved Project"
                        className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Reference Showcase Presets */}
          <section>
            <h3 className="text-xs font-semibold text-slate-300 mb-2.5">
              Reference Aura Presets
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRESET_AURAS.map((preset) => {
                const style = RARITY_COLOR_STYLES[preset.rarity.classification];
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onLoadProject(preset, true);
                      onClose();
                    }}
                    className="text-left p-3.5 rounded-lg bg-[#151a26] hover:bg-[#1a2030] border border-white/[0.07] hover:border-amber-500/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white truncate">
                        {preset.name}
                      </span>
                      <span className={`text-[11px] font-semibold ${style.text} shrink-0`}>
                        {preset.rarity.classification}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {preset.description}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-2 font-mono-num">
                      <span>{formatOdds(preset.rarity.baseOdds)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{preset.layers.length} layers</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
