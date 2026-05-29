import { db, productsTable } from '@workspace/db';
import { inArray } from 'drizzle-orm';

export async function countCoffeeItemsFromOrderItems(items: unknown): Promise<number> {
  const orderItems = Array.isArray(items) ? items as Array<{ productId?: string; quantity?: number }> : [];
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

  return orderItems.reduce((sum, item) => {
    const qty = Math.max(1, Math.floor(Number(item?.quantity ?? 1) || 1));
    return coffeeIds.has(item?.productId ?? '') ? sum + qty : sum;
  }, 0);
}
