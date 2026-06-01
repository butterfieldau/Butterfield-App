import {
  claimedRewardsTable,
  customerProfilesTable,
  db,
  ordersTable,
  scheduledNotificationsTable,
  usersTable,
} from '@workspace/db';
import { and, desc, eq, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import { sendNotification } from './notificationService.js';
import { logger } from './logger.js';
import { ensureScheduledNotificationSchemaReady } from './ensureScheduledNotificationSchemaReady.js';

export type ScheduledNotificationAudienceType =
  | 'all_customers'
  | 'loyalty_tier'
  | 'active_rewards'
  | 'inactive_customers'
  | 'customer_segment'
  | 'custom_selected_customers';

export type ScheduledNotificationStatus =
  | 'draft'
  | 'scheduled'
  | 'sent'
  | 'cancelled'
  | 'failed';

export interface ScheduledNotificationAudienceFilters {
  loyaltyTier?: 'blue' | 'silver' | 'gold' | 'black';
  inactiveDays?: number;
}

const SUPPORTED_AUDIENCES: ScheduledNotificationAudienceType[] = [
  'all_customers',
  'loyalty_tier',
  'active_rewards',
  'inactive_customers',
];

let processPromise: Promise<void> | null = null;
let started = false;
let intervalHandle: NodeJS.Timeout | null = null;

export function isSupportedScheduledAudience(audienceType: string): audienceType is ScheduledNotificationAudienceType {
  return SUPPORTED_AUDIENCES.includes(audienceType as ScheduledNotificationAudienceType);
}

function safeParseFilters(raw: string | null): ScheduledNotificationAudienceFilters {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ScheduledNotificationAudienceFilters;
  } catch {
    return {};
  }
}

async function resolveAudienceUserIds(
  audienceType: ScheduledNotificationAudienceType,
  audienceFilters: ScheduledNotificationAudienceFilters,
): Promise<string[]> {
  switch (audienceType) {
    case 'all_customers': {
      const rows = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(eq(usersTable.role, 'customer'), eq(usersTable.status, 'active')));
      return rows.map((row) => row.id);
    }
    case 'loyalty_tier': {
      const tier = audienceFilters.loyaltyTier ?? 'blue';
      const rows = await db
        .select({ userId: customerProfilesTable.userId })
        .from(customerProfilesTable)
        .innerJoin(usersTable, eq(usersTable.id, customerProfilesTable.userId))
        .where(
          and(
            eq(customerProfilesTable.loyaltyTier, tier),
            eq(usersTable.role, 'customer'),
            eq(usersTable.status, 'active'),
          ),
        );
      return rows.map((row) => row.userId);
    }
    case 'active_rewards': {
      const now = new Date();
      const rows = await db
        .selectDistinct({ userId: claimedRewardsTable.userId })
        .from(claimedRewardsTable)
        .innerJoin(usersTable, eq(usersTable.id, claimedRewardsTable.userId))
        .where(
          and(
            inArray(claimedRewardsTable.status, ['available', 'applied']),
            eq(usersTable.role, 'customer'),
            eq(usersTable.status, 'active'),
            or(isNull(claimedRewardsTable.expiresAt), sql`${claimedRewardsTable.expiresAt} >= ${now}`),
          ),
        );
      return rows.map((row) => row.userId);
    }
    case 'inactive_customers': {
      const inactiveDays = Math.max(1, audienceFilters.inactiveDays ?? 90);
      const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
      const activeOrderRows = await db
        .selectDistinct({ userId: ordersTable.userId })
        .from(ordersTable)
        .where(and(sql`${ordersTable.userId} IS NOT NULL`, sql`${ordersTable.createdAt} >= ${cutoff}`));
      const activeUserIds = activeOrderRows.map((row) => row.userId).filter(Boolean) as string[];
      const whereClause = activeUserIds.length > 0
        ? and(
            eq(usersTable.role, 'customer'),
            eq(usersTable.status, 'active'),
            notInArray(usersTable.id, activeUserIds),
          )
        : and(eq(usersTable.role, 'customer'), eq(usersTable.status, 'active'));
      const rows = await db.select({ id: usersTable.id }).from(usersTable).where(whereClause);
      return rows.map((row) => row.id);
    }
    default:
      return [];
  }
}

async function sendScheduledNotificationRow(
  row: typeof scheduledNotificationsTable.$inferSelect,
): Promise<void> {
  const audienceFilters = safeParseFilters(row.audienceFilters);
  const userIds = await resolveAudienceUserIds(
    row.audienceType as ScheduledNotificationAudienceType,
    audienceFilters,
  );

  await sendNotification({
    type: 'scheduled_announcement',
    title: row.title,
    body: row.message,
    userIds,
    data: {
      audienceType: row.audienceType,
      imageUrl: row.imageUrl ?? undefined,
      actionType: row.actionType ?? undefined,
      actionValue: row.actionValue ?? undefined,
      scheduledNotificationId: row.id,
    },
    sentBy: row.createdBy,
    logTargetLabel: `scheduled:${row.audienceType}`,
  });
}

export async function processDueScheduledNotifications(): Promise<void> {
  await ensureScheduledNotificationSchemaReady();

  if (processPromise) {
    return processPromise;
  }

  processPromise = (async () => {
    try {
      const due = await db
        .select()
        .from(scheduledNotificationsTable)
        .where(
          and(
            eq(scheduledNotificationsTable.status, 'scheduled'),
            lte(scheduledNotificationsTable.scheduledAt, new Date()),
          ),
        )
        .orderBy(desc(scheduledNotificationsTable.scheduledAt));

      for (const row of due) {
        try {
          await db
            .update(scheduledNotificationsTable)
            .set({ processingStartedAt: new Date(), updatedAt: new Date(), lastError: null })
            .where(eq(scheduledNotificationsTable.id, row.id));

          await sendScheduledNotificationRow(row);

          await db
            .update(scheduledNotificationsTable)
            .set({
              status: 'sent',
              sentAt: new Date(),
              updatedAt: new Date(),
              processingStartedAt: null,
              lastError: null,
            })
            .where(eq(scheduledNotificationsTable.id, row.id));
        } catch (error) {
          logger.error({ err: error, id: row.id }, 'Scheduled notification send failed');
          await db
            .update(scheduledNotificationsTable)
            .set({
              status: 'failed',
              updatedAt: new Date(),
              processingStartedAt: null,
              lastError: error instanceof Error ? error.message : String(error),
            })
            .where(eq(scheduledNotificationsTable.id, row.id));
        }
      }
    } finally {
      processPromise = null;
    }
  })();

  return processPromise;
}

export async function startScheduledNotificationsService() {
  await ensureScheduledNotificationSchemaReady();
  if (started) return;
  started = true;

  await processDueScheduledNotifications().catch((error) => {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Initial scheduled notification processing failed');
  });

  intervalHandle = setInterval(() => {
    processDueScheduledNotifications().catch((error) => {
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Scheduled notification processing loop failed');
    });
  }, 30_000);
}

export function stopScheduledNotificationsService() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  started = false;
}
