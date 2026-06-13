import type { ApiProduct } from '@/lib/api';

const PAIRING_RULES: Record<string, string[]> = {
  cookies:      ['coffee', 'matcha', 'tea', 'cold-drinks', 'milkshakes', 'iced-drinks'],
  coffee:       ['cookies', 'desserts', 'pastries', 'sandwiches'],
  matcha:       ['cookies', 'desserts', 'pastries'],
  tea:          ['cookies', 'desserts', 'pastries'],
  desserts:     ['coffee', 'matcha', 'milkshakes', 'cold-drinks'],
  sandwiches:   ['coffee', 'cold-drinks', 'soft-serve', 'iced-drinks'],
  bundles:      ['coffee', 'matcha', 'cold-drinks'],
  pastries:     ['coffee', 'matcha', 'tea'],
  milkshakes:   ['cookies', 'desserts'],
  'cold-drinks':['cookies', 'sandwiches', 'desserts'],
  'iced-drinks':['cookies', 'sandwiches'],
  'soft-serve': ['cookies', 'desserts'],
  'cookie-frappes': ['cookies', 'coffee'],
  fusions:      ['cookies', 'coffee'],
  boxes:        ['coffee', 'matcha', 'tea'],
  merch:        ['coffee', 'cookies'],
};

function getProductCategory(product: ApiProduct): string {
  return (
    (product as any).category ??
    product.metadata?.category ??
    'cookies'
  );
}

function getProductPriceCents(product: ApiProduct): number {
  return (product as any).priceCents ?? product.prices?.[0]?.unit_amount ?? 0;
}

export function getSuggestedProducts(
  currentProduct: ApiProduct,
  allProducts: ApiProduct[],
  excludeIds: string[] = [],
  limit = 4,
): ApiProduct[] {
  const category = getProductCategory(currentProduct);
  const pairedCategories = PAIRING_RULES[category] ?? [];

  if (pairedCategories.length === 0) return [];

  const excludeSet = new Set([currentProduct.id, ...excludeIds]);

  const candidates = allProducts.filter((p) => {
    if (excludeSet.has(p.id)) return false;
    const pCat = getProductCategory(p);
    return pairedCategories.includes(pCat);
  });

  const shuffled = candidates.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, limit);
}

export function getSuggestedProductsForCart(
  cartProductIds: string[],
  cartCategories: string[],
  allProducts: ApiProduct[],
  limit = 2,
): ApiProduct[] {
  const cartCategorySet = new Set(cartCategories.map((c) => c.toLowerCase()));
  const cartIdSet = new Set(cartProductIds);

  const suggestedCategories = new Set<string>();
  for (const cat of cartCategorySet) {
    const paired = PAIRING_RULES[cat] ?? [];
    for (const p of paired) {
      if (!cartCategorySet.has(p)) {
        suggestedCategories.add(p);
      }
    }
  }

  if (suggestedCategories.size === 0) return [];

  const candidates = allProducts.filter((p) => {
    if (cartIdSet.has(p.id)) return false;
    const pCat = getProductCategory(p);
    return suggestedCategories.has(pCat);
  });

  const shuffled = candidates.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, limit);
}

export { getProductCategory, getProductPriceCents };
