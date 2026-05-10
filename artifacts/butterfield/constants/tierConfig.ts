export type TierKey = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface TierConfig {
  key: TierKey;
  label: string;
  threshold: number;
  gradient: [string, string];
  accent: string;
  progressColor: string;
}

export const TIER_CONFIG: Record<TierKey, TierConfig> = {
  bronze: {
    key: 'bronze', label: 'Bronze', threshold: 0,
    gradient:      ['#D4863A', '#8B4513'],
    accent:        '#CD7F32',
    progressColor: '#FFC27A',
  },
  silver: {
    key: 'silver', label: 'Silver', threshold: 1000,
    gradient:      ['#8E9BAD', '#5A6473'],
    accent:        '#A1A9B4',
    progressColor: '#D0D8E4',
  },
  gold: {
    key: 'gold', label: 'Gold', threshold: 3000,
    gradient:      ['#F59E0B', '#C47E0A'],
    accent:        '#F59E0B',
    progressColor: '#FDE68A',
  },
  platinum: {
    key: 'platinum', label: 'Platinum', threshold: 10000,
    gradient:      ['#818CF8', '#4338CA'],
    accent:        '#818CF8',
    progressColor: '#C7D2FE',
  },
};

export const TIERS_ORDERED: TierConfig[] = [
  TIER_CONFIG.bronze,
  TIER_CONFIG.silver,
  TIER_CONFIG.gold,
  TIER_CONFIG.platinum,
];

export function getTierConfig(tier: string): TierConfig {
  return TIER_CONFIG[tier as TierKey] ?? TIER_CONFIG.bronze;
}

export function getTierByPoints(pts: number): TierConfig {
  if (pts >= 10000) return TIER_CONFIG.platinum;
  if (pts >= 3000)  return TIER_CONFIG.gold;
  if (pts >= 1000)  return TIER_CONFIG.silver;
  return TIER_CONFIG.bronze;
}

export function getNextTier(pts: number): TierConfig | null {
  if (pts >= 10000) return null;
  if (pts >= 3000)  return TIER_CONFIG.platinum;
  if (pts >= 1000)  return TIER_CONFIG.gold;
  return TIER_CONFIG.silver;
}
