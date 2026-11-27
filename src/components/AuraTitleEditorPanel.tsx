import { RotateCcw, Sparkles, Type } from 'lucide-react';
import { formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import {
  AURA_TITLE_ANIMATIONS,
  CUTSCENE_FONT_STYLES,
  type AuraProject,
  type AuraTitleAnimation,
  type AuraTitleConfig,
  type CutsceneFontStyle,
} from '../aura/types';
import { resolveAuraTitleConfig } from '../engine/auraTitleSprite';

interface AuraTitleEditorPanelProps {
  project: AuraProject;
  onUpdateTitleConfig: (titleConfig: AuraTitleConfig | undefined) => void;
}

const FONT_STYLE_LABELS: Record<CutsceneFontStyle, string> = {
  display: 'Display Bold',
  serif: 'Mythic Serif',
  mono: 'Tech Mono',
};

const TITLE_ANIM_LABELS: Record<AuraTitleAnimation, { label: string; desc: string }> = {
  float: { label: 'Float', desc: 'Gentle vertical hover' },
  pulse: { label: 'Pulse', desc: 'Rhythmic size breath' },
  shimmer: { label: 'Shimmer', desc: 'Radiant glow flicker' },
  none: { label: 'Still', desc: 'Fixed in place' },
};

const RARITY_HEX: Record<string, string> = {
  Common: '#94a3b8',
  Uncommon: '#34d399',
  Rare: '#38bdf8',
  Epic: '#c084fc',
  Legendary: '#fbbf24',
  Mythic: '#fb7185',
};

export function AuraTitleEditorPanel({
  project,
  onUpdateTitleConfig,
}: AuraTitleEditorPanelProps) {
  const cfg = resolveAuraTitleConfig(project);
  const rarityHex = RARITY_HEX[project.rarity.classification] ?? '#fbbf24';
  const rarityStyle = RARITY_COLOR_STYLES[project.rarity.classification];

  const update = (patch: Partial<AuraTitleConfig>) => {
    onUpdateTitleConfig({
      ...cfg,
      ...patch,
    });
  };

  return (
    <aside className="w-80 xl:w-96 shrink-0 h-full bg-[#0e1119] border-l border-white/[0.08] overflow-y-auto p-4 space-y-5 select-none">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Type className="w-4 h-4 text-sky-400" />
            <span>Aura Overhead Title</span>
          </h2>
          <button
            type="button"
            onClick={() => onUpdateTitleConfig(undefined)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
            title="Reset to default title settings"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Floats directly <span className="text-slate-200 font-medium">above the aura</span> (not above the player head) whenever equipped, with the rarity always displayed underneath.
        </p>
      </div>

      {/* Live Preview Card */}
      <div className="rounded-xl bg-[#070910] border border-white/[0.08] p-4 text-center space-y-1">
        <div
          className="font-bold tracking-tight truncate"
          style={{
            color: cfg.color,
            fontSize: `${Math.round(Math.max(14, Math.min(28, 18 * cfg.size)))}px`,
            fontFamily:
              cfg.fontStyle === 'serif'
                ? 'Georgia, serif'
                : cfg.fontStyle === 'mono'
                  ? 'monospace'
                  : 'system-ui, sans-serif',
            textShadow: `0 0 14px ${cfg.glowColor}`,
          }}
        >
          {cfg.text.trim() || project.name}
        </div>
        <div
          className={`text-[11px] font-mono-num font-bold tracking-wider ${rarityStyle.text}`}
        >
          {project.rarity.classification.toUpperCase()} · {formatOdds(project.rarity.baseOdds)}
        </div>
      </div>

      {/* Enable Toggle */}
      <label className="flex items-center justify-between gap-2 bg-[#141824] border border-white/[0.08] rounded-lg px-3 py-2.5 cursor-pointer">
        <div>
          <div className="text-xs font-semibold text-white">Show Title Above Aura</div>
          <div className="text-[10px] text-slate-400">
            Displays Title + Rarity overhead when equipped
          </div>
        </div>
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="accent-sky-500 w-4 h-4 shrink-0"
        />
      </label>

      {/* Editable Title Text */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-slate-300">Title Text</label>
          <button
            type="button"
            onClick={() => update({ text: project.name })}
            className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer"
          >
            Match Aura Name
          </button>
        </div>
        <input
          type="text"
          value={cfg.text}
          maxLength={48}
          placeholder={project.name}
          onChange={(e) => update({ text: e.target.value })}
          className="w-full bg-[#151a26] border border-white/[0.09] focus:border-sky-500/60 rounded-md px-3 py-2 text-xs text-white outline-none"
        />
        <div className="text-[10px] text-slate-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
          <span>Rarity ({project.rarity.classification}) always displays underneath automatically.</span>
        </div>
      </div>

      {/* Text Size */}
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-slate-300 font-medium">Text Size</span>
          <span className="font-mono-num text-sky-300">{cfg.size.toFixed(2)}x</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={3.0}
          step={0.05}
          value={cfg.size}
          onChange={(e) => update({ size: parseFloat(e.target.value) })}
          className="w-full studio-slider"
        />
      </div>

      {/* Height Above Aura */}
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-slate-300 font-medium">Height Above Aura</span>
          <span className="font-mono-num text-slate-200">
            {cfg.heightOffset >= 0 ? `+${cfg.heightOffset.toFixed(2)}m` : `${cfg.heightOffset.toFixed(2)}m`}
          </span>
        </div>
        <input
          type="range"
          min={-1.0}
          max={4.0}
          step={0.05}
          value={cfg.heightOffset}
          onChange={(e) => update({ heightOffset: parseFloat(e.target.value) })}
          className="w-full studio-slider"
        />
        <p className="text-[10px] text-slate-500 mt-1">
          Automatically sits above the tallest visible aura layer, plus this offset.
        </p>
      </div>

      {/* Font Style */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-slate-300">Font Style</div>
        <div className="grid grid-cols-3 gap-1.5">
          {CUTSCENE_FONT_STYLES.map((fs) => (
            <button
              key={fs}
              type="button"
              onClick={() => update({ fontStyle: fs })}
              className={`px-2 py-1.5 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                cfg.fontStyle === fs
                  ? 'bg-sky-500/20 border-sky-400/60 text-white'
                  : 'bg-[#141824] border-white/[0.07] text-slate-300 hover:border-white/[0.14]'
              }`}
            >
              {FONT_STYLE_LABELS[fs]}
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-300">Title &amp; Glow Colors</span>
          <button
            type="button"
            onClick={() => update({ glowColor: rarityHex })}
            className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer"
          >
            Match Rarity Glow
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#151a26] border border-white/[0.08] rounded-md px-2.5 py-1.5 flex items-center gap-2">
            <input
              type="color"
              value={cfg.color}
              onChange={(e) => update({ color: e.target.value })}
              className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">Text</div>
              <div className="text-[11px] font-mono-num text-slate-200 truncate">
                {cfg.color}
              </div>
            </div>
          </div>
          <div className="bg-[#151a26] border border-white/[0.08] rounded-md px-2.5 py-1.5 flex items-center gap-2">
            <input
              type="color"
              value={cfg.glowColor}
              onChange={(e) => update({ glowColor: e.target.value })}
              className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">Glow</div>
              <div className="text-[11px] font-mono-num text-slate-200 truncate">
                {cfg.glowColor}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Overhead Animation */}
      <div className="space-y-1.5 pb-4">
        <div className="text-[11px] font-medium text-slate-300">Title Motion</div>
        <div className="grid grid-cols-2 gap-1.5">
          {AURA_TITLE_ANIMATIONS.map((anim) => {
            const meta = TITLE_ANIM_LABELS[anim];
            return (
              <button
                key={anim}
                type="button"
                onClick={() => update({ animation: anim })}
                className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                  cfg.animation === anim
                    ? 'bg-sky-500/20 border-sky-400/60 text-white'
                    : 'bg-[#141824] border-white/[0.07] text-slate-300 hover:border-white/[0.14]'
                }`}
              >
                <div className="text-[11px] font-semibold">{meta.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{meta.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
