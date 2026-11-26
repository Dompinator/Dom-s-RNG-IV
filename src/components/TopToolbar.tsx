import {
  Database,
  Download,
  FolderOpen,
  Gamepad2,
  LogIn,
  Package,
  Redo2,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Undo2,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import type { AuraProject } from '../aura/types';
import type { User } from '../firebase';

export type AppMode = 'play' | 'studio';

interface TopToolbarProps {
  mode: AppMode;
  onChangeMode: (mode: AppMode) => void;
  isAdmin: boolean;
  authUser: User | null;
  accountUsername: string;
  onOpenAuth: () => void;
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
  rollPoolCount: number;
}

export function TopToolbar({
  mode,
  onChangeMode,
  isAdmin,
  authUser,
  accountUsername,
  onOpenAuth,
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
  rollPoolCount,
}: TopToolbarProps) {
  const rarityStyle = RARITY_COLOR_STYLES[project.rarity.classification];
  const isStudio = isAdmin && mode === 'studio';

  const accountPill = (
    <button
      type="button"
      onClick={onOpenAuth}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
        authUser && !authUser.emailVerified
          ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-200'
          : authUser
            ? 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-slate-100'
            : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/35 text-sky-200'
      }`}
    >
      {authUser ? (
        <>
          {isAdmin ? (
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <UserIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="max-w-[110px] truncate">
            {authUser.emailVerified ? accountUsername : 'Verify Email'}
          </span>
        </>
      ) : (
        <>
          <LogIn className="w-3.5 h-3.5" />
          <span>Log In / Sign Up</span>
        </>
      )}
    </button>
  );

  return (
    <header className="h-13 shrink-0 bg-[#0d1017] border-b border-white/[0.08] px-4 flex items-center justify-between gap-4">
      {/* Left: Brand & Mode Switcher */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-display text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0">
          Dom&apos;s RNG IV
        </span>

        {isAdmin && (
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/[0.06] shrink-0">
            <button
              type="button"
              onClick={() => onChangeMode('play')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                !isStudio
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
                isStudio
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Aura Studio</span>
            </button>
          </div>
        )}

        {isStudio && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenLibrary}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Projects</span>
            </button>
            <button
              type="button"
              onClick={onOpenRegistry}
              title="View, open, edit, and publish auras in the Roll Pool"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden md:inline">Roll Pool Manager</span>
              <span className="md:hidden">Roll Pool</span>
              <span className="font-mono-num text-[11px] text-slate-400">
                {rollPoolCount}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Center: Studio Project Info */}
      {isStudio ? (
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
          <span>Roll, store, equip &amp; explore custom auras with friends</span>
        </div>
      )}

      {/* Right Actions */}
      {isStudio ? (
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

          {accountPill}
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
            {isAdmin ? 'Roll Pool Manager' : 'Roll Pool'}
          </button>
          {accountPill}
        </div>
      )}
    </header>
  );
}

