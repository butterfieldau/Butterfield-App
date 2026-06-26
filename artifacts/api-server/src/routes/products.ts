import { Router } from 'express';
import { db, productsTable, productVariantsTable, productOptionGroupsTable, productOptionsTable, ordersTable, productCategoriesTable } from '@workspace/db';
import { eq, and, asc, ne, sql } from 'drizzle-orm';

const router = Router();
const SYDNEY_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────
function getPublicBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? '')
    .split(',')
    .map((d) => d.trim())
    .find(Boolean);
  return domain ? `https://${domain}` : '';
}

function absolutizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = getPublicBaseUrl();
  if (/^https?:\/\//i.test(url)) {
    // Re-absolutize our own storage URLs so they always use the current domain.
    // This fixes records stored with a stale dev/prod domain.
    const storageMatch = url.match(/(\/api\/storage\/objects\/.+)/);
    if (storageMatch) return base ? `${base}${storageMatch[1]}` : storageMatch[1];
    return url;
  }
  if (!base) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function parseArr(val: string | null | undefined): string[] {
  if (!val) return [];
  try { const r = JSON.parse(val); return Array.isArray(r) ? r : []; } catch { return []; }
}

function getSydneyNow(): Date {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
    const hour = get('hour');
    return new Date(
      get('year'),
      get('month') - 1,
      get('day'),
      hour === 24 ? 0 : hour,
      get('minute'),
      get('second'),
    );
  } catch {
    return now;
  }
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return null;
  }
  return hours * 60 + mins;
}

function isWithinAvailableTimeWindow(availableTimes: string | null | undefined, now: Date): boolean {
  if (!availableTimes?.trim()) return true;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const windows = availableTimes
    .split(',')
    .map((window) => window.trim())
    .filter(Boolean);

  if (windows.length === 0) return true;

  return windows.some((window) => {
    const [startRaw, endRaw] = window.split('-').map((part) => part.trim());
    const start = parseTimeToMinutes(startRaw ?? '');
    const end = parseTimeToMinutes(endRaw ?? '');
    if (start == null || end == null) return true;
    if (end < start) {
      return currentMinutes >= start || currentMinutes <= end;
    }
    return currentMinutes >= start && currentMinutes <= end;
  });
}

function isProductOrderableNow(p: typeof productsTable.$inferSelect, now = getSydneyNow()): boolean {
  if (!p.isActive || !p.isAvailable || p.isSoldOut || p.isComingSoon) return false;

  const availableDays = parseArr(p.availableDays).map((day) => day.trim()).filter(Boolean);
  if (availableDays.length > 0) {
    const today = SYDNEY_DAY_LABELS[now.getDay()];
    if (!availableDays.includes(today)) return false;
  }

  return isWithinAvailableTimeWindow(p.availableTimes, now);
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

  const available = isProductOrderableNow(p);
  const images = [
    p.imageUrl,
    ...galleryUrls,
  ].map((url) => absolutizeUrl(url)).filter((url): url is string => !!url);

  return {
    id:          p.id,
    name:        p.name,
    description: p.description ?? '',
    active:      available,
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

    slug:                p.slug ?? undefined,
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
    isAppOnly:           p.isAppOnly,
    sortOrder:           p.sortOrder,
    availableDays:       parseArr(p.availableDays),
    availableTimes:      p.availableTimes,
    shortDescription:    p.shortDescription,
    ingredients:         p.ingredients,
    nutritionInfo:       p.nutritionInfo,
    storageInstructions: p.storageInstructions,
    servingInstructions: p.servingInstructions,
    productUrl:          absolutizeUrl((p as any).productUrl ?? null),
    galleryUrls:         galleryUrls.map((url) => absolutizeUrl(url)).filter((url): url is string => !!url),
    createdAt:           p.createdAt,
  };
}

