/** Validation for the optional layer settings. Absent values stay absent. */
import type { EffectType, LayerEffectSettings } from './types';
import {
  COLOR_MODES,
  EXTRA_NUMBER_LIMITS,
  LAYER_VARIANTS,
  SYMBOL_TEXT_MAX,
  WEAPON_FORMATIONS,
  type ExtraNumberKey,
} from './variants';

export function sanitizeExtraSettings(
  type: EffectType,
  raw: Record<string, unknown>,
): Partial<LayerEffectSettings> {
  const out: Partial<LayerEffectSettings> = {};
  if (typeof raw.variant === 'string' && LAYER_VARIANTS[type].some((v) => v.id === raw.variant)) {
    out.variant = raw.variant;
  }
  const formation = WEAPON_FORMATIONS.find((f) => f === raw.formation);
  if (formation) out.formation = formation;
  const colorMode = COLOR_MODES.find((m) => m === raw.colorMode);
  if (colorMode) out.colorMode = colorMode;
  if (typeof raw.symbolText === 'string') {
    out.symbolText = raw.symbolText.replace(/[<>\u0000-\u001f]/g, '').slice(0, SYMBOL_TEXT_MAX);
  }
  for (const key of Object.keys(EXTRA_NUMBER_LIMITS) as ExtraNumberKey[]) {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const [min, max] = EXTRA_NUMBER_LIMITS[key];
    out[key] = Math.max(min, Math.min(max, value));
  }
  return out;
}
