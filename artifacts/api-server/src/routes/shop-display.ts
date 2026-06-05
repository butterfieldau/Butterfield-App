import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  claimedRewardsTable,
  db,
  ordersTable,
  staffTaskHistoryTable,
  staffTasksTable,
  staffStoreAssignmentsTable,
  storesTable,
  usersTable,
} from '@workspace/db';
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { notifyUser } from '../lib/notificationService.js';
import { recordLoyaltyPoints, reverseCoffeeStamps } from '../lib/loyaltyIdentity.js';
import { recordAuditLog } from '../lib/auditLog.js';
import { ensureShopDisplaySchemaReady } from '../lib/ensureShopDisplaySchemaReady.js';
import { countCoffeeItemsFromOrderItems } from '../lib/orderLoyaltyUtils.js';
import { refundOrderStripePayment } from '../lib/stripeRefunds.js';

const router = Router();
router.use(requireRole('shop_display'));

const ORDER_STATUS_ALERTS: Record<string, string> = {
  being_prepared: 'Your order is being prepared. ☕',
  ready_for_pickup: 'Your order is ready for pickup! 🎉',
  out_for_delivery: 'Your order is on its way! 🚚',
  completed: 'Your order is complete. Thanks for visiting! 🍪',
  cancelled: 'Your order has been cancelled. A refund has been initiated where applicable.',
};

const ACTIVE_ORDER_RANK: Record<string, number> = {
  received: 0,
  being_prepared: 1,
  ready_for_pickup: 2,
  out_for_delivery: 3,
  completed: 4,
  cancelled: 5,
  refunded: 6,
};

router.get('/me', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const [user] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, req.user!.id));

  const assignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));

  return res.json({
    data: {
      ...user,
      storeIds: assignments.map((assignment) => assignment.storeId),
    },
  });
});

router.get('/orders', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const assignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  const assignedStoreIds = assignments.map((assignment) => assignment.storeId);
  const ordersQuery = assignedStoreIds.length > 0
    ? db.select().from(ordersTable).where(inArray(ordersTable.storeId, assignedStoreIds)).orderBy(desc(ordersTable.createdAt)).limit(150)
    : db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(150);

  const [orders, users] = await Promise.all([
    ordersQuery,
    db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
    }).from(usersTable),
  ]);

  const userMap = Object.fromEntries(users.map((user) => [user.id, user]));
  const data = orders
    .map((order) => ({
      ...order,
      customerName: userMap[order.userId]?.name ?? 'Customer',
      customerEmail: userMap[order.userId]?.email ?? '',
      customerPhone: userMap[order.userId]?.phone ?? '',
    }))
    .sort((a, b) => {
      const rankDiff = (ACTIVE_ORDER_RANK[a.status] ?? 99) - (ACTIVE_ORDER_RANK[b.status] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      const leftTime = a.scheduledFor ? new Date(a.scheduledFor).getTime() : new Date(a.createdAt).getTime();
      const rightTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : new Date(b.createdAt).getTime();
      return rightTime - leftTime;
    });

  return res.json({ data });
});

router.patch('/orders/:id/status', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { id } = req.params;
  const { status } = req.body ?? {};
  const allowed = ['received', 'being_prepared', 'ready_for_pickup', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status for shop display mode.' });
  }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!existing) return res.status(404).json({ error: 'Order not found.' });

  const previousStatus = existing.status;
  const [updated] = await db.update(ordersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: 'Order not found.' });

  const msg = ORDER_STATUS_ALERTS[status];
  if (msg) {
    notifyUser(existing.userId, 'order_status', 'Butterfield Cookies', msg, {
      orderId: id,
      status,
      screen: '/(customer)/orders',
    }).catch(() => {});
  }

  const isCancellingNow = status === 'cancelled' && previousStatus !== 'cancelled' && previousStatus !== 'refunded';
  if (isCancellingNow) {
    try {
      await db.update(claimedRewardsTable)
        .set({ status: 'available', redeemedAt: null, orderId: null })
        .where(and(
          eq(claimedRewardsTable.orderId, updated.id),
          eq(claimedRewardsTable.status, 'redeemed'),
        ));
    } catch (err: any) {
      req.log.error({ err, orderId: updated.id }, 'Failed to restore claimed reward on shop display cancellation');
    }

    if (updated.loyaltyPointsEarned > 0) {
      try {
        await recordLoyaltyPoints({
          userId: updated.userId,
          pointsDelta: -updated.loyaltyPointsEarned,
          orderId: updated.id,
          description: 'Order cancelled from shop display — points reversed',
        });
      } catch (err: any) {
        req.log.error({ err, orderId: updated.id }, 'Failed to reverse loyalty points on shop display cancellation');
      }
    }

    try {
      const coffeeStampCount = await countCoffeeItemsFromOrderItems(updated.items);
      if (coffeeStampCount > 0) {
        await reverseCoffeeStamps({
          userId: updated.userId,
          stampsToRemove: coffeeStampCount,
          source: 'order_cancel',
          orderId: updated.id,
          description: 'Order cancelled from shop display — coffee stamps reversed',
        });
      }
    } catch (err: any) {
      req.log.error({ err, orderId: updated.id }, 'Failed to reverse coffee stamps on shop display cancellation');
    }

    try {
      await refundOrderStripePayment({
        orderId: updated.id,
        stripePaymentIntentId: updated.stripePaymentIntentId ?? null,
        stripePaymentStatus: updated.stripePaymentStatus ?? null,
        log: req.log,
      });
    } catch (err: any) {
      req.log.warn({ err, orderId: updated.id }, 'Stripe refund failed or skipped on shop display cancellation');
    }
  }

  await recordAuditLog({
    actor: req.user,
    entityType: 'order',
    entityId: updated.id,
    action: 'shop_display_order_status_changed',
    before: { status: previousStatus },
    after: { status: updated.status },
    metadata: { orderType: updated.type },
  });

  return res.json({ data: updated });
});

