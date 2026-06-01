import type { LoyaltyTierSettings } from '@/lib/api';

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

function toTierConfig(key: TierKey, settings?: LoyaltyTierSettings | null): TierConfig {
  if (!settings) return TIER_CONFIG[key];
  const tier = settings[key];
  return {
    key,
    label: tier?.label ?? TIER_CONFIG[key].label,
    spendThreshold: tier?.spendThresholdCents ?? TIER_CONFIG[key].spendThreshold,
    gradient: tier?.gradient ?? TIER_CONFIG[key].gradient,
    accent: tier?.accent ?? TIER_CONFIG[key].accent,
    progressColor: tier?.progressColor ?? TIER_CONFIG[key].progressColor,
  };
}

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
export function getTierConfig(tier: string, settings?: LoyaltyTierSettings | null): TierConfig {
  return toTierConfig(normalizeTierKey(tier), settings);
}

/**
 * Compute the live loyalty tier from total cents spent.
 * Blue is the base member tier, while the progress milestones shown in UI are:
 * Blue $200 -> Silver $500 -> Gold $1,000 -> Black $2,000.
 */
export function getTierBySpendCents(spentCents: number, settings?: LoyaltyTierSettings | null): TierConfig {
  const blackThreshold = settings?.black?.spendThresholdCents ?? 200000;
  const goldThreshold = settings?.gold?.spendThresholdCents ?? 100000;
  const silverThreshold = settings?.silver?.spendThresholdCents ?? 50000;
  if (spentCents >= blackThreshold) return toTierConfig('black', settings);
  if (spentCents >= goldThreshold) return toTierConfig('gold', settings);
  if (spentCents >= silverThreshold) return toTierConfig('silver', settings);
  return toTierConfig('blue', settings);
}

/** Returns the next tier to unlock, or null if already Black. */
export function getNextTierBySpend(spentCents: number, settings?: LoyaltyTierSettings | null): TierConfig | null {
  const blackThreshold = settings?.black?.spendThresholdCents ?? 200000;
  const goldThreshold = settings?.gold?.spendThresholdCents ?? 100000;
  const silverThreshold = settings?.silver?.spendThresholdCents ?? 50000;
  if (spentCents >= blackThreshold) return null;
  if (spentCents >= goldThreshold) return toTierConfig('black', settings);
  if (spentCents >= silverThreshold) return toTierConfig('gold', settings);
  return toTierConfig('silver', settings);
}
