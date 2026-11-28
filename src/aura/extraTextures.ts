/** Additional procedural textures (white shapes, tinted by the layer colors). */
import type { TextureRef } from './types';

export function drawExtraTexture(ctx: CanvasRenderingContext2D, ref: TextureRef, size: number): void {
  const c = size / 2;
  const u = size / 256;
  const white = (a: number) => `rgba(255,255,255,${a})`;
  const path = (draw: () => void, alpha = 1, blur = 12) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.scale(u, u);
    ctx.shadowColor = white(0.8);
    ctx.shadowBlur = blur * u;
    ctx.fillStyle = white(alpha);
    ctx.strokeStyle = white(alpha);
    ctx.beginPath();
    draw();
    ctx.restore();
  };
  const radial = (x: number, y: number, r: number, stops: [number, number][]) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (const [at, a] of stops) g.addColorStop(at, white(a));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  };
  const star = (points: number, outer: number, inner: number) => {
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? inner : outer;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  };

  switch (ref) {
    case 'petal':
      path(() => {
        ctx.moveTo(0, 104);
        ctx.bezierCurveTo(-96, 36, -76, -92, -22, -100);
        ctx.lineTo(0, -72);
        ctx.lineTo(22, -100);
        ctx.bezierCurveTo(76, -92, 96, 36, 0, 104);
        ctx.fill();
      }, 0.95, 8);
      break;
    case 'leaf':
      path(() => {
        ctx.moveTo(0, -112);
        ctx.quadraticCurveTo(92, -20, 0, 92);
        ctx.quadraticCurveTo(-92, -20, 0, -112);
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 5;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(0, -90);
        ctx.lineTo(0, 80);
        for (const y of [-45, 0, 40]) {
          ctx.moveTo(0, y + 18);
          ctx.lineTo(34, y - 10);
          ctx.moveTo(0, y + 18);
          ctx.lineTo(-34, y - 10);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.fillRect(-4, 84, 8, 34);
      }, 0.95, 4);
      break;
    case 'snowflake':
      path(() => {
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI) / 3);
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -108);
          ctx.moveTo(-28, -90);
          ctx.lineTo(0, -62);
          ctx.lineTo(28, -90);
          ctx.restore();
        }
        ctx.stroke();
      });
      break;
    case 'bubble':
      radial(c, c, c * 0.92, [[0, 0.03], [0.7, 0.12], [0.88, 0.85], [0.96, 0.35], [1, 0]]);
      path(() => {
        ctx.ellipse(-42, -46, 24, 13, -0.75, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    case 'smoke_puff': {
      // Overlapping soft blobs, deterministic so exports are stable.
      for (let i = 0; i < 18; i++) {
        const a = i * 2.39996;
        const d = Math.sqrt(i / 18) * size * 0.27;
        radial(c + Math.cos(a) * d, c + Math.sin(a) * d, size * (0.2 - (i % 4) * 0.018), [[0, 0.2], [0.55, 0.1], [1, 0]]);
      }
      break;
    }
    case 'pixel_block':
      ctx.fillStyle = white(1);
      ctx.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);
      ctx.fillStyle = white(0.35);
      ctx.fillRect(size * 0.12, size * 0.12, size * 0.76, size * 0.76);
      break;
    case 'heart':
      path(() => {
        ctx.moveTo(0, 94);
        ctx.bezierCurveTo(-150, -8, -74, -128, 0, -46);
        ctx.bezierCurveTo(74, -128, 150, -8, 0, 94);
        ctx.fill();
      }, 1, 20);
      break;
    case 'star_five':
      path(() => {
        star(5, 108, 45);
        ctx.fill();
      }, 1, 18);
      break;
    case 'flame_wisp':
      path(() => {
        ctx.moveTo(8, -118);
        ctx.bezierCurveTo(-14, -52, 78, -24, 60, 46);
        ctx.bezierCurveTo(48, 112, -52, 116, -62, 48);
        ctx.bezierCurveTo(-70, -4, -20, -20, -28, -62);
        ctx.bezierCurveTo(-4, -46, 4, -80, 8, -118);
        ctx.fill();
      }, 0.8, 30);
      break;
    case 'halo_ring':
      radial(c, c, c, [[0, 0], [0.5, 0], [0.68, 0.45], [0.76, 1], [0.84, 0.45], [1, 0]]);
      break;
    case 'cross_sparkle':
      radial(c, c, c * 0.4, [[0, 1], [0.4, 0.4], [1, 0]]);
      path(() => {
        star(4, 122, 9);
        ctx.fill();
      }, 1, 10);
      break;
    case 'crescent':
      path(() => {
        ctx.arc(0, 0, 100, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(44, -26, 88, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    default:
      break;
  }
}
