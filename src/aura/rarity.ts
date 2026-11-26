import type { AuraRarityInfo, RarityTier } from './types';

/**
 * Computes the official Dom's RNG IV / AETHER rarity classification strictly from BASE ODDS.
 * Luck multipliers are never factored into classification.
 *
 * - Epic: 1 in 1,000,000 or rarer
 * - Legendary: 1 in 10,000,000 or rarer
 * - Mythic: 1 in 100,000,000 or rarer (triggers global announcement in future game)
 */
export function classifyBaseOdds(rawBaseOdds: number): AuraRarityInfo {
  const safeOdds = Number.isFinite(rawBaseOdds)
    ? Math.max(1, Math.min(1_000_000_000_000, Math.round(rawBaseOdds)))
    : 1;

  let classification: RarityTier = 'Common';
  if (safeOdds >= 100_000_000) {
    classification = 'Mythic';
  } else if (safeOdds >= 10_000_000) {
    classification = 'Legendary';
  } else if (safeOdds >= 1_000_000) {
    classification = 'Epic';
  } else if (safeOdds >= 50_000) {
    classification = 'Rare';
  } else if (safeOdds >= 1_000) {
    classification = 'Uncommon';
  }

  return {
    baseOdds: safeOdds,
    classification,
    globalAnnouncement: classification === 'Mythic',
  };
}

export const RARITY_COLOR_STYLES: Record<
  RarityTier,
  { text: string; accent: string; description: string }
> = {
  Common: {
    text: 'text-slate-300',
    accent: '#94a3b8',
    description: 'Under 1 in 1,000 base odds',
  },
  Uncommon: {
    text: 'text-emerald-400',
    accent: '#34d399',
    description: '1 in 1,000 – 49,999 base odds',
  },
  Rare: {
    text: 'text-sky-400',
    accent: '#38bdf8',
    description: '1 in 50,000 – 999,999 base odds',
  },
  Epic: {
    text: 'text-violet-400',
    accent: '#a78bfa',
    description: '1 in 1,000,000 or rarer',
  },
  Legendary: {
    text: 'text-amber-400',
    accent: '#fbbf24',
    description: '1 in 10,000,000 or rarer',
  },
  Mythic: {
    text: 'text-rose-400',
    accent: '#fb7185',
    description: '1 in 100,000,000 or rarer · Global chat announcement',
  },
};

export function formatOdds(odds: number): string {
  return `1 in ${Math.max(1, Math.round(odds)).toLocaleString('en-US')}`;
}
