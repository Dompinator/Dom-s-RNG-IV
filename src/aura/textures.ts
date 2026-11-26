import * as THREE from 'three';
import type { TextureRef } from './types';

const textureCache = new Map<TextureRef, THREE.CanvasTexture>();
const canvasCache = new Map<TextureRef, HTMLCanvasElement>();

function drawProceduralTexture(ref: TextureRef, size = 256): HTMLCanvasElement {
  const existing = canvasCache.get(ref);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  switch (ref) {
    case 'soft_orb': {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.8)');
      grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.25)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      break;
    }

    case 'starburst': {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.6);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 4);
        const rayGrad = ctx.createLinearGradient(0, -cx, 0, cx);
        rayGrad.addColorStop(0, 'rgba(255,255,255,0)');
        rayGrad.addColorStop(0.5, i % 2 === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)');
        rayGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rayGrad;
        const w = i % 2 === 0 ? size * 0.05 : size * 0.025;
        ctx.beginPath();
        ctx.ellipse(0, 0, w, cx * 0.96, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }

    case 'arcane_rune': {
      // Seamless horizontal rune band for rings & cylinders
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, size * 0.12, size, size * 0.76);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.16);
      ctx.lineTo(size, size * 0.16);
      ctx.moveTo(0, size * 0.84);
      ctx.lineTo(size, size * 0.84);
      ctx.stroke();

      const cells = 8;
      const step = size / cells;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < cells; i++) {
        const x0 = i * step + step * 0.5;
        const y0 = cy;
        const r = step * 0.28;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        if (i % 3 === 0) {
          ctx.moveTo(x0, y0 - r);
          ctx.lineTo(x0 + r * 0.75, y0);
          ctx.lineTo(x0, y0 + r);
          ctx.lineTo(x0 - r * 0.75, y0);
          ctx.closePath();
          ctx.moveTo(x0, y0 - r * 0.45);
          ctx.lineTo(x0, y0 + r * 0.45);
        } else if (i % 3 === 1) {
          ctx.arc(x0, y0, r * 0.72, 0, Math.PI * 2);
          ctx.moveTo(x0 - r, y0);
          ctx.lineTo(x0 + r, y0);
        } else {
          ctx.moveTo(x0 - r * 0.6, y0 - r * 0.8);
          ctx.lineTo(x0 + r * 0.6, y0);
          ctx.lineTo(x0 - r * 0.6, y0 + r * 0.8);
          ctx.moveTo(x0 + r * 0.6, y0 - r * 0.8);
          ctx.lineTo(x0 + r * 0.6, y0 + r * 0.8);
        }
        ctx.stroke();
      }
      break;
    }

    case 'hex_grid': {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      const r = size / 8;
      const dx = r * 1.5;
      const dy = r * Math.sqrt(3);
      for (let col = -1; col < 10; col++) {
        for (let row = -1; row < 10; row++) {
          const x = col * dx;
          const y = row * dy + (col % 2 === 0 ? 0 : dy * 0.5);
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k;
            const px = x + r * Math.cos(a);
            const py = y + r * Math.sin(a);
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      break;
    }

    case 'plasma_noise': {
      const img = ctx.createImageData(size, size);
      const d = img.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const nx = (x / size) * Math.PI * 2;
          const ny = (y / size) * Math.PI * 2;
          const v =
            Math.sin(nx * 2 + Math.cos(ny * 3)) * 0.25 +
            Math.cos(ny * 3 - Math.sin(nx * 2)) * 0.25 +
            Math.sin((nx + ny) * 4) * 0.15 +
            0.55;
          const c = Math.max(0, Math.min(255, Math.floor(v * 255)));
          const idx = (y * size + x) * 4;
          d[idx] = 255;
          d[idx + 1] = 255;
          d[idx + 2] = 255;
          d[idx + 3] = c;
        }
      }
      ctx.putImageData(img, 0, 0);
      break;
    }

    case 'spark_streak': {
      ctx.save();
      ctx.translate(cx, cy);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, cx * 0.9);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.11, cx * 0.94, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'vortex_ring': {
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
      grad.addColorStop(0.5, 'rgba(255,255,255,1)');
      grad.addColorStop(0.75, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      // Subtle longitudinal streaks
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < 6; i++) {
        const y = size * (0.3 + i * 0.08);
        ctx.fillRect(0, y, size, 3);
      }
      break;
    }

    case 'crystal_facet': {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, 0, size, size);
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.25)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.75)');
      grad.addColorStop(1, 'rgba(255,255,255,0.15)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size * 0.85, 0);
      ctx.lineTo(size * 0.35, size);
      ctx.lineTo(0, size * 0.7);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, size - 4, size - 4);
      break;
    }
  }

  canvasCache.set(ref, canvas);
  return canvas;
}

export function getProceduralTexture(
  ref: TextureRef,
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const cached = textureCache.get(ref);
  if (cached) return cached;

  const canvas = drawProceduralTexture(ref);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;

  textureCache.set(ref, tex);
  return tex;
}

export async function renderTextureToPngBlob(ref: TextureRef): Promise<Blob> {
  const canvas = drawProceduralTexture(ref, 256);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`Failed to render texture ${ref} to PNG`));
    }, 'image/png');
  });
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 10, cx, cx, cx);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.32)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
