import { db, loyaltyActivityLogTable, productsTable } from '@workspace/db';
import { and, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { logger } from './logger.js';

export async function countCoffeeItemsFromOrderItems(items: unknown): Promise<number> {
  const orderItems = Array.isArray(items) ? items as Array<{ productId?: string; quantity?: number; category?: string }> : [];
  const orderProductIds = Array.from(new Set(
    orderItems
      .map((item) => item?.productId)
      .filter((productId): productId is string => Boolean(productId && typeof productId === 'string')),
  ));

  const products = orderProductIds.length > 0
    ? await db.select({ id: productsTable.id, stripeProductId: productsTable.stripeProductId, category: productsTable.category })
      .from(productsTable)
      .where(or(
        inArray(productsTable.id, orderProductIds),
        inArray(productsTable.stripeProductId, orderProductIds),
      ))
    : [];

  if (orderProductIds.length > 0 && products.length === 0) {
    logger.warn({ orderProductIds }, 'countCoffeeItems: none of the order product IDs resolved to a row in productsTable — falling back to item-level category');
  }

  // Build sets covering both local id and stripeProductId so either form matches
  const coffeeIds = new Set<string>();
  const resolvedIds = new Set<string>();
  for (const product of products) {
    const isCoffee = String(product.category ?? '').toLowerCase() === 'coffee';
    if (product.id) {
      resolvedIds.add(product.id);
      if (isCoffee) coffeeIds.add(product.id);
    }
    if (product.stripeProductId) {
      resolvedIds.add(product.stripeProductId);
      if (isCoffee) coffeeIds.add(product.stripeProductId);
    }
  }

  logger.debug(
    { resolved: products.length, coffee: coffeeIds.size, total: orderProductIds.length },
    'countCoffeeItems: product resolution summary',
  );

  return orderItems.reduce((sum, item) => {
    if ((item as any)?.freeCoffeeItem === true || (item as any)?.isFreeReward === true) return sum;
    const qty = Math.max(1, Math.floor(Number(item?.quantity ?? 1) || 1));
    const productId = item?.productId ?? '';
    // Primary: DB-resolved category (matches by local id or stripeProductId)
    if (coffeeIds.has(productId)) return sum + qty;
    // Fallback: use category stored on the order item itself (cart attaches it at add-to-cart time)
    if (!resolvedIds.has(productId) && String(item?.category ?? '').toLowerCase() === 'coffee') return sum + qty;
    return sum;
  }, 0);
}

export async function hasAwardedCoffeeStampsForOrder(orderId: string): Promise<boolean> {
  const [awarded] = await db
    .select({ id: loyaltyActivityLogTable.id })
    .from(loyaltyActivityLogTable)
    .where(and(
      eq(loyaltyActivityLogTable.orderId, orderId),
      eq(loyaltyActivityLogTable.activityType, 'in_app_order'),
      gt(loyaltyActivityLogTable.coffeeStampsDelta, 0),
    ))
    .limit(1);

  return Boolean(awarded);
}

export async function getOutstandingCoffeeStampsForOrder(orderId: string): Promise<number> {
  // Only sum positive-earning entries (activityType used by applyCoffeeStamps).
  // Reversal entries ('order_cancel', 'order_refund') are excluded so that a
  // previously-reversed order does not appear to have 0 outstanding stamps when
  // queried again — the caller's own guard (previousStatus === 'completed') is
  // responsible for preventing double-reversal. Excluding reversals also ensures
  // a non-completed order (which has no earning entries with its orderId) always
  // returns 0, preventing incorrect stamp drains on uncompleted-order cancellations.
  const [row] = await db
    .select({
      netCoffeeStamps: sql<number>`COALESCE(SUM(${loyaltyActivityLogTable.coffeeStampsDelta}), 0)`,
    })
    .from(loyaltyActivityLogTable)
    .where(
      and(
        eq(loyaltyActivityLogTable.orderId, orderId),
        gt(loyaltyActivityLogTable.coffeeStampsDelta, 0),
      ),
    );
  return Math.max(0, Number(row?.netCoffeeStamps ?? 0));
}
