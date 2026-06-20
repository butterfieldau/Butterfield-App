import { pgTable, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const vaultConfigTable = pgTable("vault_config", {
  id: text("id").primaryKey().default("singleton"),
  pinHash: text("pin_hash"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockoutExpiresAt: timestamp("lockout_expires_at"),
  pinChangedByUserId: text("pin_changed_by_user_id"),
  pinChangedAt: timestamp("pin_changed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vaultRecipesTable = pgTable("vault_recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("cookies"),
  description: text("description"),
  yieldCount: integer("yield_count").notNull().default(1),
  yieldUnit: text("yield_unit").notNull().default("cookies"),
  prepTimeMin: integer("prep_time_min"),
  bakeTimeMin: integer("bake_time_min"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  sellingPriceCents: integer("selling_price_cents"),
  createdByUserId: text("created_by_user_id"),
  updatedByUserId: text("updated_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vaultIngredientsTable = pgTable("vault_ingredients", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id").notNull(),
  name: text("name").notNull(),
  quantity: text("quantity").notNull().default("0"),
  unit: text("unit").notNull().default("g"),
  costCentsPerUnit: integer("cost_cents_per_unit").notNull().default(0),
  supplier: text("supplier"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vaultAccessLogTable = pgTable("vault_access_log", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  recipeId: text("recipe_id"),
  ipAddress: text("ip_address"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type VaultConfig = typeof vaultConfigTable.$inferSelect;
export type VaultRecipe = typeof vaultRecipesTable.$inferSelect;
export type VaultIngredient = typeof vaultIngredientsTable.$inferSelect;
export type VaultAccessLog = typeof vaultAccessLogTable.$inferSelect;
