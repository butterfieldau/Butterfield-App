import { Router } from 'express';
import { db, productsTable, productVariantsTable, productOptionGroupsTable, productOptionsTable, ordersTable } from '@workspace/db';
import { eq, and, asc, ne, sql } from 'drizzle-orm';

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
  let galleryUrls: string[] = [];
  try { tags        = JSON.parse(p.tags        ?? '[]'); } catch {}
  try { allergens   = JSON.parse(p.allergens   ?? '[]'); } catch {}
  try { dietaryTags = JSON.parse(p.dietaryTags ?? '[]'); } catch {}
  try { galleryUrls = JSON.parse((p as any).galleryUrls ?? '[]'); } catch {}

  const available = p.isAvailable && !p.isSoldOut;
  const images = [
    p.imageUrl,
    ...galleryUrls,
  ].filter((url): url is string => !!url);

  return {
    id:          p.id,
    name:        p.name,
    description: p.description ?? '',
    active:      p.isActive && p.isAvailable,
    images,
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
      nutritionInfo:       p.nutritionInfo     ?? '',
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
    productUrl:          (p as any).productUrl ?? null,
    galleryUrls,
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

// ── Top-sellers cache (15-minute TTL) ─────────────────────────────────────
let topSellersCache: { data: ReturnType<typeof mapProduct>[]; fetchedAt: number } | null = null;
const TOP_SELLERS_TTL = 15 * 60 * 1000;

// ── GET /products/top-sellers — ranked by real order frequency ────────────
router.get('/top-sellers', async (_req, res) => {
  try {
    const now = Date.now();
    if (topSellersCache && now - topSellersCache.fetchedAt < TOP_SELLERS_TTL) {
      return res.json({ data: topSellersCache.data });
    }

    // Unnest the JSONB items array across all non-cancelled orders,
    // count how many times each productId appears, return top 10 IDs.
    const rows = await db.execute<{ product_id: string; order_count: string }>(
      sql`
        SELECT elem->>'productId' AS product_id,
               COUNT(*) AS order_count
        FROM ${ordersTable},
             jsonb_array_elements(items::jsonb) AS elem
        WHERE status != 'cancelled'
          AND elem->>'productId' IS NOT NULL
          AND elem->>'productId' != ''
        GROUP BY product_id
        ORDER BY order_count DESC
        LIMIT 10
      `
    );

    const ranked = (rows.rows ?? (rows as unknown as any[])) as { product_id: string; order_count: string }[];

    if (ranked.length === 0) {
      // Fallback: return featured products so the carousel is never empty
      const featured = await db
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.isActive, true), eq(productsTable.isFeatured, true), eq(productsTable.isStaffOnly, false)))
        .orderBy(asc(productsTable.sortOrder))
        .limit(10);
      const data = featured.map(mapProduct);
      topSellersCache = { data, fetchedAt: now };
      return res.json({ data });
    }

    const idSet = new Set(ranked.map(r => r.product_id));
    const products = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.isActive, true), eq(productsTable.isStaffOnly, false)));

    const orderMap = new Map(ranked.map(r => [r.product_id, parseInt(r.order_count, 10)]));

    const data = products
      .filter(p => idSet.has(p.id))
      .map(p => ({ ...mapProduct(p), orderCount: orderMap.get(p.id) ?? 0 }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 10);

    topSellersCache = { data, fetchedAt: now };
    return res.json({ data });
  } catch {
    return res.json({ data: [] });
  }
});

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
