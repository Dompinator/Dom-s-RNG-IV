/** Additional shapes for the Orbiting Objects layer (about 0.7 units across). */
import * as THREE from 'three';
import type { OrbiterShape } from '../../aura/types';
import { mergeParts, shapeGeometry } from './kit';

function starPoints(): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.16 : 0.4;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

export function createExtraOrbiterGeometry(shape: OrbiterShape): THREE.BufferGeometry | null {
  switch (shape) {
    case 'star':
      return shapeGeometry(starPoints(), 0.12);
    case 'heart': {
      const points: [number, number][] = Array.from({ length: 40 }, (_, i) => {
        const t = (i / 40) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return [x * 0.022, y * 0.022];
      });
      return shapeGeometry(points, 0.14);
    }
    case 'diamond':
      return mergeParts([
        new THREE.CylinderGeometry(0.17, 0.32, 0.16, 8).translate(0, 0.1, 0),
        new THREE.ConeGeometry(0.32, 0.38, 8).rotateX(Math.PI).translate(0, -0.17, 0),
      ]);
    case 'pyramid':
      return new THREE.ConeGeometry(0.36, 0.46, 4);
    case 'ring':
      return new THREE.TorusGeometry(0.27, 0.06, 10, 32);
    case 'coin':
      return new THREE.CylinderGeometry(0.3, 0.3, 0.07, 28).rotateX(Math.PI / 2);
    case 'crescent': {
      const shape2d = new THREE.Shape();
      shape2d.absarc(0, 0, 0.36, Math.PI * 0.35, Math.PI * 1.65, false);
      shape2d.quadraticCurveTo(-0.36, 0, Math.cos(Math.PI * 0.35) * 0.36, Math.sin(Math.PI * 0.35) * 0.36);
      return new THREE.ExtrudeGeometry(shape2d, { depth: 0.08, bevelEnabled: false }).center();
    }
    case 'sword':
      return mergeParts([
        shapeGeometry([[-0.055, -0.14], [0.055, -0.14], [0.045, 0.34], [0, 0.46], [-0.045, 0.34]], 0.035),
        new THREE.BoxGeometry(0.26, 0.045, 0.07).translate(0, -0.16, 0),
        new THREE.BoxGeometry(0.045, 0.18, 0.045).translate(0, -0.27, 0),
      ]);
    case 'cross':
      return mergeParts([
        new THREE.BoxGeometry(0.13, 0.7, 0.13),
        new THREE.BoxGeometry(0.46, 0.13, 0.13).translate(0, 0.1, 0),
      ]);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(0.32, 0);
    default:
      return null;
  }
}
