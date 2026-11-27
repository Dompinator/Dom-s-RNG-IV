import { formatOdds } from '../aura/rarity';
import type {
  AuraCutsceneConfig,
  AuraProject,
  CutsceneElement,
  CutsceneShapeType,
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

// Deterministic pseudo-random helper per element/index
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

  // Motion transforms
  const motionTime = progress01 * (1 + el.speed * 1.8) + nowSec * 0.15 * el.speed;
  let rot = (el.rotation * Math.PI) / 180;
  let scale = el.size;
  let alpha = el.opacity;
  let scatter = 0;

  switch (el.motion) {
    case 'spin_cw':
      rot += motionTime * Math.PI * 1.4;
      break;
    case 'spin_ccw':
      rot -= motionTime * Math.PI * 1.4;
      break;
    case 'pulse':
      scale *= 0.88 + Math.sin(motionTime * Math.PI * 3.2) * 0.22;
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
      break;
  }

  // Smooth fade-in and climax pop
  const distFromClimax = Math.abs(progress01 - climaxRatio);
  const climaxBoost = distFromClimax < 0.08 ? 1 + (1 - distFromClimax / 0.08) * 0.28 : 1;
  scale *= climaxBoost;

  const r = baseUnit * 0.22 * scale;
  if (alpha <= 0.01 || r <= 1) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.globalCompositeOperation = 'lighter';
  if (el.glow > 0.05) {
    ctx.shadowColor = el.color;
    ctx.shadowBlur = Math.min(48, 18 * el.glow);
  }

  const shape: CutsceneShapeType = el.shape;
  const count = Math.max(1, Math.min(24, Math.round(el.count)));

  switch (shape) {
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

      // Orbiting rune glyphs around ring
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
  const isMythic = cutscene.tier === 'legendary_mythic';
  const climaxRatio = isMythic ? 0.48 : 0.4;
  const revealStart = climaxRatio + 0.04;
  const baseUnit = Math.min(width, height);

  // 1. Dark atmospheric canvas fill
  ctx.save();
  ctx.fillStyle = cutscene.backgroundColor || '#020308';
  ctx.fillRect(0, 0, width, height);

  // Ambient central nebula aura bloom
  const centerGlowRadius =
    baseUnit * (t < climaxRatio ? lerp(0.28, 0.72, t / climaxRatio) : lerp(1.05, 0.75, (t - climaxRatio) / (1 - climaxRatio)));
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(10, centerGlowRadius),
  );
  bgGrad.addColorStop(0, hexToRgba(cutscene.primaryColor, isMythic ? 0.42 : 0.28));
  bgGrad.addColorStop(0.5, hexToRgba(cutscene.secondaryColor, isMythic ? 0.2 : 0.12));
  bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Camera shake offset (peaks at climax explosion)
  let shakeMag = 0;
  if (t < climaxRatio) {
    shakeMag = Math.pow(t / climaxRatio, 2.2) * (isMythic ? 9 : 4) * cutscene.shakeIntensity;
  } else {
    const post = (t - climaxRatio) / (1 - climaxRatio);
    shakeMag = Math.exp(-post * 5.2) * (isMythic ? 24 : 10) * cutscene.shakeIntensity;
  }
  const shakeX = Math.sin(nowSec * 67) * shakeMag;
  const shakeY = Math.cos(nowSec * 83) * shakeMag;

  // 3. Radial speed lines (high tension during buildup & explosive burst right after drop)
  ctx.save();
  ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
  const rayCount = isMythic ? 40 : 20;
  const rayAlpha =
    t < climaxRatio
      ? 0.08 + (t / climaxRatio) * 0.22
      : Math.max(0.06, 0.35 * Math.exp(-((t - climaxRatio) * 4)));
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 + seeded(i + 9) * 0.18;
    const inner = baseUnit * (t < climaxRatio ? 0.16 + seeded(i * 3) * 0.2 : 0.08);
    const outer = baseUnit * (0.65 + seeded(i * 5) * 0.5);
    ctx.strokeStyle = hexToRgba(
      i % 2 === 0 ? cutscene.primaryColor : cutscene.secondaryColor,
      rayAlpha,
    );
    ctx.lineWidth = isMythic ? 1.5 + seeded(i) * 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }

  // 4. Render user's custom cutscene shapes & FX elements
  for (const el of cutscene.elements) {
    if (!el.visible) continue;

    let visibleInPhase = true;
    let phaseProgress = t;

    if (el.phase === 'buildup') {
      visibleInPhase = t <= climaxRatio + 0.03;
      phaseProgress = clamp01(t / climaxRatio);
    } else if (el.phase === 'climax') {
      const start = Math.max(0, climaxRatio - 0.04);
      const end = Math.min(1, climaxRatio + 0.28);
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
  vig.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // 6. Climax Whiteout / Dimensional Flash
  if (t >= climaxRatio - 0.02 && t <= climaxRatio + 0.24) {
    const flashT = clamp01((t - (climaxRatio - 0.02)) / 0.26);
    const flashOpacity =
      Math.sin(Math.min(1, flashT) * Math.PI) *
      (isMythic ? 0.92 : 0.65) *
      Math.min(1.2, cutscene.flashIntensity);
    if (flashOpacity > 0.01) {
      ctx.fillStyle = hexToRgba('#ffffff', flashOpacity);
      ctx.fillRect(0, 0, width, height);
    }
  }

  // 7. Sol's RNG-style Buildup Whisper & Reveal Typography
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (t < climaxRatio - 0.02 && cutscene.headlineText.trim()) {
    const textAlpha = clamp01(Math.sin((t / climaxRatio) * Math.PI) * 1.4);
    ctx.save();
    ctx.font = `600 ${Math.round(Math.max(14, baseUnit * 0.032))}px "Space Grotesk", system-ui, sans-serif`;
    ctx.shadowColor = cutscene.primaryColor;
    ctx.shadowBlur = 16;
    ctx.fillStyle = hexToRgba('#f8fafc', textAlpha * 0.92);
    ctx.fillText(cutscene.headlineText, width / 2, height * 0.78);
    ctx.restore();
  }

  if (t >= revealStart) {
    const revT = easeOutCubic((t - revealStart) / Math.max(0.05, 0.25));
    const titleScale = lerp(1.28, 1.0, revT);
    const nameSize = Math.round(
      Math.max(28, baseUnit * (isMythic ? 0.088 : 0.072)),
    );

    ctx.save();
    ctx.translate(width / 2 + shakeX * 0.3, height * 0.76 + shakeY * 0.3);
    ctx.scale(titleScale, titleScale);

    // Aura Name
    ctx.font = `800 ${nameSize}px "Space Grotesk", system-ui, sans-serif`;
    ctx.shadowColor = cutscene.primaryColor;
    ctx.shadowBlur = isMythic ? 34 : 22;
    ctx.fillStyle = hexToRgba('#ffffff', revT);
    ctx.fillText(aura.name, 0, 0);

    // Rarity & Odds Line
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
