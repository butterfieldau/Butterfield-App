import { Router } from 'express';
import { db, productsTable } from '@workspace/db';
import { productCategoriesTable } from '@workspace/db';

const router = Router();

const SEED_SECRET = 'seed-butterfield-drinks-2025';

const NEW_CATEGORIES = [
  { id: 'cat_milkshakes',     name: 'Milkshakes',     slug: 'milkshakes',     sortOrder: 11 },
  { id: 'cat_fusions',        name: 'Fusions',         slug: 'fusions',        sortOrder: 12 },
  { id: 'cat_iced_drinks',    name: 'Iced Drinks',     slug: 'iced-drinks',    sortOrder: 13 },
  { id: 'cat_iced_matcha',    name: 'Iced Matcha',     slug: 'iced-matcha',    sortOrder: 14 },
  { id: 'cat_cookie_frappes', name: 'Cookie Frappes',  slug: 'cookie-frappes', sortOrder: 15 },
];

const NEW_PRODUCTS = [
  // Milkshakes
  { id: 'prod_choc_milkshake',       categoryId: 'cat_milkshakes',     name: 'Chocolate Milkshake',   description: 'Thick and creamy chocolate milkshake made with rich cocoa and whole milk.',                              category: 'milkshakes',     productType: 'milkshake',   priceCents: 800, sortOrder: 1 },
  { id: 'prod_strawberry_milkshake', categoryId: 'cat_milkshakes',     name: 'Strawberry Milkshake',  description: 'Fresh strawberry milkshake blended with real fruit and creamy whole milk.',                             category: 'milkshakes',     productType: 'milkshake',   priceCents: 800, sortOrder: 2 },
  { id: 'prod_vanilla_milkshake',    categoryId: 'cat_milkshakes',     name: 'Vanilla Milkshake',     description: 'Classic vanilla milkshake made with premium vanilla bean and whole milk.',                              category: 'milkshakes',     productType: 'milkshake',   priceCents: 800, sortOrder: 3 },
  { id: 'prod_caramel_milkshake',    categoryId: 'cat_milkshakes',     name: 'Caramel Milkshake',     description: 'Smooth and indulgent caramel milkshake — buttery caramel swirled through creamy whole milk.',          category: 'milkshakes',     productType: 'milkshake',   priceCents: 800, sortOrder: 4 },
  { id: 'prod_coffee_milkshake',     categoryId: 'cat_milkshakes',     name: 'Coffee Milkshake',      description: 'Espresso-powered milkshake blended with whole milk. A caffeine hit in dessert form.',                  category: 'milkshakes',     productType: 'milkshake',   priceCents: 800, sortOrder: 5 },
  // Fusions
  { id: 'prod_sunset_spark',         categoryId: 'cat_fusions',        name: 'Sunset Spark',          description: 'Red Bull fused with our house blend of syrups and ice. Bold, bright and energising.',                    category: 'fusions',        productType: 'fusion',      priceCents: 800, sortOrder: 1, isNew: true, isFeatured: true },
  { id: 'prod_sunrise_spark',        categoryId: 'cat_fusions',        name: 'Sunrise Spark',         description: 'V Energy meets our secret syrup mix over ice. Refreshing, vibrant and dangerously drinkable.',            category: 'fusions',        productType: 'fusion',      priceCents: 800, sortOrder: 2, isNew: true },
  { id: 'prod_zero_breeze',          categoryId: 'cat_fusions',        name: 'Zero Breeze',           description: 'Sprite Zero fused with tropical syrups and ice. All the refreshment, zero the guilt.',                    category: 'fusions',        productType: 'fusion',      priceCents: 800, sortOrder: 3 },
  // Iced Drinks
  { id: 'prod_iced_latte',           categoryId: 'cat_iced_drinks',    name: 'Iced Latte',            description: 'Espresso poured over ice with cold whole milk. Clean, smooth and totally refreshing.',              category: 'iced-drinks',    productType: 'iced-coffee', priceCents: 800, sortOrder: 1, isFeatured: true },
  { id: 'prod_iced_long_black',      categoryId: 'cat_iced_drinks',    name: 'Iced Long Black',       description: 'Double espresso over ice with cold water. Strong, bold and unapologetically black.',                category: 'iced-drinks',    productType: 'iced-coffee', priceCents: 800, sortOrder: 2 },
  { id: 'prod_iced_chocolate',       categoryId: 'cat_iced_drinks',    name: 'Iced Chocolate',        description: 'Rich Belgian chocolate blended with cold milk and poured over ice. Pure indulgence.',              category: 'iced-drinks',    productType: 'iced-coffee', priceCents: 800, sortOrder: 3 },
  { id: 'prod_iced_mocha',           categoryId: 'cat_iced_drinks',    name: 'Iced Mocha',            description: 'Espresso with rich chocolate sauce and cold milk over ice. The best of both worlds.',              category: 'iced-drinks',    productType: 'iced-coffee', priceCents: 800, sortOrder: 4 },
  // Iced Matcha
  { id: 'prod_iced_matcha_regular',  categoryId: 'cat_iced_matcha',    name: 'Iced Matcha',           description: 'Ceremonial grade matcha whisked with whole milk and poured over ice. Earthy, smooth and refreshing.',   category: 'iced-matcha',    productType: 'matcha',      priceCents: 900, sortOrder: 1, isFeatured: true },
  { id: 'prod_iced_matcha_coconut',  categoryId: 'cat_iced_matcha',    name: 'Coconut Iced Matcha',   description: 'Premium matcha with creamy coconut milk over ice. Tropical, smooth and naturally sweet.',               category: 'iced-matcha',    productType: 'matcha',      priceCents: 900, sortOrder: 2 },
  { id: 'prod_chai_matcha',          categoryId: 'cat_iced_matcha',    name: 'Chai Matcha',           description: 'Ceremonial matcha blended with warming chai spices over ice. An unexpected and delicious combo.',       category: 'iced-matcha',    productType: 'matcha',      priceCents: 900, sortOrder: 3, isNew: true },
  // Cookie Frappes
  { id: 'prod_biscoff_frappe',       categoryId: 'cat_cookie_frappes', name: 'Biscoff Frappe',        description: 'Biscoff biscuits blended with milk, ice and our house frappe base. Caramelised cookie heaven.',        category: 'cookie-frappes', productType: 'frappe',      priceCents: 1100, sortOrder: 1, isFeatured: true },
  { id: 'prod_bueno_frappe',         categoryId: 'cat_cookie_frappes', name: 'Bueno Frappe',          description: 'Kinder Bueno blended into a thick, creamy frappe. Hazelnut chocolate in every sip.',                  category: 'cookie-frappes', productType: 'frappe',      priceCents: 1100, sortOrder: 2, isFeatured: true },
  { id: 'prod_oreo_frappe',          categoryId: 'cat_cookie_frappes', name: 'Oreo Frappe',           description: 'Real Oreo cookies blended with milk and ice. Cookies and cream — the drink version.',                  category: 'cookie-frappes', productType: 'frappe',      priceCents: 1100, sortOrder: 3 },
  { id: 'prod_pistachio_frappe',     categoryId: 'cat_cookie_frappes', name: 'Pistachio Frappe',      description: 'Premium pistachio paste blended with milk and ice into a silky frappe. Rich, nutty, unforgettable.', category: 'cookie-frappes', productType: 'frappe',      priceCents: 1100, sortOrder: 4, isNew: true },
];

