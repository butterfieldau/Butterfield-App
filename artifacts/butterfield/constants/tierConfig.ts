export type TierKey = 'blue' | 'silver' | 'gold' | 'black';

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
  blue: {
    key: 'blue', label: 'Blue', spendThreshold: 20000,
    gradient:      ['#1493FF', '#0C63D8'],
    accent:        '#1493FF',
    progressColor: '#7FD3FF',
  },
  silver: {
    key: 'silver', label: 'Silver', spendThreshold: 50000,  // $500
    gradient:      ['#B7C0CD', '#747F90'],
    accent:        '#D6DEE8',
    progressColor: '#EEF3F9',
  },
  gold: {
    key: 'gold', label: 'Gold', spendThreshold: 100000,      // $1,000
    gradient:      ['#E3B55F', '#A77516'],
    accent:        '#F4D48C',
    progressColor: '#FFF2CC',
  },
  black: {
    key: 'black', label: 'Black', spendThreshold: 200000, // $2,000
    gradient:      ['#1A1E27', '#05070B'],
    accent:        '#51A9FF',
    progressColor: '#93C5FD',
  },
};

export const TIERS_ORDERED: TierConfig[] = [
  TIER_CONFIG.blue,
  TIER_CONFIG.silver,
  TIER_CONFIG.gold,
  TIER_CONFIG.black,
];

export function normalizeTierKey(tier: string | null | undefined): TierKey {
  switch ((tier ?? '').toLowerCase()) {
    case 'bronze':
    case 'blue':
      return 'blue';
    case 'silver':
      return 'silver';
    case 'gold':
      return 'gold';
    case 'platinum':
    case 'black':
      return 'black';
    default:
      return 'blue';
  }
}

/** Resolve a tier key (from the server) to its full config. */
export function getTierConfig(tier: string): TierConfig {
  return TIER_CONFIG[normalizeTierKey(tier)];
}

/**
 * Compute the live loyalty tier from total cents spent.
 * Blue is the base member tier, while the progress milestones shown in UI are:
 * Blue $200 -> Silver $500 -> Gold $1,000 -> Black $2,000.
 */
export function getTierBySpendCents(spentCents: number): TierConfig {
  if (spentCents >= 200000) return TIER_CONFIG.black;
  if (spentCents >= 100000) return TIER_CONFIG.gold;
  if (spentCents >= 50000)  return TIER_CONFIG.silver;
  return TIER_CONFIG.blue;
}

/** Returns the next tier to unlock, or null if already Black. */
export function getNextTierBySpend(spentCents: number): TierConfig | null {
  if (spentCents >= 200000) return null;
  if (spentCents >= 100000) return TIER_CONFIG.black;
  if (spentCents >= 50000)  return TIER_CONFIG.gold;
  return TIER_CONFIG.silver;
}
