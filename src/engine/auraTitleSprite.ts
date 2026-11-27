import * as THREE from 'three';
import { formatOdds } from '../aura/rarity';
import type { AuraProject, AuraTitleConfig } from '../aura/types';
import type { R6Rig } from './r6Character';

const RARITY_HEX_COLORS: Record<string, string> = {
  Common: '#94a3b8',
  Uncommon: '#34d399',
  Rare: '#38bdf8',
  Epic: '#c084fc',
  Legendary: '#fbbf24',
  Mythic: '#fb7185',
};

export function resolveAuraTitleConfig(
  aura: Pick<AuraProject, 'name' | 'rarity' | 'environment' | 'layers' | 'titleConfig'>,
): AuraTitleConfig {
  const rarityHex =
    RARITY_HEX_COLORS[aura.rarity.classification] ??
    aura.environment.ambientRimColor ??
    '#fbbf24';

  if (aura.titleConfig) {
    return {
      enabled: aura.titleConfig.enabled ?? true,
      text: aura.titleConfig.text ?? '',
      size: Math.max(0.5, Math.min(3.0, aura.titleConfig.size || 1.0)),
      heightOffset: Number.isFinite(aura.titleConfig.heightOffset)
        ? Math.max(-1.0, Math.min(4.0, aura.titleConfig.heightOffset))
        : 0.55,
      color: aura.titleConfig.color || '#ffffff',
      glowColor: aura.titleConfig.glowColor || rarityHex,
      fontStyle: aura.titleConfig.fontStyle ?? 'display',
      animation: aura.titleConfig.animation ?? 'float',
    };
  }

  return {
    enabled: true,
    text: aura.name,
    size: 1.0,
    heightOffset: 0.55,
    color: '#ffffff',
    glowColor: rarityHex,
    fontStyle: 'display',
    animation: 'float',
  };
}

/**
 * Computes the highest Y coordinate (relative to rig.root) reached by the
 * character + all visible 3D aura layers, so the Aura Title always floats
 * cleanly above the aura itself.
 */
export function computeAuraTopHeight(
  aura: Pick<AuraProject, 'layers'>,
  rig: R6Rig,
): number {
  const bodyY = rig.bodyRoot.position.y;
  let maxTopY = bodyY + 2.75; // Top of R6 head baseline

  for (const layer of aura.layers) {
    if (!layer.visible) continue;

    let anchorBaseY = bodyY;
    switch (layer.anchor) {
      case 'ground':
        anchorBaseY = 0;
        break;
      case 'root':
        anchorBaseY = bodyY;
        break;
      case 'torso':
      case 'leftArm':
      case 'rightArm':
        anchorBaseY = bodyY + 1.5;
        break;
      case 'head':
        anchorBaseY = bodyY + 2.36;
        break;
      case 'leftLeg':
      case 'rightLeg':
        anchorBaseY = bodyY + 0.5;
        break;
    }

    const s = layer.settings;
    const objScale = Math.max(0.15, s.objectScale ?? 1.0);
    let extentY = 0.5;

    switch (layer.type) {
      case 'light_beams': {
        const beamH = Math.max(0.5, s.spread) * objScale;
        if (s.emissionShape === 'sphere') {
          extentY = 1.2 + beamH * 0.75;
        } else {
          extentY = beamH * Math.max(0.25, Math.abs(Math.cos(s.tilt)));
        }
        break;
      }
      case 'energy_spheres':
      case 'distortion_effects':
        extentY = s.radius * objScale;
        break;
      case 'rotating_rings':
        extentY =
          s.radius *
            objScale *
            Math.min(
              1.0,
              0.2 + Math.abs(Math.sin(s.tilt + layer.rotation.x + layer.rotation.z)),
            ) +
          s.thickness * objScale;
        break;
      case 'orbiting_objects':
        extentY = s.spread * 0.5 + 0.4 * objScale + s.radius * 0.25;
        break;
      case 'particle_systems':
      case 'floating_sparks':
        extentY = s.spread * 0.72 + s.radius * 0.45;
        break;
      case 'energy_ribbons':
        extentY = s.spread * 0.65 + s.thickness;
        break;
      case 'lightning_effects':
        extentY = s.radius * 0.85 + s.spread * 0.4;
        break;
      case 'glowing_materials':
        extentY = 0.35;
        break;
    }

    const layerTop = anchorBaseY + layer.position.y + Math.min(18, Math.max(0, extentY));
    if (layerTop > maxTopY) {
      maxTopY = layerTop;
    }
  }

  return Math.min(20, maxTopY);
}

