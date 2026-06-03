import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const wholesaleDeliverySettingsTable = pgTable('wholesale_delivery_settings', {
  id: text('id').primaryKey(),
  slotsJson: text('slots_json').notNull().default('[]'),
  cutoffReminderEnabled: boolean('cutoff_reminder_enabled').notNull().default(true),
  lastSentJson: text('last_sent_json').notNull().default('{}'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: text('updated_by'),
});
