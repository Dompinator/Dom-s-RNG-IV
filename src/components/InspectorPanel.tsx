import { Music } from 'lucide-react';
import {
  ANCHOR_LABELS,
  ANCHOR_POINTS,
  ANIMATION_MODES,
  BLEND_MODES,
  EFFECT_CATALOG,
  EMISSION_SHAPES,
  ORBITER_SHAPES,
  TEXTURE_LABELS,
  TEXTURE_REFS,
  type AnimationMode,
  type AuraLayer,
  type LayerAnimationSettings,
  type LayerEffectSettings,
} from '../aura/types';

interface InspectorPanelProps {
  layer: AuraLayer | null;
  hasAudio?: boolean;
  onUpdateLayer: (id: string, patch: Partial<AuraLayer>) => void;
  onUpdateSettings: (id: string, patch: Partial<LayerEffectSettings>) => void;
  onUpdateAnimation: (id: string, patch: Partial<LayerAnimationSettings>) => void;
  onSyncAllToMusic?: (mode: AnimationMode) => void;
}

const EFFECT_LABEL_MAP = Object.fromEntries(
  EFFECT_CATALOG.map((e) => [e.type, e.label]),
) as Record<AuraLayer['type'], string>;

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  onChange: (val: number) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  decimals = 2,
  onChange,
}: SliderRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono-num text-slate-200">
          {decimals === 0 ? Math.round(value) : value.toFixed(decimals)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full studio-slider"
      />
    </div>
  );
}

