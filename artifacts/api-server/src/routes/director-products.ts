import { Router } from 'express';
import { db, productsTable, productCategoriesTable, productVariantsTable, productOptionGroupsTable, productOptionsTable } from '@workspace/db';
import { eq, asc } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';
import { randomUUID } from 'crypto';

const router = Router();
router.use(requireRole('director', 'manager', 'master'));
// Managers must hold the 'products' permission to access any product/category/option route
router.use(requireManagerPermission('products'));

// ── Helper ─────────────────────────────────────────────────────────────────
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
    const storageMatch = url.match(/(\/api\/storage\/objects\/.+)/);
    if (storageMatch) return base ? `${base}${storageMatch[1]}` : storageMatch[1];
    return url;
  }
  if (!base) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function parseJsonArr(val: string | null | undefined): string[] {
  if (!val) return [];
  try { const r = JSON.parse(val); return Array.isArray(r) ? r : []; } catch { return []; }
}

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════════════════════════════

router.get('/categories', async (_req, res) => {
  const [cats, productMeta] = await Promise.all([
    db.select().from(productCategoriesTable).orderBy(asc(productCategoriesTable.sortOrder)),
    db.select({ categoryId: productsTable.categoryId, category: productsTable.category })
      .from(productsTable).where(eq(productsTable.isActive, true)),
  ]);
  // Count products per category — prefer categoryId FK to avoid double-counting
  const byId   = new Map<string, number>();
  const bySlug = new Map<string, number>();
  for (const p of productMeta) {
    if (p.categoryId) byId.set(p.categoryId, (byId.get(p.categoryId) ?? 0) + 1);
    else if (p.category) bySlug.set(p.category, (bySlug.get(p.category) ?? 0) + 1);
  }
  const data = cats.map(cat => ({
    ...cat,
    productCount: (byId.get(cat.id) ?? 0) + (bySlug.get(cat.slug) ?? 0),
  }));
  return res.json({ data });
});

router.post('/categories', async (req, res) => {
  const { name, slug, description, imageUrl, sortOrder, isActive, showPublic, showWholesale, isPickupAvailable, isDeliveryAvailable, showOnHome, homeOrder } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const id = `cat_${randomUUID().slice(0, 12)}`;
  const [cat] = await db.insert(productCategoriesTable).values({
    id, name: name.trim(), slug: slug?.trim() || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    description: description?.trim() || null, imageUrl: imageUrl?.trim() || null,
    sortOrder: sortOrder ?? 0, isActive: isActive ?? true,
    showPublic: showPublic ?? true, showWholesale: showWholesale ?? false,
    isPickupAvailable: isPickupAvailable ?? true, isDeliveryAvailable: isDeliveryAvailable ?? false,
    showOnHome: showOnHome ?? false, homeOrder: homeOrder ?? 0,
  }).returning();
  return res.json({ data: cat });
});

router.patch('/categories/:id', async (req, res) => {
  const { name, slug, description, imageUrl, sortOrder, isActive, showPublic, showWholesale, isPickupAvailable, isDeliveryAvailable, showOnHome, homeOrder } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (slug !== undefined) updates.slug = slug.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl?.trim() || null;
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (showPublic !== undefined) updates.showPublic = Boolean(showPublic);
  if (showWholesale !== undefined) updates.showWholesale = Boolean(showWholesale);
  if (isPickupAvailable !== undefined) updates.isPickupAvailable = Boolean(isPickupAvailable);
  if (isDeliveryAvailable !== undefined) updates.isDeliveryAvailable = Boolean(isDeliveryAvailable);
  if (showOnHome !== undefined) updates.showOnHome = Boolean(showOnHome);
  if (homeOrder !== undefined) updates.homeOrder = Number(homeOrder);
  updates.updatedAt = new Date();
  const [cat] = await db.update(productCategoriesTable).set(updates).where(eq(productCategoriesTable.id, req.params.id)).returning();
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  return res.json({ data: cat });
});

router.delete('/categories/:id', async (req, res) => {
  await db.delete(productCategoriesTable).where(eq(productCategoriesTable.id, req.params.id));
  return res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT VARIANTS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/products/:productId/variants', async (req, res) => {
  const variants = await db.select().from(productVariantsTable)
    .where(eq(productVariantsTable.productId, req.params.productId))
    .orderBy(asc(productVariantsTable.sortOrder));
  return res.json({ data: variants });
});

router.post('/products/:productId/variants', async (req, res) => {
  const { name, priceCents, sortOrder } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  if (priceCents == null || isNaN(Number(priceCents))) return res.status(400).json({ error: 'priceCents is required' });
  const id = `var_${randomUUID().slice(0, 12)}`;
  const [v] = await db.insert(productVariantsTable).values({
    id, productId: req.params.productId, name: name.trim(),
    priceCents: Number(priceCents), sortOrder: sortOrder ?? 0, isActive: true,
  }).returning();
  return res.json({ data: v });
});

router.patch('/products/:productId/variants/:id', async (req, res) => {
  const { name, priceCents, sortOrder, isActive } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (priceCents !== undefined) updates.priceCents = Number(priceCents);
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  const [v] = await db.update(productVariantsTable).set(updates).where(eq(productVariantsTable.id, req.params.id)).returning();
  if (!v) return res.status(404).json({ error: 'Variant not found' });
  return res.json({ data: v });
});

