import {
  Download,
  FolderOpen,
  Gamepad2,
  Package,
  Redo2,
  Save,
  Send,
  Sparkles,
  Undo2,
  Upload,
} from 'lucide-react';
import { formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import type { AuraProject } from '../aura/types';

export type AppMode = 'play' | 'studio';

interface TopToolbarProps {
  mode: AppMode;
  onChangeMode: (mode: AppMode) => void;
  project: AuraProject;
  canUndo: boolean;
  canRedo: boolean;
  hasUnsavedChanges: boolean;
  isExporting: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenLibrary: () => void;
  onSaveProject: () => void;
  onDownloadJson: () => void;
  onTriggerImport: () => void;
  onExportPackage: () => void;
  onPublishToRollPool: () => void;
  onOpenRegistry: () => void;
  onOpenStorage: () => void;
}

export function TopToolbar({
  mode,
  onChangeMode,
  project,
  canUndo,
  canRedo,
  hasUnsavedChanges,
  isExporting,
  onUndo,
  onRedo,
  onOpenLibrary,
  onSaveProject,
  onDownloadJson,
  onTriggerImport,
  onExportPackage,
  onPublishToRollPool,
  onOpenRegistry,
  onOpenStorage,
}: TopToolbarProps) {
  const rarityStyle = RARITY_COLOR_STYLES[project.rarity.classification];

  return (
    <header className="h-13 shrink-0 bg-[#0d1017] border-b border-white/[0.08] px-4 flex items-center justify-between gap-4">
      {/* Left: Brand & Mode Switcher */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-display text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0">
          Dom&apos;s RNG IV
        </span>

        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/[0.06] shrink-0">
          <button
            type="button"
            onClick={() => onChangeMode('play')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'play'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Baseplate</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('studio')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'studio'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Aura Studio</span>
          </button>
        </div>

        {mode === 'studio' && (
          <button
            type="button"
            onClick={onOpenLibrary}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Projects</span>
          </button>
        )}
      </div>

      {/* Center: Studio Project Info */}
      {mode === 'studio' ? (
        <div className="hidden xl:flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-slate-100 truncate max-w-[200px]">
            {project.name}
            {hasUnsavedChanges ? ' *' : ''}
          </span>
          <span className="text-slate-600 text-xs" aria-hidden="true">
            ·
          </span>
          <span className={`text-xs font-semibold ${rarityStyle.text} whitespace-nowrap`}>
            {project.rarity.classification}
          </span>
          <span className="text-slate-600 text-xs" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono-num text-slate-400 whitespace-nowrap">
            {formatOdds(project.rarity.baseOdds)}
          </span>
        </div>
      ) : (
        <div className="hidden lg:flex items-center gap-3 text-xs text-slate-400">
          <span>Baseplate World</span>
          <span aria-hidden="true">·</span>
          <span>Roll, store, equip &amp; import custom exported auras</span>
        </div>
      )}

      {/* Right Actions */}
      {mode === 'studio' ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden md:flex items-center gap-0.5 mr-1 pr-2 border-r border-white/[0.08]">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded-md text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className="p-1.5 rounded-md text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onTriggerImport}
            title="Import .aura.json or .zip package"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
          </button>

          <button
            type="button"
            onClick={onSaveProject}
            title="Save Project to Studio Library"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.09] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-amber-400" />
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={onDownloadJson}
            title="Download Portable .aura.json"
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>

          <button
            type="button"
            onClick={onExportPackage}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.09] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
          >
            <Package className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{isExporting ? 'Packaging...' : 'Export ZIP'}</span>
          </button>

          <button
            type="button"
            onClick={onPublishToRollPool}
            title="Send this aura directly into the Baseplate Roll Pool"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send to Roll Pool</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenStorage}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-slate-100 border border-white/[0.08] transition-colors whitespace-nowrap cursor-pointer"
          >
            Storage / Equip
          </button>
          <button
            type="button"
            onClick={onOpenRegistry}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
          >
            Import &amp; Edit Roll Pool
          </button>
        </div>
      )}
    </header>
  );
}