router.get('/tasks', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { category } = req.query;
  const baseQuery = db.select().from(staffTasksTable);
  const tasks = category
    ? await baseQuery.where(eq(staffTasksTable.category, category as any)).orderBy(staffTasksTable.sortOrder)
    : await baseQuery.orderBy(staffTasksTable.sortOrder);
  return res.json({ data: tasks });
});

router.patch('/tasks/:id/complete', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { isCompleted, notes } = req.body ?? {};
  const [task] = await db.update(staffTasksTable).set({
    isCompleted: isCompleted ?? true,
    completedBy: (isCompleted ?? true) ? req.user!.name : null,
    completedAt: (isCompleted ?? true) ? new Date() : null,
  }).where(eq(staffTasksTable.id, req.params.id)).returning();

  if (!task) return res.status(404).json({ error: 'Task not found.' });

  await db.insert(staffTaskHistoryTable).values({
    id: randomUUID(),
    taskId: task.id,
    taskTitle: task.title,
    taskCategory: task.category,
    completedByUserId: req.user!.id,
    completedByName: req.user!.name,
    completedByRole: req.user!.role,
    completionStatus: (isCompleted ?? true) ? 'completed' : 'reopened',
    notes: notes ?? null,
  });

  await recordAuditLog({
    actor: req.user,
    entityType: 'task',
    entityId: task.id,
    action: (isCompleted ?? true) ? 'shop_display_task_completed' : 'shop_display_task_reopened',
    after: { isCompleted: task.isCompleted, completedBy: task.completedBy },
    metadata: { category: task.category },
  });

  return res.json({ data: task });
});

router.get('/tasks/history', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { from, to } = req.query;
  const conditions: any[] = [];
  if (typeof from === 'string') conditions.push(gte(staffTaskHistoryTable.createdAt, new Date(from)));
  if (typeof to === 'string') conditions.push(sql`${staffTaskHistoryTable.createdAt} <= ${new Date(to)}`);
  const history = conditions.length > 0
    ? await db.select().from(staffTaskHistoryTable).where(and(...conditions)).orderBy(desc(staffTaskHistoryTable.createdAt)).limit(200)
    : await db.select().from(staffTaskHistoryTable).orderBy(desc(staffTaskHistoryTable.createdAt)).limit(200);
  return res.json({ data: history });
});

router.get('/store', async (req, res) => {
  const assignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  if (assignments.length === 0) return res.json({ data: null });
  const [store] = await db.select().from(storesTable)
    .where(and(eq(storesTable.id, assignments[0].storeId), isNull(storesTable.deletedAt)));
  return res.json({ data: store ?? null });
});

router.post('/printer/bytes', async (req, res) => {
  try {
    const { buildReceiptBytes } = await import('../lib/printer.js');
    const { job } = req.body as { job?: any };
    const printJob = (job as import('../lib/printer.js').PrintJob | undefined) ?? {
      orderId:      'test-0000-0000-0000',
      customerName: req.user!.name,
      type:         'pickup' as const,
      items:        [{ name: 'Choc Chip Cookie', quantity: 2, unitPriceCents: 500 }],
      totalCents:   1000,
      notes:        'Test print',
    };
    const bytes = buildReceiptBytes(printJob);
    return res.json({ data: { bytes: bytes.toString('base64') } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Could not build receipt' });
  }
});

export default router;
