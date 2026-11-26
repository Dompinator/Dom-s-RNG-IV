import {
  Camera,
  ChevronDown,
  ChevronUp,
  Grid3x3,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AuraProject,
  CameraPreset,
  CharacterPoseMode,
} from '../aura/types';
import { AuraViewportEngine } from '../engine/AuraViewportEngine';

interface ViewportCanvasProps {
  project: AuraProject;
  zenMode: boolean;
  onToggleZenMode: () => void;
  onSetLevitate: (levitate: boolean) => void;
}

const POSE_OPTIONS: { value: CharacterPoseMode; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  { value: 'levitate', label: 'Levitate' },
  { value: 'tpose', label: 'T-Pose' },
  { value: 'paused', label: 'Freeze' },
];

const CAMERA_OPTIONS: { value: CameraPreset; label: string }[] = [
  { value: 'hero', label: '3/4 Hero' },
  { value: 'front', label: 'Front' },
  { value: 'closeup', label: 'Close' },
  { value: 'top', label: 'Top' },
  { value: 'low', label: 'Low' },
];

export function ViewportCanvas({
  project,
  zenMode,
  onToggleZenMode,
  onSetLevitate,
}: ViewportCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AuraViewportEngine | null>(null);

  const [contextLost, setContextLost] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [timeScale, setTimeScale] = useState(1.0);
  const [poseMode, setPoseMode] = useState<CharacterPoseMode>(
    project.levitate ? 'levitate' : 'idle',
  );
  const [showGrid, setShowGrid] = useState(true);
  const [showStage, setShowStage] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);

  // Initialize Three.js engine once on mount
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new AuraViewportEngine(container, {
      onContextLost: () => setContextLost(true),
      onContextRestored: () => setContextLost(false),
    });
    engineRef.current = engine;
    engine.setProject(project);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push live aura edits directly into the running 3D scene
  useEffect(() => {
    engineRef.current?.setProject(project);
  }, [project]);

  useEffect(() => {
    engineRef.current?.setPlaying(playing);
  }, [playing]);

  useEffect(() => {
    engineRef.current?.setTimeScale(timeScale);
  }, [timeScale]);

  // Sync poseMode when project.levitate changes or project switches
  useEffect(() => {
    setPoseMode((curr) => {
      if (project.levitate) return 'levitate';
      return curr === 'levitate' ? 'idle' : curr;
    });
  }, [project.id, project.levitate]);

  useEffect(() => {
    engineRef.current?.setPoseMode(poseMode);
  }, [poseMode]);

  useEffect(() => {
    engineRef.current?.setStageOptions({ showGrid, showStage });
  }, [showGrid, showStage]);

  useEffect(() => {
    engineRef.current?.setAudioMuted(audioMuted);
  }, [audioMuted]);

  // Re-measure canvas when panels toggle
  useEffect(() => {
    const id = window.setTimeout(() => {
      engineRef.current?.handleResize();
    }, 60);
    return () => clearTimeout(id);
  }, [zenMode]);

  return (
    <div className="relative flex-1 h-full min-w-0 bg-[#090b10] overflow-hidden select-none">
      {/* Isolated WebGL mount node */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#090b10]/95 text-center p-6">
          <div className="max-w-sm border border-white/10 bg-[#111520] rounded-lg p-6">
            <h3 className="font-display text-base font-semibold text-white mb-2">
              WebGL Context Interrupted
            </h3>
            <p className="text-sm text-slate-400">
              The graphics driver reset the 3D viewport. Waiting for restoration or refresh the page to continue editing.
            </p>
          </div>
        </div>
      )}

      {/* Subtle top-left viewport hint & Zen toggle */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2.5 bg-[#0f131d]/90 border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-slate-400">
          <span className="text-slate-200 font-medium">R6 Preview</span>
          <span aria-hidden="true">·</span>
          <span>Drag to orbit</span>
          <span aria-hidden="true">·</span>
          <span>Scroll to zoom</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-num text-slate-300">
            {project.layers.filter((l) => l.visible).length}/{project.layers.length} active
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5">
          {project.audio && (
            <button
              type="button"
              onClick={() => setAudioMuted((m) => !m)}
              title={audioMuted ? 'Unmute Aura Song' : 'Mute Aura Song'}
              className="flex items-center gap-1.5 bg-[#0f131d]/90 hover:bg-[#181e2c] border border-white/[0.08] text-slate-200 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer"
            >
              {audioMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span className="hidden sm:inline whitespace-nowrap">
                {audioMuted ? 'Muted' : 'Aura Audio'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleZenMode}
            title={zenMode ? 'Show Studio Panels' : 'Expand Full Viewport'}
            className="flex items-center gap-1.5 bg-[#0f131d]/90 hover:bg-[#181e2c] border border-white/[0.08] text-slate-200 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer"
          >
            {zenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="whitespace-nowrap">{zenMode ? 'Show Panels' : 'Full Viewport'}</span>
          </button>
        </div>
      </div>

      {/* Unified Bottom Viewport Control Dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[96%]">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="mb-1.5 flex items-center gap-1 bg-[#0f131d]/95 hover:bg-[#171c2b] border border-white/[0.08] rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="flex flex-wrap items-center justify-center gap-2 bg-[#0f131d]/95 border border-white/[0.09] rounded-lg px-3 py-2 shadow-2xl">
            {/* Playback */}
            <div className="flex items-center gap-1 pr-2 border-r border-white/[0.08]">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                title={playing ? 'Pause Simulation' : 'Play Simulation'}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-slate-100 transition-colors cursor-pointer"
              >
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.restartSimulation()}
                title="Restart Effect Cycle"
                className="flex items-center justify-center w-8 h-8 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center bg-black/30 rounded-md p-0.5 ml-1">
                {[0.5, 1, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setTimeScale(spd)}
                    className={`px-2 py-1 text-[11px] font-mono-num rounded transition-colors cursor-pointer ${
                      timeScale === spd
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* R6 Pose */}
            <div className="flex items-center gap-1 pr-2 border-r border-white/[0.08]">
              <span className="text-[11px] text-slate-500 mr-1 hidden sm:inline">Pose</span>
              <div className="flex items-center bg-black/30 rounded-md p-0.5">
                {POSE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPoseMode(opt.value);
                      if (opt.value === 'levitate') {
                        onSetLevitate(true);
                      } else if (opt.value === 'idle') {
                        onSetLevitate(false);
                      }
                    }}
                    className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors cursor-pointer ${
                      poseMode === opt.value
                        ? 'bg-white/[0.14] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Camera Presets */}
            <div className="flex items-center gap-1 pr-2 border-r border-white/[0.08]">
              <Camera className="w-3.5 h-3.5 text-slate-500 mr-0.5 hidden sm:inline" />
              {CAMERA_OPTIONS.map((cam) => (
                <button
                  key={cam.value}
                  type="button"
                  onClick={() => engineRef.current?.setCameraPreset(cam.value)}
                  className="px-2 py-1 text-[11px] font-medium rounded bg-white/[0.04] hover:bg-white/[0.12] text-slate-300 hover:text-white whitespace-nowrap transition-colors cursor-pointer"
                >
                  {cam.label}
                </button>
              ))}
            </div>

            {/* Stage / Grid */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowGrid((g) => !g)}
                title="Toggle Floor Grid"
                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  showGrid
                    ? 'bg-white/[0.12] text-slate-100'
                    : 'bg-white/[0.03] text-slate-500 hover:text-slate-300'
                }`}
              >
                <Grid3x3 className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setShowStage((s) => !s)}
                title="Toggle Studio Pedestal"
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  showStage
                    ? 'bg-white/[0.12] text-slate-100'
                    : 'bg-white/[0.03] text-slate-500 hover:text-slate-300'
                }`}
              >
                Stage
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
