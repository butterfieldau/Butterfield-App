import { db, customerProfilesTable, storeSettingsTable } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';

export type LoyaltyTierKey = 'blue' | 'silver' | 'gold' | 'black';

export type LoyaltyTierSetting = {
  key: LoyaltyTierKey;
  label: string;
  spendThresholdCents: number;
  gradient: [string, string];
  accent: string;
  progressColor: string;
  benefits: string[];
  rewardSettings: string;
};

export type LoyaltyTierSettings = Record<LoyaltyTierKey, LoyaltyTierSetting>;

export const LOYALTY_TIER_SETTINGS_KEY = 'loyalty_tier_settings';

export const DEFAULT_LOYALTY_TIER_SETTINGS: LoyaltyTierSettings = {
  blue: {
    key: 'blue',
    label: 'Blue',
    spendThresholdCents: 20000,
    gradient: ['#1493FF', '#0C63D8'],
    accent: '#1493FF',
    progressColor: '#7FD3FF',
    benefits: [
      'Base tier entry experience',
      'Birthday reward eligibility',
      'App-only member offers',
      'Standard points earning',
    ],
    rewardSettings: 'Standard member rewards and app offers.',
  },
  silver: {
    key: 'silver',
    label: 'Silver',
    spendThresholdCents: 50000,
    gradient: ['#B7C0CD', '#747F90'],
    accent: '#D6DEE8',
    progressColor: '#EEF3F9',
    benefits: [
      'Everything in Blue',
      'Higher-value monthly rewards',
      'Earlier drop access',
      'Stronger loyalty reward settings',
    ],
    rewardSettings: 'Improved monthly rewards and priority access.',
  },
  gold: {
    key: 'gold',
    label: 'Gold',
    spendThresholdCents: 100000,
    gradient: ['#E3B55F', '#A77516'],
    accent: '#F4D48C',
    progressColor: '#FFF2CC',
    benefits: [
      'Everything in Silver',
      'Priority member treatment',
      'Richer ongoing benefits',
      'Premium reward unlocks',
    ],
    rewardSettings: 'Premium monthly rewards and priority treatment.',
  },
  black: {
    key: 'black',
    label: 'Black',
    spendThresholdCents: 200000,
    gradient: ['#1A1E27', '#05070B'],
    accent: '#51A9FF',
    progressColor: '#93C5FD',
    benefits: [
      'Everything in Gold',
      'Top-tier exclusive benefits',
      'Best reward settings',
      'Highest-value member treatment',
    ],
    rewardSettings: 'Top-tier exclusives, highest-value rewards and VIP treatment.',
  },
};

function normalizeTierKey(input: string | null | undefined): LoyaltyTierKey {
  switch ((input ?? '').toLowerCase()) {
    case 'blue':
    case 'bronze':
      return 'blue';
    case 'silver':
      return 'silver';
    case 'gold':
      return 'gold';
    case 'black':
    case 'platinum':
      return 'black';
    default:
      return 'blue';
  }
}

function normalizeColor(input: unknown, fallback: string) {
  return typeof input === 'string' && input.trim() ? input.trim() : fallback;
}

function normalizeBenefits(input: unknown, fallback: string[]) {
  if (!Array.isArray(input)) return fallback;
  const cleaned = input
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeThreshold(input: unknown, fallback: number) {
  const numeric = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

export function normalizeLoyaltyTierSettings(input: unknown): LoyaltyTierSettings {
  const raw = typeof input === 'object' && input !== null ? input as Record<string, any> : {};
  const result = {} as LoyaltyTierSettings;

  for (const key of ['blue', 'silver', 'gold', 'black'] as const) {
    const defaults = DEFAULT_LOYALTY_TIER_SETTINGS[key];
    const candidate = raw[key] ?? {};
    result[key] = {
      key,
      label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : defaults.label,
      spendThresholdCents: normalizeThreshold(candidate.spendThresholdCents, defaults.spendThresholdCents),
      gradient: [
        normalizeColor(candidate.gradient?.[0], defaults.gradient[0]),
        normalizeColor(candidate.gradient?.[1], defaults.gradient[1]),
      ],
      accent: normalizeColor(candidate.accent, defaults.accent),
      progressColor: normalizeColor(candidate.progressColor, defaults.progressColor),
      benefits: normalizeBenefits(candidate.benefits, defaults.benefits),
      rewardSettings:
        typeof candidate.rewardSettings === 'string' && candidate.rewardSettings.trim()
          ? candidate.rewardSettings.trim()
          : defaults.rewardSettings,
    };
  }

  // Keep tier progression monotonic so upgrade logic stays sane.
  result.silver.spendThresholdCents = Math.max(result.silver.spendThresholdCents, result.blue.spendThresholdCents);
  result.gold.spendThresholdCents = Math.max(result.gold.spendThresholdCents, result.silver.spendThresholdCents);
  result.black.spendThresholdCents = Math.max(result.black.spendThresholdCents, result.gold.spendThresholdCents);

  return result;
}

export async function getLoyaltyTierSettings(): Promise<LoyaltyTierSettings> {
  const [row] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.key, LOYALTY_TIER_SETTINGS_KEY))
    .limit(1);

  if (!row?.value) return DEFAULT_LOYALTY_TIER_SETTINGS;

  try {
    return normalizeLoyaltyTierSettings(JSON.parse(row.value));
  } catch {
    return DEFAULT_LOYALTY_TIER_SETTINGS;
  }
}

