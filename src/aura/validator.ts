import { classifyBaseOdds } from './rarity';
import {
  ANCHOR_POINTS,
  ANIMATION_MODES,
  AURA_FORMAT_VERSION,
  AURA_POSE_PRESETS,
  AURA_TARGET_ENGINE,
  BLEND_MODES,
  CUTSCENE_AUDIO_PRESETS,
  CUTSCENE_FONT_STYLES,
  CUTSCENE_MOTIONS,
  CUTSCENE_PHASES,
  CUTSCENE_SHAPES,
  CUTSCENE_TIER_META,
  CUTSCENE_TIERS,
  EFFECT_TYPES,
  EMISSION_SHAPES,
  ORBITER_SHAPES,
  POSE_PRESET_META,
  TEXTURE_REFS,
  type AuraAudioConfig,
  type AuraCutsceneConfig,
  type AuraLayer,
  type AuraPosePreset,
  type AuraProject,
  type CutsceneCustomAudio,
  type CutsceneElement,
  type CutsceneTier,
  type Vec3,
} from './types';

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeColor(c: unknown, fallback: string): string {
  if (typeof c !== 'string') return fallback;
  const trimmed = c.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
}

function sanitizeString(s: unknown, fallback: string, maxLen = 120): string {
  if (typeof s !== 'string') return fallback;
  const cleaned = s.replace(/[<>]/g, '').trim();
  return cleaned ? cleaned.slice(0, maxLen) : fallback;
}

function sanitizeEnum<T extends string>(
  val: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof val === 'string' && (allowed as readonly string[]).includes(val)
    ? (val as T)
    : fallback;
}

function sanitizeVec3(v: unknown, min: number, max: number, fallback: Vec3): Vec3 {
  if (!v || typeof v !== 'object') return { ...fallback };
  const rec = v as Record<string, unknown>;
  return {
    x: clamp(rec.x, min, max, fallback.x),
    y: clamp(rec.y, min, max, fallback.y),
    z: clamp(rec.z, min, max, fallback.z),
  };
}

function isSafeAudioDataUrl(rawUrl: string, maxLength: number): boolean {
  return (
    rawUrl.length > 0 &&
    rawUrl.length <= maxLength &&
    /^data:audio\/[a-zA-Z0-9.+_-]+(?:;[a-zA-Z0-9.=_-]+)*;base64,[A-Za-z0-9+/=]+$/.test(
      rawUrl,
    )
  );
}

