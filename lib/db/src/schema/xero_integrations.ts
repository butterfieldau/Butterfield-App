import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const xeroIntegrationsTable = pgTable("xero_integrations", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("disconnected"),
  tenantId: text("tenant_id"),
  tenantName: text("tenant_name"),
  connectionId: text("connection_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  scope: text("scope"),
  tokenExpiresAt: timestamp("token_expires_at"),
  defaultAccountCode: text("default_account_code"),
  defaultTaxType: text("default_tax_type"),
  defaultInvoiceStatus: text("default_invoice_status").notNull().default("AUTHORISED"),
  brandingThemeId: text("branding_theme_id"),
  brandingThemeName: text("branding_theme_name"),
  connectedBy: text("connected_by"),
  connectedAt: timestamp("connected_at"),
  disconnectedAt: timestamp("disconnected_at"),
  lastSyncAt: timestamp("last_sync_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertXeroIntegrationSchema = createInsertSchema(xeroIntegrationsTable).omit({
  tokenExpiresAt: true,
  connectedAt: true,
  disconnectedAt: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
});

export type XeroIntegration = typeof xeroIntegrationsTable.$inferSelect;
export type InsertXeroIntegration = z.infer<typeof insertXeroIntegrationSchema>;