router.post('/admin/seed-drinks', async (req, res) => {
  const secret = req.headers['x-seed-secret'] ?? req.query['secret'];
  if (secret !== SEED_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    let categoriesAdded = 0;
    let productsAdded = 0;

    for (const cat of NEW_CATEGORIES) {
      await db.insert(productCategoriesTable).values({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        isActive: true,
        showPublic: true,
        showWholesale: false,
        isPickupAvailable: true,
        isDeliveryAvailable: false,
      }).onConflictDoNothing();
      categoriesAdded++;
    }

    for (const p of NEW_PRODUCTS) {
      await db.insert(productsTable).values({
        id: p.id,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        category: p.category,
        productType: p.productType,
        priceCents: p.priceCents,
        sortOrder: p.sortOrder,
        isNew: p.isNew ?? false,
        isFeatured: p.isFeatured ?? false,
        gstIncluded: true,
        isAvailable: true,
        isActive: true,
        isWholesaleAvailable: false,
        isStaffOnly: false,
        isAppOnly: false,
        isLimitedDrop: false,
        isSoldOut: false,
        isComingSoon: false,
        isPickupOnly: false,
        wholesaleAccessMode: 'all',
        wholesaleRequiresApproval: false,
        wholesaleOrderByRequest: false,
        minOrderQty: 1,
        lowStockThreshold: 10,
      }).onConflictDoNothing();
      productsAdded++;
    }

    res.json({
      ok: true,
      categoriesAdded,
      productsAdded,
      message: `Seeded ${categoriesAdded} categories and ${productsAdded} products.`,
    });
  } catch (err: any) {
    req.log?.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
