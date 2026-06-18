import { db, storeSettingsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

const RETAIL_DELIVERY_KEY = 'retail_delivery_settings';

export interface RetailDeliverySlot {
  id: string;
  deliveryDow: number;
  deliveryLabel: string;
  cutoffDow: number;
  cutoffDayLabel: string;
  cutoffDayOffset: number;
  cutoffLabel: string;
  cutoffHour: number;
  windowOpen: string;
  windowClose: string;
}

export interface RetailDeliveryConfig {
  enabled: boolean;
  feeCents: number;
  slots: RetailDeliverySlot[];
  blackoutDates: string[];
}

const DEFAULT_RETAIL_DELIVERY: RetailDeliveryConfig = {
  enabled: false,
  feeCents: 1200,
  slots: [],
  blackoutDates: [],
};

export async function getRetailDeliverySettings(): Promise<RetailDeliveryConfig> {
  const [row] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.key, RETAIL_DELIVERY_KEY))
    .limit(1);

  if (!row) return { ...DEFAULT_RETAIL_DELIVERY };

  try {
    const parsed = JSON.parse(row.value);
    return {
      enabled: Boolean(parsed.enabled ?? false),
      feeCents: Number(parsed.feeCents ?? 1200),
      slots: Array.isArray(parsed.slots) ? parsed.slots : [],
      blackoutDates: Array.isArray(parsed.blackoutDates) ? parsed.blackoutDates : [],
    };
  } catch {
    return { ...DEFAULT_RETAIL_DELIVERY };
  }
}

export async function saveRetailDeliverySettings(
  config: RetailDeliveryConfig,
  updatedBy?: string | null,
): Promise<void> {
  const value = JSON.stringify(config);
  await db
    .insert(storeSettingsTable)
    .values({ key: RETAIL_DELIVERY_KEY, value, updatedBy: updatedBy ?? undefined, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: storeSettingsTable.key,
      set: { value, updatedAt: new Date(), updatedBy: updatedBy ?? undefined },
    });
}
