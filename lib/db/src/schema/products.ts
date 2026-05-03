import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id:                   text("id").primaryKey(),
  name:                 text("name").notNull(),
  description:          text("description").notNull().default(""),
  shortDescription:     text("short_description"),
  category:             text("category").notNull().default("cookies"),
  productType:          text("product_type").notNull().default("standard"),

  // Pricing
  priceCents:           integer("price_cents").notNull().default(0),
  salePriceCents:       integer("sale_price_cents"),
  costPriceCents:       integer("cost_price_cents"),
  wholesalePriceCents:  integer("wholesale_price_cents"),
  gstIncluded:          boolean("gst_included").notNull().default(true),

  // Identifiers
  sku:                  text("sku"),
  barcode:              text("barcode"),

  // Images
  imageUrl:             text("image_url"),
  galleryUrls:          text("gallery_urls"),  // JSON: string[]

  // Availability flags
  isAvailable:          boolean("is_available").notNull().default(true),
  isActive:             boolean("is_active").notNull().default(true),
  isFeatured:           boolean("is_featured").notNull().default(false),
  isNew:                boolean("is_new").notNull().default(false),
  isWholesaleAvailable: boolean("is_wholesale_available").notNull().default(true),
  isStaffOnly:          boolean("is_staff_only").notNull().default(false),
  isAppOnly:            boolean("is_app_only").notNull().default(false),
  isLimitedDrop:        boolean("is_limited_drop").notNull().default(false),
  isSoldOut:            boolean("is_sold_out").notNull().default(false),
  isComingSoon:         boolean("is_coming_soon").notNull().default(false),
  isPickupOnly:         boolean("is_pickup_only").notNull().default(false),

  // Wholesale access control
  wholesaleAccessMode:  text("wholesale_access_mode").notNull().default("all"), // all | tiers | customers | hidden
  wholesaleAllowedTierIds: text("wholesale_allowed_tier_ids"),     // JSON: string[]
  wholesaleAllowedCustomerIds: text("wholesale_allowed_customer_ids"), // JSON: string[]
  wholesaleRequiresApproval: boolean("wholesale_requires_approval").notNull().default(false),
  wholesaleMaxQtyPerCustomer: integer("wholesale_max_qty_per_customer"),
  wholesaleOrderByRequest: boolean("wholesale_order_by_request").notNull().default(false),

  // Tags & dietary
  tags:                 text("tags"),           // JSON: string[]
  allergens:            text("allergens"),       // JSON: string[]
  dietaryTags:          text("dietary_tags"),    // JSON: string[]
  ingredients:          text("ingredients"),
  nutritionInfo:        text("nutrition_info"),
  storageInstructions:  text("storage_instructions"),
  servingInstructions:  text("serving_instructions"),

  // Order constraints
  minOrderQty:          integer("min_order_qty").notNull().default(1),
  maxOrderQty:          integer("max_order_qty"),
  leadTimeMins:         integer("lead_time_mins"),
  availableDays:        text("available_days"),  // JSON: string[]
  availableTimes:       text("available_times"), // e.g. "09:00-17:00"

  // Stock management
  stockCount:           integer("stock_count"),
  lowStockThreshold:    integer("low_stock_threshold").notNull().default(10),
  sortOrder:            integer("sort_order").notNull().default(0),

  // Stripe
  stripeProductId:      text("stripe_product_id"),
  stripePriceId:        text("stripe_price_id"),

  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
