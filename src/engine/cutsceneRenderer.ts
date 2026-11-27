import { formatOdds } from '../aura/rarity';
import {
  CUTSCENE_TIER_META,
  type AuraCutsceneConfig,
  type AuraProject,
  type CutsceneElement,
  type CutsceneShapeType,
  type CutsceneTier,
} from '../aura/types';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutQuad(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(255,255,255,${clamp01(alpha)})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp01(alpha)})`;
}

function seeded(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  radius: number,
  points: number,
  innerRatio: number,
  el: CutsceneElement,
  alpha: number,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * innerRatio;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  const grad = ctx.createRadialGradient(0, 0, radius * 0.05, 0, 0, radius);
  grad.addColorStop(0, hexToRgba('#ffffff', alpha));
  grad.addColorStop(0.35, hexToRgba(el.color, alpha * 0.92));
  grad.addColorStop(1, hexToRgba(el.secondaryColor, 0));

  ctx.fillStyle = grad;
  ctx.fill();

  ctx.lineWidth = Math.max(1.5, radius * 0.025);
  ctx.strokeStyle = hexToRgba('#ffffff', alpha * 0.75);
  ctx.stroke();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  el: CutsceneElement,
  baseUnit: number,
  progress01: number,
  climaxRatio: number,
  phaseProgress: number,
  nowSec: number,
) {
  const cx = (el.x / 100) * baseUnit * 1.45;
  const cy = (el.y / 100) * baseUnit * 1.1;

  const motionTime = progress01 * (1 + el.speed * 1.8) + nowSec * 0.15 * el.speed;
  let rot = (el.rotation * Math.PI) / 180;
  let scale = el.size;
  let alpha = el.opacity;
  let scatter = 0;

  let offsetX = 0;
  let offsetY = 0;
  let typewriterRatio = 1;
  const hasTimedWindow =
    typeof el.startTime === 'number' && typeof el.duration === 'number';
  const fadeEdges =
    clamp01(phaseProgress / 0.16) * clamp01((1 - phaseProgress) / 0.16);

  switch (el.motion) {
    case 'fade':
      alpha *= fadeEdges;
      break;
    case 'typewriter':
      typewriterRatio = clamp01(phaseProgress / 0.65);
      alpha *= clamp01((1 - phaseProgress) / 0.14);
      if (el.shape !== 'custom_text') {
        scale *= easeOutCubic(typewriterRatio);
      }
      break;
    case 'rise': {
      const enter = easeOutCubic(Math.min(1, phaseProgress * 2.5));
      offsetY += lerp(baseUnit * 0.08, -baseUnit * 0.035, phaseProgress);
      scale *= lerp(0.92, 1.0, enter);
      alpha *= fadeEdges;
      break;
    }
    case 'zoom_in': {
      const zT = easeOutCubic(Math.min(1, phaseProgress * 2.4));
      scale *= lerp(0.18, 1.04, zT);
      alpha *= clamp01(phaseProgress / 0.12) * clamp01((1 - phaseProgress) / 0.16);
      break;
    }
    case 'shake': {
      const shakePower = 0.012 * (0.7 + el.speed * 0.45);
      offsetX += Math.sin(nowSec * 92 + el.id.length * 7) * baseUnit * shakePower;
      offsetY += Math.cos(nowSec * 109 + el.id.length * 13) * baseUnit * shakePower;
      if (hasTimedWindow) {
        alpha *= fadeEdges;
      }
      break;
    }
    case 'spin_cw':
      rot += motionTime * Math.PI * 1.4;
      break;
    case 'spin_ccw':
      rot -= motionTime * Math.PI * 1.4;
      break;
    case 'pulse':
      scale *= 0.88 + Math.sin(motionTime * Math.PI * 3.2) * 0.22;
      if (hasTimedWindow && el.shape === 'custom_text') {
        alpha *= fadeEdges;
      }
      break;
    case 'expand':
      scale *= 0.25 + easeOutCubic(phaseProgress) * 2.1;
      alpha *= Math.max(0, 1 - Math.pow(phaseProgress, 1.45));
      break;
    case 'converge':
      scale *= Math.max(0.18, 2.0 - easeInOutQuad(phaseProgress) * 1.65);
      rot += motionTime * Math.PI * 1.2;
      break;
    case 'shatter':
      scatter = easeOutCubic(phaseProgress);
      scale *= 0.75 + scatter * 0.8;
      if (el.phase === 'climax') {
        alpha *= Math.max(0, 1 - Math.pow(phaseProgress, 2.2));
      }
      break;
    case 'flicker':
      alpha *= 0.45 + 0.55 * Math.abs(Math.sin(motionTime * 19));
      if (hasTimedWindow && el.shape === 'custom_text') {
        alpha *= clamp01((1 - phaseProgress) / 0.12);
      }
      break;
    case 'slam': {
      const slamT = easeOutCubic(Math.min(1, phaseProgress * 3.5));
      scale *= lerp(1.9, 1.0, slamT);
      alpha *= slamT * (hasTimedWindow ? clamp01((1 - phaseProgress) / 0.14) : 1);
      break;
    }
    case 'static':
      break;
  }

  const distFromClimax = Math.abs(progress01 - climaxRatio);
  const climaxBoost =
    el.shape !== 'custom_text' && distFromClimax < 0.08
      ? 1 + (1 - distFromClimax / 0.08) * 0.28
      : 1;
  scale *= climaxBoost;

  const r = baseUnit * 0.22 * scale;
  if (alpha <= 0.01 || r <= 1) return;

  ctx.save();
  ctx.translate(cx + offsetX, cy + offsetY);
  ctx.rotate(rot);
  if (el.shape !== 'custom_text') {
    ctx.globalCompositeOperation = 'lighter';
  }
  if (el.glow > 0.05) {
    ctx.shadowColor = el.shape === 'custom_text' ? el.secondaryColor : el.color;
    ctx.shadowBlur = Math.min(48, 18 * el.glow);
  }

  const shape: CutsceneShapeType = el.shape;
  const count = Math.max(1, Math.min(24, Math.round(el.count)));

  switch (shape) {
    case 'custom_text': {
      const fullLabel = (el.text ?? '').trim();
      if (!fullLabel) break;
      const visibleChars =
        el.motion === 'typewriter'
          ? Math.max(1, Math.ceil(fullLabel.length * typewriterRatio))
          : fullLabel.length;
      const label = fullLabel.slice(0, visibleChars);
      const px = Math.round(Math.max(14, baseUnit * 0.048 * scale));
      const family =
        el.fontStyle === 'serif'
          ? 'Georgia, "Times New Roman", serif'
          : el.fontStyle === 'mono'
            ? '"JetBrains Mono", ui-monospace, monospace'
            : '"Space Grotesk", system-ui, sans-serif';
      ctx.font = `700 ${px}px ${family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = hexToRgba(el.color, alpha);
      ctx.fillText(label, 0, 0);
      break;
    }

    case 'four_point_star':
      drawFourPointStar(ctx, r * 1.35, 4, 0.22, el, alpha);
      break;

    case 'eight_point_star':
      drawFourPointStar(ctx, r * 1.3, 8, 0.26, el, alpha);
      break;

    case 'arcane_ring': {
      ctx.strokeStyle = hexToRgba(el.color, alpha);
      ctx.lineWidth = Math.max(2, r * 0.045);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = hexToRgba(el.secondaryColor, alpha * 0.75);
      ctx.lineWidth = Math.max(1.2, r * 0.025);
      ctx.setLineDash([r * 0.16, r * 0.1]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const tickCount = Math.max(4, count);
      for (let i = 0; i < tickCount; i++) {
        const a = (i / tickCount) * Math.PI * 2;
        const gx = Math.cos(a) * r * 0.91;
        const gy = Math.sin(a) * r * 0.91;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = hexToRgba('#ffffff', alpha * 0.9);
        ctx.fillRect(-r * 0.03, -r * 0.07, r * 0.06, r * 0.14);
        ctx.restore();
      }
      break;
    }

    case 'hex_portal': {
      const rings = [1.0, 0.74];
      rings.forEach((mult, idx) => {
        const rad = r * mult;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + (idx === 1 ? Math.PI / 6 : 0);
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = hexToRgba(idx === 0 ? el.color : el.secondaryColor, alpha);
        ctx.lineWidth = Math.max(2, r * (idx === 0 ? 0.05 : 0.03));
        ctx.stroke();
      });
      break;
    }

    case 'shockwave_ring': {
      const grad = ctx.createRadialGradient(0, 0, r * 0.65, 0, 0, r * 1.05);
      grad.addColorStop(0, hexToRgba(el.color, 0));
      grad.addColorStop(0.7, hexToRgba(el.color, alpha * 0.75));
      grad.addColorStop(0.92, hexToRgba(el.secondaryColor, alpha));
      grad.addColorStop(1, hexToRgba(el.secondaryColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'sacred_triangle': {
      for (let t = 0; t < 2; t++) {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3 - Math.PI / 2 + t * Math.PI;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = hexToRgba(t === 0 ? el.color : el.secondaryColor, alpha);
        ctx.lineWidth = Math.max(2, r * 0.04);
        ctx.stroke();
      }
      break;
    }

    case 'crescent_moon': {
      ctx.fillStyle = hexToRgba(el.color, alpha);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, 0.45, Math.PI * 2 - 0.45, false);
      ctx.arc(r * 0.32, 0, r * 0.72, Math.PI * 2 - 0.65, 0.65, true);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = hexToRgba(el.secondaryColor, alpha * 0.7);
      ctx.lineWidth = Math.max(1.5, r * 0.025);
      ctx.stroke();
      break;
    }

    case 'cross_flare': {
      const flareW = r * 2.7;
      const flareH = r * 0.14;
      const hGrad = ctx.createLinearGradient(-flareW, 0, flareW, 0);
      hGrad.addColorStop(0, hexToRgba(el.secondaryColor, 0));
      hGrad.addColorStop(0.45, hexToRgba(el.color, alpha * 0.85));
      hGrad.addColorStop(0.5, hexToRgba('#ffffff', alpha));
      hGrad.addColorStop(0.55, hexToRgba(el.color, alpha * 0.85));
      hGrad.addColorStop(1, hexToRgba(el.secondaryColor, 0));
      ctx.fillStyle = hGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, flareW, flareH, 0, 0, Math.PI * 2);
      ctx.fill();

      const vGrad = ctx.createLinearGradient(0, -flareW * 0.65, 0, flareW * 0.65);
      vGrad.addColorStop(0, hexToRgba(el.secondaryColor, 0));
      vGrad.addColorStop(0.5, hexToRgba('#ffffff', alpha * 0.9));
      vGrad.addColorStop(1, hexToRgba(el.secondaryColor, 0));
      ctx.fillStyle = vGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, flareH * 0.8, flareW * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'shard_burst': {
      const spreadDist = el.motion === 'shatter' ? lerp(0.15, 1.55, scatter) : 0.95;
      for (let i = 0; i < count; i++) {
        const seed = seeded(i + 1 + el.id.length);
        const a = (i / count) * Math.PI * 2 + seed * 0.4;
        const dist = r * spreadDist * (0.45 + seed * 0.85);
        const shardLen = r * (0.24 + seed * 0.34);
        const shardW = shardLen * 0.32;

        ctx.save();
        ctx.translate(Math.cos(a) * dist, Math.sin(a) * dist);
        ctx.rotate(a + motionTime * (seed > 0.5 ? 1.5 : -1.5));
        ctx.beginPath();
        ctx.moveTo(shardLen, 0);
        ctx.lineTo(0, shardW);
        ctx.lineTo(-shardLen * 0.6, 0);
        ctx.lineTo(0, -shardW);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(i % 2 === 0 ? el.color : el.secondaryColor, alpha * 0.9);
        ctx.fill();
        ctx.restore();
      }
      break;
    }

    case 'spiral_vortex': {
      const arms = Math.max(2, Math.min(12, count));
      for (let arm = 0; arm < arms; arm++) {
        const baseAngle = (arm / arms) * Math.PI * 2;
        ctx.beginPath();
        const steps = 22;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const rad = r * 1.45 * (1 - u * 0.9);
          const ang = baseAngle + u * Math.PI * 2.2;
          const px = Math.cos(ang) * rad;
          const py = Math.sin(ang) * rad;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = hexToRgba(arm % 2 === 0 ? el.color : el.secondaryColor, alpha * 0.82);
        ctx.lineWidth = Math.max(1.5, r * 0.03);
        ctx.stroke();
      }
      break;
    }

    case 'lightning_crack': {
      const bolts = Math.max(2, Math.min(16, count));
      for (let b = 0; b < bolts; b++) {
        const a = (b / bolts) * Math.PI * 2 + seeded(b * 3 + 5) * 0.35;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const segs = 6;
        let curX = 0;
        let curY = 0;
        for (let s = 1; s <= segs; s++) {
          const u = s / segs;
          const jitter = (seeded(b * 17 + s * 7 + Math.floor(nowSec * 8)) - 0.5) * r * 0.24;
          const targetDist = r * 1.65 * u;
          curX = Math.cos(a) * targetDist - Math.sin(a) * jitter;
          curY = Math.sin(a) * targetDist + Math.cos(a) * jitter;
          ctx.lineTo(curX, curY);
        }
        ctx.strokeStyle = hexToRgba(b % 2 === 0 ? '#ffffff' : el.secondaryColor, alpha);
        ctx.lineWidth = Math.max(1.6, r * 0.032);
        ctx.stroke();
      }
      break;
    }

    case 'orb_core': {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.15);
      grad.addColorStop(0, hexToRgba('#ffffff', alpha));
      grad.addColorStop(0.28, hexToRgba(el.color, alpha * 0.95));
      grad.addColorStop(0.65, hexToRgba(el.secondaryColor, alpha * 0.45));
      grad.addColorStop(1, hexToRgba(el.secondaryColor, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

export function renderCutsceneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cutscene: AuraCutsceneConfig,
  aura: Pick<AuraProject, 'name' | 'rarity'>,
  progress01: number,
  nowSec: number,
) {
  const t = clamp01(progress01);
  const tier: CutsceneTier = CUTSCENE_TIER_META[cutscene.tier]
    ? cutscene.tier
    : 'epic';
  const climaxRatio = CUTSCENE_TIER_META[tier].climaxRatio;
  const isMythic = tier === 'mythic';
  const isLarge = tier === 'legendary' || isMythic;
  const isSimple = tier === 'under_epic';
  const revealStart = climaxRatio + 0.03;
  const baseUnit = Math.min(width, height);

  // 1. Dark atmospheric canvas fill
  ctx.save();
  ctx.fillStyle = cutscene.backgroundColor || '#020308';
  ctx.fillRect(0, 0, width, height);

  // Ambient central nebula aura bloom
  const centerGlowRadius =
    baseUnit *
    (t < climaxRatio
      ? lerp(0.24, isMythic ? 0.95 : 0.72, t / climaxRatio)
      : lerp(1.15, 0.78, (t - climaxRatio) / Math.max(0.01, 1 - climaxRatio)));
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(10, centerGlowRadius),
  );
  bgGrad.addColorStop(0, hexToRgba(cutscene.primaryColor, isMythic ? 0.5 : isSimple ? 0.28 : 0.4));
  bgGrad.addColorStop(0.5, hexToRgba(cutscene.secondaryColor, isMythic ? 0.26 : isSimple ? 0.12 : 0.2));
  bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Camera shake offset (Mythic escalates dramatically before silence & explodes at drop)
  let shakeMag = 0;
  if (t < climaxRatio) {
    const preSilence = isMythic && t > climaxRatio - 0.025 && t < climaxRatio;
    shakeMag = preSilence
      ? 0.5
      : Math.pow(t / climaxRatio, 2.0) * (isMythic ? 14 : isLarge ? 10 : isSimple ? 3.5 : 8) * cutscene.shakeIntensity;
  } else {
    const post = (t - climaxRatio) / Math.max(0.01, 1 - climaxRatio);
    shakeMag = Math.exp(-post * 5.0) * (isMythic ? 32 : isLarge ? 26 : isSimple ? 9 : 20) * cutscene.shakeIntensity;
  }
  const shakeX = Math.sin(nowSec * 67) * shakeMag;
  const shakeY = Math.cos(nowSec * 83) * shakeMag;

  // 3. Radial speed lines + Mythic pre-climax reality cracks
  ctx.save();
  ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
  const rayCount = isMythic ? 56 : isLarge ? 44 : isSimple ? 18 : 34;
  const rayAlpha =
    t < climaxRatio
      ? 0.08 + (t / climaxRatio) * (isMythic ? 0.34 : 0.22)
      : Math.max(0.06, 0.42 * Math.exp(-((t - climaxRatio) * 4)));
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 + seeded(i + 9) * 0.18;
    const inner = baseUnit * (t < climaxRatio ? 0.14 + seeded(i * 3) * 0.22 : 0.06);
    const outer = baseUnit * (0.7 + seeded(i * 5) * 0.55);
    ctx.strokeStyle = hexToRgba(
      i % 2 === 0 ? cutscene.primaryColor : cutscene.secondaryColor,
      rayAlpha,
    );
    ctx.lineWidth = isMythic ? 1.8 + seeded(i) * 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }

  // Mythic Act III reality-fracture lines right before the 20s supernova drop
  if (isMythic && t > 0.5 && t < climaxRatio + 0.08) {
    const crackIntensity =
      t < climaxRatio
        ? clamp01((t - 0.5) / (climaxRatio - 0.5))
        : Math.max(0, 1 - (t - climaxRatio) / 0.08);
    ctx.strokeStyle = hexToRgba('#ffffff', crackIntensity * 0.8);
    ctx.lineWidth = 2.2;
    for (let c = 0; c < 10; c++) {
      const a = (c / 10) * Math.PI * 2 + 0.22;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let s = 1; s <= 5; s++) {
        const dist = (s / 5) * baseUnit * 0.72 * crackIntensity;
        const j = (seeded(c * 13 + s * 5) - 0.5) * baseUnit * 0.08;
        ctx.lineTo(Math.cos(a) * dist - Math.sin(a) * j, Math.sin(a) * dist + Math.cos(a) * j);
      }
      ctx.stroke();
    }
  }

  // 4. Render user's custom cutscene shapes & FX & timed custom text elements
  const currentTimeSec = t * Math.max(1, cutscene.duration);
  for (const el of cutscene.elements) {
    if (!el.visible) continue;

    let visibleInPhase = true;
    let phaseProgress = t;

    if (typeof el.startTime === 'number' && typeof el.duration === 'number') {
      const start = Math.max(0, el.startTime);
      const len = Math.max(0.1, el.duration);
      const end = start + len;
      visibleInPhase = currentTimeSec >= start && currentTimeSec <= end;
      phaseProgress = clamp01((currentTimeSec - start) / len);
    } else if (el.phase === 'buildup') {
      visibleInPhase = t <= climaxRatio + 0.03;
      phaseProgress = clamp01(t / climaxRatio);
    } else if (el.phase === 'climax') {
      const start = Math.max(0, climaxRatio - 0.04);
      const end = Math.min(1, climaxRatio + 0.24);
      visibleInPhase = t >= start && t <= end;
      phaseProgress = clamp01((t - start) / Math.max(0.01, end - start));
    } else if (el.phase === 'reveal') {
      visibleInPhase = t >= climaxRatio;
      phaseProgress = clamp01((t - climaxRatio) / Math.max(0.01, 1 - climaxRatio));
    }

    if (!visibleInPhase) continue;
    drawShape(ctx, el, baseUnit, t, climaxRatio, phaseProgress, nowSec);
  }
  ctx.restore();

  // 5. Dramatic vignette around screen edges
  const vig = ctx.createRadialGradient(
    width / 2,
    height / 2,
    baseUnit * 0.25,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.84)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // 6a. Mythic false-climax mini pulse at ~38%
  if (isMythic && t >= 0.36 && t <= 0.43) {
    const pulseT = clamp01((t - 0.36) / 0.07);
    const pulseAlpha = Math.sin(pulseT * Math.PI) * 0.28 * cutscene.flashIntensity;
    if (pulseAlpha > 0.01) {
      ctx.fillStyle = hexToRgba(cutscene.primaryColor, pulseAlpha);
      ctx.fillRect(0, 0, width, height);
    }
  }

  // 6b. Main Climax Whiteout / Dimensional Flash
  if (t >= climaxRatio - 0.015 && t <= climaxRatio + 0.22) {
    const flashT = clamp01((t - (climaxRatio - 0.015)) / 0.235);
    const flashOpacity =
      Math.sin(Math.min(1, flashT) * Math.PI) *
      (isMythic ? 0.98 : isLarge ? 0.92 : isSimple ? 0.65 : 0.86) *
      Math.min(1.2, cutscene.flashIntensity);
    if (flashOpacity > 0.01) {
      ctx.fillStyle = hexToRgba('#ffffff', flashOpacity);
      ctx.fillRect(0, 0, width, height);
    }
  }

  // 7. Optional Reveal Title (no automatic buildup quote text unless explicitly enabled)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const showHeadline = cutscene.showHeadlineText === true;
  if (showHeadline && t < climaxRatio - 0.02 && cutscene.headlineText.trim()) {
    const textAlpha = clamp01(Math.sin((t / climaxRatio) * Math.PI) * 1.45);
    ctx.save();
    ctx.font = `600 ${Math.round(Math.max(14, baseUnit * 0.032))}px "Space Grotesk", system-ui, sans-serif`;
    ctx.shadowColor = cutscene.primaryColor;
    ctx.shadowBlur = 16;
    ctx.fillStyle = hexToRgba('#f8fafc', textAlpha * 0.94);
    ctx.fillText(cutscene.headlineText, width / 2, height * 0.78);
    ctx.restore();
  }

  const showReveal = cutscene.showRevealText ?? true;
  if (showReveal && t >= revealStart) {
    const revT = easeOutCubic((t - revealStart) / Math.max(0.05, 0.22));
    const titleScale = lerp(1.28, 1.0, revT);
    const nameSize = Math.round(
      Math.max(28, baseUnit * (isMythic ? 0.095 : isLarge ? 0.088 : isSimple ? 0.072 : 0.082)),
    );

    ctx.save();
    ctx.translate(width / 2 + shakeX * 0.3, height * 0.76 + shakeY * 0.3);
    ctx.scale(titleScale, titleScale);

    ctx.font = `800 ${nameSize}px "Space Grotesk", system-ui, sans-serif`;
    ctx.shadowColor = cutscene.primaryColor;
    ctx.shadowBlur = isMythic ? 38 : isLarge ? 32 : 22;
    ctx.fillStyle = hexToRgba('#ffffff', revT);
    ctx.fillText(aura.name, 0, 0);

    const subSize = Math.round(Math.max(13, baseUnit * 0.028));
    ctx.font = `700 ${subSize}px "JetBrains Mono", monospace`;
    ctx.shadowColor = cutscene.secondaryColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = hexToRgba(cutscene.secondaryColor, revT * 0.95);
    ctx.fillText(
      `${aura.rarity.classification.toUpperCase()}  ·  ${formatOdds(aura.rarity.baseOdds)}`,
      0,
      nameSize * 0.72,
    );

    ctx.restore();
  }

  ctx.restore();
}
