/** Inspector controls for styles and the shared per-layer customization. */
import type { ReactNode } from 'react';
import { variantSwitchPatch } from '../aura/extraDefaults';
import type { AuraLayer, LayerEffectSettings } from '../aura/types';
import {
  COLOR_MODE_LABELS,
  COLOR_MODES,
  EXTRA_NUMBER_LIMITS,
  getLayerVariant,
  LAYER_VARIANTS,
  SYMBOL_TEXT_MAX,
  WEAPON_FORMATION_LABELS,
  WEAPON_FORMATIONS,
  type ExtraNumberKey,
} from '../aura/variants';

const selectClass =
  'w-full bg-[#151a26] border border-white/[0.08] focus:border-amber-500/70 rounded-md px-2.5 py-1.5 text-xs text-slate-100 outline-none';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

interface StyleSelectorProps {
  layer: AuraLayer;
  onUpdateLayer: (id: string, patch: Partial<AuraLayer>) => void;
  onUpdateSettings: (id: string, patch: Partial<LayerEffectSettings>) => void;
}

export function LayerStyleSelector({ layer, onUpdateLayer, onUpdateSettings }: StyleSelectorProps) {
  const active = getLayerVariant(layer);
  return (
    <section className="space-y-3">
      <Field label={`Style (${LAYER_VARIANTS[layer.type].length} available)`}>
        <div className="flex flex-wrap gap-1">
          {LAYER_VARIANTS[layer.type].map((variant) => (
            <button
              key={variant.id}
              type="button"
              aria-pressed={active === variant.id}
              onClick={() => onUpdateLayer(layer.id, variantSwitchPatch(layer, variant.id))}
              className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors cursor-pointer ${
                active === variant.id
                  ? 'bg-amber-500 border-amber-500 text-slate-950 font-semibold'
                  : 'bg-[#151a26] border-white/[0.08] text-slate-300 hover:border-amber-500/50'
              }`}
            >
              {variant.label}
            </button>
          ))}
        </div>
      </Field>

      {layer.type === 'floating_weapons' && (
        <Field label="Formation">
          <select
            className={selectClass}
            value={layer.settings.formation ?? WEAPON_FORMATIONS[0]}
            onChange={(e) =>
              onUpdateSettings(layer.id, {
                formation: e.target.value as LayerEffectSettings['formation'],
              })
            }
          >
            {WEAPON_FORMATIONS.map((f) => (
              <option key={f} value={f}>
                {WEAPON_FORMATION_LABELS[f]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {layer.type === 'floating_symbols' && active === 'custom' && (
        <Field label="Your text or emoji (spaces separate words)">
          <input
            type="text"
            className={selectClass}
            maxLength={SYMBOL_TEXT_MAX}
            value={layer.settings.symbolText ?? ''}
            placeholder="DOM"
            onChange={(e) => onUpdateSettings(layer.id, { symbolText: e.target.value })}
          />
        </Field>
      )}
    </section>
  );
}

const EXTRA_SLIDERS: { key: ExtraNumberKey; label: string; spatial?: boolean }[] = [
  { key: 'colorSpeed', label: 'Color Animation Speed' },
  { key: 'flicker', label: 'Flicker' },
  { key: 'fadeCycle', label: 'Fade In / Out Cycle' },
  { key: 'floatBob', label: 'Float Bobbing', spatial: true },
  { key: 'floatSpeed', label: 'Float Speed', spatial: true },
  { key: 'layerOrbitRadius', label: 'Orbit Whole Layer (radius)', spatial: true },
  { key: 'layerOrbitSpeed', label: 'Layer Orbit Speed', spatial: true },
  { key: 'stretchX', label: 'Stretch Width (X)', spatial: true },
  { key: 'stretchY', label: 'Stretch Height (Y)', spatial: true },
  { key: 'stretchZ', label: 'Stretch Depth (Z)', spatial: true },
];

export function LayerExtraSettings({
  layer,
  onUpdateSettings,
}: Pick<StyleSelectorProps, 'layer' | 'onUpdateSettings'>) {
  const s = layer.settings;
  const isSkin = layer.type === 'glowing_materials';
  const reset = () => {
    const patch: Partial<LayerEffectSettings> = { colorMode: 'static' };
    for (const { key } of EXTRA_SLIDERS) patch[key] = EXTRA_NUMBER_LIMITS[key][2];
    onUpdateSettings(layer.id, patch);
  };
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-200">Extra Customization</h4>
        <button type="button" onClick={reset} className="text-[10px] text-slate-400 hover:text-amber-300 cursor-pointer">
          Reset
        </button>
      </div>
      <Field label="Color Animation">
        <select
          className={selectClass}
          value={s.colorMode ?? 'static'}
          onChange={(e) =>
            onUpdateSettings(layer.id, { colorMode: e.target.value as LayerEffectSettings['colorMode'] })
          }
        >
          {COLOR_MODES.map((m) => (
            <option key={m} value={m}>
              {COLOR_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>
      {EXTRA_SLIDERS.filter((x) => !(isSkin && x.spatial)).map(({ key, label }) => {
        const [min, max, neutral] = EXTRA_NUMBER_LIMITS[key];
        const value = s[key] ?? neutral;
        return (
          <div key={key}>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-400">{label}</span>
              <span className="font-mono-num text-slate-200">{value.toFixed(2)}</span>
            </div>
            <input
              type="range"
              aria-label={label}
              min={min}
              max={max}
              step={0.05}
              value={value}
              onChange={(e) => onUpdateSettings(layer.id, { [key]: parseFloat(e.target.value) })}
              className="w-full studio-slider"
            />
          </div>
        );
      })}
    </section>
  );
}