function sanitizeCutsceneConfig(
  raw: unknown,
  existingAudioLen: number,
  warnings: string[],
): AuraCutsceneConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const c = raw as Record<string, unknown>;
  const rawTier = c.tier === 'legendary_mythic' ? 'epic' : c.tier;
  const tier: CutsceneTier = sanitizeEnum(rawTier, CUTSCENE_TIERS, 'epic');
  const tierMeta = CUTSCENE_TIER_META[tier];
  const rawElements = Array.isArray(c.elements) ? c.elements.slice(0, 24) : [];
  if (Array.isArray(c.elements) && c.elements.length > 24) {
    warnings.push('Cutscene element count capped at 24.');
  }

  const elements: CutsceneElement[] = [];
  for (let i = 0; i < rawElements.length; i++) {
    const item = rawElements[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const el = item as Record<string, unknown>;
    const cleanText =
      typeof el.text === 'string'
        ? el.text.replace(/[<>]/g, '').slice(0, 80)
        : undefined;
    elements.push({
      id: sanitizeString(el.id, `cut_${i}_${Math.random().toString(36).slice(2, 6)}`, 48),
      name: sanitizeString(el.name, `Shape ${i + 1}`, 48),
      shape: sanitizeEnum(el.shape, CUTSCENE_SHAPES, 'four_point_star'),
      visible: typeof el.visible === 'boolean' ? el.visible : true,
      phase: sanitizeEnum(el.phase, CUTSCENE_PHASES, 'all'),
      motion: sanitizeEnum(el.motion, CUTSCENE_MOTIONS, 'spin_cw'),
      color: sanitizeColor(el.color, '#fbbf24'),
      secondaryColor: sanitizeColor(el.secondaryColor, '#38bdf8'),
      x: clamp(el.x, -50, 50, 0),
      y: clamp(el.y, -50, 50, 0),
      size: clamp(el.size, 0.2, 3.0, 1.0),
      speed: clamp(el.speed, 0, 4.0, 1.2),
      opacity: clamp(el.opacity, 0.05, 1.0, 0.9),
      glow: clamp(el.glow, 0, 2.5, 1.4),
      count: Math.round(clamp(el.count, 1, 24, 6)),
      rotation: clamp(el.rotation, -180, 180, 0),
      ...(cleanText !== undefined ? { text: cleanText } : {}),
      ...(typeof el.fontStyle === 'string'
        ? { fontStyle: sanitizeEnum(el.fontStyle, CUTSCENE_FONT_STYLES, 'display') }
        : {}),
      ...(typeof el.startTime === 'number'
        ? { startTime: clamp(el.startTime, 0, 30, 0) }
        : {}),
      ...(typeof el.duration === 'number'
        ? { duration: clamp(el.duration, 0.1, 30, 2.5) }
        : {}),
    });
  }

  let customAudio: CutsceneCustomAudio | undefined;
  if (c.customAudio && typeof c.customAudio === 'object' && !Array.isArray(c.customAudio)) {
    const ca = c.customAudio as Record<string, unknown>;
    const rawUrl = typeof ca.dataUrl === 'string' ? ca.dataUrl.trim() : '';
    const maxRemaining = Math.max(0, 880_000 - existingAudioLen);
    const maxAllowed = Math.min(350_000, maxRemaining);
    if (maxAllowed > 0 && isSafeAudioDataUrl(rawUrl, maxAllowed)) {
      customAudio = {
        fileName: sanitizeString(ca.fileName, 'cutscene-sfx.audio', 96),
        mimeType: sanitizeString(ca.mimeType, 'audio/mpeg', 48),
        dataUrl: rawUrl,
        volume: clamp(ca.volume, 0, 1, 0.85),
      };
    } else if (rawUrl.length > 0) {
      warnings.push('Ignored oversized or unsupported cutscene custom audio payload.');
    }
  }

  const headlineText =
    typeof c.headlineText === 'string'
      ? c.headlineText.replace(/[<>]/g, '').trim().slice(0, 80)
      : '';

  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : true,
    tier,
    duration: clamp(c.duration, 1.0, 30.0, tierMeta.defaultDuration),
    primaryColor: sanitizeColor(c.primaryColor, '#fbbf24'),
    secondaryColor: sanitizeColor(c.secondaryColor, '#38bdf8'),
    backgroundColor: sanitizeColor(c.backgroundColor, '#020308'),
    headlineText,
    showHeadlineText: c.showHeadlineText === true,
    showRevealText:
      typeof c.showRevealText === 'boolean' ? c.showRevealText : true,
    shakeIntensity: clamp(c.shakeIntensity, 0, 2.5, tier === 'under_epic' ? 0.75 : 1.5),
    flashIntensity: clamp(c.flashIntensity, 0, 2.5, tier === 'under_epic' ? 1.0 : 1.5),
    audioPreset: sanitizeEnum(c.audioPreset, CUTSCENE_AUDIO_PRESETS, 'cosmic_sub_drop'),
    audioVolume: clamp(c.audioVolume, 0, 1, 0.9),
    ...(customAudio ? { customAudio } : {}),
    elements,
  };
}

export interface ValidationResult {
  ok: true;
  project: AuraProject;
  warnings: string[];
}

export interface ValidationError {
  ok: false;
  error: string;
}

/**
 * Strictly validates and sanitizes an untrusted JSON payload into a safe AuraProject.
 * Rejects executable strings, unknown effect types, or malformed structures.
 */
