import type { ApiProduct } from '@/lib/api';

export function getProductCategory(product: ApiProduct): string {
  return (
    (product as any).category ??
    product.metadata?.category ??
    'cookies'
  );
}

export function getProductPriceCents(product: ApiProduct): number {
  return (product as any).priceCents ?? product.prices?.[0]?.unit_amount ?? 0;
}

export function getSuggestedProducts(
  currentProduct: ApiProduct,
  allProducts: ApiProduct[],
  excludeIds: string[] = [],
  limit = 4,
): ApiProduct[] {
  const excludeSet = new Set([currentProduct.id, ...excludeIds]);

  const candidates = allProducts.filter((p) => {
    if (excludeSet.has(p.id)) return false;
    return getProductCategory(p) === 'cookies';
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
  const cartIdSet = new Set(cartProductIds);

  const candidates = allProducts.filter((p) => {
    if (cartIdSet.has(p.id)) return false;
    return getProductCategory(p) === 'cookies';
  });

  if (candidates.length === 0) return [];

  const shuffled = candidates.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, limit);
}
