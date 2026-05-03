import { Router } from 'express';
import { db, productsTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';

const router = Router();

// Map a productsTable row to the ApiProduct shape the customer UI expects.
// Keeps full backward compatibility with metadata/prices fields while also
// exposing raw fields for richer clients (product detail screen, cart, etc).
function mapProduct(p: typeof productsTable.$inferSelect) {
  let tags: string[]       = [];
  let allergens: string[]  = [];
  let dietaryTags: string[] = [];
  try { tags        = JSON.parse(p.tags        ?? '[]'); } catch {}
  try { allergens   = JSON.parse(p.allergens   ?? '[]'); } catch {}
  try { dietaryTags = JSON.parse(p.dietaryTags ?? '[]'); } catch {}

  const available = p.isAvailable && !p.isSoldOut;

  return {
    // ── Core fields the customer UI reads directly ──────────────────
    id:          p.id,
    name:        p.name,
    description: p.description ?? '',
    active:      p.isActive && p.isAvailable,
    images:      p.imageUrl ? [p.imageUrl] : [],

    // ── metadata object used by menu.tsx / index.tsx ────────────────
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

    // ── prices array used by getPrice() helpers ─────────────────────
    prices: [{
      id:          p.stripePriceId ?? `price_local_${p.id}`,
      unit_amount: p.salePriceCents ?? p.priceCents ?? 0,
      currency:    'aud',
      active:      true,
      metadata:    {},
    }],

    // ── Raw fields for richer consumers (product detail, cart, etc) ─
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

// Public product list — excludes staff-only, inactive, and archived products.
// isAvailable=false products are included but flagged (shows as sold out).
router.get('/', async (_req, res) => {
  try {
    const products = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.isActive, true),
          eq(productsTable.isStaffOnly, false),
          eq(productsTable.isAppOnly, false),  // app-only products are public
        ),
      )
      .orderBy(productsTable.sortOrder, productsTable.name);

    // Re-include isAppOnly — they should still show publicly in the app
    const appProducts = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.isActive, true),
          eq(productsTable.isStaffOnly, false),
          eq(productsTable.isAppOnly, true),
        ),
      )
      .orderBy(productsTable.sortOrder, productsTable.name);

    const all = [...products, ...appProducts].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    );

    return res.json({ data: all.map(mapProduct) });
  } catch {
    return res.json({ data: [] });
  }
});

// Single product by ID
router.get('/:id', async (req, res) => {
  try {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, req.params.id));
    if (!product || !product.isActive) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.json({ data: mapProduct(product) });
  } catch {
    return res.status(404).json({ error: 'Product not found' });
  }
});

export default router;