export async function saveLoyaltyTierSettings(
  settings: LoyaltyTierSettings,
  updatedBy?: string | null,
) {
  const normalized = normalizeLoyaltyTierSettings(settings);
  const value = JSON.stringify(normalized);
  await db
    .insert(storeSettingsTable)
    .values({ key: LOYALTY_TIER_SETTINGS_KEY, value, updatedBy: updatedBy ?? null })
    .onConflictDoUpdate({
      target: storeSettingsTable.key,
      set: { value, updatedAt: new Date(), updatedBy: updatedBy ?? null },
    });
  return normalized;
}

export async function computeLoyaltyTierFromSpend(totalSpentCents: number): Promise<LoyaltyTierKey> {
  const settings = await getLoyaltyTierSettings();
  if (totalSpentCents >= settings.black.spendThresholdCents) return 'black';
  if (totalSpentCents >= settings.gold.spendThresholdCents) return 'gold';
  if (totalSpentCents >= settings.silver.spendThresholdCents) return 'silver';
  return 'blue';
}

export function normalizeStoredLoyaltyTier(input: string | null | undefined): LoyaltyTierKey {
  return normalizeTierKey(input);
}

export const ANNUAL_TIER_EXCLUDED_ORDER_STATUSES = ['cancelled', 'refunded', 'voided'] as const;

export function getAnnualTierWindowStart(asOf = new Date()): Date {
  const start = new Date(asOf);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return start;
}

export function isOrderEligibleForAnnualTier(status: string | null | undefined): boolean {
  return !ANNUAL_TIER_EXCLUDED_ORDER_STATUSES.includes(
    String(status ?? '').toLowerCase() as typeof ANNUAL_TIER_EXCLUDED_ORDER_STATUSES[number],
  );
}

export function getTierEligibleSpendForOrder(input: {
  tierEligibleSpendCents?: number | null;
  totalCents: number;
  surchargeCents?: number | null;
  loyaltyPointsUsed?: number | null;
}): number {
  // New orders persist their gross eligible product value. The fallback lets
  // existing annual history retain point redemptions while excluding POS fees.
  if (input.tierEligibleSpendCents != null) {
    return Math.max(0, Number(input.tierEligibleSpendCents));
  }
  return Math.max(
    0,
    Number(input.totalCents ?? 0) -
      Number(input.surchargeCents ?? 0) +
      Number(input.loyaltyPointsUsed ?? 0) * 5,
  );
}

/**
 * Rebuild a member's current tier from qualifying app and attached POS orders.
 * Lifetime profile spend remains intentionally untouched for reporting.
 */
export async function refreshCustomerAnnualLoyaltyTier(userId: string, asOf = new Date()) {
  const windowStart = getAnnualTierWindowStart(asOf);
  type SpendResult = { rows?: Array<{ annual_tier_spend_cents?: number | string }> };
  const result = await db.execute(
    sql`SELECT COALESCE(SUM(
          COALESCE(
            tier_eligible_spend_cents,
            GREATEST(0, total_cents - COALESCE(surcharge_cents, 0) + COALESCE(loyalty_points_used, 0) * 5)
          )
        ), 0)::int AS annual_tier_spend_cents
        FROM orders
        WHERE user_id = ${userId}
          AND created_at >= ${windowStart}
          AND created_at <= ${asOf}
          AND status NOT IN ('cancelled', 'refunded', 'voided')`,
  ) as unknown as SpendResult;
  const annualTierSpendCents = Math.max(0, Number(result.rows?.[0]?.annual_tier_spend_cents ?? 0));
  const loyaltyTier = await computeLoyaltyTierFromSpend(annualTierSpendCents);

  await db.update(customerProfilesTable)
    .set({ annualTierSpendCents, loyaltyTier, updatedAt: asOf })
    .where(eq(customerProfilesTable.userId, userId));

  return { annualTierSpendCents, loyaltyTier, windowStart, asOf };
}
