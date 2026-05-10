import { db, productCategoriesTable, productVariantsTable, productOptionGroupsTable, productOptionsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function uid(prefix: string, name: string) {
  return `${prefix}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 40)}`;
}

const COFFEE_CAT_ID  = "cat_coffee";
const MATCHA_CAT_ID  = "cat_matcha";
const TEA_CAT_ID     = "cat_tea";
const COOKIES_CAT_ID = "cat_cookies";

const CATEGORIES = [
  { id: COFFEE_CAT_ID,  name: "Coffee",      slug: "coffee",      description: "Freshly brewed espresso-based drinks",  sortOrder: 1, showPublic: true, showWholesale: false },
  { id: MATCHA_CAT_ID,  name: "Matcha",      slug: "matcha",      description: "Premium Japanese matcha drinks",         sortOrder: 2, showPublic: true, showWholesale: false },
  { id: TEA_CAT_ID,     name: "Tea",         slug: "tea",         description: "Premium loose-leaf teas",                sortOrder: 3, showPublic: true, showWholesale: false },
  { id: COOKIES_CAT_ID, name: "Cookies",     slug: "cookies",     description: "Freshly baked cookies",                 sortOrder: 4, showPublic: true, showWholesale: true  },
  { id: "cat_cold",     name: "Cold Drinks", slug: "cold-drinks", description: "Refreshing cold beverages",              sortOrder: 5, showPublic: true, showWholesale: false },
  { id: "cat_softserve", name: "Soft Serve", slug: "soft-serve",  description: "House-made soft serve ice cream",        sortOrder: 6, showPublic: true, showWholesale: false },
  { id: "cat_specials", name: "Specials",    slug: "specials",    description: "Daily and seasonal specials",            sortOrder: 7, showPublic: true, showWholesale: false },
  { id: "cat_seasonal", name: "Seasonal",    slug: "seasonal",    description: "Limited seasonal offerings",             sortOrder: 8, showPublic: true, showWholesale: false },
  { id: "cat_merch",    name: "Merch",       slug: "merch",       description: "Butterfield branded merchandise",        sortOrder: 9, showPublic: true, showWholesale: false },
  { id: "cat_wholesale", name: "Wholesale",  slug: "wholesale",   description: "Wholesale-only products",                sortOrder: 10, showPublic: false, showWholesale: true },
];

// Coffee products: [name, base price (smallest), isSingleSize]
const COFFEE_PRODUCTS: { name: string; description: string; base: number; variants: { name: string; priceCents: number }[] }[] = [
  { name: "Cappuccino",     description: "Espresso with steamed milk and a thick layer of velvety foam",          base: 450, variants: [{ name: "Small", priceCents: 450 }, { name: "Medium", priceCents: 550 }, { name: "Large", priceCents: 700 }] },
  { name: "Latte",          description: "Espresso with steamed milk and a light touch of microfoam",             base: 450, variants: [{ name: "Small", priceCents: 450 }, { name: "Medium", priceCents: 550 }, { name: "Large", priceCents: 700 }] },
  { name: "Flat White",     description: "Ristretto shots with steamed, velvety milk — the Australian classic",   base: 450, variants: [{ name: "Small", priceCents: 450 }, { name: "Medium", priceCents: 550 }, { name: "Large", priceCents: 700 }] },
  { name: "Long Black",     description: "Double espresso poured over hot water — bold and intense",              base: 450, variants: [{ name: "Small", priceCents: 450 }, { name: "Medium", priceCents: 550 }, { name: "Large", priceCents: 700 }] },
  { name: "Mocha",          description: "Espresso with steamed milk and rich chocolate — a café favourite",      base: 500, variants: [{ name: "Small", priceCents: 500 }, { name: "Medium", priceCents: 600 }, { name: "Large", priceCents: 750 }] },
  { name: "White Choc Mocha", description: "Espresso with creamy white chocolate and steamed milk",              base: 550, variants: [{ name: "Small", priceCents: 550 }, { name: "Medium", priceCents: 650 }, { name: "Large", priceCents: 750 }] },
  { name: "Chai Latte",     description: "Spiced chai blend with steamed milk — warming and aromatic",            base: 500, variants: [{ name: "Small", priceCents: 500 }, { name: "Medium", priceCents: 600 }, { name: "Large", priceCents: 750 }] },
  { name: "Belgian Choc",   description: "Premium Belgian hot chocolate with silky steamed milk",                 base: 650, variants: [{ name: "Small", priceCents: 650 }, { name: "Medium", priceCents: 700 }, { name: "Large", priceCents: 750 }] },
  { name: "Piccolo",        description: "A ristretto with a small pour of steamed milk — intense and sweet",     base: 450, variants: [{ name: "One Size", priceCents: 450 }] },
  { name: "Espresso",       description: "A pure shot of concentrated espresso — the foundation of all coffee",   base: 400, variants: [{ name: "One Size", priceCents: 400 }] },
  { name: "Macchiato",      description: "Espresso 'stained' with a small dash of foamed milk",                   base: 450, variants: [{ name: "One Size", priceCents: 450 }] },
  { name: "Matcha",         description: "Ceremonial grade matcha whisked with steamed milk — earthy and smooth", base: 650, variants: [{ name: "Small", priceCents: 650 }, { name: "Medium", priceCents: 700 }, { name: "Large", priceCents: 750 }] },
  { name: "Dirty Chai",     description: "Spiced chai with an espresso shot for an extra kick",                   base: 650, variants: [{ name: "Small", priceCents: 650 }, { name: "Medium", priceCents: 700 }, { name: "Large", priceCents: 750 }] },
  { name: "Dirty Matcha",   description: "Matcha latte with an espresso shot — the best of both worlds",          base: 600, variants: [{ name: "Small", priceCents: 600 }, { name: "Medium", priceCents: 650 }, { name: "Large", priceCents: 700 }] },
  { name: "Tea",            description: "Premium loose-leaf tea served in a pot — choose your blend",            base: 400, variants: [{ name: "Small", priceCents: 400 }, { name: "Medium", priceCents: 500 }, { name: "Large", priceCents: 600 }] },
];

// Option groups and their options
const OPTION_GROUPS: {
  id: string; name: string; description?: string; selectionType: string; isRequired: boolean;
  sortOrder: number; appliesToCategoryIds: string[]; appliesToProductIds?: string[]; excludeProductIds?: string[];
  options: { name: string; priceAdjustmentCents: number; isDefault?: boolean }[];
}[] = [
  {
    id: "og_milk", name: "Milk Type", selectionType: "single", isRequired: false, sortOrder: 10,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [
      { name: "Full Cream",    priceAdjustmentCents: 0,   isDefault: true },
      { name: "Skim",          priceAdjustmentCents: 0 },
      { name: "Almond +$1",   priceAdjustmentCents: 100 },
      { name: "Oat +$1",      priceAdjustmentCents: 100 },
      { name: "Soy +$1",      priceAdjustmentCents: 100 },
      { name: "Lactose Free +$1", priceAdjustmentCents: 100 },
      { name: "Coconut +$1",  priceAdjustmentCents: 100 },
    ],
  },
  {
    id: "og_sugar", name: "Sugar", selectionType: "single", isRequired: false, sortOrder: 20,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [
      { name: "No Sugar",   priceAdjustmentCents: 0, isDefault: true },
      { name: "1 Sugar",    priceAdjustmentCents: 0 },
      { name: "2 Sugars",   priceAdjustmentCents: 0 },
      { name: "3 Sugars",   priceAdjustmentCents: 0 },
      { name: "4 Sugars",   priceAdjustmentCents: 0 },
      { name: "Equal",      priceAdjustmentCents: 0 },
      { name: "Stevia",     priceAdjustmentCents: 0 },
      { name: "Raw Sugar",  priceAdjustmentCents: 0 },
    ],
  },
  {
    id: "og_honey", name: "Honey", selectionType: "single", isRequired: false, sortOrder: 25,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [
      { name: "No Honey",          priceAdjustmentCents: 0,  isDefault: true },
      { name: "Add Honey +$0.50",  priceAdjustmentCents: 50 },
    ],
  },
  {
    id: "og_strength", name: "Coffee Strength", selectionType: "single", isRequired: false, sortOrder: 30,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [
      { name: "Regular",                 priceAdjustmentCents: 0,   isDefault: true },
      { name: "Weak",                    priceAdjustmentCents: 0 },
      { name: "Strong",                  priceAdjustmentCents: 0 },
      { name: "Extra Shot +$1",          priceAdjustmentCents: 100 },
      { name: "Double Extra Shot +$2",   priceAdjustmentCents: 200 },
    ],
  },
  {
    id: "og_decaf", name: "Decaf", selectionType: "single", isRequired: false, sortOrder: 35,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [
      { name: "Regular Coffee",  priceAdjustmentCents: 0,  isDefault: true },
      { name: "Decaf +$0.50",    priceAdjustmentCents: 50 },
    ],
  },
  {
    id: "og_temperature", name: "Temperature", selectionType: "single", isRequired: false, sortOrder: 40,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [
      { name: "Normal",      priceAdjustmentCents: 0, isDefault: true },
      { name: "Extra Hot",   priceAdjustmentCents: 0 },
      { name: "Warm",        priceAdjustmentCents: 0 },
      { name: "Not Too Hot", priceAdjustmentCents: 0 },
    ],
  },
  {
    id: "og_fullness", name: "Cup Fullness", selectionType: "single", isRequired: false, sortOrder: 45,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [
      { name: "Normal",      priceAdjustmentCents: 0, isDefault: true },
      { name: "3/4 Full",    priceAdjustmentCents: 0 },
      { name: "Extra Full",  priceAdjustmentCents: 0 },
      { name: "Leave Room",  priceAdjustmentCents: 0 },
      { name: "Half Full",   priceAdjustmentCents: 0 },
    ],
  },
  {
    id: "og_syrup", name: "Syrups", selectionType: "single", isRequired: false, sortOrder: 50,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [
      { name: "No Syrup",            priceAdjustmentCents: 0,   isDefault: true },
      { name: "Vanilla +$1",         priceAdjustmentCents: 100 },
      { name: "Caramel +$1",         priceAdjustmentCents: 100 },
      { name: "Hazelnut +$1",        priceAdjustmentCents: 100 },
      { name: "White Chocolate +$1", priceAdjustmentCents: 100 },
      { name: "Blue Vanilla +$1",    priceAdjustmentCents: 100 },
    ],
  },
  {
    id: "og_other", name: "Other Options", selectionType: "multi", isRequired: false, sortOrder: 60,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [
      { name: "No Chocolate on Top",      priceAdjustmentCents: 0 },
      { name: "Extra Chocolate Powder",   priceAdjustmentCents: 0 },
      { name: "Cinnamon",                 priceAdjustmentCents: 0 },
      { name: "No Lid",                   priceAdjustmentCents: 0 },
      { name: "Own Cup",                  priceAdjustmentCents: 0 },
    ],
  },
  {
    id: "og_tea_flavour", name: "Tea Flavour", selectionType: "single", isRequired: true, sortOrder: 10,
    appliesToCategoryIds: [],
    appliesToProductIds: [], // will be filled with Tea product ID below
    options: [
      { name: "English Breakfast",     priceAdjustmentCents: 0, isDefault: true },
      { name: "Earl Grey",             priceAdjustmentCents: 0 },
      { name: "Peppermint",            priceAdjustmentCents: 0 },
      { name: "Lemongrass & Ginger",   priceAdjustmentCents: 0 },
      { name: "Green Tea",             priceAdjustmentCents: 0 },
    ],
  },
  {
    id: "og_barista_notes", name: "Barista Notes", selectionType: "text", isRequired: false, sortOrder: 99,
    appliesToCategoryIds: [COFFEE_CAT_ID],
    options: [],
  },
];

async function main() {
  console.log("🌱 Seeding Butterfield product catalog...\n");

  // 1. Upsert categories
  console.log("📂 Seeding categories...");
  for (const cat of CATEGORIES) {
    const existing = await db.select().from(productCategoriesTable).where(eq(productCategoriesTable.id, cat.id));
    if (existing.length === 0) {
      await db.insert(productCategoriesTable).values({
        id: cat.id, name: cat.name, slug: cat.slug, description: cat.description ?? null,
        sortOrder: cat.sortOrder, isActive: true, showPublic: cat.showPublic,
        showWholesale: cat.showWholesale, isPickupAvailable: true, isDeliveryAvailable: false,
      });
      console.log(`  ✓ Created category: ${cat.name}`);
    } else {
      console.log(`  · Skipped (exists): ${cat.name}`);
    }
  }

  // 2. Seed coffee products + variants
  console.log("\n☕ Seeding coffee products...");
  let teaProductId = "";
  for (const p of COFFEE_PRODUCTS) {
    const productId = uid("prod", p.name);
    const existing = await db.select().from(productsTable).where(eq(productsTable.id, productId));

    if (existing.length === 0) {
      await db.insert(productsTable).values({
        id: productId, categoryId: COFFEE_CAT_ID, name: p.name, description: p.description,
        category: "coffee", productType: "coffee", priceCents: p.base,
        isAvailable: true, isActive: true, isFeatured: false, isNew: false,
        isWholesaleAvailable: false, isStaffOnly: false, isAppOnly: false,
        isLimitedDrop: false, isSoldOut: false, isComingSoon: false, isPickupOnly: true,
        sortOrder: COFFEE_PRODUCTS.indexOf(p),
        minOrderQty: 1, wholesaleAccessMode: "all",
        tags: "[]", allergens: "[]", dietaryTags: "[]",
      });
      console.log(`  ✓ Created product: ${p.name}`);
    } else {
      // Update categoryId if not set
      if (!existing[0].categoryId) {
        await db.update(productsTable).set({ categoryId: COFFEE_CAT_ID }).where(eq(productsTable.id, productId));
      }
      console.log(`  · Exists, updating: ${p.name}`);
    }

    if (p.name === "Tea") teaProductId = productId;

    // Seed variants
    for (let i = 0; i < p.variants.length; i++) {
      const v = p.variants[i];
      const variantId = uid("var", `${p.name}_${v.name}`);
      const existingVar = await db.select().from(productVariantsTable).where(eq(productVariantsTable.id, variantId));
      if (existingVar.length === 0) {
        await db.insert(productVariantsTable).values({
          id: variantId, productId, name: v.name, priceCents: v.priceCents, sortOrder: i, isActive: true,
        });
      }
    }
  }

  // 3. Seed option groups + options
  console.log("\n⚙️  Seeding option groups...");
  for (const group of OPTION_GROUPS) {
    // For Tea Flavour, apply to tea product
    let appliesToProductIds = group.appliesToProductIds ?? [];
    if (group.id === "og_tea_flavour" && teaProductId) {
      appliesToProductIds = [teaProductId];
    }

    const existingGroup = await db.select().from(productOptionGroupsTable).where(eq(productOptionGroupsTable.id, group.id));
    if (existingGroup.length === 0) {
      await db.insert(productOptionGroupsTable).values({
        id: group.id, name: group.name, description: group.description ?? null,
        selectionType: group.selectionType, isRequired: group.isRequired,
        minSelections: 0, maxSelections: null, sortOrder: group.sortOrder, isActive: true,
        appliesToCategoryIds: JSON.stringify(group.appliesToCategoryIds),
        appliesToProductIds:  JSON.stringify(appliesToProductIds),
        excludeProductIds:    JSON.stringify(group.excludeProductIds ?? []),
      });
      console.log(`  ✓ Created option group: ${group.name}`);
    } else {
      // Update product IDs for tea flavour
      if (group.id === "og_tea_flavour" && teaProductId) {
        await db.update(productOptionGroupsTable)
          .set({ appliesToProductIds: JSON.stringify([teaProductId]) })
          .where(eq(productOptionGroupsTable.id, group.id));
      }
      console.log(`  · Exists: ${group.name}`);
    }

    // Seed options
    for (let i = 0; i < group.options.length; i++) {
      const opt = group.options[i];
      const optId = uid("opt", `${group.id}_${opt.name}`);
      const existingOpt = await db.select().from(productOptionsTable).where(eq(productOptionsTable.id, optId));
      if (existingOpt.length === 0) {
        await db.insert(productOptionsTable).values({
          id: optId, groupId: group.id, name: opt.name,
          priceAdjustmentCents: opt.priceAdjustmentCents,
          sortOrder: i, isActive: true, isDefault: opt.isDefault ?? false,
        });
      }
    }
  }

  console.log("\n✅ Coffee menu seed complete!\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