export function InspectorPanel({
  layer,
  hasAudio = false,
  onUpdateLayer,
  onUpdateSettings,
  onUpdateAnimation,
  onSyncAllToMusic,
}: InspectorPanelProps) {
  if (!layer) {
    return (
      <aside className="w-80 xl:w-[340px] shrink-0 h-full bg-[#0e1119] border-l border-white/[0.08] flex items-center justify-center p-6 text-center select-none">
        <div className="max-w-[220px]">
          <p className="text-sm font-medium text-slate-300">No Layer Selected</p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Select an effect layer from the stack on the left or add a new effect to edit its 3D parameters.
          </p>
        </div>
      </aside>
    );
  }

  const t = layer.type;
  const s = layer.settings;
  const a = layer.animation;

  const showRadius = t !== 'glowing_materials';
  const showSpread = [
    'rotating_rings',
    'orbiting_objects',
    'particle_systems',
    'lightning_effects',
    'energy_ribbons',
    'floating_sparks',
    'light_beams',
  ].includes(t);
  const showThickness = ['rotating_rings', 'lightning_effects', 'energy_ribbons'].includes(t);
  const showTurbulence = [
    'energy_spheres',
    'particle_systems',
    'lightning_effects',
    'energy_ribbons',
    'floating_sparks',
    'distortion_effects',
    'glowing_materials',
  ].includes(t);
  const showTilt = [
    'rotating_rings',
    'orbiting_objects',
    'particle_systems',
    'energy_ribbons',
    'floating_sparks',
    'light_beams',
  ].includes(t);
  const showSegments = [
    'energy_spheres',
    'rotating_rings',
    'lightning_effects',
    'energy_ribbons',
    'distortion_effects',
  ].includes(t);
  const showLifetime = [
    'particle_systems',
    'lightning_effects',
    'floating_sparks',
  ].includes(t);
  const showArcCount = [
    'rotating_rings',
    'lightning_effects',
    'energy_ribbons',
    'light_beams',
  ].includes(t);
  const showParticleCount = [
    'orbiting_objects',
    'particle_systems',
    'floating_sparks',
  ].includes(t);

  return (
    <aside className="w-80 xl:w-[340px] shrink-0 h-full bg-[#0e1119] border-l border-white/[0.08] flex flex-col select-none">
      {/* Inspector Header */}
      <div className="px-4 py-3 border-b border-white/[0.08]">
        <div className="text-[11px] font-medium text-amber-400">
          {EFFECT_LABEL_MAP[layer.type]}
        </div>
        <input
          type="text"
          value={layer.name}
          maxLength={64}
          onChange={(e) => onUpdateLayer(layer.id, { name: e.target.value })}
          className="mt-1 w-full bg-transparent border-b border-white/[0.1] focus:border-amber-500 pb-1 text-sm font-semibold text-white outline-none"
        />
      </div>

      {/* Scrollable Inspector Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Anchor & Blending */}
        <section className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              R6 Body Anchor
            </label>
            <select
              value={layer.anchor}
              onChange={(e) =>
                onUpdateLayer(layer.id, { anchor: e.target.value as AuraLayer['anchor'] })
              }
              className="w-full bg-[#151a26] border border-white/[0.08] focus:border-amber-500/70 rounded-md px-2 py-1.5 text-xs text-slate-100 outline-none"
            >
              {ANCHOR_POINTS.map((pt) => (
                <option key={pt} value={pt}>
                  {ANCHOR_LABELS[pt]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Blend Mode
            </label>
            <select
              value={layer.blendMode}
              onChange={(e) =>
                onUpdateLayer(layer.id, {
                  blendMode: e.target.value as AuraLayer['blendMode'],
                })
              }
              className="w-full bg-[#151a26] border border-white/[0.08] focus:border-amber-500/70 rounded-md px-2 py-1.5 text-xs text-slate-100 outline-none capitalize"
            >
              {BLEND_MODES.map((m) => (
                <option key={m} value={m}>
                  {m === 'additive' ? 'Additive Glow' : 'Normal Alpha'}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Colors & Texture */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-200">
            Color &amp; Surface Pattern
          </h4>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Primary Color
              </label>
              <div className="flex items-center gap-2 bg-[#151a26] border border-white/[0.08] rounded-md px-2 py-1">
                <input
                  type="color"
                  value={layer.color}
                  onChange={(e) => onUpdateLayer(layer.id, { color: e.target.value })}
                  className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                />
                <input
                  type="text"
                  value={layer.color}
                  onChange={(e) => {
                    if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) {
                      onUpdateLayer(layer.id, { color: e.target.value });
                    }
                  }}
                  className="w-full bg-transparent text-[11px] font-mono-num text-slate-200 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Secondary Color
              </label>
              <div className="flex items-center gap-2 bg-[#151a26] border border-white/[0.08] rounded-md px-2 py-1">
                <input
                  type="color"
                  value={layer.secondaryColor}
                  onChange={(e) =>
                    onUpdateLayer(layer.id, { secondaryColor: e.target.value })
                  }
                  className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                />
                <input
                  type="text"
                  value={layer.secondaryColor}
                  onChange={(e) => {
                    if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) {
                      onUpdateLayer(layer.id, { secondaryColor: e.target.value });
                    }
                  }}
                  className="w-full bg-transparent text-[11px] font-mono-num text-slate-200 outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Procedural Texture Asset
            </label>
            <select
              value={layer.textureRef}
              onChange={(e) =>
                onUpdateLayer(layer.id, {
                  textureRef: e.target.value as AuraLayer['textureRef'],
                })
              }
              className="w-full bg-[#151a26] border border-white/[0.08] focus:border-amber-500/70 rounded-md px-2.5 py-1.5 text-xs text-slate-100 outline-none"
            >
              {TEXTURE_REFS.map((ref) => (
                <option key={ref} value={ref}>
                  {TEXTURE_LABELS[ref]}
                </option>
              ))}
            </select>
          </div>
        </section>

        <hr className="border-white/[0.07]" />

        {/* Core Intensity, Glow, Opacity, Scale */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-200">
            Scale &amp; Radiance
          </h4>
          <SliderRow
            label={t === 'glowing_materials' ? 'Shell Expand' : 'Overall Scale'}
            value={s.size}
            min={0.1}
            max={4.0}
            step={0.05}
            onChange={(val) => onUpdateSettings(layer.id, { size: val })}
          />
          <SliderRow
            label="Object Size (Resize)"
            value={s.objectScale ?? 1.0}
            min={0.15}
            max={4.0}
            step={0.05}
            onChange={(val) => onUpdateSettings(layer.id, { objectScale: val })}
          />
          <SliderRow
            label="Intensity"
            value={s.intensity}
            min={0.1}
            max={4.5}
            step={0.05}
            onChange={(val) => onUpdateSettings(layer.id, { intensity: val })}
          />
          <SliderRow
            label="Glow Multiplier"
            value={s.glow}
            min={0.2}
            max={3.5}
            step={0.05}
            onChange={(val) => onUpdateSettings(layer.id, { glow: val })}
          />
          <SliderRow
            label="Opacity"
            value={s.opacity}
            min={0.05}
            max={1.0}
            step={0.02}
            onChange={(val) => onUpdateSettings(layer.id, { opacity: val })}
          />
        </section>

        <hr className="border-white/[0.07]" />

        {/* Effect-Specific Geometry & Emitter Controls */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-200">
            Effect Parameters
          </h4>

          {[
            'particle_systems',
            'rotating_rings',
            'orbiting_objects',
            'lightning_effects',
            'energy_ribbons',
            'floating_sparks',
            'light_beams',
          ].includes(t) && (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                {t === 'particle_systems'
                  ? 'Emission Volume'
                  : t === 'orbiting_objects'
                    ? 'Orbit Path Shape'
                    : t === 'rotating_rings'
                      ? 'Ring Arrangement'
                      : t === 'light_beams'
                        ? 'Beam Layout'
                        : 'Effect Shape'}
              </label>
              <select
                value={s.emissionShape}
                onChange={(e) =>
                  onUpdateSettings(layer.id, {
                    emissionShape: e.target.value as LayerEffectSettings['emissionShape'],
                  })
                }
                className="w-full bg-[#151a26] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-xs text-slate-100 outline-none capitalize"
              >
                {EMISSION_SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {shape.charAt(0).toUpperCase() + shape.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {t === 'orbiting_objects' && (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Satellite Geometry
              </label>
              <select
                value={s.orbiterShape}
                onChange={(e) =>
                  onUpdateSettings(layer.id, {
                    orbiterShape: e.target.value as LayerEffectSettings['orbiterShape'],
                  })
                }
                className="w-full bg-[#151a26] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-xs text-slate-100 outline-none"
              >
                {ORBITER_SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {shape.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showParticleCount && (
            <SliderRow
              label={t === 'orbiting_objects' ? 'Object Count' : 'Particle Count'}
              value={s.particleCount}
              min={t === 'orbiting_objects' ? 1 : 16}
              max={t === 'orbiting_objects' ? 48 : t === 'floating_sparks' ? 600 : 1500}
              step={t === 'orbiting_objects' ? 1 : 10}
              decimals={0}
              onChange={(val) => onUpdateSettings(layer.id, { particleCount: val })}
            />
          )}

          {showArcCount && (
            <SliderRow
              label={
                t === 'rotating_rings'
                  ? 'Concentric Rings'
                  : t === 'light_beams'
                    ? 'Beam Count'
                    : t === 'energy_ribbons'
                      ? 'Ribbon Strands'
                      : 'Arc Bolts'
              }
              value={s.arcCount}
              min={1}
              max={t === 'lightning_effects' ? 16 : 8}
              step={1}
              decimals={0}
              onChange={(val) => onUpdateSettings(layer.id, { arcCount: val })}
            />
          )}

          {showRadius && (
            <SliderRow
              label="Radius"
              value={s.radius}
              min={0.3}
              max={6.0}
              step={0.05}
              onChange={(val) => onUpdateSettings(layer.id, { radius: val })}
            />
          )}

          {showSpread && (
            <SliderRow
              label={t === 'light_beams' ? 'Beam Height' : 'Vertical Spread'}
              value={s.spread}
              min={0.1}
              max={8.0}
              step={0.1}
              onChange={(val) => onUpdateSettings(layer.id, { spread: val })}
            />
          )}

          {showThickness && (
            <SliderRow
              label={t === 'energy_ribbons' ? 'Ribbon Width' : 'Thickness'}
              value={s.thickness}
              min={0.01}
              max={0.65}
              step={0.01}
              onChange={(val) => onUpdateSettings(layer.id, { thickness: val })}
            />
          )}

          {showTurbulence && (
            <SliderRow
              label="Turbulence / Noise"
              value={s.turbulence}
              min={0}
              max={2.0}
              step={0.05}
              onChange={(val) => onUpdateSettings(layer.id, { turbulence: val })}
            />
          )}

          {showLifetime && (
            <SliderRow
              label={t === 'lightning_effects' ? 'Flicker Interval (s)' : 'Lifetime (s)'}
              value={s.lifetime}
              min={t === 'lightning_effects' ? 0.04 : 0.3}
              max={t === 'lightning_effects' ? 0.6 : 6.0}
              step={t === 'lightning_effects' ? 0.02 : 0.1}
              onChange={(val) => onUpdateSettings(layer.id, { lifetime: val })}
            />
          )}

          {showTilt && (
            <SliderRow
              label="Tilt Angle (rad)"
              value={s.tilt}
              min={-1.57}
              max={1.57}
              step={0.03}
              onChange={(val) => onUpdateSettings(layer.id, { tilt: val })}
            />
          )}

          {showSegments && (
            <SliderRow
              label="Geometry Detail"
              value={s.segments}
              min={8}
              max={96}
              step={4}
              decimals={0}
              onChange={(val) => onUpdateSettings(layer.id, { segments: val })}
            />
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={s.reverseDirection}
                onChange={(e) =>
                  onUpdateSettings(layer.id, { reverseDirection: e.target.checked })
                }
                className="accent-amber-500 rounded"
              />
              <span>Reverse Motion</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={s.wireframe}
                onChange={(e) =>
                  onUpdateSettings(layer.id, { wireframe: e.target.checked })
                }
                className="accent-amber-500 rounded"
              />
              <span>Wireframe</span>
            </label>
          </div>
        </section>

        <hr className="border-white/[0.07]" />

        {/* Animation Settings */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-200">
            Animation &amp; Rotation
          </h4>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Movement Mode
            </label>
            <div className="grid grid-cols-3 gap-1 bg-black/35 p-1 rounded-md">
              {ANIMATION_MODES.map((mode) => {
                const active = !a.syncToMusic && a.mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      onUpdateAnimation(layer.id, { mode, syncToMusic: false })
                    }
                    className={`py-1 text-[10px] font-medium rounded capitalize transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onUpdateAnimation(layer.id, { syncToMusic: true })}
                className={`flex items-center justify-center gap-1 py-1 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                  a.syncToMusic
                    ? 'bg-sky-400 text-slate-950 font-semibold'
                    : 'text-sky-300 hover:bg-sky-500/15'
                }`}
              >
                <Music className="w-3 h-3" />
                <span>Music</span>
              </button>
            </div>

            {a.syncToMusic && (
              <div className="mt-2 p-2.5 rounded-md bg-sky-500/10 border border-sky-500/25 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-sky-300 capitalize">
                    Music &gt; {a.mode}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Follows rhythm &amp; beat
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1 bg-black/40 p-1 rounded">
                  {ANIMATION_MODES.map((subMode) => (
                    <button
                      key={subMode}
                      type="button"
                      onClick={() =>
                        onUpdateAnimation(layer.id, {
                          mode: subMode,
                          syncToMusic: true,
                        })
                      }
                      className={`py-1 text-[10px] font-medium rounded capitalize transition-colors cursor-pointer ${
                        a.mode === subMode
                          ? 'bg-sky-400 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {subMode}
                    </button>
                  ))}
                </div>
                {onSyncAllToMusic && (
                  <button
                    type="button"
                    onClick={() => onSyncAllToMusic(a.mode)}
                    className="w-full py-1 px-2 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-[10px] font-semibold text-sky-200 transition-colors cursor-pointer capitalize"
                  >
                    Apply Music &gt; {a.mode} to All Layers
                  </button>
                )}
                {!hasAudio && (
                  <p className="text-[10px] text-amber-300 leading-snug">
                    Upload a song in the Layers footer or Aura &amp; Rarity tab to drive Music Sync.
                  </p>
                )}
              </div>
            )}
          </div>

          <SliderRow
            label="Playback Speed"
            value={a.speed}
            min={0}
            max={4.0}
            step={0.05}
            onChange={(val) => onUpdateAnimation(layer.id, { speed: val })}
          />
          <SliderRow
            label={a.syncToMusic ? 'Music Reactivity' : 'Pulse Amplitude'}
            value={a.amplitude}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(val) => onUpdateAnimation(layer.id, { amplitude: val })}
          />
          <SliderRow
            label="Pulse Frequency"
            value={a.frequency}
            min={0.2}
            max={8.0}
            step={0.1}
            onChange={(val) => onUpdateAnimation(layer.id, { frequency: val })}
          />

          <div className="grid grid-cols-3 gap-2 pt-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <div key={axis}>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                  Spin {axis}
                </label>
                <input
                  type="number"
                  step={0.1}
                  min={-10}
                  max={10}
                  value={a.rotationSpeed[axis]}
                  onChange={(e) =>
                    onUpdateAnimation(layer.id, {
                      rotationSpeed: {
                        ...a.rotationSpeed,
                        [axis]: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full bg-[#151a26] border border-white/[0.08] rounded px-2 py-1 text-xs font-mono-num text-slate-200 outline-none focus:border-amber-500/70"
                />
              </div>
            ))}
          </div>
        </section>

        <hr className="border-white/[0.07]" />

        {/* Local Transform Offsets */}
        <section className="space-y-2.5 pb-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-200">
              Local Offset (X / Y / Z)
            </h4>
            <span className="text-[10px] text-slate-500">Or drag 3D arrows</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <div key={axis}>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase">
                  Pos {axis}
                </label>
                <input
                  type="number"
                  step={0.1}
                  min={-6}
                  max={6}
                  value={layer.position[axis]}
                  onChange={(e) =>
                    onUpdateLayer(layer.id, {
                      position: {
                        ...layer.position,
                        [axis]: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full bg-[#151a26] border border-white/[0.08] rounded px-2 py-1 text-xs font-mono-num text-slate-200 outline-none focus:border-amber-500/70"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