// ── Resolve option groups applicable to a product ─────────────────────────
async function getProductOptionGroups(productId: string, categoryId: string | null, category: string | null) {
  const [allGroups, allOptions, allCategories] = await Promise.all([
    db.select().from(productOptionGroupsTable)
      .where(eq(productOptionGroupsTable.isActive, true))
      .orderBy(asc(productOptionGroupsTable.sortOrder)),
    db.select().from(productOptionsTable)
      .where(eq(productOptionsTable.isActive, true))
      .orderBy(asc(productOptionsTable.sortOrder)),
    db.select({ id: productCategoriesTable.id, slug: productCategoriesTable.slug })
      .from(productCategoriesTable),
  ]);

  // Build a slug-lookup so we can resolve UUID → slug without a per-group query
  const catSlugById = new Map<string, string>(allCategories.map(c => [c.id, c.slug]));

  const applicable = allGroups.filter(g => {
    const catIds     = parseArr(g.appliesToCategoryIds);
    const prodIds    = parseArr(g.appliesToProductIds);
    const excludeIds = parseArr(g.excludeProductIds);

    if (excludeIds.includes(productId)) return false;

    // Matches product explicitly
    if (prodIds.includes(productId)) return true;
    // Matches by categoryId UUID (product has a FK categoryId)
    if (categoryId && catIds.includes(categoryId)) return true;
    // Matches by legacy category slug prefix
    if (category && catIds.some(id => id === `cat_${category}`)) return true;
    // Matches by resolving any UUID in catIds to its slug and comparing with the product's category string
    // This handles the case where the product's categoryId FK is null but its category slug field is set
    if (category && catIds.some(id => catSlugById.get(id) === category)) return true;

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
const TOP_SELLERS_TTL = 5 * 60 * 1000;

// ── GET /products/top-sellers — ranked by real order frequency ────────────
router.get('/top-sellers', async (_req, res) => {
  try {
    const now = Date.now();
    const sydNow = getSydneyNow();
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
        .where(and(eq(productsTable.isActive, true), eq(productsTable.isFeatured, true), eq(productsTable.isStaffOnly, false), eq(productsTable.isPosOnly, false)))
        .orderBy(asc(productsTable.sortOrder))
        .limit(10);
      const data = featured.filter((p) => isProductOrderableNow(p, sydNow)).map(mapProduct);
      topSellersCache = { data, fetchedAt: now };
      return res.json({ data });
    }

    const idSet = new Set(ranked.map(r => r.product_id));
    const products = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.isActive, true), eq(productsTable.isStaffOnly, false), eq(productsTable.isPosOnly, false)));

    const orderMap = new Map(ranked.map(r => [r.product_id, parseInt(r.order_count, 10)]));

    const data = products
      .filter(p => idSet.has(p.id) && isProductOrderableNow(p, sydNow))
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
    const sydNow = getSydneyNow();
    const products = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.isActive, true), eq(productsTable.isStaffOnly, false), eq(productsTable.isPosOnly, false)))
      .orderBy(asc(productsTable.sortOrder), asc(productsTable.name));

    const variants = await db.select().from(productVariantsTable)
      .where(eq(productVariantsTable.isActive, true))
      .orderBy(asc(productVariantsTable.sortOrder));

    const data = products.filter((p) => isProductOrderableNow(p, sydNow)).map(p => ({
      ...mapProduct(p),
      variants: variants.filter(v => v.productId === p.id),
      hasVariants: variants.some(v => v.productId === p.id),
    }));

    return res.json({ data });
  } catch {
    return res.json({ data: [] });
  }
});

// ── GET /products/categories — customer-facing active category list ───────
// Returns active categories where showPublic = true (visible in the customer ordering app).
// Three-tier fallback so the endpoint survives production DBs at any migration stage:
//   1. Drizzle ORM with showPublic filter (fast path, fully migrated schema)
//   2. Raw SQL with show_public column reference (show_public exists but Drizzle errored)
//   3. Raw SQL without show_public (pre-migration DB — all active categories returned)
router.get('/categories', async (_req, res) => {
  try {
    const { productCategoriesTable: catTable } = await import('@workspace/db');
    const cats = await db.select().from(catTable)
      .where(and(eq(catTable.isActive, true), eq(catTable.showPublic, true)))
      .orderBy(asc(catTable.sortOrder));
    return res.json({ data: cats });
  } catch {
    try {
      const result = await db.execute(sql`
        SELECT
          id, name, slug, description,
          image_url            AS "imageUrl",
          sort_order           AS "sortOrder",
          is_active            AS "isActive",
          show_public          AS "showPublic",
          show_wholesale       AS "showWholesale",
          COALESCE(is_pickup_available,  true)  AS "isPickupAvailable",
          COALESCE(is_delivery_available, false) AS "isDeliveryAvailable",
          COALESCE(show_on_home, false)          AS "showOnHome",
          COALESCE(home_order, 0)                AS "homeOrder",
          color,
          show_pos             AS "showPos",
          created_at           AS "createdAt",
          updated_at           AS "updatedAt"
        FROM product_categories
        WHERE is_active = true AND show_public = true
        ORDER BY sort_order ASC
      `);
      return res.json({ data: result.rows ?? [] });
    } catch {
      // Pre-migration DB: show_pos column doesn't exist — show all active categories.
      try {
        const result = await db.execute(sql`
          SELECT
            id, name, slug, description,
            image_url            AS "imageUrl",
            sort_order           AS "sortOrder",
            is_active            AS "isActive",
            show_public          AS "showPublic",
            show_wholesale       AS "showWholesale",
            COALESCE(is_pickup_available,  true)  AS "isPickupAvailable",
            COALESCE(is_delivery_available, false) AS "isDeliveryAvailable",
            COALESCE(show_on_home, false)          AS "showOnHome",
            COALESCE(home_order, 0)                AS "homeOrder",
            NULL::text                             AS color,
            true                                   AS "showPos",
            created_at           AS "createdAt",
            updated_at           AS "updatedAt"
          FROM product_categories
          WHERE is_active = true
          ORDER BY sort_order ASC
        `);
        return res.json({ data: result.rows ?? [] });
      } catch {
        return res.json({ data: [] });
      }
    }
  }
});

// ── GET /products/:id — full detail with variants + applicable option groups
router.get('/:id', async (req, res) => {
  try {
    const sydNow = getSydneyNow();
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, req.params.id));

    if (!product || !product.isActive || product.isPosOnly) {
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
