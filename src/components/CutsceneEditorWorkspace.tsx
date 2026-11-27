import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Film,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { encodeCutsceneAudioFile } from '../aura/audioEncoder';
import {
  createCutsceneElement,
  createDefaultCutscene,
  CUTSCENE_TEMPLATES,
} from '../aura/cutscenePresets';
import {
  CUTSCENE_AUDIO_LABELS,
  CUTSCENE_AUDIO_PRESETS,
  CUTSCENE_FONT_STYLES,
  CUTSCENE_MOTIONS,
  CUTSCENE_PHASES,
  CUTSCENE_SHAPE_LABELS,
  CUTSCENE_SHAPES,
  CUTSCENE_TIER_META,
  CUTSCENE_TIERS,
  type AuraCutsceneConfig,
  type AuraProject,
  type CutsceneAudioPreset,
  type CutsceneElement,
  type CutsceneFontStyle,
  type CutsceneMotion,
  type CutscenePhase,
  type CutsceneShapeType,
  type CutsceneTier,
} from '../aura/types';
import { CutsceneAudioEngine } from '../engine/cutsceneAudio';
import { renderCutsceneFrame } from '../engine/cutsceneRenderer';

interface CutsceneEditorWorkspaceProps {
  project: AuraProject;
  zenMode: boolean;
  onUpdateCutscene: (cutscene: AuraCutsceneConfig | undefined) => void;
  onNotify: (text: string, kind?: 'info' | 'error') => void;
}

const PHASE_LABELS: Record<CutscenePhase, string> = {
  all: 'Full Cutscene',
  buildup: 'Buildup Only',
  climax: 'Climax Impact',
  reveal: 'Reveal After Drop',
};

const MOTION_LABELS: Record<CutsceneMotion, string> = {
  spin_cw: 'Spin Clockwise',
  spin_ccw: 'Spin Counter-CW',
  pulse: 'Rhythmic Pulse',
  expand: 'Shockwave Expand',
  converge: 'Implode / Converge',
  shatter: 'Explosive Shatter',
  flicker: 'High-Voltage Flicker',
  slam: 'Slam In',
  static: 'Still / Static',
};

const FONT_STYLE_LABELS: Record<CutsceneFontStyle, string> = {
  display: 'Display Bold',
  serif: 'Mythic Serif',
  mono: 'Technical Mono',
};