function renderAuraTitleTexture(
  aura: AuraProject,
  cfg: AuraTitleConfig,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const titleLabel = (cfg.text.trim() || aura.name).slice(0, 48);
  const rarityHex =
    RARITY_HEX_COLORS[aura.rarity.classification] ?? '#cbd5e1';
  const rarityLine = `${aura.rarity.classification.toUpperCase()}  ·  ${formatOdds(
    aura.rarity.baseOdds,
  )}`;

  const fontFamily =
    cfg.fontStyle === 'serif'
      ? 'Georgia, "Times New Roman", serif'
      : cfg.fontStyle === 'mono'
        ? '"JetBrains Mono", ui-monospace, monospace'
        : '"Space Grotesk", system-ui, -apple-system, sans-serif';

  // Auto-fit long titles cleanly within 940px
  let titlePx = 86;
  ctx.font = `800 ${titlePx}px ${fontFamily}`;
  while (titlePx > 38 && ctx.measureText(titleLabel).width > 920) {
    titlePx -= 4;
    ctx.font = `800 ${titlePx}px ${fontFamily}`;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Soft radial halo behind text (no hard box)
  const halo = ctx.createRadialGradient(
    canvas.width / 2,
    148,
    20,
    canvas.width / 2,
    148,
    430,
  );
  halo.addColorStop(0, 'rgba(6, 9, 16, 0.55)');
  halo.addColorStop(0.65, 'rgba(6, 9, 16, 0.22)');
  halo.addColorStop(1, 'rgba(6, 9, 16, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Main Title with crisp outline & outer glow
  ctx.save();
  ctx.font = `800 ${titlePx}px ${fontFamily}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(4, 6, 12, 0.9)';
  ctx.strokeText(titleLabel, canvas.width / 2, 126);

  ctx.shadowColor = cfg.glowColor;
  ctx.shadowBlur = 26;
  ctx.fillStyle = cfg.color;
  ctx.fillText(titleLabel, canvas.width / 2, 126);
  ctx.restore();

  // Rarity line ALWAYS underneath the Title
  ctx.save();
  ctx.font = `700 34px "JetBrains Mono", ui-monospace, monospace`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(4, 6, 12, 0.92)';
  ctx.strokeText(rarityLine, canvas.width / 2, 212);

  ctx.shadowColor = rarityHex;
  ctx.shadowBlur = 16;
  ctx.fillStyle = rarityHex;
  ctx.fillText(rarityLine, canvas.width / 2, 212);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class AuraTitleSpriteController {
  public readonly sprite: THREE.Sprite;
  private material: THREE.SpriteMaterial;
  private texture: THREE.CanvasTexture | null = null;
  private lastSignature = '';
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.material = new THREE.SpriteMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.visible = false;
    this.sprite.renderOrder = 20;
    this.scene.add(this.sprite);
  }

  public update(elapsed: number, aura: AuraProject | null, rig: R6Rig) {
    if (!aura) {
      this.sprite.visible = false;
      return;
    }

    const cfg = resolveAuraTitleConfig(aura);
    if (!cfg.enabled) {
      this.sprite.visible = false;
      return;
    }

    const displayTitle = (cfg.text.trim() || aura.name).slice(0, 48);
    const sig = [
      displayTitle,
      aura.rarity.classification,
      aura.rarity.baseOdds,
      cfg.color,
      cfg.glowColor,
      cfg.fontStyle,
    ].join('|');

    if (sig !== this.lastSignature || !this.texture) {
      const oldTex = this.texture;
      this.texture = renderAuraTitleTexture(aura, cfg);
      this.material.map = this.texture;
      this.material.needsUpdate = true;
      this.lastSignature = sig;
      oldTex?.dispose();
    }

    this.sprite.visible = true;

    const topY = computeAuraTopHeight(aura, rig);
    let animFloatY = 0;
    let animScale = 1;
    let animOpacity = 1;

    switch (cfg.animation) {
      case 'float':
        animFloatY = Math.sin(elapsed * 2.1) * 0.12;
        break;
      case 'pulse':
        animScale = 1 + Math.sin(elapsed * 3.1) * 0.065;
        animOpacity = 0.88 + Math.sin(elapsed * 3.1) * 0.12;
        break;
      case 'shimmer':
        animFloatY = Math.sin(elapsed * 1.5) * 0.06;
        animOpacity = 0.82 + 0.18 * Math.sin(elapsed * 5.2);
        break;
      case 'none':
        break;
    }

    this.sprite.position.set(
      rig.root.position.x,
      rig.root.position.y + topY + cfg.heightOffset + animFloatY,
      rig.root.position.z,
    );

    const scaleFactor = cfg.size * animScale;
    this.sprite.scale.set(4.5 * scaleFactor, 1.406 * scaleFactor, 1);
    this.material.opacity = animOpacity;
  }

  public dispose() {
    this.scene.remove(this.sprite);
    this.texture?.dispose();
    this.texture = null;
    this.material.dispose();
  }
}
