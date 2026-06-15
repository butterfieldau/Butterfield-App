import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

// ── Product Categories ─────────────────────────────────────────────────────
export const productCategoriesTable = pgTable("product_categories", {
  id:                  text("id").primaryKey(),
  name:                text("name").notNull(),
  slug:                text("slug").notNull(),
  description:         text("description"),
  imageUrl:            text("image_url"),
  sortOrder:           integer("sort_order").notNull().default(0),
  isActive:            boolean("is_active").notNull().default(true),
  showPublic:          boolean("show_public").notNull().default(true),
  showWholesale:       boolean("show_wholesale").notNull().default(false),
  isPickupAvailable:   boolean("is_pickup_available").notNull().default(true),
  isDeliveryAvailable: boolean("is_delivery_available").notNull().default(false),
  showOnHome:          boolean("show_on_home").notNull().default(false),
  homeOrder:           integer("home_order").notNull().default(0),
  color:               text("color"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

// ── Product Variants (sizes, flavours, quantities) ─────────────────────────
// productId → products.id (managed via application logic, no FK ref to avoid circular imports)
export const productVariantsTable = pgTable("product_variants", {
  id:         text("id").primaryKey(),
  productId:  text("product_id").notNull(),
  name:       text("name").notNull(),       // "Small", "Medium", "Large", "One Size"
  priceCents: integer("price_cents").notNull(),
  sortOrder:  integer("sort_order").notNull().default(0),
  isActive:   boolean("is_active").notNull().default(true),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

// ── Product Option Groups (Milk Type, Sugar, Syrups, etc.) ─────────────────
// selectionType: "single" | "multi" | "text"
export const productOptionGroupsTable = pgTable("product_option_groups", {
  id:                   text("id").primaryKey(),
  name:                 text("name").notNull(),
  description:          text("description"),
  selectionType:        text("selection_type").notNull().default("single"),
  isRequired:           boolean("is_required").notNull().default(false),
  minSelections:        integer("min_selections").notNull().default(0),
  maxSelections:        integer("max_selections"),
  sortOrder:            integer("sort_order").notNull().default(0),
  isActive:             boolean("is_active").notNull().default(true),
  appliesToCategoryIds: text("applies_to_category_ids"), // JSON: string[]
  appliesToProductIds:  text("applies_to_product_ids"),  // JSON: string[]
  excludeProductIds:    text("exclude_product_ids"),      // JSON: string[]
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
});

// ── Product Options (Full Cream, Skim, Almond +$1, etc.) ──────────────────
export const productOptionsTable = pgTable("product_options", {
  id:                   text("id").primaryKey(),
  groupId:              text("group_id").notNull(),  // → product_option_groups.id
  name:                 text("name").notNull(),
  priceAdjustmentCents: integer("price_adjustment_cents").notNull().default(0),
  sortOrder:            integer("sort_order").notNull().default(0),
  isActive:             boolean("is_active").notNull().default(true),
  isDefault:            boolean("is_default").notNull().default(false),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
});

export type ProductCategory    = typeof productCategoriesTable.$inferSelect;
export type ProductVariant     = typeof productVariantsTable.$inferSelect;
export type ProductOptionGroup = typeof productOptionGroupsTable.$inferSelect;
export type ProductOption      = typeof productOptionsTable.$inferSelect;