export function CutsceneEditorWorkspace({
  project,
  zenMode,
  onUpdateCutscene,
  onNotify,
}: CutsceneEditorWorkspaceProps) {
  const defaultPrimary = project.layers[0]?.color ?? '#fbbf24';
  const defaultSecondary = project.layers[0]?.secondaryColor ?? '#38bdf8';

  const cutscene: AuraCutsceneConfig = useMemo(() => {
    const base =
      project.cutscene ??
      createDefaultCutscene('epic', defaultPrimary, defaultSecondary);
    // Normalize any legacy tier key safely
    const safeTier: CutsceneTier = CUTSCENE_TIER_META[base.tier] ? base.tier : 'epic';
    return safeTier === base.tier ? base : { ...base, tier: safeTier };
  }, [project.cutscene, defaultPrimary, defaultSecondary]);

  const [selectedElId, setSelectedElId] = useState<string | null>(
    cutscene.elements[0]?.id ?? null,
  );
  const [isPlaying, setIsPlaying] = useState(true);
  const [playTime, setPlayTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [isEncodingSfx, setIsEncodingSfx] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sfxInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<CutsceneAudioEngine | null>(null);
  const playTimeRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const cutsceneRef = useRef(cutscene);
  cutsceneRef.current = cutscene;

  useEffect(() => {
    if (!cutscene.elements.some((e) => e.id === selectedElId)) {
      setSelectedElId(cutscene.elements[0]?.id ?? null);
    }
  }, [cutscene.elements, selectedElId]);

  useEffect(() => {
    const engine = new CutsceneAudioEngine();
    audioRef.current = engine;
    return () => {
      engine.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  // Continuous Canvas render loop for live cutscene editing
  useEffect(() => {
    let rafId = 0;
    let lastMs = performance.now();

    const frame = (nowMs: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastMs) / 1000));
      lastMs = nowMs;

      const cur = cutsceneRef.current;
      const dur = Math.max(1, cur.duration);

      if (isPlayingRef.current) {
        let next = playTimeRef.current + dt;
        if (next >= dur) {
          next = 0;
        }
        playTimeRef.current = next;
        setPlayTime(next);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, canvas.clientWidth);
        const h = Math.max(1, canvas.clientHeight);
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          renderCutsceneFrame(
            ctx,
            w,
            h,
            cur,
            project,
            playTimeRef.current / dur,
            nowMs / 1000,
          );
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [project]);

  const selectedElement =
    cutscene.elements.find((e) => e.id === selectedElId) ?? null;

  const commitCutscene = (next: AuraCutsceneConfig) => {
    onUpdateCutscene(next);
  };

  const handleToggleEnabled = (enabled: boolean) => {
    commitCutscene({ ...cutscene, enabled });
  };

  const handleSwitchTier = (tier: CutsceneTier) => {
    const meta = CUTSCENE_TIER_META[tier];
    const nextAudioPreset: CutsceneAudioPreset =
      tier === 'under_epic'
        ? 'epic_chime'
        : tier === 'legendary' && cutscene.audioPreset === 'epic_chime'
          ? 'celestial_choir'
          : cutscene.audioPreset === 'epic_chime'
            ? 'cosmic_sub_drop'
            : cutscene.audioPreset;

    const next: AuraCutsceneConfig = {
      ...cutscene,
      enabled: true,
      tier,
      duration: meta.defaultDuration,
      shakeIntensity:
        tier === 'under_epic'
          ? 0.75
          : tier === 'epic'
            ? 1.5
            : tier === 'legendary'
              ? 1.75
              : 2.1,
      flashIntensity:
        tier === 'under_epic'
          ? 1.0
          : tier === 'epic'
            ? 1.45
            : tier === 'legendary'
              ? 1.65
              : 2.0,
      audioPreset: nextAudioPreset,
    };
    commitCutscene(next);
    playTimeRef.current = 0;
    setPlayTime(0);
  };

  const handleApplyTemplate = (templateId: string) => {
    const tpl = CUTSCENE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    const built = tpl.build(cutscene.primaryColor, cutscene.secondaryColor);
    commitCutscene(built);
    setSelectedElId(built.elements[0]?.id ?? null);
    playTimeRef.current = 0;
    setPlayTime(0);
    setIsPlaying(true);
    audioRef.current?.play(built, muted, 0);
    onNotify(`Loaded "${tpl.label}" cutscene template.`);
  };

  const handleAddShape = (shape: CutsceneShapeType) => {
    const el = createCutsceneElement(shape, {
      color: shape === 'custom_text' ? '#ffffff' : cutscene.primaryColor,
      secondaryColor:
        shape === 'custom_text' ? cutscene.primaryColor : cutscene.secondaryColor,
    });
    const next = {
      ...cutscene,
      enabled: true,
      elements: [el, ...cutscene.elements].slice(0, 24),
    };
    commitCutscene(next);
    setSelectedElId(el.id);
  };

  const handleUpdateElement = (id: string, patch: Partial<CutsceneElement>) => {
    commitCutscene({
      ...cutscene,
      elements: cutscene.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    });
  };

  const handleDeleteElement = (id: string) => {
    const remaining = cutscene.elements.filter((e) => e.id !== id);
    commitCutscene({ ...cutscene, elements: remaining });
    if (selectedElId === id) {
      setSelectedElId(remaining[0]?.id ?? null);
    }
  };

  const handleDuplicateElement = (id: string) => {
    const target = cutscene.elements.find((e) => e.id === id);
    if (!target || cutscene.elements.length >= 24) return;
    const copy: CutsceneElement = {
      ...target,
      id: `cut_${Math.random().toString(36).slice(2, 9)}`,
      name: `${target.name} Copy`,
    };
    const idx = cutscene.elements.findIndex((e) => e.id === id);
    const nextEls = [...cutscene.elements];
    nextEls.splice(idx + 1, 0, copy);
    commitCutscene({ ...cutscene, elements: nextEls });
    setSelectedElId(copy.id);
  };

  const handleMoveElement = (id: string, dir: 'up' | 'down') => {
    const idx = cutscene.elements.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= cutscene.elements.length) return;
    const nextEls = [...cutscene.elements];
    const [item] = nextEls.splice(idx, 1);
    nextEls.splice(targetIdx, 0, item);
    commitCutscene({ ...cutscene, elements: nextEls });
  };

  const handlePlayWithAudio = () => {
    playTimeRef.current = 0;
    setPlayTime(0);
    setIsPlaying(true);
    audioRef.current?.play(cutscene, muted, 0);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      audioRef.current?.stop();
    } else {
      setIsPlaying(true);
      audioRef.current?.play(cutscene, muted, playTimeRef.current);
    }
  };

  const handleResetTime = () => {
    audioRef.current?.stop();
    playTimeRef.current = 0;
    setPlayTime(0);
  };

  const handleUploadCustomSfx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsEncodingSfx(true);
    try {
      const { customAudio, optimizedNote } = await encodeCutsceneAudioFile(
        file,
        cutscene.customAudio?.volume ?? 0.85,
      );
      commitCutscene({ ...cutscene, enabled: true, customAudio });
      onNotify(optimizedNote ?? `Attached cutscene SFX "${customAudio.fileName}".`);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Failed to encode cutscene audio.',
        'error',
      );
    } finally {
      setIsEncodingSfx(false);
    }
  };

  const tierMeta = CUTSCENE_TIER_META[cutscene.tier] ?? CUTSCENE_TIER_META.epic;
  const climaxRatio = tierMeta.climaxRatio;

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      <input
        ref={sfxInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
        onChange={handleUploadCustomSfx}
        className="hidden"
      />

      {/* Left Panel: Type, Templates, Shape Palette & Active Elements */}
      {!zenMode && (
        <aside className="w-72 xl:w-80 shrink-0 h-full bg-[#0e1119] border-r border-white/[0.08] flex flex-col select-none">
          <div className="p-3 border-b border-white/[0.08] space-y-2.5">
            <label className="flex items-center justify-between gap-2 bg-[#141824] border border-white/[0.08] rounded-lg px-3 py-2 cursor-pointer">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-white">
                    Enable Roll Cutscene
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Plays automatically when this aura is rolled
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={cutscene.enabled}
                onChange={(e) => handleToggleEnabled(e.target.checked)}
                className="accent-amber-500 w-4 h-4 shrink-0"
              />
            </label>

            {/* 4 Cutscene Tiers */}
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                Cutscene Type
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CUTSCENE_TIERS.map((tierKey) => {
                  const meta = CUTSCENE_TIER_META[tierKey];
                  const active = cutscene.tier === tierKey;
                  const activeStyle =
                    tierKey === 'mythic'
                      ? 'bg-rose-500/20 border-rose-400/60 text-white'
                      : tierKey === 'legendary'
                        ? 'bg-amber-500/20 border-amber-400/60 text-white'
                        : tierKey === 'epic'
                          ? 'bg-purple-500/20 border-purple-400/60 text-white'
                          : 'bg-sky-500/20 border-sky-400/60 text-white';

                  return (
                    <button
                      key={tierKey}
                      type="button"
                      onClick={() => handleSwitchTier(tierKey)}
                      className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? activeStyle
                          : 'bg-[#141824] border-white/[0.07] text-slate-300 hover:border-white/[0.15]'
                      }`}
                    >
                      <div className="text-[11px] font-semibold leading-tight">
                        {meta.label}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        {meta.shortDesc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Quick Templates */}
            <section className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-300">
                Quick Cutscene Presets
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CUTSCENE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl.id)}
                    className="px-2 py-1.5 text-[11px] font-medium rounded-md bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.07] text-slate-200 text-left truncate transition-colors cursor-pointer"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Addable On-Screen Text Shortcut + 12 Shapes & FX */}
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">
                  Add Shapes, Text &amp; FX
                </span>
                <span className="text-[10px] text-slate-500 font-mono-num">
                  {cutscene.elements.length}/24
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleAddShape('custom_text')}
                disabled={cutscene.elements.length >= 24}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-xs font-semibold text-amber-200 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Type className="w-3.5 h-3.5" />
                <span>Add On-Screen Text</span>
              </button>

              <div className="grid grid-cols-2 gap-1">
                {CUTSCENE_SHAPES.filter((s) => s !== 'custom_text').map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => handleAddShape(shape)}
                    disabled={cutscene.elements.length >= 24}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-[#131824] hover:bg-[#1b2234] border border-white/[0.07] text-[11px] text-slate-200 disabled:opacity-40 transition-colors cursor-pointer truncate"
                  >
                    <Plus className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="truncate">{CUTSCENE_SHAPE_LABELS[shape]}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Cutscene Element Stack */}
            <section className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-300">
                Cutscene Elements ({cutscene.elements.length})
              </div>
              {cutscene.elements.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-white/[0.1] text-center text-[11px] text-slate-400">
                  Click any shape or text button above to build your cutscene.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {cutscene.elements.map((el, idx) => {
                    const isSelected = el.id === selectedElId;
                    return (
                      <div
                        key={el.id}
                        onClick={() => setSelectedElId(el.id)}
                        className={`rounded-lg p-2 border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#171d2c] border-amber-500/60'
                            : 'bg-[#121621] border-white/[0.06] hover:border-white/[0.14]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20"
                              style={{
                                background: `linear-gradient(135deg, ${el.color}, ${el.secondaryColor})`,
                              }}
                            />
                            <span
                              className={`text-xs font-medium truncate ${
                                el.visible ? 'text-slate-100' : 'text-slate-500 line-through'
                              }`}
                            >
                              {el.name}
                            </span>
                          </div>
                          <div
                            className="flex items-center gap-0.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateElement(el.id, { visible: !el.visible })
                              }
                              className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                            >
                              {el.visible ? (
                                <Eye className="w-3 h-3" />
                              ) : (
                                <EyeOff className="w-3 h-3 text-slate-600" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveElement(el.id, 'up')}
                              disabled={idx === 0}
                              className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-25 cursor-pointer"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveElement(el.id, 'down')}
                              disabled={idx === cutscene.elements.length - 1}
                              className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-25 cursor-pointer"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateElement(el.id)}
                              className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteElement(el.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 pl-4 text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                          <span>{CUTSCENE_SHAPE_LABELS[el.shape]}</span>
                          <span>·</span>
                          <span>{PHASE_LABELS[el.phase]}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </aside>
      )}

      {/* Center Stage: Live Cutscene Canvas + Timeline Transport */}
      <div className="relative flex-1 min-w-0 h-full bg-[#04050a] flex flex-col overflow-hidden select-none">
        <div className="relative flex-1 min-h-0">
          <canvas ref={canvasRef} className="w-full h-full block" />

          {/* Top Preview Info */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 bg-[#0f131d]/90 border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-medium text-white">{tierMeta.label}</span>
              <span className="text-slate-500">·</span>
              <span className="font-mono-num text-slate-400">
                {playTime.toFixed(2)}s / {cutscene.duration.toFixed(1)}s
              </span>
              {!cutscene.enabled && (
                <>
                  <span className="text-slate-500">·</span>
                  <span className="text-amber-300">Disabled on Roll</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handlePlayWithAudio}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold shadow-lg transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Preview Full Cutscene + Audio</span>
            </button>
          </div>
        </div>

        {/* Bottom Timeline Scrubber & Transport */}
        <div className="shrink-0 bg-[#0d1017] border-t border-white/[0.08] px-4 py-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="w-8 h-8 rounded-md bg-white/[0.07] hover:bg-white/[0.14] text-white flex items-center justify-center cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleResetTime}
            className="w-8 h-8 rounded-md bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 flex items-center justify-center cursor-pointer"
            title="Restart Timeline"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="flex-1 space-y-1">
            <div className="relative flex items-center">
              <input
                type="range"
                min={0}
                max={cutscene.duration}
                step={0.02}
                value={playTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  playTimeRef.current = val;
                  setPlayTime(val);
                  setIsPlaying(false);
                  audioRef.current?.stop();
                }}
                className="w-full studio-slider"
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono-num">
              <span>0.0s Buildup</span>
              <span className="text-amber-400/90">
                Climax Impact ({(cutscene.duration * climaxRatio).toFixed(1)}s)
              </span>
              <span>Reveal End ({cutscene.duration.toFixed(1)}s)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs text-slate-200 cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>{muted ? 'Muted' : 'Audio On'}</span>
          </button>
        </div>
      </div>

      {/* Right Panel: Selected Element Inspector + On-Screen Text Choices + Audio Settings */}
      {!zenMode && (
        <aside className="w-80 xl:w-96 shrink-0 h-full bg-[#0e1119] border-l border-white/[0.08] overflow-y-auto p-3.5 space-y-5 select-none">
          {selectedElement ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white">
                  Selected Element
                </h3>
                <span className="text-[11px] text-amber-400">
                  {CUTSCENE_SHAPE_LABELS[selectedElement.shape]}
                </span>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Element Name</label>
                <input
                  type="text"
                  value={selectedElement.name}
                  maxLength={48}
                  onChange={(e) =>
                    handleUpdateElement(selectedElement.id, { name: e.target.value })
                  }
                  className="w-full bg-[#151a26] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-xs text-white outline-none"
                />
              </div>

              {selectedElement.shape === 'custom_text' && (
                <div className="space-y-2.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div>
                    <label className="block text-[11px] font-medium text-amber-200 mb-1">
                      On-Screen Text
                    </label>
                    <input
                      type="text"
                      value={selectedElement.text ?? ''}
                      maxLength={80}
                      placeholder="Enter text to show on screen..."
                      onChange={(e) =>
                        handleUpdateElement(selectedElement.id, { text: e.target.value })
                      }
                      className="w-full bg-[#10141f] border border-white/[0.12] rounded-md px-2.5 py-1.5 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      Font Style
                    </label>
                    <select
                      value={selectedElement.fontStyle ?? 'display'}
                      onChange={(e) =>
                        handleUpdateElement(selectedElement.id, {
                          fontStyle: e.target.value as CutsceneFontStyle,
                        })
                      }
                      className="w-full bg-[#10141f] border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-slate-100 outline-none"
                    >
                      {CUTSCENE_FONT_STYLES.map((fs) => (
                        <option key={fs} value={fs}>
                          {FONT_STYLE_LABELS[fs]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Type / Shape</label>
                  <select
                    value={selectedElement.shape}
                    onChange={(e) =>
                      handleUpdateElement(selectedElement.id, {
                        shape: e.target.value as CutsceneShapeType,
                        ...(e.target.value === 'custom_text' && !selectedElement.text
                          ? { text: 'THE HEAVENS TREMBLE...' }
                          : {}),
                      })
                    }
                    className="w-full bg-[#151a26] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-slate-100 outline-none"
                  >
                    {CUTSCENE_SHAPES.map((s) => (
                      <option key={s} value={s}>
                        {CUTSCENE_SHAPE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Phase</label>
                  <select
                    value={selectedElement.phase}
                    onChange={(e) =>
                      handleUpdateElement(selectedElement.id, {
                        phase: e.target.value as CutscenePhase,
                      })
                    }
                    className="w-full bg-[#151a26] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-slate-100 outline-none"
                  >
                    {CUTSCENE_PHASES.map((p) => (
                      <option key={p} value={p}>
                        {PHASE_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Motion</label>
                <select
                  value={selectedElement.motion}
                  onChange={(e) =>
                    handleUpdateElement(selectedElement.id, {
                      motion: e.target.value as CutsceneMotion,
                    })
                  }
                  className="w-full bg-[#151a26] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-slate-100 outline-none"
                >
                  {CUTSCENE_MOTIONS.map((m) => (
                    <option key={m} value={m}>
                      {MOTION_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {selectedElement.shape === 'custom_text' ? 'Text Color' : 'Primary Color'}
                  </label>
                  <div className="flex items-center gap-2 bg-[#151a26] border border-white/[0.08] rounded-md px-2 py-1">
                    <input
                      type="color"
                      value={selectedElement.color}
                      onChange={(e) =>
                        handleUpdateElement(selectedElement.id, {
                          color: e.target.value,
                        })
                      }
                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <span className="text-[11px] font-mono-num text-slate-300">
                      {selectedElement.color}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {selectedElement.shape === 'custom_text' ? 'Glow Color' : 'Secondary Color'}
                  </label>
                  <div className="flex items-center gap-2 bg-[#151a26] border border-white/[0.08] rounded-md px-2 py-1">
                    <input
                      type="color"
                      value={selectedElement.secondaryColor}
                      onChange={(e) =>
                        handleUpdateElement(selectedElement.id, {
                          secondaryColor: e.target.value,
                        })
                      }
                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <span className="text-[11px] font-mono-num text-slate-300">
                      {selectedElement.secondaryColor}
                    </span>
                  </div>
                </div>
              </div>

              {(
                [
                  ['Size', 'size', 0.2, 3.0, 0.05],
                  ['Motion Speed', 'speed', 0, 4.0, 0.1],
                  ['Opacity', 'opacity', 0.1, 1.0, 0.05],
                  ['Glow Intensity', 'glow', 0, 2.5, 0.1],
                  ['Spokes / Count', 'count', 1, 24, 1],
                  ['Offset X (%)', 'x', -50, 50, 1],
                  ['Offset Y (%)', 'y', -50, 50, 1],
                  ['Base Angle (deg)', 'rotation', -180, 180, 5],
                ] as const
              ).map(([label, key, min, max, step]) => (
                <div key={key}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-mono-num text-slate-200">
                      {Number(selectedElement[key]).toFixed(step < 1 ? 2 : 0)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={selectedElement[key]}
                    onChange={(e) =>
                      handleUpdateElement(selectedElement.id, {
                        [key]: parseFloat(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>
              ))}
            </section>
          ) : (
            <div className="p-3 rounded-lg bg-[#141824] border border-white/[0.06] text-xs text-slate-400">
              Select an element on the left or add a new shape/text to customize its motion and glow.
            </div>
          )}

          <hr className="border-white/[0.07]" />

          {/* Optional On-Screen Text & Atmosphere Controls */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-white">
              On-Screen Text &amp; Atmosphere
            </h3>

            <label className="flex items-center justify-between gap-2 bg-[#141824] border border-white/[0.07] rounded-lg px-2.5 py-2 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-slate-200">
                  Show Buildup Headline Text
                </div>
                <div className="text-[10px] text-slate-400">
                  Optional whisper quote before climax drop
                </div>
              </div>
              <input
                type="checkbox"
                checked={cutscene.showHeadlineText ?? cutscene.headlineText.trim().length > 0}
                onChange={(e) =>
                  commitCutscene({ ...cutscene, showHeadlineText: e.target.checked })
                }
                className="accent-amber-500 w-4 h-4 shrink-0"
              />
            </label>

            {(cutscene.showHeadlineText ?? cutscene.headlineText.trim().length > 0) && (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Buildup Headline Text
                </label>
                <input
                  type="text"
                  value={cutscene.headlineText}
                  maxLength={80}
                  placeholder="e.g. A distant star awakens..."
                  onChange={(e) =>
                    commitCutscene({ ...cutscene, headlineText: e.target.value })
                  }
                  className="w-full bg-[#151a26] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-xs text-white outline-none"
                />
              </div>
            )}

            <label className="flex items-center justify-between gap-2 bg-[#141824] border border-white/[0.07] rounded-lg px-2.5 py-2 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-slate-200">
                  Show Aura Name on Reveal
                </div>
                <div className="text-[10px] text-slate-400">
                  Display Aura Name &amp; 1-in-N odds after impact
                </div>
              </div>
              <input
                type="checkbox"
                checked={cutscene.showRevealText ?? true}
                onChange={(e) =>
                  commitCutscene({ ...cutscene, showRevealText: e.target.checked })
                }
                className="accent-amber-500 w-4 h-4 shrink-0"
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['Primary', 'primaryColor'],
                  ['Secondary', 'secondaryColor'],
                  ['Backdrop', 'backgroundColor'],
                ] as const
              ).map(([lbl, field]) => (
                <div key={field}>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    {lbl}
                  </label>
                  <div className="flex items-center gap-1.5 bg-[#151a26] border border-white/[0.08] rounded-md px-1.5 py-1">
                    <input
                      type="color"
                      value={cutscene[field]}
                      onChange={(e) =>
                        commitCutscene({ ...cutscene, [field]: e.target.value })
                      }
                      className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <span className="text-[10px] font-mono-num text-slate-300 truncate">
                      {cutscene[field]}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Total Duration</span>
                <span className="font-mono-num text-slate-200">
                  {cutscene.duration.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min={1.2}
                max={25.0}
                step={0.1}
                value={cutscene.duration}
                onChange={(e) =>
                  commitCutscene({
                    ...cutscene,
                    duration: parseFloat(e.target.value),
                  })
                }
                className="w-full studio-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Screen Shake Intensity</span>
                <span className="font-mono-num text-slate-200">
                  {cutscene.shakeIntensity.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2.5}
                step={0.05}
                value={cutscene.shakeIntensity}
                onChange={(e) =>
                  commitCutscene({
                    ...cutscene,
                    shakeIntensity: parseFloat(e.target.value),
                  })
                }
                className="w-full studio-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Whiteout Flash Intensity</span>
                <span className="font-mono-num text-slate-200">
                  {cutscene.flashIntensity.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2.2}
                step={0.05}
                value={cutscene.flashIntensity}
                onChange={(e) =>
                  commitCutscene({
                    ...cutscene,
                    flashIntensity: parseFloat(e.target.value),
                  })
                }
                className="w-full studio-slider"
              />
            </div>
          </section>

          <hr className="border-white/[0.07]" />

          {/* Insane Cutscene Audio */}
          <section className="space-y-3 pb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-sky-400" />
                <span>Cutscene Audio Synthesizer</span>
              </h3>
              <button
                type="button"
                onClick={handlePlayWithAudio}
                className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                Test Audio
              </button>
            </div>

            <div className="space-y-1.5">
              {CUTSCENE_AUDIO_PRESETS.map((presetKey) => {
                const info = CUTSCENE_AUDIO_LABELS[presetKey];
                const active = cutscene.audioPreset === presetKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => {
                      const next = {
                        ...cutscene,
                        audioPreset: presetKey as CutsceneAudioPreset,
                      };
                      commitCutscene(next);
                      audioRef.current?.play(next, muted, 0);
                      playTimeRef.current = 0;
                      setPlayTime(0);
                      setIsPlaying(true);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                      active
                        ? 'bg-sky-500/15 border-sky-400/50 text-white'
                        : 'bg-[#141824] border-white/[0.06] hover:border-white/[0.14] text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-medium">{info.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{info.desc}</div>
                  </button>
                );
              })}
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Synth Volume</span>
                <span className="font-mono-num text-slate-200">
                  {Math.round(cutscene.audioVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={cutscene.audioVolume}
                onChange={(e) =>
                  commitCutscene({
                    ...cutscene,
                    audioVolume: parseFloat(e.target.value),
                  })
                }
                className="w-full studio-slider"
              />
            </div>

            {/* Optional Custom Cutscene SFX Upload */}
            <div className="bg-[#141824] border border-white/[0.07] rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-200">
                  Optional Custom Cutscene SFX
                </span>
                {cutscene.customAudio && (
                  <button
                    type="button"
                    onClick={() =>
                      commitCutscene({ ...cutscene, customAudio: undefined })
                    }
                    className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => sfxInputRef.current?.click()}
                disabled={isEncodingSfx}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-slate-100 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {isEncodingSfx
                    ? 'Processing SFX...'
                    : cutscene.customAudio
                      ? cutscene.customAudio.fileName
                      : 'Upload Custom Drop SFX'}
                </span>
              </button>
            </div>
          </section>
        </aside>
      )}
    </div>
  );
}
