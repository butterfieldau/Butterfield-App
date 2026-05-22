import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, productsTable, stockItemsTable, stockMovementsTable } from '@workspace/db';
import { sendNotification } from './notificationService.js';

type DbLike = typeof db;

type Actor = {
  userId?: string | null;
  name?: string | null;
  role?: string | null;
};

type StockActionType =
  | 'add'
  | 'remove'
  | 'adjust'
  | 'transfer'
  | 'wasted'
  | 'expired'
  | 'stocktake'
  | 'sale_deduction'
  | 'refund_return';

type StockItemActionInput = {
  stockItemId: string;
  actionType: StockActionType;
  quantity?: number;
  targetQuantity?: number;
  targetStockItemId?: string | null;
  reason?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  costImpactCents?: number | null;
  relatedOrderId?: string | null;
  productId?: string | null;
  allowNegativeOverride?: boolean;
  actor?: Actor;
};

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

async function notifyIfThresholdCrossed(existing: { currentQuantity: number; lowStockThreshold: number; name: string; unit: string; id: string }, updated: { currentQuantity: number; lowStockThreshold: number; name: string; unit: string; id: string }) {
  const oldQty = existing.currentQuantity;
  const newQty = updated.currentQuantity;
  const threshold = updated.lowStockThreshold;
  const itemName = updated.name;

  if (newQty <= 0 && oldQty > 0) {
    await sendNotification({
      roles: ['director', 'master'],
      type: 'stock_out',
      title: 'Out of Stock',
      body: `${itemName} is now out of stock.`,
      data: { stockItemId: updated.id, name: itemName, quantity: newQty },
    });
    return;
  }

  if (threshold > 0 && newQty > 0 && newQty <= threshold && oldQty > threshold) {
    await sendNotification({
      roles: ['director', 'master'],
      type: 'stock_low',
      title: 'Low Stock Alert',
      body: `${itemName} is running low — only ${newQty} ${updated.unit} remaining.`,
      data: { stockItemId: updated.id, name: itemName, quantity: newQty, threshold },
    });
  }
}

function computeDelta(input: StockItemActionInput, currentQuantity: number): number {
  if (input.actionType === 'adjust' || input.actionType === 'stocktake') {
    return roundQty((input.targetQuantity ?? currentQuantity) - currentQuantity);
  }

  const quantity = roundQty(Math.abs(Number(input.quantity ?? 0) || 0));
  switch (input.actionType) {
    case 'add':
    case 'refund_return':
      return quantity;
    case 'remove':
    case 'wasted':
    case 'expired':
    case 'sale_deduction':
    case 'transfer':
      return -quantity;
    default:
      return 0;
  }
}

export async function applyStockItemAction(tx: DbLike, input: StockItemActionInput) {
  const [existing] = await tx.select().from(stockItemsTable).where(eq(stockItemsTable.id, input.stockItemId));
  if (!existing) throw new Error('Stock item not found');

  const quantityBefore = Number(existing.currentQuantity ?? 0);
  const delta = computeDelta(input, quantityBefore);
  const quantityAfter = roundQty(quantityBefore + delta);

  if (quantityAfter < 0 && !existing.allowNegativeStock && !input.allowNegativeOverride) {
    throw new Error(`Cannot reduce ${existing.name} below zero.`);
  }

  const [updated] = await tx.update(stockItemsTable)
    .set({ currentQuantity: quantityAfter, updatedAt: new Date() })
    .where(eq(stockItemsTable.id, input.stockItemId))
    .returning();

  await tx.insert(stockMovementsTable).values({
    id: randomUUID(),
    stockItemId: input.stockItemId,
    productId: input.productId ?? null,
    relatedOrderId: input.relatedOrderId ?? null,
    actionType: input.actionType,
    quantityDelta: delta,
    quantityBefore,
    quantityAfter,
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    photoUrl: input.photoUrl ?? null,
    costImpactCents: input.costImpactCents ?? null,
    performedByUserId: input.actor?.userId ?? null,
    performedByName: input.actor?.name ?? null,
    performedByRole: input.actor?.role ?? null,
    targetStockItemId: input.targetStockItemId ?? null,
  });

  await notifyIfThresholdCrossed(existing, updated);
  return updated;
}

