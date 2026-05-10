export type TierKey = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface TierConfig {
  key: TierKey;
  label: string;
  /** Minimum total spend in cents to reach this tier (matches server thresholds). */
  spendThreshold: number;
  gradient: [string, string];
  accent: string;
  progressColor: string;
}

export const TIER_CONFIG: Record<TierKey, TierConfig> = {
  bronze: {
    key: 'bronze', label: 'Bronze', spendThreshold: 0,
    gradient:      ['#D4863A', '#8B4513'],
    accent:        '#CD7F32',
    progressColor: '#FFC27A',
  },
  silver: {
    key: 'silver', label: 'Silver', spendThreshold: 15000,  // $150
    gradient:      ['#8E9BAD', '#5A6473'],
    accent:        '#A1A9B4',
    progressColor: '#D0D8E4',
  },
  gold: {
    key: 'gold', label: 'Gold', spendThreshold: 50000,      // $500
    gradient:      ['#F59E0B', '#C47E0A'],
    accent:        '#F59E0B',
    progressColor: '#FDE68A',
  },
  platinum: {
    key: 'platinum', label: 'Platinum', spendThreshold: 100000, // $1,000
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

/** Resolve a tier key (from the server) to its full config. */
export function getTierConfig(tier: string): TierConfig {
  return TIER_CONFIG[tier as TierKey] ?? TIER_CONFIG.bronze;
}

/** Compute the correct tier from total cents spent (mirrors the server calculation). */
export function getTierBySpendCents(spentCents: number): TierConfig {
  if (spentCents >= 100000) return TIER_CONFIG.platinum;
  if (spentCents >= 50000)  return TIER_CONFIG.gold;
  if (spentCents >= 15000)  return TIER_CONFIG.silver;
  return TIER_CONFIG.bronze;
}

/** Returns the next tier to unlock, or null if already Platinum. */
export function getNextTierBySpend(spentCents: number): TierConfig | null {
  if (spentCents >= 100000) return null;
  if (spentCents >= 50000)  return TIER_CONFIG.platinum;
  if (spentCents >= 15000)  return TIER_CONFIG.gold;
  return TIER_CONFIG.silver;
}
