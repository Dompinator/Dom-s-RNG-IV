import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Music,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { encodeAudioFileForAura } from '../aura/audioEncoder';
import { classifyBaseOdds, formatOdds, RARITY_COLOR_STYLES } from '../aura/rarity';
import {
  ANCHOR_LABELS,
  AURA_POSE_PRESETS,
  EFFECT_CATALOG,
  POSE_PRESET_META,
  type AuraAudioConfig,
  type AuraEnvironment,
  type AuraLayer,
  type AuraPosePreset,
  type AuraProject,
} from '../aura/types';

interface LayerPanelProps {
  project: AuraProject;
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onOpenAddModal: () => void;
  onToggleVisibility: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onMoveLayer: (id: string, direction: 'up' | 'down') => void;
  onUpdateProjectMeta: (patch: Partial<Pick<AuraProject, 'name' | 'description' | 'author'>>) => void;
  onUpdateBaseOdds: (baseOdds: number) => void;
  onUpdateEnvironment: (patch: Partial<AuraEnvironment>) => void;
  onUpdateAudio: (audio: AuraAudioConfig | undefined) => void;
  onSetPosePreset: (pose: AuraPosePreset) => void;
  onToggleAllMusicSync: (enabled: boolean) => void;
  onNotify: (text: string, kind?: 'info' | 'error') => void;
}

const EFFECT_LABEL_MAP = Object.fromEntries(
  EFFECT_CATALOG.map((e) => [e.type, e.label]),
) as Record<AuraLayer['type'], string>;

const QUICK_ODDS = [
  { label: '100K', value: 100_000 },
  { label: '1M (Epic)', value: 1_000_000 },
  { label: '10M (Leg.)', value: 10_000_000 },
  { label: '100M (Myth.)', value: 100_000_000 },
];