export async function applyTransferBetweenStockItems(tx: DbLike, input: StockItemActionInput & { targetStockItemId: string; quantity: number }) {
  const qty = roundQty(Math.abs(Number(input.quantity ?? 0) || 0));
  if (qty <= 0) throw new Error('Quantity must be greater than zero.');
  if (input.targetStockItemId === input.stockItemId) throw new Error('Select a different target item for transfer.');

  await applyStockItemAction(tx, {
    ...input,
    quantity: qty,
    actionType: 'transfer',
    targetStockItemId: input.targetStockItemId,
  });

  await applyStockItemAction(tx, {
    ...input,
    stockItemId: input.targetStockItemId,
    quantity: qty,
    actionType: 'add',
    notes: input.notes ? `Transfer in: ${input.notes}` : 'Transfer in',
    targetStockItemId: input.stockItemId,
  });
}

export async function getStockMovementHistory(stockItemId: string) {
  return db.select().from(stockMovementsTable)
    .where(eq(stockMovementsTable.stockItemId, stockItemId))
    .orderBy(stockMovementsTable.createdAt);
}

export async function reduceProductStockForOrder(tx: DbLike, items: any[], actor: Actor, relatedOrderId: string) {
  const productLines = Array.isArray(items)
    ? items
      .filter((item) => item?.productId && !String(item.productId).startsWith('reward:'))
      .map((item) => ({ productId: String(item.productId), quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1) || 1)) }))
    : [];
  if (!productLines.length) return;

  const productIds = Array.from(new Set(productLines.map((line) => line.productId)));
  const products = await tx.select().from(productsTable).where(inArray(productsTable.id, productIds));
  const byId = new Map(products.map((product) => [product.id, product]));

  for (const line of productLines) {
    const product = byId.get(line.productId);
    if (!product || product.stockCount == null) continue;
    const quantityBefore = Number(product.stockCount);
    const quantityAfter = quantityBefore - line.quantity;
    if (quantityAfter < 0 && !product.allowNegativeStock) {
      throw new Error(`${product.name} is out of stock.`);
    }
    await tx.update(productsTable)
      .set({ stockCount: quantityAfter, updatedAt: new Date() })
      .where(eq(productsTable.id, product.id));
    await tx.insert(stockMovementsTable).values({
      id: randomUUID(),
      productId: product.id,
      relatedOrderId,
      actionType: 'sale_deduction',
      quantityDelta: -line.quantity,
      quantityBefore,
      quantityAfter,
      notes: `Order sale for ${product.name}`,
      performedByUserId: actor.userId ?? null,
      performedByName: actor.name ?? null,
      performedByRole: actor.role ?? null,
    });
  }
}

export async function restoreProductStockForOrder(tx: DbLike, items: any[], actor: Actor, relatedOrderId: string) {
  const productLines = Array.isArray(items)
    ? items
      .filter((item) => item?.productId && !String(item.productId).startsWith('reward:'))
      .map((item) => ({ productId: String(item.productId), quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1) || 1)) }))
    : [];
  if (!productLines.length) return;

  const productIds = Array.from(new Set(productLines.map((line) => line.productId)));
  const products = await tx.select().from(productsTable).where(inArray(productsTable.id, productIds));
  const byId = new Map(products.map((product) => [product.id, product]));

  for (const line of productLines) {
    const product = byId.get(line.productId);
    if (!product || product.stockCount == null) continue;
    const quantityBefore = Number(product.stockCount);
    const quantityAfter = quantityBefore + line.quantity;
    await tx.update(productsTable)
      .set({ stockCount: quantityAfter, updatedAt: new Date() })
      .where(eq(productsTable.id, product.id));
    await tx.insert(stockMovementsTable).values({
      id: randomUUID(),
      productId: product.id,
      relatedOrderId,
      actionType: 'refund_return',
      quantityDelta: line.quantity,
      quantityBefore,
      quantityAfter,
      notes: `Stock returned from order ${relatedOrderId.slice(0, 8)}`,
      performedByUserId: actor.userId ?? null,
      performedByName: actor.name ?? null,
      performedByRole: actor.role ?? null,
    });
  }
}

export async function buildSupplierOrderList() {
  const rows = await db.select().from(stockItemsTable)
    .where(and(eq(stockItemsTable.isActive, true)));

  const reorder = rows
    .filter((item) => item.lowStockThreshold > 0 && item.currentQuantity <= item.lowStockThreshold)
    .map((item) => ({
      id: item.id,
      name: item.name,
      supplier: item.supplier || 'Unassigned supplier',
      unit: item.unit,
      currentQuantity: item.currentQuantity,
      lowStockThreshold: item.lowStockThreshold,
      suggestedOrderQuantity: Math.max(item.lowStockThreshold * 2 - item.currentQuantity, item.lowStockThreshold || 1),
    }));

  return reorder.reduce<Record<string, typeof reorder>>((acc, row) => {
    (acc[row.supplier] ||= []).push(row);
    return acc;
  }, {});
}
