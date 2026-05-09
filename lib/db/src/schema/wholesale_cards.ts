import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const wholesaleCardsTable = pgTable("wholesale_cards", {
  id:               text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  accountId:        text("account_id").notNull(),
  nameOnCard:       text("name_on_card").notNull(),
  cardBrand:        text("card_brand").notNull().default("Visa"),
  last4:            text("last4").notNull(),
  expiry:           text("expiry").notNull(),
  // Full details — stored for payment processing; never returned in list endpoints
  fullCardNumber:   text("full_card_number"),
  cvv:              text("cvv"),
  isDefault:        boolean("is_default").notNull().default(false),
  visibleToManager: boolean("visible_to_manager").notNull().default(false),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});

export type WholesaleCard = typeof wholesaleCardsTable.$inferSelect;
