import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const wholesaleTermsAcceptancesTable = pgTable("wholesale_terms_acceptances", {
  id:             text("id").primaryKey(),
  userId:         text("user_id").notNull(),
  businessId:     text("business_id"),
  businessName:   text("business_name"),
  contactName:    text("contact_name"),
  email:          text("email"),
  termsVersion:   text("terms_version").notNull(),
  acceptedAt:     timestamp("accepted_at").notNull().defaultNow(),
  devicePlatform: text("device_platform"),
  appVersion:     text("app_version"),
  ipAddress:      text("ip_address"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const wholesaleSecurityEventsTable = pgTable("wholesale_security_events", {
  id:             text("id").primaryKey(),
  userId:         text("user_id").notNull(),
  businessId:     text("business_id"),
  businessName:   text("business_name"),
  email:          text("email"),
  eventType:      text("event_type").notNull(),
  screenName:     text("screen_name").notNull(),
  termsVersion:   text("terms_version"),
  pricingVersion: text("pricing_version"),
  devicePlatform: text("device_platform"),
  appVersion:     text("app_version"),
  metadata:       jsonb("metadata"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export type WholesaleTermsAcceptance = typeof wholesaleTermsAcceptancesTable.$inferSelect;
export type WholesaleSecurityEvent   = typeof wholesaleSecurityEventsTable.$inferSelect;
