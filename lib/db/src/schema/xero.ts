import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const xeroConnectionsTable = pgTable("xero_connections", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("disconnected"),
  tenantId: text("tenant_id"),
  tenantName: text("tenant_name"),
  tenantType: text("tenant_type"),
  scopes: text("scopes"),
  encryptedAccessToken: text("encrypted_access_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  connectedByUserId: text("connected_by_user_id"),
  selectedAt: timestamp("selected_at"),
  lastRefreshedAt: timestamp("last_refreshed_at"),
  defaultSalesAccountCode: text("default_sales_account_code"),
  defaultTaxType: text("default_tax_type").default("OUTPUT"),
  defaultPaymentTerms: text("default_payment_terms").default("30 days"),
  invoiceEmailMode: text("invoice_email_mode").notNull().default("manual"),
  autoCreateOnStatus: text("auto_create_on_status").notNull().default("manual"),
  autoSendOnAuthorise: boolean("auto_send_on_authorise").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const xeroSyncLogsTable = pgTable("xero_sync_logs", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  detailsJson: text("details_json"),
  actorUserId: text("actor_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type XeroConnection = typeof xeroConnectionsTable.$inferSelect;
export type XeroSyncLog = typeof xeroSyncLogsTable.$inferSelect;
