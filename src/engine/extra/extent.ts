/** Approximate height above the anchor, so the aura title clears new layers. */
import type { AuraLayer } from '../../aura/types';

export function getExtraLayerExtent(layer: AuraLayer): number {
  const s = layer.settings;
  const scale = s.size * Math.max(0.15, s.objectScale ?? 1);
  switch (layer.type) {
    case 'aura_wings': return s.radius * scale * 0.75;
    case 'halo_crowns': return s.radius * scale * 1.2;
    case 'magic_circles':
    case 'shockwaves': return layer.settings.variant === 'stacked' ? s.spread * scale : 0.4;
    case 'floating_weapons': return s.formation === 'sword_rain' ? s.spread * 2 * scale : s.radius * scale;
    case 'singularity': return s.radius * scale;
    case 'aura_flames': return s.spread * scale;
    case 'weather': return Math.min(5, s.spread * 2) * scale;
    case 'floating_symbols':
    case 'celestial_bodies': return s.spread * scale * 0.6;
    case 'ground_eruption': return s.spread * scale;
    case 'chains': return s.spread * scale * 0.7;
    default: return 0.5;
  }
}