router.delete('/products/:productId/variants/:id', async (req, res) => {
  await db.delete(productVariantsTable).where(eq(productVariantsTable.id, req.params.id));
  return res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// OPTION GROUPS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/option-groups', async (_req, res) => {
  const groups = await db.select().from(productOptionGroupsTable).orderBy(asc(productOptionGroupsTable.sortOrder));
  const options = await db.select().from(productOptionsTable).orderBy(asc(productOptionsTable.sortOrder));
  const data = groups.map(g => ({
    ...g,
    appliesToCategoryIds: parseJsonArr(g.appliesToCategoryIds),
    appliesToProductIds:  parseJsonArr(g.appliesToProductIds),
    excludeProductIds:    parseJsonArr(g.excludeProductIds),
    options: options.filter(o => o.groupId === g.id),
  }));
  return res.json({ data });
});

router.post('/option-groups', async (req, res) => {
  const { name, description, selectionType, isRequired, minSelections, maxSelections, sortOrder,
    appliesToCategoryIds, appliesToProductIds, excludeProductIds } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const id = `og_${randomUUID().slice(0, 12)}`;
  const [g] = await db.insert(productOptionGroupsTable).values({
    id, name: name.trim(), description: description?.trim() || null,
    selectionType: selectionType ?? 'single', isRequired: isRequired ?? false,
    minSelections: minSelections ?? 0, maxSelections: maxSelections ?? null,
    sortOrder: sortOrder ?? 0, isActive: true,
    appliesToCategoryIds: JSON.stringify(appliesToCategoryIds ?? []),
    appliesToProductIds:  JSON.stringify(appliesToProductIds ?? []),
    excludeProductIds:    JSON.stringify(excludeProductIds ?? []),
  }).returning();
  return res.json({ data: { ...g, options: [] } });
});

router.patch('/option-groups/:id', async (req, res) => {
  const { name, description, selectionType, isRequired, minSelections, maxSelections, sortOrder, isActive,
    appliesToCategoryIds, appliesToProductIds, excludeProductIds } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (selectionType !== undefined) updates.selectionType = selectionType;
  if (isRequired !== undefined) updates.isRequired = Boolean(isRequired);
  if (minSelections !== undefined) updates.minSelections = Number(minSelections);
  if (maxSelections !== undefined) updates.maxSelections = maxSelections != null ? Number(maxSelections) : null;
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (appliesToCategoryIds !== undefined) updates.appliesToCategoryIds = JSON.stringify(appliesToCategoryIds);
  if (appliesToProductIds !== undefined) updates.appliesToProductIds = JSON.stringify(appliesToProductIds);
  if (excludeProductIds !== undefined) updates.excludeProductIds = JSON.stringify(excludeProductIds);
  updates.updatedAt = new Date();
  const [g] = await db.update(productOptionGroupsTable).set(updates).where(eq(productOptionGroupsTable.id, req.params.id)).returning();
  if (!g) return res.status(404).json({ error: 'Option group not found' });
  return res.json({ data: g });
});

router.delete('/option-groups/:id', async (req, res) => {
  await db.delete(productOptionGroupsTable).where(eq(productOptionGroupsTable.id, req.params.id));
  return res.json({ success: true });
});

// ── Options within a group ─────────────────────────────────────────────────

router.post('/option-groups/:groupId/options', async (req, res) => {
  const { name, priceAdjustmentCents, sortOrder, isDefault } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const id = `opt_${randomUUID().slice(0, 12)}`;
  const [opt] = await db.insert(productOptionsTable).values({
    id, groupId: req.params.groupId, name: name.trim(),
    priceAdjustmentCents: priceAdjustmentCents ?? 0,
    sortOrder: sortOrder ?? 0, isActive: true, isDefault: isDefault ?? false,
  }).returning();
  return res.json({ data: opt });
});

router.patch('/option-groups/:groupId/options/:id', async (req, res) => {
  const { name, priceAdjustmentCents, sortOrder, isActive, isDefault } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (priceAdjustmentCents !== undefined) updates.priceAdjustmentCents = Number(priceAdjustmentCents);
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (isDefault !== undefined) updates.isDefault = Boolean(isDefault);
  const [opt] = await db.update(productOptionsTable).set(updates).where(eq(productOptionsTable.id, req.params.id)).returning();
  if (!opt) return res.status(404).json({ error: 'Option not found' });
  return res.json({ data: opt });
});

router.delete('/option-groups/:groupId/options/:id', async (req, res) => {
  await db.delete(productOptionsTable).where(eq(productOptionsTable.id, req.params.id));
  return res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// FULL CATALOG (categories + products + variants summary)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/catalog', async (_req, res) => {
  const [categories, products, variants] = await Promise.all([
    db.select().from(productCategoriesTable).orderBy(asc(productCategoriesTable.sortOrder)),
    db.select().from(productsTable).orderBy(asc(productsTable.sortOrder), asc(productsTable.name)),
    db.select().from(productVariantsTable).where(eq(productVariantsTable.isActive, true)).orderBy(asc(productVariantsTable.sortOrder)),
  ]);
  const data = categories.map(cat => ({
    ...cat,
    products: products.filter(p => p.categoryId === cat.id || p.category === cat.slug).map(p => ({
      ...p,
      variants: variants.filter(v => v.productId === p.id),
    })),
  }));
  return res.json({ data });
});

export default router;