export function LayerPanel({
  project,
  selectedLayerId,
  onSelectLayer,
  onOpenAddModal,
  onToggleVisibility,
  onDuplicateLayer,
  onDeleteLayer,
  onMoveLayer,
  onUpdateProjectMeta,
  onUpdateBaseOdds,
  onUpdateEnvironment,
  onUpdateAudio,
  onSetPosePreset,
  onToggleAllMusicSync,
  onNotify,
}: LayerPanelProps) {
  const [tab, setTab] = useState<'layers' | 'aura'>('layers');
  const [isEncodingAudio, setIsEncodingAudio] = useState(false);
  const songInputRef = useRef<HTMLInputElement | null>(null);

  const rarityStyle = RARITY_COLOR_STYLES[project.rarity.classification];
  const previewRarity = classifyBaseOdds(project.rarity.baseOdds);
  const activePose: AuraPosePreset =
    project.posePreset ?? (project.levitate ? 'levitate' : 'idle');
  const syncedLayerCount = project.layers.filter((l) => l.animation.syncToMusic).length;
  const allLayersSynced =
    project.layers.length > 0 && syncedLayerCount === project.layers.length;

  const handleSongFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsEncodingAudio(true);
    try {
      const { audio, optimizedNote } = await encodeAudioFileForAura(file, project.audio);
      onUpdateAudio(audio);
      onNotify(
        optimizedNote ?? `Attached spatial aura song "${audio.fileName}".`,
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Failed to load audio file.',
        'error',
      );
    } finally {
      setIsEncodingAudio(false);
    }
  };

  return (
    <aside className="w-72 xl:w-80 shrink-0 h-full bg-[#0e1119] border-r border-white/[0.08] flex flex-col select-none">
      {/* Segmented Panel Switch */}
      <div className="p-2.5 border-b border-white/[0.08]">
        <div className="grid grid-cols-2 gap-1 bg-black/35 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('layers')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'layers'
                ? 'bg-[#1a2030] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Layers ({project.layers.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('aura')}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'aura'
                ? 'bg-[#1a2030] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Aura &amp; Rarity</span>
          </button>
        </div>
      </div>

      {/* Hidden Audio Upload Input */}
      <input
        ref={songInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
        onChange={handleSongFileChange}
        className="hidden"
      />

      {tab === 'layers' ? (
        <>
          <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Effect Stack
            </span>
            <button
              type="button"
              onClick={onOpenAddModal}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Layer</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {project.layers.length === 0 ? (
              <div className="p-4 text-center border border-dashed border-white/[0.1] rounded-lg m-2">
                <p className="text-xs text-slate-400 mb-3">
                  This aura has no effect layers yet.
                </p>
                <button
                  type="button"
                  onClick={onOpenAddModal}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-white transition-colors cursor-pointer"
                >
                  Add First Effect
                </button>
              </div>
            ) : (
              project.layers.map((layer, index) => {
                const isSelected = layer.id === selectedLayerId;
                return (
                  <div
                    key={layer.id}
                    onClick={() => onSelectLayer(layer.id)}
                    className={`group rounded-lg p-2.5 border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#171d2c] border-amber-500/60'
                        : 'bg-[#121621] border-white/[0.06] hover:border-white/[0.14]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20"
                          style={{
                            background: `linear-gradient(135deg, ${layer.color}, ${layer.secondaryColor})`,
                          }}
                        />
                        <span
                          className={`text-xs font-medium truncate ${
                            layer.visible ? 'text-slate-100' : 'text-slate-500 line-through'
                          }`}
                        >
                          {layer.name}
                        </span>
                      </div>

                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onToggleVisibility(layer.id)}
                          title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                        >
                          {layer.visible ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveLayer(layer.id, 'up')}
                          disabled={index === 0}
                          title="Move Up"
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveLayer(layer.id, 'down')}
                          disabled={index === project.layers.length - 1}
                          title="Move Down"
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateLayer(layer.id)}
                          title="Duplicate Layer"
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteLayer(layer.id)}
                          title="Delete Layer"
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-white/[0.08] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 pl-4">
                      <span className="truncate">{EFFECT_LABEL_MAP[layer.type]}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{ANCHOR_LABELS[layer.anchor]}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Upload Song Bar directly accessible in Layers tab */}
          <div className="p-2.5 border-t border-white/[0.08] bg-[#0b0e16] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Music className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-[11px] text-slate-300 truncate">
                  {project.audio ? project.audio.fileName : 'No aura song attached'}
                </span>
              </div>
              {project.audio && (
                <button
                  type="button"
                  onClick={() => onUpdateAudio(undefined)}
                  title="Remove Aura Song"
                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-white/[0.06] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => songInputRef.current?.click()}
              disabled={isEncodingAudio}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {isEncodingAudio
                  ? 'Processing Audio...'
                  : project.audio
                    ? 'Replace Song'
                    : 'Upload Song'}
              </span>
            </button>
            {project.audio && project.layers.length > 0 && (
              <button
                type="button"
                onClick={() => onToggleAllMusicSync(!allLayersSynced)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-colors cursor-pointer ${
                  allLayersSynced
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300'
                }`}
              >
                <span>Sync All Movement to Song</span>
                <span className="font-mono-num">
                  {syncedLayerCount}/{project.layers.length}
                </span>
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
          {/* Identity */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-200">
              Aura Identity
            </h3>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Aura Name
              </label>
              <input
                type="text"
                value={project.name}
                onChange={(e) => onUpdateProjectMeta({ name: e.target.value })}
                maxLength={64}
                className="w-full bg-[#151a26] border border-white/[0.08] focus:border-amber-500/70 rounded-md px-2.5 py-1.5 text-xs text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Creator / Author
              </label>
              <input
                type="text"
                value={project.author}
                onChange={(e) => onUpdateProjectMeta({ author: e.target.value })}
                maxLength={64}
                className="w-full bg-[#151a26] border border-white/[0.08] focus:border-amber-500/70 rounded-md px-2.5 py-1.5 text-xs text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={project.description}
                onChange={(e) => onUpdateProjectMeta({ description: e.target.value })}
                maxLength={400}
                className="w-full bg-[#151a26] border border-white/[0.08] focus:border-amber-500/70 rounded-md px-2.5 py-1.5 text-xs text-slate-200 outline-none resize-none"
              />
            </div>
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-slate-300">
                  In-Game Character Pose
                </label>
                <span className="text-[10px] text-amber-300 font-medium">
                  {POSE_PRESET_META[activePose].floats ? 'Floating Stance' : 'Grounded Stance'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {AURA_POSE_PRESETS.map((poseKey) => {
                  const meta = POSE_PRESET_META[poseKey];
                  const selected = activePose === poseKey;
                  return (
                    <button
                      key={poseKey}
                      type="button"
                      onClick={() => onSetPosePreset(poseKey)}
                      className={`text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-amber-500/15 border-amber-500/50 text-white'
                          : 'bg-[#141824] border-white/[0.06] hover:border-white/[0.14] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{meta.label}</span>
                        <span className="text-[10px] text-slate-400">
                          {meta.floats ? 'Hover' : 'Ground'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                        {meta.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <hr className="border-white/[0.07]" />

          {/* Future Game Rarity Classification */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200">
                Base Rarity &amp; Classification
              </h3>
              <span className={`text-xs font-semibold ${rarityStyle.text}`}>
                {previewRarity.classification}
              </span>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Base Rarity Odds (1 in N)
              </label>
              <input
                type="number"
                min={1}
                max={1000000000000}
                value={project.rarity.baseOdds}
                onChange={(e) => onUpdateBaseOdds(Number(e.target.value) || 1)}
                className="w-full bg-[#151a26] border border-white/[0.08] focus:border-amber-500/70 rounded-md px-2.5 py-1.5 text-xs font-mono-num text-white outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ODDS.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => onUpdateBaseOdds(q.value)}
                  className="px-2 py-1 text-[11px] font-medium rounded bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 border border-white/[0.06] transition-colors cursor-pointer"
                >
                  {q.label}
                </button>
              ))}
            </div>

            <div className="bg-[#141824] border border-white/[0.06] rounded-lg p-2.5 space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span>Display Odds</span>
                <span className="font-mono-num text-slate-200">
                  {formatOdds(previewRarity.baseOdds)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tier Rule</span>
                <span className="text-slate-300">{rarityStyle.description.split(' · ')[0]}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Global Chat Alert</span>
                <span
                  className={
                    previewRarity.globalAnnouncement ? 'text-rose-400 font-medium' : 'text-slate-500'
                  }
                >
                  {previewRarity.globalAnnouncement ? 'Mythic Broadcast' : 'None'}
                </span>
              </div>
            </div>
          </section>

          <hr className="border-white/[0.07]" />

          {/* Environment & Post-Processing */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-200">
              Studio Atmosphere &amp; Bloom
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Backdrop
                </label>
                <div className="flex items-center gap-2 bg-[#151a26] border border-white/[0.08] rounded-md px-2 py-1">
                  <input
                    type="color"
                    value={project.environment.backgroundColor}
                    onChange={(e) =>
                      onUpdateEnvironment({ backgroundColor: e.target.value })
                    }
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                  <span className="text-[11px] font-mono-num text-slate-300">
                    {project.environment.backgroundColor}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Rim Light
                </label>
                <div className="flex items-center gap-2 bg-[#151a26] border border-white/[0.08] rounded-md px-2 py-1">
                  <input
                    type="color"
                    value={project.environment.ambientRimColor}
                    onChange={(e) =>
                      onUpdateEnvironment({ ambientRimColor: e.target.value })
                    }
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                  <span className="text-[11px] font-mono-num text-slate-300">
                    {project.environment.ambientRimColor}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Bloom Strength</span>
                <span className="font-mono-num text-slate-200">
                  {project.environment.bloomStrength.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2.2}
                step={0.05}
                value={project.environment.bloomStrength}
                onChange={(e) =>
                  onUpdateEnvironment({ bloomStrength: parseFloat(e.target.value) })
                }
                className="w-full studio-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Bloom Radius</span>
                <span className="font-mono-num text-slate-200">
                  {project.environment.bloomRadius.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={project.environment.bloomRadius}
                onChange={(e) =>
                  onUpdateEnvironment({ bloomRadius: parseFloat(e.target.value) })
                }
                className="w-full studio-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Bloom Threshold</span>
                <span className="font-mono-num text-slate-200">
                  {project.environment.bloomThreshold.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={project.environment.bloomThreshold}
                onChange={(e) =>
                  onUpdateEnvironment({ bloomThreshold: parseFloat(e.target.value) })
                }
                className="w-full studio-slider"
              />
            </div>
          </section>

          <hr className="border-white/[0.07]" />

          {/* Spatial 3D Aura Audio */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-sky-400" />
                <span>Spatial Aura Song</span>
              </h3>
              {project.audio && (
                <button
                  type="button"
                  onClick={() => onUpdateAudio(undefined)}
                  className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Plays directly from the character&apos;s aura in 3D space so nearby players hear it coming from the aura.
            </p>

            <button
              type="button"
              onClick={() => songInputRef.current?.click()}
              disabled={isEncodingAudio}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {isEncodingAudio
                  ? 'Processing Audio...'
                  : project.audio
                    ? 'Replace Song File'
                    : 'Upload Song'}
              </span>
            </button>

            {project.audio && (
              <div className="bg-[#141824] border border-white/[0.07] rounded-lg p-3 space-y-3">
                <label className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.06] cursor-pointer">
                  <div>
                    <div className="text-[11px] font-semibold text-sky-300">
                      Sync All Movement to Song
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Every layer follows the song&apos;s rhythm ({syncedLayerCount}/{project.layers.length})
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allLayersSynced}
                    onChange={(e) => onToggleAllMusicSync(e.target.checked)}
                    className="accent-sky-400 w-4 h-4 shrink-0"
                  />
                </label>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-100 truncate">
                    {project.audio.fileName}
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={project.audio.loop}
                      onChange={(e) =>
                        onUpdateAudio({
                          ...project.audio!,
                          loop: e.target.checked,
                        })
                      }
                      className="accent-sky-400"
                    />
                    <span>Loop</span>
                  </label>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Volume</span>
                    <span className="font-mono-num text-slate-200">
                      {Math.round(project.audio.volume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={project.audio.volume}
                    onChange={(e) =>
                      onUpdateAudio({
                        ...project.audio!,
                        volume: parseFloat(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Full Volume Radius</span>
                    <span className="font-mono-num text-slate-200">
                      {project.audio.refDistance.toFixed(0)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={25}
                    step={1}
                    value={project.audio.refDistance}
                    onChange={(e) =>
                      onUpdateAudio({
                        ...project.audio!,
                        refDistance: parseFloat(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Max Hearing Range</span>
                    <span className="font-mono-num text-slate-200">
                      {project.audio.maxDistance.toFixed(0)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={120}
                    step={2}
                    value={project.audio.maxDistance}
                    onChange={(e) =>
                      onUpdateAudio({
                        ...project.audio!,
                        maxDistance: parseFloat(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Distance Falloff</span>
                    <span className="font-mono-num text-slate-200">
                      {project.audio.rolloffFactor.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={3.5}
                    step={0.1}
                    value={project.audio.rolloffFactor}
                    onChange={(e) =>
                      onUpdateAudio({
                        ...project.audio!,
                        rolloffFactor: parseFloat(e.target.value),
                      })
                    }
                    className="w-full studio-slider"
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
