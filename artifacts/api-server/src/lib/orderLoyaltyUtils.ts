import { db, productsTable } from '@workspace/db';
import { inArray } from 'drizzle-orm';

export async function countCoffeeItemsFromOrderItems(items: unknown): Promise<number> {
  const orderItems = Array.isArray(items) ? items as Array<{ productId?: string; quantity?: number; category?: string }> : [];
  const orderProductIds = Array.from(new Set(
    orderItems
      .map((item) => item?.productId)
      .filter((productId): productId is string => Boolean(productId && typeof productId === 'string')),
  ));

  const products = orderProductIds.length > 0
    ? await db.select({ id: productsTable.id, category: productsTable.category })
      .from(productsTable)
      .where(inArray(productsTable.id, orderProductIds))
    : [];

  const coffeeIds = new Set(
    products
      .filter((product) => String(product.category ?? '').toLowerCase() === 'coffee')
      .map((product) => product.id),
  );

  // IDs that resolved in the DB
  const resolvedIds = new Set(products.map((p) => p.id));

  return orderItems.reduce((sum, item) => {
    if ((item as any)?.freeCoffeeItem === true) return sum;
    const qty = Math.max(1, Math.floor(Number(item?.quantity ?? 1) || 1));
    const productId = item?.productId ?? '';
    // Primary: DB-resolved category
    if (coffeeIds.has(productId)) return sum + qty;
    // Fallback: use category stored on the order item itself (cart attaches it at add-to-cart time)
    if (!resolvedIds.has(productId) && String(item?.category ?? '').toLowerCase() === 'coffee') return sum + qty;
    return sum;
  }, 0);
}
