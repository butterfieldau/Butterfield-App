import { Router } from 'express';
import { db, productsTable, productVariantsTable, productOptionGroupsTable, productOptionsTable } from '@workspace/db';
import { eq, and, asc } from 'drizzle-orm';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────
function parseArr(val: string | null | undefined): string[] {
  if (!val) return [];
  try { const r = JSON.parse(val); return Array.isArray(r) ? r : []; } catch { return []; }
}

function mapProduct(p: typeof productsTable.$inferSelect) {
  let tags: string[]       = [];
  let allergens: string[]  = [];
  let dietaryTags: string[] = [];
  try { tags        = JSON.parse(p.tags        ?? '[]'); } catch {}
  try { allergens   = JSON.parse(p.allergens   ?? '[]'); } catch {}
  try { dietaryTags = JSON.parse(p.dietaryTags ?? '[]'); } catch {}

  const available = p.isAvailable && !p.isSoldOut;

  return {
    id:          p.id,
    name:        p.name,
    description: p.description ?? '',
    active:      p.isActive && p.isAvailable,
    images:      p.imageUrl ? [p.imageUrl] : [],
    categoryId:  p.categoryId,

    metadata: {
      category:            p.category          ?? 'cookies',
      tags:                tags.join(','),
      available:           available            ? 'true' : 'false',
      isNew:               p.isNew             ? 'true' : 'false',
      isFeatured:          p.isFeatured        ? 'true' : 'false',
      isLimitedDrop:       p.isLimitedDrop     ? 'true' : 'false',
      isComingSoon:        p.isComingSoon      ? 'true' : 'false',
      allergens:           allergens.join(','),
      dietaryTags:         dietaryTags.join(','),
      sku:                 p.sku               ?? '',
      shortDescription:    p.shortDescription  ?? '',
      storageInstructions: p.storageInstructions ?? '',
      servingInstructions: p.servingInstructions ?? '',
      ingredients:         p.ingredients       ?? '',
    },

    prices: [{
      id:          p.stripePriceId ?? `price_local_${p.id}`,
      unit_amount: p.salePriceCents ?? p.priceCents ?? 0,
      currency:    'aud',
      active:      true,
      metadata:    {},
    }],

    priceCents:          p.priceCents,
    salePriceCents:      p.salePriceCents,
    costPriceCents:      p.costPriceCents,
    wholesalePriceCents: p.wholesalePriceCents,
    category:            p.category,
    productType:         p.productType,
    sku:                 p.sku,
    isFeatured:          p.isFeatured,
    isNew:               p.isNew,
    isSoldOut:           p.isSoldOut,
    isLimitedDrop:       p.isLimitedDrop,
    isComingSoon:        p.isComingSoon,
    isPickupOnly:        p.isPickupOnly,
    gstIncluded:         p.gstIncluded,
    allergens,
    dietaryTags,
    tags,
    minOrderQty:         p.minOrderQty,
    maxOrderQty:         p.maxOrderQty,
    stockCount:          p.stockCount,
    sortOrder:           p.sortOrder,
    shortDescription:    p.shortDescription,
    ingredients:         p.ingredients,
    nutritionInfo:       p.nutritionInfo,
    storageInstructions: p.storageInstructions,
    servingInstructions: p.servingInstructions,
    createdAt:           p.createdAt,
  };
}

// ── Resolve option groups applicable to a product ─────────────────────────
async function getProductOptionGroups(productId: string, categoryId: string | null, category: string | null) {
  const allGroups  = await db.select().from(productOptionGroupsTable)
    .where(eq(productOptionGroupsTable.isActive, true))
    .orderBy(asc(productOptionGroupsTable.sortOrder));
  const allOptions = await db.select().from(productOptionsTable)
    .where(eq(productOptionsTable.isActive, true))
    .orderBy(asc(productOptionsTable.sortOrder));

  const applicable = allGroups.filter(g => {
    const catIds     = parseArr(g.appliesToCategoryIds);
    const prodIds    = parseArr(g.appliesToProductIds);
    const excludeIds = parseArr(g.excludeProductIds);

    if (excludeIds.includes(productId)) return false;

    // Matches product explicitly
    if (prodIds.includes(productId)) return true;
    // Matches by categoryId
    if (categoryId && catIds.includes(categoryId)) return true;
    // Matches by legacy category slug
    if (category && catIds.some(id => id === `cat_${category}`)) return true;

    return false;
  });

  return applicable.map(g => ({
    ...g,
    appliesToCategoryIds: parseArr(g.appliesToCategoryIds),
    appliesToProductIds:  parseArr(g.appliesToProductIds),
    excludeProductIds:    parseArr(g.excludeProductIds),
    options: allOptions.filter(o => o.groupId === g.id),
  }));
}

// ── GET /products — public list (with variants, no options for perf) ───────
router.get('/', async (_req, res) => {
  try {
    const products = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.isActive, true), eq(productsTable.isStaffOnly, false)))
      .orderBy(asc(productsTable.sortOrder), asc(productsTable.name));

    const variants = await db.select().from(productVariantsTable)
      .where(eq(productVariantsTable.isActive, true))
      .orderBy(asc(productVariantsTable.sortOrder));

    const data = products.map(p => ({
      ...mapProduct(p),
      variants: variants.filter(v => v.productId === p.id),
      hasVariants: variants.some(v => v.productId === p.id),
    }));

    return res.json({ data });
  } catch {
    return res.json({ data: [] });
  }
});

// ── GET /products/categories — public category list ────────────────────────
router.get('/categories', async (_req, res) => {
  try {
    const { productCategoriesTable: catTable } = await import('@workspace/db');
    const cats = await db.select().from(catTable)
      .where(and(eq(catTable.isActive, true), eq(catTable.showPublic, true)))
      .orderBy(asc(catTable.sortOrder));
    return res.json({ data: cats });
  } catch {
    return res.json({ data: [] });
  }
});

// ── GET /products/:id — full detail with variants + applicable option groups
router.get('/:id', async (req, res) => {
  try {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, req.params.id));

    if (!product || !product.isActive) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const [variants, optionGroups] = await Promise.all([
      db.select().from(productVariantsTable)
        .where(and(eq(productVariantsTable.productId, product.id), eq(productVariantsTable.isActive, true)))
        .orderBy(asc(productVariantsTable.sortOrder)),
      getProductOptionGroups(product.id, product.categoryId, product.category),
    ]);

    return res.json({
      data: {
        ...mapProduct(product),
        variants,
        hasVariants: variants.length > 0,
        optionGroups,
      },
    });
  } catch {
    return res.status(404).json({ error: 'Product not found' });
  }
});

export default router;
