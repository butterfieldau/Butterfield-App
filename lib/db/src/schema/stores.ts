import { pgTable, text, integer, timestamp, boolean, real, pgEnum } from "drizzle-orm/pg-core";

export const storeStatusEnum = pgEnum("store_status", [
  "open",
  "coming_soon",
  "temporarily_closed",
  "closed",
]);

export const storesTable = pgTable("stores", {
  id:               text("id").primaryKey(),
  name:             text("name").notNull(),
  slug:             text("slug").notNull(),
  address:          text("address"),
  suburb:           text("suburb"),
  state:            text("state"),
  postcode:         text("postcode"),
  country:          text("country").notNull().default("Australia"),
  latitude:         real("latitude"),
  longitude:        real("longitude"),
  geofenceRadius:   integer("geofence_radius").notNull().default(100),
  phone:            text("phone"),
  email:            text("email"),
  imageUrl:         text("image_url"),
  status:           storeStatusEnum("status").notNull().default("open"),
  pickupAvailable:  boolean("pickup_available").notNull().default(true),
  deliveryAvailable:boolean("delivery_available").notNull().default(false),
  publicNotes:      text("public_notes"),
  internalNotes:    text("internal_notes"),
  sortOrder:        integer("sort_order").notNull().default(0),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

export const storeOpeningHoursTable = pgTable("store_opening_hours", {
  id:         text("id").primaryKey(),
  storeId:    text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  dayOfWeek:  integer("day_of_week").notNull(), // 0 = Sunday … 6 = Saturday
  openTime:   text("open_time"),               // "06:30"
  closeTime:  text("close_time"),              // "21:00"
  isClosed:   boolean("is_closed").notNull().default(false),
  notes:      text("notes"),
});

export const staffStoreAssignmentsTable = pgTable("staff_store_assignments", {
  id:        text("id").primaryKey(),
  staffId:   text("staff_id").notNull(),
  storeId:   text("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive:  boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Store               = typeof storesTable.$inferSelect;
export type StoreOpeningHours   = typeof storeOpeningHoursTable.$inferSelect;
export type StaffStoreAssignment= typeof staffStoreAssignmentsTable.$inferSelect;