export function validateAuraProject(raw: unknown): ValidationResult | ValidationError {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Aura file must be a JSON object.' };
  }

  const obj = raw as Record<string, unknown>;
  const warnings: string[] = [];

  if (!Array.isArray(obj.layers)) {
    return { ok: false, error: 'Missing or invalid "layers" array in aura configuration.' };
  }

  // Reject any suspicious executable keys if someone tried to inject scripts
  const forbiddenKeys = ['script', 'code', 'vertexShader', 'fragmentShader', 'eval', 'glsl'];
  for (const key of forbiddenKeys) {
    if (key in obj) {
      warnings.push(`Ignored unsupported custom field "${key}" for security.`);
    }
  }

  const rawLayers = obj.layers.slice(0, 48);
  if (obj.layers.length > 48) {
    warnings.push('Layer count capped at 48 for performance.');
  }

  const layers: AuraLayer[] = [];
  for (let i = 0; i < rawLayers.length; i++) {
    const item = rawLayers[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push(`Skipped invalid layer at index ${i}.`);
      continue;
    }
    const l = item as Record<string, unknown>;
    const type = sanitizeEnum(l.type, EFFECT_TYPES, 'energy_spheres');
    if (l.type !== type) {
      warnings.push(`Layer "${String(l.name ?? i)}" had unknown type; defaulted to ${type}.`);
    }

    const animRaw = (l.animation && typeof l.animation === 'object' ? l.animation : {}) as Record<string, unknown>;
    const setRaw = (l.settings && typeof l.settings === 'object' ? l.settings : {}) as Record<string, unknown>;

    layers.push({
      id: sanitizeString(l.id, `lyr_${i}_${Math.random().toString(36).slice(2, 6)}`, 48),
      name: sanitizeString(l.name, `Layer ${i + 1}`, 64),
      type,
      visible: typeof l.visible === 'boolean' ? l.visible : true,
      anchor: sanitizeEnum(l.anchor, ANCHOR_POINTS, 'root'),
      blendMode: sanitizeEnum(l.blendMode, BLEND_MODES, 'additive'),
      color: sanitizeColor(l.color, '#38bdf8'),
      secondaryColor: sanitizeColor(l.secondaryColor, '#a855f7'),
      position: sanitizeVec3(l.position, -10, 10, { x: 0, y: 0, z: 0 }),
      rotation: sanitizeVec3(l.rotation, -Math.PI * 2, Math.PI * 2, { x: 0, y: 0, z: 0 }),
      textureRef: sanitizeEnum(l.textureRef, TEXTURE_REFS, 'soft_orb'),
      animation: {
        mode: sanitizeEnum(animRaw.mode, ANIMATION_MODES, 'smooth'),
        ...(typeof animRaw.syncToMusic === 'boolean'
          ? { syncToMusic: animRaw.syncToMusic }
          : {}),
        speed: clamp(animRaw.speed, 0, 10, 1),
        amplitude: clamp(animRaw.amplitude, 0, 5, 0.25),
        frequency: clamp(animRaw.frequency, 0.1, 30, 1.5),
        rotationSpeed: sanitizeVec3(animRaw.rotationSpeed, -15, 15, { x: 0, y: 0.8, z: 0 }),
      },
      settings: {
        size: clamp(setRaw.size, 0.05, 8, 1),
        intensity: clamp(setRaw.intensity, 0, 6, 1.4),
        opacity: clamp(setRaw.opacity, 0, 1, 0.85),
        glow: clamp(setRaw.glow, 0, 5, 1.4),
        radius: clamp(setRaw.radius, 0.1, 10, 1.8),
        thickness: clamp(setRaw.thickness, 0.01, 2, 0.14),
        spread: clamp(setRaw.spread, 0.1, 12, 1.5),
        turbulence: clamp(setRaw.turbulence, 0, 3, 0.6),
        particleCount: Math.round(clamp(setRaw.particleCount, 1, 3000, 220)),
        lifetime: clamp(setRaw.lifetime, 0.05, 10, 2.0),
        arcCount: Math.round(clamp(setRaw.arcCount, 1, 24, 5)),
        segments: Math.round(clamp(setRaw.segments, 4, 128, 32)),
        emissionShape: sanitizeEnum(setRaw.emissionShape, EMISSION_SHAPES, 'cylinder'),
        orbiterShape: sanitizeEnum(setRaw.orbiterShape, ORBITER_SHAPES, 'crystal'),
        wireframe: typeof setRaw.wireframe === 'boolean' ? setRaw.wireframe : false,
        doubleSided: typeof setRaw.doubleSided === 'boolean' ? setRaw.doubleSided : true,
        reverseDirection: typeof setRaw.reverseDirection === 'boolean' ? setRaw.reverseDirection : false,
        tilt: clamp(setRaw.tilt, -Math.PI, Math.PI, 0.15),
      },
    });
  }

  const rarityRaw = (obj.rarity && typeof obj.rarity === 'object' ? obj.rarity : {}) as Record<string, unknown>;
  const envRaw = (obj.environment && typeof obj.environment === 'object' ? obj.environment : {}) as Record<string, unknown>;

  const rarity = classifyBaseOdds(
    typeof rarityRaw.baseOdds === 'number' ? rarityRaw.baseOdds : 1_000_000,
  );

  let audio: AuraAudioConfig | undefined;
  if (obj.audio && typeof obj.audio === 'object' && !Array.isArray(obj.audio)) {
    const aRaw = obj.audio as Record<string, unknown>;
    const rawUrl = typeof aRaw.dataUrl === 'string' ? aRaw.dataUrl.trim() : '';
    const isSafeAudioUrl = isSafeAudioDataUrl(rawUrl, 920_000);

    if (isSafeAudioUrl) {
      audio = {
        fileName: sanitizeString(aRaw.fileName, 'aura-theme.audio', 96),
        mimeType: sanitizeString(aRaw.mimeType, 'audio/mpeg', 48),
        dataUrl: rawUrl,
        volume: clamp(aRaw.volume, 0, 1, 0.75),
        loop: typeof aRaw.loop === 'boolean' ? aRaw.loop : true,
        refDistance: clamp(aRaw.refDistance, 1, 40, 6),
        maxDistance: clamp(aRaw.maxDistance, 5, 140, 42),
        rolloffFactor: clamp(aRaw.rolloffFactor, 0.1, 4, 1.4),
      };
    } else if (rawUrl.length > 0) {
      warnings.push('Ignored unsupported or oversized aura audio payload.');
    }
  }

  let posePreset: AuraPosePreset | undefined;
  if (
    typeof obj.posePreset === 'string' &&
    (AURA_POSE_PRESETS as readonly string[]).includes(obj.posePreset)
  ) {
    posePreset = obj.posePreset as AuraPosePreset;
  } else if (obj.levitate === true) {
    posePreset = 'levitate';
  }

  const levitate =
    posePreset !== undefined
      ? POSE_PRESET_META[posePreset].floats
      : typeof obj.levitate === 'boolean'
        ? obj.levitate
        : undefined;

  const cutscene = sanitizeCutsceneConfig(
    obj.cutscene,
    audio?.dataUrl.length ?? 0,
    warnings,
  );

  const project: AuraProject = {
    formatVersion: AURA_FORMAT_VERSION,
    engine: AURA_TARGET_ENGINE,
    id: sanitizeString(obj.id, `aura_${Math.random().toString(36).slice(2, 9)}`, 64),
    name: sanitizeString(obj.name, 'Imported Aura', 64),
    description: sanitizeString(obj.description, 'Imported aura project.', 400),
    author: sanitizeString(obj.author, 'Creator', 64),
    updatedAt: new Date().toISOString(),
    rarity,
    environment: {
      backgroundColor: sanitizeColor(envRaw.backgroundColor, '#090b10'),
      bloomStrength: clamp(envRaw.bloomStrength, 0, 2.5, 0.8),
      bloomRadius: clamp(envRaw.bloomRadius, 0, 1.5, 0.5),
      bloomThreshold: clamp(envRaw.bloomThreshold, 0, 1, 0.64),
      ambientRimColor: sanitizeColor(envRaw.ambientRimColor, '#f59e0b'),
    },
    layers,
    textures: Array.from(new Set(layers.map((l) => l.textureRef))),
    ...(audio ? { audio } : {}),
    ...(typeof levitate === 'boolean' ? { levitate } : {}),
    ...(posePreset ? { posePreset } : {}),
    ...(cutscene ? { cutscene } : {}),
  };

  return { ok: true, project, warnings };
}
