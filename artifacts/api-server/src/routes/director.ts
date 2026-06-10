import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import {
  db, usersTable, customerProfilesTable, staffProfilesTable,
  wholesaleAccountsTable, wholesaleOrdersTable, ordersTable, storeSettingsTable, productsTable,
  staffShiftsTable, staffIssuesTable, staffWastageTable, staffLeaveRequestsTable, staffTasksTable, staffTaskHistoryTable,
  feedbackTable, loyaltyRewardsTable, announcementsTable, managerProfilesTable,
  wholesaleCardsTable, deletedAccountsTable, discountCodesTable, discountCodeUsagesTable,
  staffInviteTokensTable, storesTable, wholesaleDeliverySettingsTable,
  auditLogsTable, loginHistoryTable,
} from '@workspace/db';
import {
  getOrCreateWholesaleDeliverySettings,
  DEFAULT_DELIVERY_SLOTS,
  type WholesaleDeliverySlot,
} from '../lib/wholesaleCutoffReminder.js';
import { eq, desc, count, sum, gte, lte, lt, isNull, isNotNull, and, sql, inArray } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { requireManagerRoutePermission } from '../middlewares/managerPermission.js';
import type { ManagerPermission } from '@workspace/db';
import { notifyUser } from '../lib/notificationService.js';
import { recordAuditLog } from '../lib/auditLog.js';
import { ensureShopDisplaySchemaReady } from '../lib/ensureShopDisplaySchemaReady.js';
import { normalizeTaskListCompletion } from '../lib/taskReset.js';
import { recordLoyaltyPoints, reverseCoffeeStamps } from '../lib/loyaltyIdentity.js';
import { countCoffeeItemsFromOrderItems } from '../lib/orderLoyaltyUtils.js';
import { refundOrderStripePayment, refundWholesaleOrderStripePayment } from '../lib/stripeRefunds.js';
import { getAllowedNextStatuses, getStatusMessage, TERMINAL_STATUSES } from '../lib/orderStatusTransitions.js';
import { syncWholesaleInvoiceStatuses } from '../lib/stripeWholesaleInvoices.js';
import { buildInvoiceHtml } from '../lib/invoiceTemplate.js';
import { claimedRewardsTable } from '@workspace/db';
import {
  getRegisterSessionReport,
  listRegisterSessionReports,
  updateClosedRegisterSessionNotes,
} from '../lib/registers.js';

const router = Router();
router.use(requireRole('director', 'manager', 'master'));

const ACCESS_ROLE_LABELS = {
  manager: 'Manager',
  supervisor: 'Supervisor',
  store_manager: 'Store Manager',
  area_manager: 'Area Manager',
  director: 'Director',
  master: 'Master',
} as const;

type AccessRoleKey = keyof typeof ACCESS_ROLE_LABELS;

function isManagerFamilyRole(role: string): role is Extract<AccessRoleKey, 'manager' | 'supervisor' | 'store_manager' | 'area_manager'> {
  return ['manager', 'supervisor', 'store_manager', 'area_manager'].includes(role);
}

// For managers, enforce per-route permissions based on method + path.
// Discount code management is director/master only.
// Directors and masters pass through unconditionally.
// Returns a MANAGER_PERMISSIONS string or 'director_only' to block managers entirely.
function resolveDirectorPermission(method: string, path: string): ManagerPermission | 'director_only' | 'self_only' | 'always' {
  // Director-only: adding/removing directors
  if (path.startsWith('/directors')) return 'director_only';
  // User deletion and wholesale-card visibility — director-only
  if (method === 'DELETE' && path.startsWith('/users/')) return 'director_only';
  if (path.startsWith('/wholesale-cards/') && path.endsWith('/visibility')) return 'director_only';

  // Manager management — director/master only
  if (path === '/managers' || path.startsWith('/managers/')) return 'director_only';
  if (path === '/shop-displays' || path.startsWith('/shop-displays/')) return 'director_only';

  // Dashboard stats + activity feed
  if (path === '/stats' || path === '/stats/revenue' || path === '/sessions') return 'dashboard';
  if (path === '/activity') return 'dashboard';
  // Deleted accounts — director/master only
  if (path.startsWith('/deleted-accounts')) return 'director_only';
  if (path.startsWith('/discount-codes')) return 'pricing';

  // Orders
  if (path === '/orders' || path.startsWith('/orders/')) return 'orders';

  // Users / staff / wholesale management
  if (path === '/users' || path.startsWith('/users/')) return 'users';
  if (path === '/staff' || path.startsWith('/staff/')) return 'users';
  if (path === '/wholesale' || path.startsWith('/wholesale/')) return 'users';
  if (path.startsWith('/wholesale-cards/')) return 'users';
  if (path === '/create-staff' || path === '/create-wholesale') return 'users';
  // Staff-hub manage mode is shown to ALL managers regardless of permissions,
  // so every staffhub operation must be accessible to every manager.
  if (path === '/staff-list') return 'always';
  if (path === '/tasks') return method === 'GET' ? 'always' : 'tasks';
  if (path === '/tasks/history') return 'always';
  if (path.startsWith('/tasks/')) return method === 'GET' ? 'always' : 'tasks';
  if (path === '/wastage' || path.startsWith('/wastage/')) return 'always';
  if (path === '/issues' || path.startsWith('/issues/')) return 'always';
  if (path === '/leave' || path.startsWith('/leave/')) return 'always';
  if (path === '/timesheets' || path.startsWith('/timesheets/')) return 'self_only';

  // Products
  if (path === '/products' || path.startsWith('/products/')) return 'products';

  // Settings (store/printer) — geofencing is stripped server-side for managers
  if (path === '/settings' || path.startsWith('/printer/')) return 'settings';

  // Banner — separate permission so directors can grant it independently of settings
  if (path === '/home-banner') return 'banners';

  // Rewards
  if (path === '/rewards' || path.startsWith('/rewards/')) return 'rewards';

  // Announcements
  if (path === '/announcements' || path.startsWith('/announcements/')) return 'announcements';

  // Reports (base + all sub-routes)
  if (path === '/reports' || path.startsWith('/reports/')) return 'reports';
  // Feedback tab is shown to all managers in staffhub manage mode
  if (path === '/feedback' || path.startsWith('/feedback/')) return 'always';

  // Audit logs + login history — director only (security-sensitive data)
  if (path === '/audit-logs') return 'director_only';
  if (path === '/login-history') return 'director_only';

  // POS thresholds — director only
  if (path === '/pos-thresholds') return 'director_only';

  // Unknown paths: block managers
  return 'director_only';
}

router.use(requireManagerRoutePermission(resolveDirectorPermission));

// ── Enhanced Dashboard stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const now = new Date();
  const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const startOfToday = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), sydneyNow.getDate());
  const startOfWeekMonday = new Date(startOfToday);
  const dayOfWeek = startOfWeekMonday.getDay();
  const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeekMonday.setDate(startOfWeekMonday.getDate() + mondayDiff);
  const endOfWeekSunday = new Date(startOfWeekMonday);
  endOfWeekSunday.setDate(endOfWeekSunday.getDate() + 6);
  endOfWeekSunday.setHours(23, 59, 59, 999);
  const startOfWeek  = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - 7);
  const startOfMonth = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), 1);
  const longShiftCutoff = new Date(now.getTime() - 10 * 60 * 60 * 1000);
  const todayMMDD = `${String(sydneyNow.getMonth() + 1).padStart(2,'0')}-${String(sydneyNow.getDate()).padStart(2,'0')}`;

  const [
    [totalOrders], [todayOrders], [weekOrders],
    [todayRev], [weekRev], [monthRev],
    [activeOrders], [wholesaleOrders],
    [totalUsers], [pendingStaff], [pendingWholesale], [totalWholesale],
    [totalProducts], [soldOutProds], [lowStockProds],
    [clockedIn], [longShifts],
    [openIssues], [highIssues],
    [wastageToday], [wastageCostToday], [wastageWeek], [wastageCostWeek],
    [pendingLeave],
    [unreadFeedback],
    [openTasks],
  ] = await Promise.all([
    db.select({ count: count() }).from(ordersTable),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfToday)),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfWeek)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable).where(and(gte(ordersTable.createdAt, startOfToday), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable).where(and(gte(ordersTable.createdAt, startOfWeek),  sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable).where(and(gte(ordersTable.createdAt, startOfMonth), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ count: count() }).from(ordersTable).where(sql`${ordersTable.status} IN ('received','being_prepared','ready_for_pickup')`),
    db.select({ count: count() }).from(wholesaleOrdersTable).where(sql`${wholesaleOrdersTable.status} IN ('pending','confirmed','processing')`),
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(staffProfilesTable).where(eq(staffProfilesTable.approvedByAdmin, false)),
    db.select({ count: count() }).from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.status, 'pending')),
    db.select({ count: count() }).from(wholesaleAccountsTable),
    db.select({ count: count() }).from(productsTable).where(eq(productsTable.isActive, true)),
    db.select({ count: count() }).from(productsTable).where(and(eq(productsTable.isSoldOut, true), eq(productsTable.isActive, true))),
    db.select({ count: count() }).from(productsTable).where(and(isNotNull(productsTable.stockCount), sql`${productsTable.stockCount} <= ${productsTable.lowStockThreshold}`, eq(productsTable.isActive, true))),
    db.select({ count: count() }).from(staffShiftsTable).where(isNull(staffShiftsTable.clockOut)),
    db.select({ count: count() }).from(staffShiftsTable).where(and(isNull(staffShiftsTable.clockOut), lte(staffShiftsTable.clockIn, longShiftCutoff))),
    db.select({ count: count() }).from(staffIssuesTable).where(eq(staffIssuesTable.status, 'open')),
    db.select({ count: count() }).from(staffIssuesTable).where(and(eq(staffIssuesTable.status, 'open'), sql`${staffIssuesTable.priority} IN ('high','urgent')`)),
    db.select({ count: count() }).from(staffWastageTable).where(gte(staffWastageTable.createdAt, startOfToday)),
    db.select({ total: sum(staffWastageTable.estimatedCostCents) }).from(staffWastageTable).where(gte(staffWastageTable.createdAt, startOfToday)),
    db.select({ count: count() }).from(staffWastageTable).where(gte(staffWastageTable.createdAt, startOfWeekMonday)),
    db.select({ total: sum(staffWastageTable.estimatedCostCents) }).from(staffWastageTable).where(gte(staffWastageTable.createdAt, startOfWeekMonday)),
    db.select({ count: count() }).from(staffLeaveRequestsTable).where(eq(staffLeaveRequestsTable.status, 'pending')),
    db.select({ count: count() }).from(feedbackTable).where(eq(feedbackTable.isRead, false)),
    db.select({ count: count() }).from(staffTasksTable).where(eq(staffTasksTable.isCompleted, false)),
  ]);

  const weekShifts = await db.select({
    clockIn: staffShiftsTable.clockIn,
    clockOut: staffShiftsTable.clockOut,
    unpaidBreakMins: staffShiftsTable.unpaidBreakMins,
    hourlyRateCents: staffProfilesTable.hourlyRateCents,
  })
    .from(staffShiftsTable)
    .leftJoin(staffProfilesTable, eq(staffShiftsTable.userId, staffProfilesTable.userId))
    .where(and(
      lte(staffShiftsTable.clockIn, endOfWeekSunday),
      sql`coalesce(${staffShiftsTable.clockOut}, now()) >= ${startOfWeekMonday}`,
    ));

  const weekWagesOwedCents = weekShifts.reduce((sum, shift) => {
    const shiftStart = new Date(shift.clockIn);
    const rawShiftEnd = shift.clockOut ? new Date(shift.clockOut) : now;
    const effectiveStart = shiftStart < startOfWeekMonday ? startOfWeekMonday : shiftStart;
    const effectiveEnd = rawShiftEnd > endOfWeekSunday ? endOfWeekSunday : rawShiftEnd;
    if (effectiveEnd <= effectiveStart) return sum;
    const totalMins = Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000);
    const paidMins = Math.max(0, totalMins - (shift.unpaidBreakMins ?? 0));
    const hourlyRateCents = shift.hourlyRateCents ?? 0;
    return sum + Math.round((paidMins / 60) * hourlyRateCents);
  }, 0);

  // Birthday customers (birthday field stored as YYYY-MM-DD text, match MM-DD suffix)
  let birthdayCount = 0;
  try {
    const [bday] = await db.select({ count: count() }).from(customerProfilesTable)
      .where(sql`RIGHT(${customerProfilesTable.birthday}, 5) = ${todayMMDD}`);
    birthdayCount = bday.count;
  } catch {}

  return res.json({
    data: {
      orders: {
        total:        totalOrders.count,
        today:        todayOrders.count,
        week:         weekOrders.count,
        active:       activeOrders.count,
        wholesaleNew: wholesaleOrders.count,
      },
      revenue: {
        today: Number(todayRev.total  ?? 0),
        week:  Number(weekRev.total   ?? 0),
        month: Number(monthRev.total  ?? 0),
      },
      staff: {
        clockedIn:  clockedIn.count,
        longShifts: longShifts.count,
        pendingLeave: pendingLeave.count,
        weekWagesOwedCents,
      },
      users: {
        total:            totalUsers.count,
        pendingStaff:     pendingStaff.count,
        pendingWholesale: pendingWholesale.count,
        totalWholesale:   totalWholesale.count,
      },
      products: {
        total:     totalProducts.count,
        soldOut:   soldOutProds.count,
        lowStock:  lowStockProds.count,
      },
      issues: {
        open:     openIssues.count,
        high:     highIssues.count,
      },
      wastage: {
        countToday: wastageToday.count,
        costToday:  Number(wastageCostToday.total ?? 0),
        countWeek: wastageWeek.count,
        costWeek:  Number(wastageCostWeek.total ?? 0),
      },
      customers: {
        birthdayToday: birthdayCount,
        unreadFeedback: unreadFeedback.count,
      },
      tasks: {
        open: openTasks.count,
      },
    },
  });
});

// ── Activity log ─────────────────────────────────────────────────────────────
router.get('/activity', async (req, res) => {
  const [orders, issues, wastage, leave] = await Promise.all([
    db.select({
      id: ordersTable.id, createdAt: ordersTable.createdAt,
      status: ordersTable.status, totalCents: ordersTable.totalCents,
    }).from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(15),
    db.select({
      id: staffIssuesTable.id, createdAt: staffIssuesTable.createdAt,
      title: staffIssuesTable.title, priority: staffIssuesTable.priority,
      status: staffIssuesTable.status,
    }).from(staffIssuesTable).orderBy(desc(staffIssuesTable.createdAt)).limit(8),
    db.select({
      id: staffWastageTable.id, createdAt: staffWastageTable.createdAt,
      productName: staffWastageTable.productName, reason: staffWastageTable.reason,
    }).from(staffWastageTable).orderBy(desc(staffWastageTable.createdAt)).limit(6),
    db.select({
      id: staffLeaveRequestsTable.id, createdAt: staffLeaveRequestsTable.createdAt,
      type: staffLeaveRequestsTable.type, status: staffLeaveRequestsTable.status,
      startDate: staffLeaveRequestsTable.startDate,
    }).from(staffLeaveRequestsTable).orderBy(desc(staffLeaveRequestsTable.createdAt)).limit(5),
  ]);

  const events = [
    ...orders.map(o => ({ type: 'order',   id: o.id, title: `Order #${o.id.slice(-6).toUpperCase()}`, sub: `AUD $${((o.totalCents ?? 0) / 100).toFixed(2)} · ${o.status.replace(/_/g, ' ')}`, at: o.createdAt, icon: 'shopping-bag', color: '#40C0F2' })),
    ...issues.map(i => ({ type: 'issue',   id: i.id, title: `Issue: ${i.title}`, sub: `${i.priority} priority · ${i.status}`, at: i.createdAt, icon: 'alert-triangle', color: i.priority === 'urgent' || i.priority === 'high' ? '#EF4444' : '#F59E0B' })),
    ...wastage.map(w => ({ type: 'wastage', id: w.id, title: `Wastage: ${w.productName}`, sub: w.reason, at: w.createdAt, icon: 'trash-2', color: '#8B5CF6' })),
    ...leave.map(l => ({ type: 'leave',   id: l.id, title: `Leave request · ${l.type}`, sub: `From ${l.startDate} · ${l.status}`, at: l.createdAt, icon: 'calendar', color: '#22C55E' })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);

  return res.json({ data: events });
});

// ── All orders (customer + wholesale merged, enriched with customer info) ─────
router.get('/orders', async (req, res) => {
  const [customerOrders, wholesaleOrders, allUsers, wsAccounts] = await Promise.all([
    db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(300),
    db.select().from(wholesaleOrdersTable).orderBy(desc(wholesaleOrdersTable.createdAt)).limit(150),
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone }).from(usersTable),
    db.select({ id: wholesaleAccountsTable.id, userId: wholesaleAccountsTable.userId, companyName: wholesaleAccountsTable.companyName, abn: wholesaleAccountsTable.abn }).from(wholesaleAccountsTable),
  ]);
  const syncedWholesaleOrders = await syncWholesaleInvoiceStatuses(wholesaleOrders.map((order) => order.id)).catch(() => ({}));
  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
  const wsMap   = Object.fromEntries(wsAccounts.map(w => [w.userId, w]));
  const all = [
    ...customerOrders.map(o => ({
      ...o,
      orderSource:   'customer' as const,
      customerName:  userMap[o.userId]?.name  ?? null,
      customerEmail: userMap[o.userId]?.email ?? null,
      customerPhone: userMap[o.userId]?.phone ?? null,
    })),
    ...wholesaleOrders.map(wo => {
      const liveOrder = (syncedWholesaleOrders as Record<string, any>)[wo.id] ?? wo;
      return ({
      ...liveOrder,
      type:          'wholesale',
      orderSource:   'wholesale' as const,
      customerName:  wsMap[liveOrder.userId]?.companyName ?? userMap[liveOrder.userId]?.name ?? null,
      customerEmail: userMap[liveOrder.userId]?.email ?? null,
      customerPhone: userMap[liveOrder.userId]?.phone ?? null,
      companyAbn:    wsMap[liveOrder.userId]?.abn ?? null,
    });
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 300);
  return res.json({ data: all });
});

router.post('/orders/:id/accept', async (req, res) => {
  const { id } = req.params;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, id));

  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status !== ('scheduled' as any)) {
    return res.status(400).json({ error: 'Only scheduled orders can be accepted.' });
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: 'accepted' as any, updatedAt: new Date() })
    .where(eq(ordersTable.id, id))
    .returning();

  const deliveryLabel = order.scheduledFor
    ? new Date(order.scheduledFor).toLocaleDateString('en-AU', {
        timeZone: 'Australia/Sydney', weekday: 'long', day: 'numeric', month: 'long',
      })
    : 'the scheduled date';

  notifyUser(
    order.userId,
    'order_accepted',
    'Order Accepted',
    `Your order for ${deliveryLabel} has been confirmed. We'll start preparing it on the day.`,
    { orderId: id, status: 'accepted', screen: '/(customer)/orders' },
  ).catch(() => {});

  return res.json({ data: updated });
});

router.patch('/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, cancelReason } = req.body;
  const WHOLESALE_VALID = ['pending','processing','dispatched','delivered','cancelled'];

  // Cancelling or refunding is director/master only — managers cannot do this
  const isDirectorOrMaster = req.user!.role === 'director' || req.user!.role === 'master';
  if ((status === 'cancelled' || status === 'refunded') && !isDirectorOrMaster) {
    return res.status(403).json({ error: 'Only directors and masters can cancel or refund orders.' });
  }

  const WHOLESALE_STATUS_MSG: Record<string, string> = {
    processing: 'Your wholesale order is being processed.',
    dispatched: 'Your wholesale order has been dispatched. 🚚',
    delivered:  'Your wholesale order has been delivered. ✅',
    cancelled:  'Your wholesale order has been cancelled.',
  };

  const [customerOrder] = await db
    .select()
    .from(ordersTable).where(eq(ordersTable.id, id));
  if (customerOrder) {
    // Validate the requested status against the type-aware transition rules
    const allowedNext = getAllowedNextStatuses(
      customerOrder.status,
      customerOrder.type,
      customerOrder.scheduledFor ?? null,
    );
    if (!allowedNext.has(status)) {
      const allowedList = [...allowedNext].join(', ');
      return res.status(400).json({
        error: `Cannot transition a ${customerOrder.type} order from '${customerOrder.status}' to '${status}'. Allowed next statuses: ${allowedList || 'none (order is terminal)'}.`,
      });
    }

    const previousStatus = customerOrder.status;
    const setFields: Record<string, any> = { status, updatedAt: new Date() };
    if ((status === 'cancelled' || status === 'refunded') && cancelReason) {
      setFields.cancelReason = String(cancelReason).trim();
    }
    const [updated] = await db.update(ordersTable).set(setFields).where(eq(ordersTable.id, id)).returning();
    const msg = getStatusMessage(status, customerOrder.type, customerOrder.scheduledFor ?? null);
    if (msg) {
      notifyUser(customerOrder.userId, 'order_status', 'Butterfield Cookies', msg,
        { orderId: id, status, screen: '/(customer)/orders' }).catch(() => {});
    }

    // On cancellation or refund: reverse loyalty points + restore claimed rewards + Stripe refund
    const isCancelOrRefund = (status === 'cancelled' || status === 'refunded');
    const wasAlreadyCancelledOrRefunded = previousStatus === 'cancelled' || previousStatus === 'refunded';
    if (isCancelOrRefund && !wasAlreadyCancelledOrRefunded && updated) {
      // Restore claimed reward if any
      try {
        await db.update(claimedRewardsTable)
          .set({ status: 'available', redeemedAt: null, orderId: null })
          .where(and(
            eq(claimedRewardsTable.orderId, updated.id),
            eq(claimedRewardsTable.status, 'redeemed'),
          ));
      } catch (err: any) {
        req.log.error({ err, orderId: updated.id }, 'Failed to restore claimed reward on director cancellation');
      }

      // Reverse loyalty points earned from this order
      if (updated.loyaltyPointsEarned > 0) {
        try {
          await recordLoyaltyPoints({
            userId: updated.userId,
            pointsDelta: -updated.loyaltyPointsEarned,
            orderId: updated.id,
            description: `Order ${status} — points reversed`,
          });
        } catch (err: any) {
          req.log.error({ err, orderId: updated.id }, 'Failed to reverse loyalty points on director cancellation');
        }
      }

      try {
        const coffeeStampCount = await countCoffeeItemsFromOrderItems(updated.items);
        if (coffeeStampCount > 0) {
          await reverseCoffeeStamps({
            userId: updated.userId,
            stampsToRemove: coffeeStampCount,
            source: status === 'refunded' ? 'order_refund' : 'order_cancel',
            orderId: updated.id,
            description: `Order ${status} — coffee stamps reversed`,
          });
        }
      } catch (err: any) {
        req.log.error({ err, orderId: updated.id }, 'Failed to reverse coffee stamps on director cancellation');
      }

      try {
        await refundOrderStripePayment({
          orderId: updated.id,
          stripePaymentIntentId: updated.stripePaymentIntentId ?? null,
          stripePaymentStatus: updated.stripePaymentStatus ?? null,
          log: req.log,
        });
      } catch (err: any) {
        // Non-fatal: log but don't fail the request — refund may already exist or be ineligible
        req.log.warn({ err, orderId: updated.id }, 'Stripe refund failed or skipped on order cancellation');
      }
    }

    return res.json({ data: updated });
  }

  const [wholesaleOrder] = await db
    .select({ id: wholesaleOrdersTable.id, userId: wholesaleOrdersTable.userId, status: wholesaleOrdersTable.status })
    .from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, id));
  if (wholesaleOrder) {
    if (!WHOLESALE_VALID.includes(status)) return res.status(400).json({ error: 'Invalid wholesale order status.' });
    const wsSetFields: Record<string, any> = { status, updatedAt: new Date() };
    if (status === 'cancelled' && cancelReason) {
      wsSetFields.cancelReason = String(cancelReason).trim();
    }
    const [updated] = await db.update(wholesaleOrdersTable).set(wsSetFields).where(eq(wholesaleOrdersTable.id, id)).returning();
    const isCancelOrRefund = status === 'cancelled' || status === 'refunded';
    const wasAlreadyCancelledOrRefunded = wholesaleOrder.status === 'cancelled' || wholesaleOrder.status === 'refunded';
    if (isCancelOrRefund && !wasAlreadyCancelledOrRefunded) {
      try {
        await refundWholesaleOrderStripePayment({
          orderId: updated.id,
          stripePaymentIntentId: updated.stripePaymentIntentId ?? null,
          stripePaymentStatus: updated.stripePaymentStatus ?? null,
          log: req.log,
        });
      } catch (err: any) {
        req.log.warn({ err, orderId: updated.id }, 'Stripe refund failed or skipped on wholesale cancellation');
      }
    }
    const msg = WHOLESALE_STATUS_MSG[status];
    if (msg) {
      notifyUser(wholesaleOrder.userId, 'order_status', 'Butterfield Wholesale', msg,
        { orderId: id, status, screen: '/(wholesale)/orders' }).catch(() => {});
    }
    return res.json({ data: { ...updated, orderSource: 'wholesale' } });
  }

  return res.status(404).json({ error: 'Order not found.' });
});

// ── Custom HTML invoice for a wholesale order (director/manager view) ─────────
router.get('/wholesale/orders/:id/invoice', async (req, res) => {
  const { id } = req.params;

  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, id));
  if (!order) return res.status(404).send('Order not found');

  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.id, order.accountId));
  const [user]    = account ? await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, account.userId)) : [null];

  const items = Array.isArray(order.items) ? (order.items as any[]).map((i: any) => ({
    description: i.productName ?? i.name ?? i.description ?? 'Item',
    qty:         Number(i.quantity ?? i.qty ?? 1),
    unitCents:   Number(i.unitPriceCents ?? i.unitPrice ?? i.unit_price ?? i.unitCents ?? 0),
  })) : [];

  const paymentTermsMap: Record<string, string> = {
    pay_on_order: 'Pay on order',
    net_7:  '7 days from invoice date',
    net_14: '14 days from invoice date',
    net_30: '30 days from invoice date',
    net_60: '60 days from invoice date',
  };
  const paymentTerms = paymentTermsMap[(account as any)?.paymentTerms ?? ''] ?? (account as any)?.paymentTerms ?? '30 days from invoice date';

  const invoiceNumber = (order as any).invoiceNumber
    ? `INV-${(order as any).invoiceNumber}`
    : `INV-${order.id.slice(0, 8).toUpperCase()}`;

  const html = buildInvoiceHtml({
    invoiceNumber,
    invoiceDate:  order.createdAt,
    dueDate:      (order as any).dueDate ?? order.createdAt,
    status:       (order as any).invoiceStatus ?? order.status,
    companyName:  account?.companyName ?? user?.name ?? 'Customer',
    abn:          account?.abn ?? null,
    email:        user?.email ?? null,
    address:      (account as any)?.deliveryAddress ?? null,
    accountRef:   account?.id?.slice(0, 8).toUpperCase() ?? null,
    items,
    totalCents:   order.totalCents ?? 0,
    poReference:  order.poReference ?? null,
    notes:        order.notes ?? null,
    paymentTerms,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
});


// ── All users ────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  const staffProfiles = await db.select().from(staffProfilesTable);
  const wholesaleAccounts = await db.select().from(wholesaleAccountsTable);
  const spMap = Object.fromEntries(staffProfiles.map(s => [s.userId, s]));
  const waMap = Object.fromEntries(wholesaleAccounts.map(w => [w.userId, w]));
  const result = users.map(({ passwordHash: _pw, ...u }) => ({
    ...u,
    staffProfile:     spMap[u.id] ?? null,
    wholesaleAccount: waMap[u.id] ?? null,
  }));
  return res.json({ data: result });
});

router.get('/shop-displays', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const rows = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    status: usersTable.status,
    phone: usersTable.phone,
    createdAt: usersTable.createdAt,
    lastLogin: usersTable.lastLogin,
  }).from(usersTable)
    .where(eq(usersTable.role, 'shop_display' as any))
    .orderBy(desc(usersTable.createdAt));

  if (rows.length === 0) return res.json({ data: [] });

  const allProfiles = await db.execute(sql`SELECT user_id, permissions FROM shop_display_profiles`);
  const profileRows: Array<{ user_id: string; permissions: string }> =
    ((allProfiles as any).rows ?? allProfiles) as any;
  const permMap: Record<string, string[]> = {};
  for (const p of profileRows) {
    try { permMap[p.user_id] = JSON.parse(p.permissions || '[]'); } catch { permMap[p.user_id] = []; }
  }

  return res.json({ data: rows.map((r) => ({ ...r, permissions: permMap[r.id] ?? [] })) });
});

router.post('/shop-displays', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { name, email, password, phone } = req.body ?? {};
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(String(password), 10);
  const [created] = await db.insert(usersTable).values({
    id: userId,
    email: normalizedEmail,
    passwordHash,
    role: 'shop_display' as any,
    name: String(name).trim(),
    phone: phone?.trim() ? String(phone).trim() : null,
    status: 'active',
    isActive: 'true',
  }).returning({
    id: usersTable.id,
    email: usersTable.email,
    role: usersTable.role,
    name: usersTable.name,
    phone: usersTable.phone,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
  });

  await recordAuditLog({
    actor: req.user,
    entityType: 'user',
    entityId: userId,
    action: 'shop_display_created',
    after: created,
  });

  return res.status(201).json({ data: created });
});

router.patch('/shop-displays/:id', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { id } = req.params;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!existing || existing.role !== 'shop_display') {
    return res.status(404).json({ error: 'Shop display login not found.' });
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.email !== undefined) updates.email = String(req.body.email).trim().toLowerCase();
  if (req.body.phone !== undefined) updates.phone = String(req.body.phone).trim() || null;
  if (req.body.status !== undefined) {
    const nextStatus = String(req.body.status);
    if (!['active', 'inactive', 'suspended'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Status must be active, inactive or suspended.' });
    }
    updates.status = nextStatus;
    updates.isActive = nextStatus === 'active' ? 'true' : 'false';
  }

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      name: usersTable.name,
      phone: usersTable.phone,
      status: usersTable.status,
      lastLogin: usersTable.lastLogin,
    });

  await recordAuditLog({
    actor: req.user,
    entityType: 'user',
    entityId: id,
    action: 'shop_display_updated',
    before: {
      name: existing.name,
      email: existing.email,
      phone: existing.phone,
      status: existing.status,
    },
    after: updated,
  });

  if (req.body.permissions !== undefined && Array.isArray(req.body.permissions)) {
    const perms = JSON.stringify(req.body.permissions);
    await db.execute(sql`
      INSERT INTO shop_display_profiles (user_id, permissions, updated_at)
      VALUES (${id}, ${perms}, now())
      ON CONFLICT (user_id) DO UPDATE SET permissions = ${perms}, updated_at = now()
    `);
    (updated as any).permissions = req.body.permissions;
  }
  return res.json({ data: updated });
});

router.patch('/shop-displays/:id/password', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { id } = req.params;
  const { password } = req.body ?? {};
  if (!password?.trim()) return res.status(400).json({ error: 'Password is required.' });
  const [existing] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
  if (!existing || existing.role !== 'shop_display') {
    return res.status(404).json({ error: 'Shop display login not found.' });
  }
  const passwordHash = await bcrypt.hash(String(password), 10);
  await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, id));
  await recordAuditLog({
    actor: req.user,
    entityType: 'user',
    entityId: id,
    action: 'shop_display_password_reset',
  });
  return res.json({ success: true });
});

router.delete('/shop-displays/:id', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { id } = req.params;
  const [existing] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    name: usersTable.name,
    email: usersTable.email,
  }).from(usersTable).where(eq(usersTable.id, id));
  if (!existing || existing.role !== 'shop_display') {
    return res.status(404).json({ error: 'Shop display login not found.' });
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  await recordAuditLog({
    actor: req.user,
    entityType: 'user',
    entityId: id,
    action: 'shop_display_deleted',
    before: existing,
  });
  return res.json({ success: true });
});

router.patch('/staff/:id/clock-pin', async (req, res) => {
  const { id } = req.params;
  const { pin } = req.body ?? {};
  if (pin !== null && pin !== undefined) {
    if (!/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
    }
    const hashed = await bcrypt.hash(String(pin), 10);
    const [existingProfile] = await db.select({ userId: staffProfilesTable.userId })
      .from(staffProfilesTable).where(eq(staffProfilesTable.userId, id)).limit(1);
    if (existingProfile) {
      // Always sync both PIN fields so directors/managers have one PIN for everything
      await db.execute(sql`
        UPDATE staff_profiles SET clock_pin = ${hashed}, settings_pin_hash = ${hashed} WHERE user_id = ${id}
      `);
    } else {
      // No staff_profiles row yet (e.g. manager accounts) — create a minimal one
      await db.insert(staffProfilesTable).values({
        userId: id,
        employeeId: `EMP-${id.slice(0, 8).toUpperCase()}`,
        clockPin: hashed,
        isManager: true,
        approvedByAdmin: false,
      });
      // Also set settings_pin_hash on the new row
      await db.execute(sql`
        UPDATE staff_profiles SET settings_pin_hash = ${hashed} WHERE user_id = ${id}
      `);
    }
    await recordAuditLog({ actor: req.user, entityType: 'staff_profile', entityId: id, action: 'pos_pin_set' });
  } else {
    // Clear both PIN fields together
    await db.execute(sql`
      UPDATE staff_profiles SET clock_pin = NULL, settings_pin_hash = NULL WHERE user_id = ${id}
    `);
    await recordAuditLog({ actor: req.user, entityType: 'staff_profile', entityId: id, action: 'pos_pin_cleared' });
  }
  return res.json({ success: true });
});

router.patch('/staff/:id/settings-pin', async (req, res) => {
  // Settings PIN management is director/master only — managers cannot issue access PINs
  if (!['director', 'master'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only directors and masters can manage Settings PINs.' });
  }
  const { id } = req.params;
  const { pin } = req.body ?? {};
  if (pin !== null && pin !== undefined) {
    if (!/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ error: 'Settings PIN must be exactly 4 digits.' });
    }
    const hashed = await bcrypt.hash(String(pin), 10);
    const [existing] = await db.select({ userId: staffProfilesTable.userId })
      .from(staffProfilesTable).where(eq(staffProfilesTable.userId, id)).limit(1);
    if (existing) {
      // Always sync both PIN fields so one PIN works for everything
      await db.execute(sql`UPDATE staff_profiles SET settings_pin_hash = ${hashed}, clock_pin = ${hashed} WHERE user_id = ${id}`);
    } else {
      await db.insert(staffProfilesTable).values({
        userId: id,
        employeeId: `EMP-${id.slice(0, 8).toUpperCase()}`,
        clockPin: hashed,
        isManager: true,
        approvedByAdmin: false,
      });
      await db.execute(sql`UPDATE staff_profiles SET settings_pin_hash = ${hashed} WHERE user_id = ${id}`);
    }
    await recordAuditLog({ actor: req.user, entityType: 'staff_profile', entityId: id, action: 'pos_pin_set' });
  } else {
    // Clear both fields together
    await db.execute(sql`UPDATE staff_profiles SET settings_pin_hash = NULL, clock_pin = NULL WHERE user_id = ${id}`);
    await recordAuditLog({ actor: req.user, entityType: 'staff_profile', entityId: id, action: 'pos_pin_cleared' });
  }
  return res.json({ success: true });
});

// ── Verify settings PIN (director/manager/master tokens) ─────────────────────
router.post('/verify-settings-pin', async (req, res) => {
  const { pin } = req.body ?? {};
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'A 4-digit PIN is required.' });
  }
  const rows = await db.execute(sql`
    SELECT sp.user_id, sp.settings_pin_hash, sp.clock_pin
    FROM staff_profiles sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.role IN ('manager', 'director', 'master')
  `);
  const profiles = (rows as any).rows ?? (rows as any) ?? [];
  for (const row of profiles) {
    if (row.settings_pin_hash) {
      const valid = await bcrypt.compare(String(pin), row.settings_pin_hash);
      if (valid) {
        recordAuditLog({ actor: req.user, action: 'settings.pin_verify_success', entityType: 'settings', entityId: row.user_id ?? '' });
        db.insert(loginHistoryTable).values({
          id: randomUUID(),
          userId: req.user?.id ?? null,
          email: req.user?.email ?? null,
          role: req.user?.role ?? null,
          success: true,
          failReason: null,
          ip: (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? (req as any).ip ?? null,
          userAgent: req.headers?.['user-agent'] ?? null,
        }).catch(() => {});
        return res.json({ granted: true });
      }
    } else if (row.clock_pin) {
      const valid = await bcrypt.compare(String(pin), row.clock_pin);
      if (valid) {
        recordAuditLog({ actor: req.user, action: 'settings.pin_verify_success', entityType: 'settings', entityId: row.user_id ?? '' });
        db.insert(loginHistoryTable).values({
          id: randomUUID(),
          userId: req.user?.id ?? null,
          email: req.user?.email ?? null,
          role: req.user?.role ?? null,
          success: true,
          failReason: null,
          ip: (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? (req as any).ip ?? null,
          userAgent: req.headers?.['user-agent'] ?? null,
        }).catch(() => {});
        return res.json({ granted: true });
      }
    }
  }
  recordAuditLog({ actor: req.user, action: 'settings.pin_verify_fail', entityType: 'settings', entityId: '' });
  db.insert(loginHistoryTable).values({
    id: randomUUID(),
    userId: req.user?.id ?? null,
    email: req.user?.email ?? null,
    role: req.user?.role ?? null,
    success: false,
    failReason: 'WRONG_PIN',
    ip: (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? (req as any).ip ?? null,
    userAgent: req.headers?.['user-agent'] ?? null,
  }).catch(() => {});
  return res.json({ granted: false });
});

// ── Delete user (director only) ──────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (id === req.user!.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'master') return res.status(403).json({ error: 'Master accounts cannot be deleted.' });
  if (target.role === 'director' && req.user!.role !== 'master') return res.status(403).json({ error: 'Only the master account can delete director accounts.' });
  if (!['director', 'master'].includes(req.user!.role)) return res.status(403).json({ error: 'Only directors can delete accounts.' });

  // Snapshot the user's data before hard-deleting — kept for 30 days for recovery
  const [fullUser] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  const [custProfile]     = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, id));
  const [staffProfile]    = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, id));
  const [wholesaleAccount]= await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, id));
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(deletedAccountsTable).values({
    id,
    deletedBy: req.user!.id,
    deletedByName: null,
    expiresAt,
    role: target.role,
    email: fullUser?.email ?? '',
    name: fullUser?.name ?? '',
    snapshot: {
      user: fullUser ?? null,
      customerProfile: custProfile ?? null,
      staffProfile: staffProfile ?? null,
      wholesaleAccount: wholesaleAccount ?? null,
    },
  }).onConflictDoNothing();

  await db.execute(sql`DELETE FROM loyalty_transactions WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM orders WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM customer_profiles WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM staff_profiles WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM wholesale_accounts WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM manager_profiles WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM staff_shifts WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM staff_wastage WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM staff_issues WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM staff_leave_requests WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM wholesale_orders WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM favourites WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM feedback WHERE user_id = ${id}`);
  await db.execute(sql`DELETE FROM waitlists WHERE user_id = ${id}`);
  await db.delete(usersTable).where(eq(usersTable.id, id));

  return res.json({ success: true });
});

// ── Staff member detail (GET + full PATCH) ───────────────────────────────────
router.get('/staff/:userId', async (req, res) => {
  const { userId } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const [profile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, userId));
  const recentShifts = await db.select().from(staffShiftsTable)
    .where(eq(staffShiftsTable.userId, userId))
    .orderBy(desc(staffShiftsTable.clockIn))
    .limit(10);
  const { passwordHash: _, ...safeUser } = user;
  let parsedEmergencyContact: { name?: string | null; phone?: string | null; relationship?: string | null } | null = null;
  if (profile?.emergencyContact) {
    try {
      parsedEmergencyContact = JSON.parse(profile.emergencyContact);
    } catch {
      parsedEmergencyContact = null;
    }
  }
  return res.json({
    data: {
      ...safeUser,
      staffProfile: profile
        ? {
            ...profile,
            emergencyContact: parsedEmergencyContact,
          }
        : null,
      recentShifts,
    },
  });
});

router.patch('/staff/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, email, phone, address, taxFileNumber, position, department, hourlyRateCents, employmentStatus, dateOfBirth, emergencyContact } = req.body;

  const userUpdates: Record<string, any> = { updatedAt: new Date() };
  if (name  !== undefined) userUpdates.name  = String(name).trim();
  if (email !== undefined) userUpdates.email = String(email).trim().toLowerCase();
  if (phone !== undefined) userUpdates.phone = String(phone).trim() || null;
  if (Object.keys(userUpdates).length > 1) {
    await db.update(usersTable).set(userUpdates).where(eq(usersTable.id, userId));
  }

  const profileUpdates: Record<string, any> = { updatedAt: new Date() };
  if (address         !== undefined) profileUpdates.address         = String(address).trim() || null;
  if (taxFileNumber   !== undefined) profileUpdates.taxFileNumber   = String(taxFileNumber).trim() || null;
  if (position        !== undefined) profileUpdates.position        = String(position).trim();
  if (department      !== undefined) profileUpdates.department      = String(department).trim();
  if (hourlyRateCents !== undefined) profileUpdates.hourlyRateCents = Number(hourlyRateCents);
  if (employmentStatus !== undefined) profileUpdates.employmentStatus = String(employmentStatus);
  if (dateOfBirth     !== undefined) profileUpdates.dateOfBirth     = String(dateOfBirth).trim() || null;
  if (emergencyContact !== undefined) profileUpdates.emergencyContact = emergencyContact ? JSON.stringify(emergencyContact) : null;
  if (Object.keys(profileUpdates).length > 1) {
    await db.update(staffProfilesTable).set(profileUpdates).where(eq(staffProfilesTable.userId, userId));
  }

  const [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [updatedProfile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, userId));
  const { passwordHash: _, ...safeUser } = updatedUser;
  let parsedEmergencyContact: { name?: string | null; phone?: string | null; relationship?: string | null } | null = null;
  if (updatedProfile?.emergencyContact) {
    try {
      parsedEmergencyContact = JSON.parse(updatedProfile.emergencyContact);
    } catch {
      parsedEmergencyContact = null;
    }
  }
  return res.json({
    data: {
      ...safeUser,
      staffProfile: updatedProfile
        ? {
            ...updatedProfile,
            emergencyContact: parsedEmergencyContact,
          }
        : null,
    },
  });
});

// ── Director clock-in/out on behalf of a staff member ────────────────────────
router.post('/staff/:userId/clock-in', async (req, res) => {
  const { userId } = req.params;
  const existing = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, userId), isNull(staffShiftsTable.clockOut)));
  if (existing.length > 0) {
    return res.status(400).json({ error: 'Staff member is already clocked in.', shift: existing[0] });
  }
  const [shift] = await db.insert(staffShiftsTable).values({
    id: randomUUID(), userId, clockIn: new Date(), unpaidBreakMins: 0,
  }).returning();
  return res.status(201).json({ data: shift });
});

router.post('/staff/:userId/clock-out', async (req, res) => {
  const { userId } = req.params;
  const [active] = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, userId), isNull(staffShiftsTable.clockOut)));
  if (!active) return res.status(400).json({ error: 'No active shift for this staff member.' });
  const now = new Date();
  const diffMs  = now.getTime() - active.clockIn.getTime();
  const hrs = (diffMs / 3_600_000).toFixed(2);
  const [shift] = await db.update(staffShiftsTable)
    .set({ clockOut: now, hoursWorked: hrs, unpaidBreakMins: 0 })
    .where(eq(staffShiftsTable.id, active.id)).returning();
  return res.json({ data: shift });
});

// ── Toggle staff orders permission ───────────────────────────────────────────
router.patch('/staff/:userId/orders-permission', async (req, res) => {
  const { userId } = req.params;
  const { canViewOrders } = req.body;
  if (typeof canViewOrders !== 'boolean') {
    return res.status(400).json({ error: 'canViewOrders must be a boolean.' });
  }
  const [updated] = await db.update(staffProfilesTable)
    .set({ canViewOrders })
    .where(eq(staffProfilesTable.userId, userId))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Staff profile not found.' });
  return res.json({ data: updated });
});

// ── Staff leave requests (per user) ──────────────────────────────────────────
router.get('/staff/:userId/leave', async (req, res) => {
  const rows = await db.select().from(staffLeaveRequestsTable)
    .where(eq(staffLeaveRequestsTable.userId, req.params.userId))
    .orderBy(desc(staffLeaveRequestsTable.createdAt))
    .limit(20);
  return res.json({ data: rows });
});

router.patch('/staff/leave/:leaveId/review', async (req, res) => {
  const { approved, note } = req.body;
  const newStatus = approved ? 'approved' : 'rejected';
  const [updated] = await db.update(staffLeaveRequestsTable)
    .set({ status: newStatus, reviewedBy: req.user!.id, reviewedAt: new Date(), reviewNote: note ?? null })
    .where(eq(staffLeaveRequestsTable.id, req.params.leaveId)).returning();
  if (!updated) return res.status(404).json({ error: 'Leave request not found.' });
  return res.json({ data: updated });
});

// ── Staff approval ───────────────────────────────────────────────────────────
router.patch('/staff/:userId/approve', async (req, res) => {
  const { userId } = req.params;
  const { approved } = req.body;
  const [updated] = await db.update(staffProfilesTable)
    .set({ approvedByAdmin: approved !== false })
    .where(eq(staffProfilesTable.userId, userId))
    .returning();
  return res.json({ data: updated });
});

// ── Promote any customer to staff / manager / director ────────────────────────
router.patch('/customers/:id/promote', requireRole('director', 'master'), async (req, res) => {
  const id = req.params.id as string;
  const { role, accessRole } = req.body;
  if (!['staff', 'manager', 'director', 'master'].includes(role)) {
    return res.status(400).json({ error: 'Role must be staff, manager, director, or master.' });
  }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'master') return res.status(403).json({ error: 'Cannot change master account role.' });
  if (role === 'master' && req.user!.role !== 'master') {
    return res.status(403).json({ error: 'Only a master account can assign master access.' });
  }
  if (role === 'director' && req.user!.role !== 'master') {
    return res.status(403).json({ error: 'Only a master account can assign director access.' });
  }

  const normalizedAccessRole: AccessRoleKey =
    role === 'manager'
      ? (isManagerFamilyRole(accessRole) ? accessRole : 'manager')
      : role === 'director'
        ? 'director'
        : role === 'master'
          ? 'master'
          : 'manager';

  // Change role
  const [updated] = await db.update(usersTable)
    .set({ role: role as any, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role });

  // Ensure appropriate profile records exist (check-then-insert, avoids constraint errors)
  if (role === 'staff' || role === 'manager') {
    const existingSpRows = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, id));
    if (existingSpRows.length === 0) {
      await db.insert(staffProfilesTable).values({
        userId:          id,
        employeeId:      `EMP-${Date.now().toString(36).toUpperCase()}`,
        position:        role === 'manager' ? ACCESS_ROLE_LABELS[normalizedAccessRole] : 'Staff',
        department:      'floor',
        isManager:       role === 'manager',
        approvedByAdmin: true,
        hourlyRateCents: 0,
        address:         null,
        taxFileNumber:   null,
      });
    } else if (role === 'manager') {
      await db.update(staffProfilesTable)
        .set({
          position: ACCESS_ROLE_LABELS[normalizedAccessRole],
          isManager: true,
          approvedByAdmin: true,
          updatedAt: new Date(),
        })
        .where(eq(staffProfilesTable.userId, id));
    }
    if (role === 'manager') {
      const existingMpRows = await db.select().from(managerProfilesTable).where(eq(managerProfilesTable.userId, id));
      if (existingMpRows.length === 0) {
        const permStr: string = JSON.stringify(['dashboard', 'orders']);
        await db.insert(managerProfilesTable).values({
          userId:          id,
          permissions:     permStr,
          createdByUserId: req.user!.id,
          notes:           null,
        });
      }
    } else {
      await db.delete(managerProfilesTable).where(eq(managerProfilesTable.userId, id));
      await db.update(staffProfilesTable)
        .set({ position: 'Staff', isManager: false, updatedAt: new Date() })
        .where(eq(staffProfilesTable.userId, id));
    }
  } else if (role === 'director' || role === 'master') {
    await db.delete(managerProfilesTable).where(eq(managerProfilesTable.userId, id));
  }

  return res.json({ data: updated });
});

// ── Promote staff to director ─────────────────────────────────────────────────
router.patch('/staff/:userId/promote-director', async (req, res) => {
  if (req.user!.role !== 'master') {
    return res.status(403).json({ error: 'Only a master account can promote users to director.' });
  }
  const { userId } = req.params;
  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'director') return res.status(400).json({ error: 'User is already a director.' });
  if (target.role === 'master') return res.status(403).json({ error: 'Cannot change master account role.' });
  const [updated] = await db.update(usersTable)
    .set({ role: 'director' as any })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role });
  return res.json({ data: updated });
});

// ── Wholesale approval ───────────────────────────────────────────────────────
router.patch('/wholesale/:accountId/status', async (req, res) => {
  const { accountId } = req.params;
  const { status } = req.body;
  if (!['approved','pending','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const [updated] = await db.update(wholesaleAccountsTable)
    .set({ status }).where(eq(wholesaleAccountsTable.id, accountId)).returning();
  return res.json({ data: updated });
});

// ── Wholesale account general update ─────────────────────────────────────────
router.patch('/wholesale/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const updates: Record<string, any> = {};
  // Credit management
  if (req.body.creditEnabled       !== undefined) updates.creditEnabled       = Boolean(req.body.creditEnabled);
  if (req.body.creditLimitCents    !== undefined) updates.creditLimitCents    = Number(req.body.creditLimitCents);
  if (req.body.creditNotes         !== undefined) updates.creditNotes         = req.body.creditNotes ? String(req.body.creditNotes) : null;
  // Payment & delivery
  if (req.body.paymentTerms        !== undefined) updates.paymentTerms        = req.body.paymentTerms ? String(req.body.paymentTerms) : null;
  if (req.body.deliveryAddress     !== undefined) updates.deliveryAddress     = String(req.body.deliveryAddress);
  if (req.body.deliveryFeeCents    !== undefined) updates.deliveryFeeCents    = Number(req.body.deliveryFeeCents);
  if (req.body.minimumOrderCents   !== undefined) {
    updates.minimumOrderCents = Number(req.body.minimumOrderCents);
    updates.minOrderCents     = Number(req.body.minimumOrderCents);
  }
  // Business details (director/master can edit on behalf of customer)
  if (req.body.companyName         !== undefined) updates.companyName         = req.body.companyName ? String(req.body.companyName).trim() : null;
  if (req.body.abn                 !== undefined) updates.abn                 = req.body.abn ? String(req.body.abn).trim() : null;
  if (req.body.contactName         !== undefined) updates.contactName         = req.body.contactName ? String(req.body.contactName).trim() : null;
  if (req.body.phone               !== undefined) updates.phone               = req.body.phone ? String(req.body.phone).trim() : null;
  if (req.body.email               !== undefined) updates.email               = req.body.email ? String(req.body.email).trim() : null;
  if (req.body.pricingTier         !== undefined) updates.pricingTier         = req.body.pricingTier ? String(req.body.pricingTier).trim() : null;
  if (req.body.businessHours       !== undefined) updates.businessHours       = req.body.businessHours ? String(req.body.businessHours).trim() : null;
  // Account manager details (director/master only)
  if (req.body.accountManagerName  !== undefined) updates.accountManager      = req.body.accountManagerName ? String(req.body.accountManagerName) : null;
  if (req.body.accountManagerPhone !== undefined) updates.accountManagerPhone = req.body.accountManagerPhone ? String(req.body.accountManagerPhone) : null;
  if (req.body.accountManagerEmail !== undefined) updates.accountManagerEmail = req.body.accountManagerEmail ? String(req.body.accountManagerEmail) : null;
  // Accounts team email (for invoice delivery)
  if (req.body.accountsEmail       !== undefined) updates.accountsEmail       = req.body.accountsEmail ? String(req.body.accountsEmail) : null;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No updatable fields provided.' });
  updates.updatedAt = new Date();
  const [updated] = await db.update(wholesaleAccountsTable).set(updates).where(eq(wholesaleAccountsTable.id, accountId)).returning();
  if (!updated) return res.status(404).json({ error: 'Wholesale account not found.' });
  return res.json({ data: updated });
});

// ── Director: wholesale invoice management ────────────────────────────────────

/** Parse NET days from paymentTerms string e.g. 'net_14' → 14 */
function parseNetTermDays(paymentTerms: string | null | undefined): number {
  if (!paymentTerms || paymentTerms === 'pay_on_order') return 0;
  const m = paymentTerms.match(/(\d+)/);
  return m ? Number(m[1]) || 0 : 0;
}

/** Derive the due date for a NET order (stored date or computed from createdAt + terms) */
function deriveDueDate(order: { invoiceDueDate?: string | null; createdAt: Date }, netDays: number): Date {
  if (order.invoiceDueDate) return new Date(order.invoiceDueDate);
  const d = new Date(order.createdAt);
  d.setDate(d.getDate() + netDays);
  return d;
}

// List all invoices for NET-term accounts — auto-marks overdue on every fetch
router.get('/wholesale/invoices', async (req, res) => {
  const allAccounts = await db.select().from(wholesaleAccountsTable);
  const netAccounts = allAccounts.filter(
    (a) => a.paymentTerms && a.paymentTerms !== 'pay_on_order',
  );
  if (netAccounts.length === 0) return res.json({ data: [] });

  const netAccountIds = netAccounts.map((a) => a.id);
  const orders = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(inArray(wholesaleOrdersTable.accountId, netAccountIds))
    .orderBy(desc(wholesaleOrdersTable.createdAt));

  // Best-effort Stripe sync
  const synced = await syncWholesaleInvoiceStatuses(orders.map((o) => o.id)).catch(() => ({}));

  const accountMap = Object.fromEntries(netAccounts.map((a) => [a.id, a]));
  const now = new Date();

  // Auto-mark overdue + fill in missing invoiceDueDate
  const overdueUpdates: Promise<unknown>[] = [];
  const updatedOrders = orders.map((rawOrder) => {
    const order = (synced as Record<string, any>)[rawOrder.id] ?? rawOrder;
    const account = accountMap[order.accountId];
    const netDays = parseNetTermDays(account?.paymentTerms);
    const dueDate = netDays > 0 ? deriveDueDate(order, netDays) : null;
    const alreadyPaid = order.isPaid || ['paid'].includes(String(order.invoiceStatus ?? '').toLowerCase());
    const alreadyOverdue = String(order.invoiceStatus ?? '').toLowerCase() === 'overdue';

    if (dueDate && !alreadyPaid) {
      const dueDateStr = dueDate.toISOString().slice(0, 10);
      if (dueDate < now) {
        if (!alreadyOverdue || !order.invoiceDueDate) {
          overdueUpdates.push(
            db.update(wholesaleOrdersTable)
              .set({ invoiceStatus: 'overdue', invoiceDueDate: dueDateStr, updatedAt: new Date() })
              .where(eq(wholesaleOrdersTable.id, rawOrder.id)),
          );
          order.invoiceStatus = 'overdue';
          order.invoiceDueDate = dueDateStr;
        }
      } else if (!order.invoiceDueDate) {
        // Just fill in the missing due date
        overdueUpdates.push(
          db.update(wholesaleOrdersTable)
            .set({ invoiceDueDate: dueDateStr, updatedAt: new Date() })
            .where(eq(wholesaleOrdersTable.id, rawOrder.id)),
        );
        order.invoiceDueDate = dueDateStr;
      }
    }

    return {
      ...order,
      companyName:     account?.companyName     ?? 'Unknown',
      abn:             account?.abn             ?? null,
      paymentTerms:    account?.paymentTerms    ?? null,
      accountsEmail:   account?.accountsEmail   ?? null,
      deliveryAddress: account?.deliveryAddress ?? null,
      contactEmail:    account?.email           ?? null,
    };
  });

  // Fire-and-forget DB updates (don't block response)
  await Promise.allSettled(overdueUpdates);

  return res.json({ data: updatedOrders });
});

// Mark a wholesale order invoice as manually paid
router.patch('/wholesale/invoices/:orderId/mark-paid', async (req, res) => {
  const { orderId } = req.params;
  const [updated] = await db
    .update(wholesaleOrdersTable)
    .set({
      isPaid:              true,
      paidAt:              new Date(),
      invoiceStatus:       'paid',
      stripePaymentStatus: 'paid',
      updatedAt:           new Date(),
    })
    .where(eq(wholesaleOrdersTable.id, orderId))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Order not found.' });
  return res.json({ data: updated });
});

// Send an invoice payment reminder email to the wholesale customer
router.post('/wholesale/invoices/:orderId/send-reminder', async (req, res) => {
  const { orderId } = req.params;

  const [order] = await db
    .select()
    .from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const [account] = await db
    .select()
    .from(wholesaleAccountsTable)
    .where(eq(wholesaleAccountsTable.id, order.accountId));
  if (!account) return res.status(404).json({ error: 'Account not found.' });

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, order.userId));

  const recipientEmail = account.accountsEmail?.trim() || account.email?.trim() || user?.email;
  if (!recipientEmail) return res.status(400).json({ error: 'No email address on file for this account.' });

  const netDays = parseNetTermDays(account.paymentTerms);
  const dueDate = netDays > 0 ? deriveDueDate(order, netDays) : null;
  const dueDateStr = dueDate
    ? dueDate.toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const totalAUD = ((order.totalCents ?? 0) / 100).toLocaleString('en-AU', {
    style: 'currency', currency: 'AUD',
  });
  const invNum = order.invoiceNumber ?? order.poReference ?? `INV-${order.id.slice(0, 6).toUpperCase()}`;
  const termsLabel: Record<string, string> = {
    net_7: 'NET 7', net_14: 'NET 14', net_30: 'NET 30', net_60: 'NET 60',
  };
  const terms = termsLabel[account.paymentTerms ?? ''] ?? account.paymentTerms ?? '';
  const isOverdue = dueDate ? dueDate < new Date() : false;

  const { sendEmail, buildInvoiceReminderEmail } = await import('../lib/emailService.js');
  const html = buildInvoiceReminderEmail({
    companyName: account.companyName,
    contactName: account.contactName ?? user?.name ?? account.companyName,
    invoiceNumber: invNum,
    totalAUD,
    dueDate: dueDateStr,
    terms,
    isOverdue,
  });

  const subject = isOverdue
    ? `Overdue invoice reminder: ${invNum} — ${totalAUD}`
    : `Invoice reminder: ${invNum} due ${dueDateStr}`;

  const { success } = await sendEmail({ to: recipientEmail, subject, html });

  if (!success) {
    return res.status(500).json({ error: 'Failed to send email. Check that Resend integration is connected.' });
  }

  return res.json({ success: true, sentTo: recipientEmail });
});

// ── Products CRUD ─────────────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const products = await db.select().from(productsTable).orderBy(productsTable.sortOrder, productsTable.name);
  return res.json({ data: products });
});

router.post('/products', async (req, res) => {
  const {
    name, description, shortDescription, category, productType,
    priceCents, salePriceCents, costPriceCents, wholesalePriceCents, gstIncluded,
    sku, barcode, imageUrl, productUrl,
    isAvailable, isFeatured, isNew, isWholesaleAvailable, isStaffOnly, isAppOnly,
    isLimitedDrop, isSoldOut, isComingSoon, isPickupOnly,
    tags, allergens, dietaryTags, ingredients, nutritionInfo,
    storageInstructions, servingInstructions,
    minOrderQty, maxOrderQty, leadTimeMins, availableDays, availableTimes,
    stockCount, lowStockThreshold, sortOrder,
  } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Product name is required.' });
  if (typeof priceCents !== 'number') return res.status(400).json({ error: 'Price is required.' });

  const [product] = await db.insert(productsTable).values({
    id: randomUUID(),
    name: name.trim(),
    description:        description        ?? '',
    shortDescription:   shortDescription   ?? null,
    category:           category           ?? 'cookies',
    productType:        productType        ?? 'standard',
    priceCents,
    salePriceCents:     salePriceCents     ?? null,
    costPriceCents:     costPriceCents     ?? null,
    wholesalePriceCents:wholesalePriceCents ?? null,
    gstIncluded:        gstIncluded        ?? true,
    sku:                sku                ?? null,
    barcode:            barcode            ?? null,
    imageUrl:           imageUrl           ?? null,
    productUrl:         productUrl         ?? null,
    isAvailable:        isAvailable        ?? true,
    isFeatured:         isFeatured         ?? false,
    isNew:              isNew              ?? false,
    isWholesaleAvailable: isWholesaleAvailable ?? true,
    isStaffOnly:        isStaffOnly        ?? false,
    isAppOnly:          isAppOnly          ?? false,
    isLimitedDrop:      isLimitedDrop      ?? false,
    isSoldOut:          isSoldOut          ?? false,
    isComingSoon:       isComingSoon        ?? false,
    isPickupOnly:       isPickupOnly        ?? false,
    tags:               tags               ? JSON.stringify(tags)         : null,
    allergens:          allergens          ? JSON.stringify(allergens)     : null,
    dietaryTags:        dietaryTags        ? JSON.stringify(dietaryTags)   : null,
    ingredients:        ingredients        ?? null,
    nutritionInfo:      nutritionInfo      ?? null,
    storageInstructions:storageInstructions ?? null,
    servingInstructions:servingInstructions ?? null,
    minOrderQty:        minOrderQty        ?? 1,
    maxOrderQty:        maxOrderQty        ?? null,
    leadTimeMins:       leadTimeMins        ?? null,
    availableDays:      availableDays       ? JSON.stringify(availableDays) : null,
    availableTimes:     availableTimes      ?? null,
    stockCount:         stockCount          ?? null,
    lowStockThreshold:  lowStockThreshold   ?? 10,
    sortOrder:          sortOrder           ?? 0,
  }).returning();
  return res.status(201).json({ data: product });
});

router.patch('/products/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = [
    'name','description','shortDescription','category','productType',
    'priceCents','salePriceCents','costPriceCents','wholesalePriceCents','gstIncluded',
    'sku','barcode','imageUrl','galleryUrls','productUrl',
    'isAvailable','isActive','isFeatured','isNew','isWholesaleAvailable','isStaffOnly',
    'isAppOnly','isLimitedDrop','isSoldOut','isComingSoon','isPickupOnly',
    'tags','allergens','dietaryTags','ingredients','nutritionInfo',
    'storageInstructions','servingInstructions',
    'minOrderQty','maxOrderQty','leadTimeMins','availableDays','availableTimes',
    'stockCount','lowStockThreshold','sortOrder',
  ];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.updatedAt = new Date();
  const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  return res.json({ data: updated });
});

router.delete('/products/:id', async (req, res) => {
  await db.update(productsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(productsTable.id, req.params.id));
  return res.json({ success: true });
});

router.delete('/products/:id/permanent', requireRole('director', 'master'), async (req, res) => {
  const id = req.params.id as string;
  const [product] = await db.select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable).where(eq(productsTable.id, id));
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  try {
    await db.delete(productsTable).where(eq(productsTable.id, id));
    return res.json({ success: true });
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    if (msg.includes('foreign key') || msg.includes('violates') || msg.includes('constraint')) {
      return res.status(409).json({
        error: `"${product.name}" cannot be deleted because it appears in past orders. Archive it instead to hide it from menus while keeping your order history intact.`,
        code: 'HAS_ORDER_HISTORY',
      });
    }
    req.log.error({ err }, 'permanent product delete failed');
    return res.status(500).json({ error: 'Delete failed. Please try again.' });
  }
});

// ── Store settings ───────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  await db.insert(storeSettingsTable).values([
    { key: 'geo_radius_meters',  value: '20' },
    { key: 'shop_lat',           value: '-33.8349' },
    { key: 'shop_lng',           value: '150.9942' },
    { key: 'store_open',         value: 'true' },
    { key: 'daily_special',      value: 'Cookie & Cream Sandwich' },
    { key: 'order_cutoff_time',  value: '' },
    { key: 'printer_ip',         value: '' },
    { key: 'printer_port',       value: '9100' },
  ]).onConflictDoNothing();
  const rows = await db.select().from(storeSettingsTable);
  return res.json({ data: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});

router.patch('/settings', async (req, res) => {
  let updates = req.body as Record<string, string>;
  // Managers cannot modify geo-fence settings — strip them out server-side
  if (req.user!.role === 'manager') {
    const { geo_radius_meters, shop_lat, shop_lng, ...rest } = updates;
    updates = rest;
  }
  for (const [key, value] of Object.entries(updates)) {
    await db.insert(storeSettingsTable).values({ key, value, updatedBy: req.user!.id })
      .onConflictDoUpdate({ target: storeSettingsTable.key, set: { value, updatedAt: new Date(), updatedBy: req.user!.id } });
  }

  // Propagate geo settings to the stores table so clock-in and login use the same values.
  // Clock-in reads stores.geofenceRadius / stores.latitude / stores.longitude directly,
  // not the store_settings table, so we must keep them in sync whenever the director
  // updates the Settings screen.
  const storeGeoUpdate: Record<string, any> = { updatedAt: new Date() };
  if (updates.geo_radius_meters !== undefined) {
    const r = parseInt(updates.geo_radius_meters);
    if (!isNaN(r) && r >= 5) storeGeoUpdate.geofenceRadius = r;
  }
  if (updates.shop_lat !== undefined) {
    const lat = parseFloat(updates.shop_lat);
    if (!isNaN(lat)) storeGeoUpdate.latitude = lat;
  }
  if (updates.shop_lng !== undefined) {
    const lng = parseFloat(updates.shop_lng);
    if (!isNaN(lng)) storeGeoUpdate.longitude = lng;
  }
  if (Object.keys(storeGeoUpdate).length > 1) {
    // Update all stores so every assigned store reflects the director's geo settings.
    await db.update(storesTable).set(storeGeoUpdate);
  }

  const rows = await db.select().from(storeSettingsTable);
  return res.json({ data: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});

// ── Printer bytes — device does the TCP send, server only builds ESC/POS ─────
// The API server runs in the cloud and cannot reach a local-network printer.
// Instead the app fetches the raw ESC/POS bytes here, then opens the TCP
// socket itself from the device (which IS on the same LAN as the printer).
router.post('/printer/bytes', async (req, res) => {
  try {
    const { buildReceiptBytes, buildTaxInvoiceBytes, buildRegisterSummaryBytes, buildLinklyReceiptBytes, buildOpenDrawerBytes } = await import('../lib/printer.js');
    const { job } = req.body as { job?: any };
    const brand: 'epson' | 'star' = job?.printerBrand === 'star' ? 'star' : 'epson';
    if (job?.jobType === 'open_drawer') {
      const pin: 0 | 1 = job?.drawerPin === 1 ? 1 : 0;
      const bytes = buildOpenDrawerBytes(pin);
      return res.json({ data: { bytes: bytes.toString('base64') } });
    }
    if (job?.jobType === 'register_summary') {
      const bytes = buildRegisterSummaryBytes({
        title: typeof job?.title === 'string' ? job.title : 'Daily Register Summary',
        lines: Array.isArray(job?.lines) ? job.lines : [],
        printerBrand: brand,
      });
      return res.json({ data: { bytes: bytes.toString('base64') } });
    }
    if (job?.jobType === 'linkly_receipt') {
      const bytes = buildLinklyReceiptBytes({
        title: typeof job?.title === 'string' ? job.title : 'Linkly Receipt',
        lines: Array.isArray(job?.lines) ? job.lines : [],
        printerBrand: brand,
      });
      return res.json({ data: { bytes: bytes.toString('base64') } });
    }
    const isRealJob = job && job.orderId && job.orderId !== 'test-0000-0000-0000' && Array.isArray(job.items) && job.items.length > 0;
    const printJob = isRealJob
      ? (job as import('../lib/printer.js').PrintJob)
      : {
          orderId:             'test-0000-0000-0000',
          customerName:        req.user!.name,
          type:                'pickup' as const,
          items:               [
            { name: 'Choc Chip Cookie', quantity: 2, unitPriceCents: 500 },
            { name: 'Flat White',       quantity: 1, unitPriceCents: 550 },
          ],
          totalCents:          1550,
          loyaltyPointsEarned: 15,
          notes:               'Test print — Butterfield POS',
          printerBrand:        brand,
        };
    const bytes = job?.jobType === 'tax_invoice'
      ? buildTaxInvoiceBytes(printJob)
      : buildReceiptBytes(printJob);
    return res.json({ data: { bytes: bytes.toString('base64') } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Could not build receipt' });
  }
});

// ── Wholesale accounts list ──────────────────────────────────────────────────
router.get('/wholesale', async (req, res) => {
  const accounts = await db.select().from(wholesaleAccountsTable).orderBy(desc(wholesaleAccountsTable.createdAt));
  return res.json({ data: accounts });
});

// ── Create staff account ─────────────────────────────────────────────────────
router.post('/create-staff', async (req, res) => {
  const { name, email, password, position, department, isManager, hourlyRateCents, phone, address, taxFileNumber, employmentStatus } = req.body;
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  if (existing.length > 0) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const userId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: email.toLowerCase().trim(), passwordHash: hash, role: 'staff' as any, name: name.trim(), phone: phone?.trim() ?? null });
  const empId = `EMP-${Date.now().toString(36).toUpperCase()}`;
  const [profile] = await db.insert(staffProfilesTable).values({
    userId, employeeId: empId,
    position:         position?.trim()         ?? 'Crew',
    department:       department?.trim()       ?? 'floor',
    isManager:        isManager === true,
    approvedByAdmin:  true,
    hourlyRateCents:  typeof hourlyRateCents === 'number' ? hourlyRateCents : 0,
    address:          address?.trim()          ?? null,
    taxFileNumber:    taxFileNumber?.trim()    ?? null,
    employmentStatus: employmentStatus?.trim() ?? 'casual',
  }).returning();
  return res.status(201).json({ data: { userId, email, name, role: 'staff', employeeId: empId, profile } });
});

// ── Create wholesale account ──────────────────────────────────────────────────
router.post('/create-wholesale', async (req, res) => {
  const { name, email, password, companyName, abn, phone } = req.body;
  if (!name?.trim() || !email?.trim() || !password?.trim() || !companyName?.trim()) {
    return res.status(400).json({ error: 'Name, email, password and company name are required.' });
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  if (existing.length > 0) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const userId = randomUUID();
  await db.insert(usersTable).values({
    id: userId,
    email: email.toLowerCase().trim(),
    passwordHash: hash,
    role: 'wholesale' as any,
    name: name.trim(),
    phone: phone?.trim() || null,
  });
  const accountId = randomUUID();
  const [account] = await db.insert(wholesaleAccountsTable).values({
    id: accountId, userId,
    companyName: companyName.trim(),
    abn:         abn?.trim()   ?? '',
    contactName: name.trim(),
    phone:       phone?.trim() || null,
    email:       email.toLowerCase().trim(),
    status:      'approved',
  }).returning();
  return res.status(201).json({ data: { userId, email, name, role: 'wholesale', account } });
});

// ── Rewards CRUD ──────────────────────────────────────────────────────────────
const REWARD_PURGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

router.get('/rewards', async (req, res) => {
  // Auto-purge hard-delete rewards older than 14 days
  const cutoff = new Date(Date.now() - REWARD_PURGE_MS);
  await db.delete(loyaltyRewardsTable)
    .where(and(isNotNull(loyaltyRewardsTable.deletedAt), lt(loyaltyRewardsTable.deletedAt, cutoff)));
  const rewards = await db.select().from(loyaltyRewardsTable).orderBy(loyaltyRewardsTable.pointsCost);

  // Enrich each reward with its claim count (redeemed claims only)
  const claimCountResult = await db.execute(
    sql.raw(`SELECT reward_id, COUNT(*) as cnt FROM claimed_rewards WHERE status = 'redeemed' GROUP BY reward_id`)
  );
  const claimRows: { reward_id: string; cnt: string }[] =
    (claimCountResult as unknown as { rows?: { reward_id: string; cnt: string }[] }).rows ?? [];
  const countMap = new Map<string, number>(
    claimRows.map(r => [r.reward_id, parseInt(r.cnt, 10)])
  );

  return res.json({
    data: rewards.map(r => ({ ...r, claimCount: countMap.get(r.id) ?? 0 })),
  });
});

router.post('/rewards', async (req, res) => {
  const b = req.body ?? {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'Reward name is required.' });
  if (typeof b.pointsCost !== 'number') return res.status(400).json({ error: 'pointsCost must be a number.' });
  const rewardType = b.rewardType ?? 'item_reward';
  if (!['item_reward', 'money_voucher'].includes(rewardType)) {
    return res.status(400).json({ error: 'rewardType must be item_reward or money_voucher.' });
  }
  if (rewardType === 'money_voucher' && (!b.voucherValueCents || typeof b.voucherValueCents !== 'number' || b.voucherValueCents < 1)) {
    return res.status(400).json({ error: 'money_voucher rewards require a voucherValueCents value.' });
  }
  const claimExpiryDays = b.claimExpiryDays != null && Number(b.claimExpiryDays) > 0
    ? Math.floor(Number(b.claimExpiryDays))
    : null;
  const [reward] = await db.insert(loyaltyRewardsTable).values({
    id:               randomUUID(),
    name:             b.name.trim(),
    description:      b.description?.trim() ?? '',
    pointsCost:       b.pointsCost,
    category:         b.category ?? 'food',
    imageUrl:         b.imageUrl ?? null,
    isActive:         b.isActive !== false,
    isAppOnly:        b.isAppOnly === true,
    stock:            typeof b.stock === 'number' ? b.stock : null,
    expiresAt:        b.expiresAt ? new Date(b.expiresAt) : null,
    rewardType,
    voucherValueCents: rewardType === 'money_voucher' ? b.voucherValueCents : null,
    linkedProductId:  b.linkedProductId ?? null,
    customerRedeemable: b.customerRedeemable !== false,
    staffRedeemable:  b.staffRedeemable === true,
    claimExpiryDays,
  }).returning();
  return res.status(201).json({ data: reward });
});

router.patch('/rewards/:id', async (req, res) => {
  const b = req.body ?? {};
  const allowed = ['name','description','pointsCost','category','imageUrl','isActive','isAppOnly','stock',
    'rewardType','voucherValueCents','linkedProductId','customerRedeemable','staffRedeemable'];
  const updates: Record<string, any> = {};
  for (const k of allowed) if (b[k] !== undefined) updates[k] = b[k];
  if (b.expiresAt !== undefined) updates.expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  if (b.claimExpiryDays !== undefined) {
    updates.claimExpiryDays = b.claimExpiryDays != null && Number(b.claimExpiryDays) > 0
      ? Math.floor(Number(b.claimExpiryDays))
      : null;
  }
  // Enforce voucher value presence
  if (updates.rewardType === 'money_voucher' && updates.voucherValueCents === undefined) {
    const [existing] = await db.select({ rewardType: loyaltyRewardsTable.rewardType, voucherValueCents: loyaltyRewardsTable.voucherValueCents })
      .from(loyaltyRewardsTable).where(eq(loyaltyRewardsTable.id, req.params.id));
    if (!existing?.voucherValueCents) {
      return res.status(400).json({ error: 'money_voucher rewards require voucherValueCents.' });
    }
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update.' });
  const [updated] = await db.update(loyaltyRewardsTable).set(updates)
    .where(and(eq(loyaltyRewardsTable.id, req.params.id), isNull(loyaltyRewardsTable.deletedAt))).returning();
  if (!updated) return res.status(404).json({ error: 'Reward not found.' });
  return res.json({ data: updated });
});

// Soft-delete: set deletedAt timestamp (customer-facing /loyalty/rewards already filters deletedAt IS NULL)
router.delete('/rewards/:id', async (req, res) => {
  await db.update(loyaltyRewardsTable)
    .set({ isActive: false, deletedAt: new Date() })
    .where(eq(loyaltyRewardsTable.id, req.params.id));
  return res.json({ success: true });
});

// Restore a soft-deleted reward (clears deletedAt, re-activates)
router.post('/rewards/:id/restore', async (req, res) => {
  const [restored] = await db.update(loyaltyRewardsTable)
    .set({ deletedAt: null, isActive: true })
    .where(eq(loyaltyRewardsTable.id, req.params.id)).returning();
  if (!restored) return res.status(404).json({ error: 'Reward not found.' });
  return res.json({ data: restored });
});

// ── Announcements / Notifications CRUD ───────────────────────────────────────
router.get('/announcements', async (req, res) => {
  const rows = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
  return res.json({ data: rows });
});

router.post('/announcements', async (req, res) => {
  const b = req.body ?? {};
  if (!b.title?.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!b.body?.trim())  return res.status(400).json({ error: 'Body is required.' });
  const [announcement] = await db.insert(announcementsTable).values({
    id:          randomUUID(),
    title:       b.title.trim(),
    body:        b.body.trim(),
    targetRoles: Array.isArray(b.targetRoles) ? b.targetRoles : ['customer'],
    isActive:    b.isActive !== false,
    isPinned:    b.isPinned === true,
    imageUrl:    b.imageUrl ?? null,
    expiresAt:   b.expiresAt ? new Date(b.expiresAt) : null,
  }).returning();
  return res.status(201).json({ data: announcement });
});

router.patch('/announcements/:id', async (req, res) => {
  const b = req.body ?? {};
  const allowed = ['title','body','targetRoles','isActive','isPinned','imageUrl'];
  const updates: Record<string, any> = {};
  for (const k of allowed) if (b[k] !== undefined) updates[k] = b[k];
  if (b.expiresAt !== undefined) updates.expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update.' });
  const [updated] = await db.update(announcementsTable).set(updates)
    .where(eq(announcementsTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Announcement not found.' });
  return res.json({ data: updated });
});

router.delete('/announcements/:id', async (req, res) => {
  await db.delete(announcementsTable).where(eq(announcementsTable.id, req.params.id));
  return res.json({ success: true });
});

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
  const now = new Date();
  const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const startOfToday = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), sydneyNow.getDate());
  const startOfWeek  = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - 7);
  const startOfMonth = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), 1);
  const start30      = new Date(startOfToday); start30.setDate(startOfToday.getDate() - 29);

  const [
    [todayRev], [weekRev], [monthRev],
    [todayCount], [weekCount], [monthCount],
    [todayAvg],
    typeRows, statusRows, recentOrders,
    feedbackRows, [unreadFeedback],
    [totalCustomers], [newCustomersWeek],
  ] = await Promise.all([
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable)
      .where(and(gte(ordersTable.createdAt, startOfToday), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable)
      .where(and(gte(ordersTable.createdAt, startOfWeek), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable)
      .where(and(gte(ordersTable.createdAt, startOfMonth), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfToday)),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfWeek)),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfMonth)),
    db.select({ avg: sql<string>`AVG(${ordersTable.totalCents})` }).from(ordersTable)
      .where(and(gte(ordersTable.createdAt, startOfWeek), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ type: ordersTable.type, count: count() }).from(ordersTable)
      .where(gte(ordersTable.createdAt, startOfMonth)).groupBy(ordersTable.type),
    db.select({ status: ordersTable.status, count: count() }).from(ordersTable)
      .where(gte(ordersTable.createdAt, startOfMonth)).groupBy(ordersTable.status),
    db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(5),
    db.select().from(feedbackTable).orderBy(desc(feedbackTable.createdAt)).limit(20),
    db.select({ count: count() }).from(feedbackTable).where(eq(feedbackTable.isRead, false)),
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, 'customer' as any)),
    db.select({ count: count() }).from(usersTable)
      .where(and(eq(usersTable.role, 'customer' as any), gte(usersTable.createdAt, startOfWeek))),
  ]);

  // Revenue per day for last 30 days
  const dailyRevRows = await db.select({
    day: sql<string>`DATE_TRUNC('day', ${ordersTable.createdAt} AT TIME ZONE 'Australia/Sydney')`,
    total: sum(ordersTable.totalCents),
    count: count(),
  }).from(ordersTable)
    .where(and(gte(ordersTable.createdAt, start30), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`))
    .groupBy(sql`DATE_TRUNC('day', ${ordersTable.createdAt} AT TIME ZONE 'Australia/Sydney')`)
    .orderBy(sql`DATE_TRUNC('day', ${ordersTable.createdAt} AT TIME ZONE 'Australia/Sydney')`);

  const topSellingSourceOrders = await db.select({
    items: ordersTable.items,
  }).from(ordersTable)
    .where(and(gte(ordersTable.createdAt, start30), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`));

  const topSellingMap = new Map<string, { name: string; quantity: number }>();
  for (const row of topSellingSourceOrders) {
    const items = Array.isArray(row.items) ? row.items as any[] : [];
    for (const item of items) {
      const rawName = typeof item?.name === 'string' && item.name.trim()
        ? item.name.trim()
        : typeof item?.productName === 'string' && item.productName.trim()
          ? item.productName.trim()
          : typeof item?.title === 'string' && item.title.trim()
            ? item.title.trim()
            : 'Unknown Item';
      const name = rawName.replace(/\s+/g, ' ').trim();
      const quantity = Math.max(1, Math.floor(Number(item?.quantity ?? 1) || 1));
      const current = topSellingMap.get(name);
      if (current) {
        current.quantity += quantity;
      } else {
        topSellingMap.set(name, { name, quantity });
      }
    }
  }

  const topSellingItems = Array.from(topSellingMap.values())
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, 10);

  return res.json({
    data: {
      revenue: {
        today: Number(todayRev.total ?? 0),
        week:  Number(weekRev.total  ?? 0),
        month: Number(monthRev.total ?? 0),
      },
      orders: {
        today: todayCount.count,
        week:  weekCount.count,
        month: monthCount.count,
        avgValueCents: Math.round(parseFloat(todayAvg.avg ?? '0')),
      },
      byType:   typeRows,
      byStatus: statusRows,
      dailyRevenue: dailyRevRows.map(r => ({
        day: new Date(r.day as any).toISOString(),
        totalCents: Number(r.total ?? 0),
        count: r.count,
      })),
      topSellingItems,
      recentOrders,
      feedback: feedbackRows,
      unreadFeedback: unreadFeedback.count,
      customers: {
        total:   totalCustomers.count,
        newWeek: newCustomersWeek.count,
      },
    },
  });
});

// ── Analytics: helper to parse from/to date range ────────────────────────────
/**
 * Returns the UTC Date corresponding to a wall-clock boundary in Sydney timezone.
 * E.g. "2026-06-01" + endOfDay=false => 2026-05-31T14:00:00Z (AEST midnight)
 */
function sydneyBoundary(dateStr: string, endOfDay: boolean): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const h = endOfDay ? 23 : 0, mi = endOfDay ? 59 : 0, sec = endOfDay ? 59 : 0;

  // Probe at 02:00 UTC on that day to find Sydney's actual offset (handles AEST/AEDT correctly)
  const probe = new Date(Date.UTC(y, m - 1, d, 2, 0, 0));
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(probe);
  const get = (t: string) => {
    const v = parseInt(parts.find(p => p.type === t)?.value ?? '0', 10);
    return t === 'hour' ? v % 24 : v;
  };
  const sydLocalMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offsetMs = sydLocalMs - probe.getTime(); // positive for Sydney (UTC+10 or UTC+11)

  // Target UTC = Sydney wall-clock time − offset
  return new Date(Date.UTC(y, m - 1, d, h, mi, sec) - offsetMs);
}

function parseDateRange(query: Record<string, any>): { fromDate: Date; toDate: Date } {
  // Default: today in Sydney (start and end of day)
  const now = new Date();
  const sydneyParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const sy = sydneyParts.find(p => p.type === 'year')?.value ?? '2026';
  const sm = sydneyParts.find(p => p.type === 'month')?.value ?? '01';
  const sd = sydneyParts.find(p => p.type === 'day')?.value ?? '01';
  const todayStr = `${sy}-${sm}-${sd}`;

  let fromDate: Date;
  let toDate: Date;

  if (query.from) {
    const str = String(query.from).trim();
    fromDate = /^\d{4}-\d{2}-\d{2}$/.test(str) ? sydneyBoundary(str, false) : sydneyBoundary(todayStr, false);
  } else {
    fromDate = sydneyBoundary(todayStr, false);
  }

  if (query.to) {
    const str = String(query.to).trim();
    toDate = /^\d{4}-\d{2}-\d{2}$/.test(str) ? sydneyBoundary(str, true) : sydneyBoundary(todayStr, true);
  } else {
    toDate = sydneyBoundary(todayStr, true);
  }

  return { fromDate, toDate };
}

// ── Analytics: Sales Summary ──────────────────────────────────────────────────
router.get('/reports/summary', async (req, res) => {
  const { fromDate, toDate } = parseDateRange(req.query as any);

  const [
    [revenue],
    [orderCount],
    [refundCount],
    [cancelCount],
    [discountTotal],
  ] = await Promise.all([
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable)
      .where(and(
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
        sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
      )),
    db.select({ count: count() }).from(ordersTable)
      .where(and(
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
        sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
      )),
    db.select({ count: count() }).from(ordersTable)
      .where(and(
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
        eq(ordersTable.status, 'refunded' as any),
      )),
    db.select({ count: count() }).from(ordersTable)
      .where(and(
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
        eq(ordersTable.status, 'cancelled' as any),
      )),
    db.select({ total: sum(ordersTable.discountCents) }).from(ordersTable)
      .where(and(
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
        sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
        isNotNull(ordersTable.discountCents),
        sql`${ordersTable.discountCents} > 0`,
      )),
  ]);

  const totalRevenueCents = Number(revenue.total ?? 0);
  const totalOrders = orderCount.count;
  const avgOrderValueCents = totalOrders > 0 ? Math.round(totalRevenueCents / totalOrders) : 0;
  // Australian GST is 10% included in price; net = gross / 1.1
  const gstCents = Math.round(totalRevenueCents - totalRevenueCents / 1.1);
  const netRevenueCents = totalRevenueCents - gstCents;

  return res.json({
    data: {
      totalRevenueCents,
      orderCount: totalOrders,
      avgOrderValueCents,
      gstCents,
      netRevenueCents,
      refundCount: refundCount.count,
      cancelCount: cancelCount.count,
      totalDiscountCents: Number(discountTotal.total ?? 0),
    },
  });
});

// ── Analytics: Product Sales ──────────────────────────────────────────────────
router.get('/reports/products', async (req, res) => {
  const { fromDate, toDate } = parseDateRange(req.query as any);

  const orders = await db.select({ items: ordersTable.items }).from(ordersTable)
    .where(and(
      gte(ordersTable.createdAt, fromDate),
      lte(ordersTable.createdAt, toDate),
      sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
    ));

  const productMap = new Map<string, { name: string; units: number; revenueCents: number }>();
  for (const row of orders) {
    const items = Array.isArray(row.items) ? row.items as any[] : [];
    for (const item of items) {
      const name = (
        (typeof item?.name === 'string' && item.name.trim()) ||
        (typeof item?.productName === 'string' && item.productName.trim()) ||
        (typeof item?.title === 'string' && item.title.trim()) ||
        'Unknown Item'
      ).replace(/\s+/g, ' ').trim();
      const qty = Math.max(1, Math.floor(Number(item?.quantity ?? 1) || 1));
      const price = Math.max(0, Number(item?.priceCents ?? item?.price ?? 0));
      const existing = productMap.get(name);
      if (existing) {
        existing.units += qty;
        existing.revenueCents += price * qty;
      } else {
        productMap.set(name, { name, units: qty, revenueCents: price * qty });
      }
    }
  }

  const products = Array.from(productMap.values())
    .sort((a, b) => b.units - a.units || b.revenueCents - a.revenueCents)
    .slice(0, 30);

  return res.json({ data: products });
});

// ── Analytics: Busy Times (hourly daily-average heatmap, date-range-aware) ───
router.get('/reports/busy-times', async (req, res) => {
  // Honour the same from/to range as other report endpoints so the whole dashboard
  // is consistent. avgPerDay = rawCount / rangeDays gives the daily average per hour.
  const { fromDate, toDate } = parseDateRange(req.query as any);

  const rows = await db.select({
    hour: sql<number>`EXTRACT(HOUR FROM ${ordersTable.createdAt} AT TIME ZONE 'Australia/Sydney')::int`,
    orderCount: count(),
  }).from(ordersTable)
    .where(and(
      gte(ordersTable.createdAt, fromDate),
      lte(ordersTable.createdAt, toDate),
      sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
    ))
    .groupBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt} AT TIME ZONE 'Australia/Sydney')::int`)
    .orderBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt} AT TIME ZONE 'Australia/Sydney')::int`);

  // Number of Sydney calendar days in the selected range (minimum 1)
  const rangeDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000));

  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, orderCount: 0, avgPerDay: 0 }));
  for (const row of rows) {
    const h = Number(row.hour);
    if (h >= 0 && h < 24) {
      buckets[h].orderCount = row.orderCount;
      buckets[h].avgPerDay  = Math.round((row.orderCount / rangeDays) * 10) / 10;
    }
  }

  return res.json({ data: buckets });
});

// ── Analytics: Staff Performance ──────────────────────────────────────────────
router.get('/reports/staff', async (req, res) => {
  const { fromDate, toDate } = parseDateRange(req.query as any);

  const [shifts, staffUsers, staffProfiles, processedOrders] = await Promise.all([
    db.select({
      userId:          staffShiftsTable.userId,
      clockIn:         staffShiftsTable.clockIn,
      clockOut:        staffShiftsTable.clockOut,
      unpaidBreakMins: staffShiftsTable.unpaidBreakMins,
    }).from(staffShiftsTable)
      .where(and(
        gte(staffShiftsTable.clockIn, fromDate),
        lte(staffShiftsTable.clockIn, toDate),
        isNotNull(staffShiftsTable.clockOut),
      )),
    db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
      .where(sql`${usersTable.role} IN ('staff','manager','supervisor','store_manager','area_manager')`),
    db.select({
      userId: staffProfilesTable.userId,
      employeeId: staffProfilesTable.employeeId,
      position: staffProfilesTable.position,
    }).from(staffProfilesTable),
    // Orders attributed to a staff member via processedByUserId
    db.select({
      processedByUserId: (ordersTable as any).processedByUserId,
      totalCents:        ordersTable.totalCents,
    }).from(ordersTable)
      .where(and(
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
        isNotNull((ordersTable as any).processedByUserId),
        sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
      )),
  ]);

  const userMap = Object.fromEntries(staffUsers.map(u => [u.id, u]));
  const profMap = Object.fromEntries(staffProfiles.map(p => [p.userId, p]));

  // Group attributed orders by processedByUserId
  const ordersByStaff = new Map<string, { count: number; revenueCents: number }>();
  for (const o of processedOrders) {
    const uid = o.processedByUserId as string;
    const ex = ordersByStaff.get(uid);
    if (ex) { ex.count++; ex.revenueCents += o.totalCents ?? 0; }
    else ordersByStaff.set(uid, { count: 1, revenueCents: o.totalCents ?? 0 });
  }

  // Aggregate shifts per staff member; include order attribution where available
  const staffMap = new Map<string, {
    userId: string; name: string; employeeId: string | null; position: string | null;
    shiftCount: number; totalMinutes: number;
    ordersProcessed: number | null; revenueHandledCents: number | null;
  }>();

  for (const shift of shifts) {
    const uid      = shift.userId;
    const clockIn  = new Date(shift.clockIn);
    const clockOut = shift.clockOut ? new Date(shift.clockOut) : null;
    if (!clockOut) continue;

    const totalMins = Math.max(0, Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000));
    const paidMins  = Math.max(0, totalMins - (shift.unpaidBreakMins ?? 0));

    const existing = staffMap.get(uid);
    if (existing) {
      existing.shiftCount++;
      existing.totalMinutes += paidMins;
    } else {
      const attribution = ordersByStaff.get(uid);
      staffMap.set(uid, {
        userId:              uid,
        name:                userMap[uid]?.name ?? 'Unknown',
        employeeId:          profMap[uid]?.employeeId ?? null,
        position:            profMap[uid]?.position ?? null,
        shiftCount:          1,
        totalMinutes:        paidMins,
        ordersProcessed:     attribution?.count ?? null,
        revenueHandledCents: attribution?.revenueCents ?? null,
      });
    }
  }

  const staffList = Array.from(staffMap.values())
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  return res.json({ data: staffList });
});

// ── Analytics: Payment Breakdown ──────────────────────────────────────────────
router.get('/reports/payments', async (req, res) => {
  const { fromDate, toDate } = parseDateRange(req.query as any);

  const rows = await db.select({
    method:     ordersTable.paymentMethodType,
    orderCount: count(),
    revenue:    sum(ordersTable.totalCents),
  }).from(ordersTable)
    .where(and(
      gte(ordersTable.createdAt, fromDate),
      lte(ordersTable.createdAt, toDate),
      sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
    ))
    .groupBy(ordersTable.paymentMethodType);

  const breakdown = rows.map(r => ({
    method:      r.method ?? 'unknown',
    orderCount:  r.orderCount,
    revenueCents: Number(r.revenue ?? 0),
  }));

  return res.json({ data: breakdown });
});

// ── Analytics: Refunds & Discounts ────────────────────────────────────────────
router.get('/reports/refunds', async (req, res) => {
  const { fromDate, toDate } = parseDateRange(req.query as any);

  const [refundedOrders, cancelledOrders, discountedOrders] = await Promise.all([
    db.select({
      totalCents:   ordersTable.totalCents,
      cancelReason: (ordersTable as any).cancelReason,
    }).from(ordersTable)
      .where(and(
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
        eq(ordersTable.status, 'refunded' as any),
      )),
    // Cancelled orders also have cancelReason and represent lost revenue
    db.select({
      totalCents:   ordersTable.totalCents,
      cancelReason: (ordersTable as any).cancelReason,
    }).from(ordersTable)
      .where(and(
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
        eq(ordersTable.status, 'cancelled' as any),
      )),
    // Discounted orders — LEFT JOIN discount_codes to get type
    db.select({
      discountCode:   ordersTable.discountCode,
      discountCodeId: ordersTable.discountCodeId,
      discountCents:  ordersTable.discountCents,
      loyaltyPointsUsed: ordersTable.loyaltyPointsUsed,
      discountType:   discountCodesTable.discountType,
    }).from(ordersTable)
      .leftJoin(discountCodesTable, eq(ordersTable.discountCodeId, discountCodesTable.id))
      .where(and(
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
        sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
        sql`(${ordersTable.discountCents} > 0 OR ${ordersTable.loyaltyPointsUsed} > 0)`,
      )),
  ]);

  const totalRefundCents = refundedOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0);

  // Aggregate top cancel/refund reasons across both refunded and cancelled orders
  const reasonMap = new Map<string, { reason: string; count: number; totalCents: number }>();
  for (const o of [...refundedOrders, ...cancelledOrders]) {
    const reason = ((o as any).cancelReason as string | null | undefined)?.trim() || 'No reason given';
    const ex = reasonMap.get(reason);
    if (ex) {
      ex.count++;
      ex.totalCents += Number(o.totalCents ?? 0);
    } else {
      reasonMap.set(reason, { reason, count: 1, totalCents: Number(o.totalCents ?? 0) });
    }
  }
  const topReasons = Array.from(reasonMap.values())
    .sort((a, b) => b.count - a.count || b.totalCents - a.totalCents)
    .slice(0, 10);

  // Group discounts by type:
  //   loyalty_redemption — loyalty points used (even if also has code)
  //   percentage         — % off promo code (from discountType)
  //   fixed_amount       — flat $ off promo code
  //   free_delivery      — delivery waiver promo code
  //   promo_code         — promo code but type unknown (no matching code row)
  const typeMap = new Map<string, { type: string; count: number; totalDiscountCents: number }>();
  for (const o of discountedOrders) {
    let type: string;
    if ((o.loyaltyPointsUsed ?? 0) > 0 && !o.discountCodeId) {
      type = 'loyalty_redemption';
    } else if (o.discountType) {
      type = o.discountType;
    } else if (o.discountCode || o.discountCodeId) {
      type = 'promo_code';
    } else {
      type = 'other';
    }
    const cents = Number(o.discountCents ?? 0);
    const ex = typeMap.get(type);
    if (ex) { ex.count++; ex.totalDiscountCents += cents; }
    else typeMap.set(type, { type, count: 1, totalDiscountCents: cents });
  }
  const totalDiscountCents = discountedOrders.reduce((s, o) => s + Number(o.discountCents ?? 0), 0);
  const byType = Array.from(typeMap.values()).sort((a, b) => b.totalDiscountCents - a.totalDiscountCents);

  // Also keep byCode for drill-down
  const codeMap = new Map<string, { code: string; count: number; totalDiscountCents: number }>();
  for (const o of discountedOrders) {
    const code = o.discountCode ?? 'no_code';
    const ex = codeMap.get(code);
    if (ex) { ex.count++; ex.totalDiscountCents += Number(o.discountCents ?? 0); }
    else codeMap.set(code, { code, count: 1, totalDiscountCents: Number(o.discountCents ?? 0) });
  }

  return res.json({
    data: {
      refunds: {
        count:      refundedOrders.length,
        totalCents: totalRefundCents,
        topReasons,
      },
      discounts: {
        count:         discountedOrders.length,
        totalCents:    totalDiscountCents,
        byType,
        byCode:        Array.from(codeMap.values()).sort((a, b) => b.totalDiscountCents - a.totalDiscountCents),
      },
    },
  });
});

router.get('/reports/register-sessions', async (req, res) => {
  const closeMethod = req.query.closeMethod === 'manual' || req.query.closeMethod === 'auto'
    ? req.query.closeMethod
    : undefined;
  const variance = req.query.variance === 'with_variance' || req.query.variance === 'without_variance' || req.query.variance === 'all'
    ? req.query.variance
    : undefined;
  const data = await listRegisterSessionReports({
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
    register: typeof req.query.register === 'string' ? req.query.register : undefined,
    staffUserId: typeof req.query.staffUserId === 'string' ? req.query.staffUserId : undefined,
    closeMethod,
    variance,
  });
  return res.json({ data });
});

router.get('/reports/register-sessions/:id', async (req, res) => {
  const report = await getRegisterSessionReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Register report not found.' });
  return res.json({ data: report });
});

router.patch('/reports/register-sessions/:id', async (req, res) => {
  const updated = await updateClosedRegisterSessionNotes({
    sessionId: req.params.id,
    closeNote: typeof req.body?.closeNote === 'string' ? req.body.closeNote : null,
    varianceNote: typeof req.body?.varianceNote === 'string' ? req.body.varianceNote : null,
  });
  if (!updated) return res.status(404).json({ error: 'Register report not found.' });
  const report = await getRegisterSessionReport(req.params.id);
  return res.json({ data: report });
});

// ── Analytics: Customer Growth ────────────────────────────────────────────────
router.get('/reports/customers', async (req, res) => {
  const { fromDate, toDate } = parseDateRange(req.query as any);

  const [
    newCustomers,
    [totalCustomers],
    [activeCustomers],
  ] = await Promise.all([
    db.select({
      day: sql<string>`DATE_TRUNC('day', ${usersTable.createdAt} AT TIME ZONE 'Australia/Sydney')`,
      count: count(),
    }).from(usersTable)
      .where(and(
        eq(usersTable.role, 'customer' as any),
        gte(usersTable.createdAt, fromDate),
        lte(usersTable.createdAt, toDate),
      ))
      .groupBy(sql`DATE_TRUNC('day', ${usersTable.createdAt} AT TIME ZONE 'Australia/Sydney')`)
      .orderBy(sql`DATE_TRUNC('day', ${usersTable.createdAt} AT TIME ZONE 'Australia/Sydney')`),
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, 'customer' as any)),
    db.select({ count: count() }).from(usersTable)
      .where(and(
        eq(usersTable.role, 'customer' as any),
        gte(usersTable.lastLogin, fromDate),
        lte(usersTable.lastLogin, toDate),
      )),
  ]);

  const newTotal = newCustomers.reduce((s, r) => s + r.count, 0);

  return res.json({
    data: {
      newCustomers: newTotal,
      totalCustomers: totalCustomers.count,
      activeCustomers: activeCustomers.count,
      byDay: newCustomers.map(r => ({
        day: new Date(r.day as any).toISOString(),
        count: r.count,
      })),
    },
  });
});

// ── Timesheets ────────────────────────────────────────────────────────────────
router.get('/timesheets', async (req, res) => {
  const viewScope: 'all' | 'self' | undefined = (req as any).managerViewScope;

  const rows = await db
    .select({
      id:              staffShiftsTable.id,
      userId:          staffShiftsTable.userId,
      clockIn:         staffShiftsTable.clockIn,
      clockOut:        staffShiftsTable.clockOut,
      hoursWorked:     staffShiftsTable.hoursWorked,
      unpaidBreakMins: staffShiftsTable.unpaidBreakMins,
      approvedAt:      staffShiftsTable.approvedAt,
      approvedById:    staffShiftsTable.approvedById,
      createdAt:       staffShiftsTable.createdAt,
      name:            usersTable.name,
      email:           usersTable.email,
      position:        staffProfilesTable.position,
      isManager:       staffProfilesTable.isManager,
      hourlyRateCents: staffProfilesTable.hourlyRateCents,
    })
    .from(staffShiftsTable)
    .leftJoin(usersTable,         eq(usersTable.id,     staffShiftsTable.userId))
    .leftJoin(staffProfilesTable, eq(staffProfilesTable.userId, staffShiftsTable.userId))
    .orderBy(desc(staffShiftsTable.clockIn))
    .limit(400);

  // Directors and masters: return full data unchanged.
  if (!viewScope) return res.json({ data: rows });

  const callerId = req.user!.id;

  if (viewScope === 'self') {
    // Manager without timesheets permission: only their own shifts.
    const own = rows.filter(r => r.userId === callerId);
    return res.json({ data: own });
  }

  // Manager WITH timesheets permission: all shifts but never expose other
  // staff members' pay rates — that information stays private regardless.
  const sanitised = rows.map(r =>
    r.userId === callerId ? r : { ...r, hourlyRateCents: null },
  );
  return res.json({ data: sanitised });
});

router.patch('/timesheets/:id', async (req, res) => {
  const { approve, clockIn, clockOut, unpaidBreakMins } = req.body as {
    approve?: boolean; clockIn?: string; clockOut?: string | null; unpaidBreakMins?: number;
  };

  const [existing] = await db.select().from(staffShiftsTable).where(eq(staffShiftsTable.id, req.params.id));
  if (!existing) return res.status(404).json({ error: 'Shift not found' });

  // Managers with 'self' scope can only edit their own shifts.
  const viewScope: 'all' | 'self' | undefined = (req as any).managerViewScope;
  if (viewScope === 'self' && existing.userId !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: you can only edit your own shifts' });
  }

  const updates: Partial<typeof staffShiftsTable.$inferSelect> = {};

  if (typeof approve === 'boolean') {
    updates.approvedAt   = approve ? new Date() : null;
    updates.approvedById = approve ? req.user!.id : null;
  }

  if (clockIn !== undefined)  updates.clockIn  = new Date(clockIn);
  if (clockOut !== undefined) updates.clockOut = clockOut ? new Date(clockOut) : null;
  if (typeof unpaidBreakMins === 'number') updates.unpaidBreakMins = unpaidBreakMins;

  const resolvedIn    = (updates.clockIn  ?? existing.clockIn) as Date;
  const resolvedOut   = (updates.clockOut !== undefined ? updates.clockOut : existing.clockOut) as Date | null;
  const resolvedBreak = updates.unpaidBreakMins ?? existing.unpaidBreakMins ?? 0;
  if (resolvedOut) {
    const diffMs  = resolvedOut.getTime() - resolvedIn.getTime();
    const breakMs = resolvedBreak * 60_000;
    updates.hoursWorked = Math.max(0, (diffMs - breakMs) / 3_600_000).toFixed(2);
  }

  const [updated] = await db.update(staffShiftsTable).set(updates).where(eq(staffShiftsTable.id, req.params.id)).returning();
  return res.json({ data: updated });
});

// ── Staff hub: all wastage, issues, leave (director/manager view) ─────────────
router.get('/wastage', async (req, res) => {
  const rows = await db
    .select({
      id: staffWastageTable.id,
      userId: staffWastageTable.userId,
      productName: staffWastageTable.productName,
      quantity: staffWastageTable.quantity,
      unit: staffWastageTable.unit,
      reason: staffWastageTable.reason,
      estimatedCostCents: staffWastageTable.estimatedCostCents,
      notes: staffWastageTable.notes,
      createdAt: staffWastageTable.createdAt,
      staffName: usersTable.name,
      staffEmail: usersTable.email,
    })
    .from(staffWastageTable)
    .leftJoin(usersTable, eq(staffWastageTable.userId, usersTable.id))
    .orderBy(desc(staffWastageTable.createdAt))
    .limit(200);
  return res.json({ data: rows });
});

router.delete('/wastage/:id', async (req, res) => {
  const [deleted] = await db.delete(staffWastageTable)
    .where(eq(staffWastageTable.id, req.params.id)).returning({ id: staffWastageTable.id });
  if (!deleted) return res.status(404).json({ error: 'Wastage entry not found.' });
  return res.json({ data: { success: true } });
});

router.get('/issues', async (req, res) => {
  const rows = await db
    .select({
      id: staffIssuesTable.id,
      userId: staffIssuesTable.userId,
      title: staffIssuesTable.title,
      description: staffIssuesTable.description,
      category: staffIssuesTable.category,
      priority: staffIssuesTable.priority,
      status: staffIssuesTable.status,
      resolvedAt: staffIssuesTable.resolvedAt,
      createdAt: staffIssuesTable.createdAt,
      staffName: usersTable.name,
      staffEmail: usersTable.email,
    })
    .from(staffIssuesTable)
    .leftJoin(usersTable, eq(staffIssuesTable.userId, usersTable.id))
    .orderBy(desc(staffIssuesTable.createdAt))
    .limit(200);
  return res.json({ data: rows });
});

router.patch('/issues/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const updates: any = { status };
  if (status === 'resolved' || status === 'closed') {
    updates.resolvedAt = new Date();
    updates.resolvedBy = req.user!.id;
  }
  const [updated] = await db.update(staffIssuesTable)
    .set(updates)
    .where(eq(staffIssuesTable.id, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Issue not found' });
  return res.json({ data: updated });
});

router.get('/leave', async (req, res) => {
  const rows = await db
    .select({
      id: staffLeaveRequestsTable.id,
      userId: staffLeaveRequestsTable.userId,
      startDate: staffLeaveRequestsTable.startDate,
      endDate: staffLeaveRequestsTable.endDate,
      type: staffLeaveRequestsTable.type,
      reason: staffLeaveRequestsTable.reason,
      status: staffLeaveRequestsTable.status,
      reviewedBy: staffLeaveRequestsTable.reviewedBy,
      reviewedAt: staffLeaveRequestsTable.reviewedAt,
      reviewNote: staffLeaveRequestsTable.reviewNote,
      createdAt: staffLeaveRequestsTable.createdAt,
      staffName: usersTable.name,
      staffEmail: usersTable.email,
      reviewedByName: sql<string | null>`(SELECT name FROM users WHERE id = ${staffLeaveRequestsTable.reviewedBy})`,
    })
    .from(staffLeaveRequestsTable)
    .leftJoin(usersTable, eq(staffLeaveRequestsTable.userId, usersTable.id))
    .orderBy(desc(staffLeaveRequestsTable.createdAt))
    .limit(200);
  return res.json({ data: rows });
});

router.delete('/leave/:leaveId', async (req, res) => {
  const [deleted] = await db.delete(staffLeaveRequestsTable)
    .where(eq(staffLeaveRequestsTable.id, req.params.leaveId)).returning({ id: staffLeaveRequestsTable.id });
  if (!deleted) return res.status(404).json({ error: 'Leave request not found.' });
  return res.json({ data: { success: true } });
});

router.get('/tasks', async (_req, res) => {
  await ensureShopDisplaySchemaReady();
  const rows = await db.select().from(staffTasksTable).orderBy(staffTasksTable.sortOrder, staffTasksTable.title);
  return res.json({ data: normalizeTaskListCompletion(rows) });
});

router.get('/tasks/history', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromDate = req.query.from ? new Date(req.query.from as string) : sevenDaysAgo;
  const toDate   = req.query.to   ? new Date(req.query.to   as string) : now;
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid history date range.' });
  }
  const rows = await db.select().from(staffTaskHistoryTable)
    .where(and(
      gte(staffTaskHistoryTable.createdAt, fromDate),
      lte(staffTaskHistoryTable.createdAt, toDate),
    ))
    .orderBy(desc(staffTaskHistoryTable.createdAt))
    .limit(500);
  return res.json({ data: rows });
});

router.patch('/tasks/:id/complete', async (req, res) => {
  const shouldComplete: boolean = req.body.isCompleted !== false;
  const [task] = await db.update(staffTasksTable).set({
    isCompleted: shouldComplete,
    completedBy:  shouldComplete ? (req.user!.name ?? null) : null,
    completedAt:  shouldComplete ? new Date() : null,
  }).where(eq(staffTasksTable.id, req.params.id as string)).returning();
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  await db.insert(staffTaskHistoryTable).values({
    id:               randomUUID(),
    taskId:           task.id,
    taskTitle:        task.title ?? '',
    taskCategory:     task.category ?? 'daily',
    completedByUserId: req.user!.id,
    completedByName:  req.user!.name ?? null,
    completedByRole:  req.user!.role,
    completionStatus: shouldComplete ? 'completed' : 'reopened',
  });
  return res.json({ data: task });
});

router.post('/tasks', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { title, description, category, cadence, isRecurring, assignedToUserId, assignedToName } = req.body ?? {};
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'Task title is required.' });
  const allowedCategories = ['daily', 'prep', 'cleaning', 'opening', 'closing', 'training'];
  const allowedCadences = ['daily', 'weekly', 'one_off'];
  if (category && !allowedCategories.includes(category)) return res.status(400).json({ error: 'Invalid task category.' });
  if (cadence && !allowedCadences.includes(cadence)) return res.status(400).json({ error: 'Invalid task cadence.' });

  const [lastTask] = await db.select({ sortOrder: staffTasksTable.sortOrder }).from(staffTasksTable).orderBy(desc(staffTasksTable.sortOrder)).limit(1);
  const [created] = await db.insert(staffTasksTable).values({
    id: randomUUID(),
    title: title.trim(),
    description: description?.trim() || null,
    category: (category ?? 'daily') as any,
    cadence: cadence ?? 'daily',
    isRecurring: typeof isRecurring === 'boolean' ? isRecurring : cadence !== 'one_off',
    sortOrder: (lastTask?.sortOrder ?? -10) + 10,
    assignedToUserId: assignedToUserId ?? null,
    assignedToName: assignedToName ?? null,
  }).returning();

  await recordAuditLog({
    actor: req.user,
    entityType: 'task',
    entityId: created.id,
    action: 'director_task_created',
    after: created,
  });

  return res.status(201).json({ data: created });
});

router.get('/staff-list', async (req, res) => {
  const staff = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
    .from(usersTable)
    .where(sql`${usersTable.role} IN ('staff', 'manager', 'director', 'master')`);
  return res.json({ data: staff });
});

router.patch('/tasks/:id', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { id } = req.params;
  const { title, description, category, cadence, isRecurring, assignedToUserId, assignedToName } = req.body ?? {};

  const [existing] = await db.select().from(staffTasksTable).where(eq(staffTasksTable.id, id));
  if (!existing) return res.status(404).json({ error: 'Task not found.' });

  const allowedCategories = ['daily', 'prep', 'cleaning', 'opening', 'closing', 'training'];
  const allowedCadences = ['daily', 'weekly', 'one_off'];
  if (category && !allowedCategories.includes(category)) return res.status(400).json({ error: 'Invalid task category.' });
  if (cadence && !allowedCadences.includes(cadence)) return res.status(400).json({ error: 'Invalid task cadence.' });

  const updates: any = {};
  if (typeof title === 'string') updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (category) updates.category = category;
  if (cadence) updates.cadence = cadence;
  if (typeof isRecurring === 'boolean') updates.isRecurring = isRecurring;
  else if (cadence) updates.isRecurring = cadence !== 'one_off';
  if (assignedToUserId !== undefined) updates.assignedToUserId = assignedToUserId ?? null;
  if (assignedToName !== undefined) updates.assignedToName = assignedToName ?? null;

  const [updated] = await db.update(staffTasksTable).set(updates).where(eq(staffTasksTable.id, id)).returning();
  await recordAuditLog({
    actor: req.user,
    entityType: 'task',
    entityId: updated.id,
    action: 'director_task_updated',
    before: existing,
    after: updated,
  });
  return res.json({ data: updated });
});

router.post('/tasks/reorder', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { taskIds } = req.body ?? {};
  if (!Array.isArray(taskIds) || taskIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'taskIds must be an array of ids.' });
  }
  await Promise.all(taskIds.map((taskId, index) =>
    db.update(staffTasksTable).set({ sortOrder: index * 10 }).where(eq(staffTasksTable.id, taskId)),
  ));
  await recordAuditLog({
    actor: req.user,
    entityType: 'task',
    entityId: 'bulk',
    action: 'director_task_reordered',
    metadata: { taskIds },
  });
  return res.json({ success: true });
});

router.delete('/tasks/:id', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { id } = req.params;
  const [existing] = await db.select().from(staffTasksTable).where(eq(staffTasksTable.id, id));
  if (!existing) return res.status(404).json({ error: 'Task not found.' });
  await db.delete(staffTasksTable).where(eq(staffTasksTable.id, id));
  await recordAuditLog({
    actor: req.user,
    entityType: 'task',
    entityId: id,
    action: 'director_task_deleted',
    before: existing,
  });
  return res.json({ success: true });
});

// ── Feedback management ───────────────────────────────────────────────────────
router.get('/feedback', async (req, res) => {
  const rows = await db.select().from(feedbackTable).orderBy(desc(feedbackTable.createdAt)).limit(100);
  return res.json({ data: rows });
});

router.patch('/feedback/:id/read', async (req, res) => {
  const [updated] = await db.update(feedbackTable).set({ isRead: true })
    .where(eq(feedbackTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Feedback not found.' });
  return res.json({ data: updated });
});

// ── Manager management ────────────────────────────────────────────────────────
// Only directors can manage manager accounts (managers can view their own profile)

function parsePerms(raw?: string | null): string[] {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

router.get('/managers', async (req, res) => {
  if (!['director', 'master'].includes(req.user?.role ?? '')) {
    return res.status(403).json({ error: 'Director only' });
  }
  const managers = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    permissions: managerProfilesTable.permissions,
    notes: managerProfilesTable.notes,
    position: staffProfilesTable.position,
    createdAt: managerProfilesTable.createdAt,
  }).from(managerProfilesTable)
    .leftJoin(usersTable, eq(usersTable.id, managerProfilesTable.userId))
    .leftJoin(staffProfilesTable, eq(staffProfilesTable.userId, managerProfilesTable.userId))
    .orderBy(desc(managerProfilesTable.createdAt));

  return res.json({
    data: managers.map(m => ({
      ...m,
      role: 'manager',
      accessRole: Object.entries(ACCESS_ROLE_LABELS).find(([, label]) => label === (m.position ?? 'Manager'))?.[0] ?? 'manager',
      permissions: parsePerms(m.permissions),
    })),
  });
});

router.post('/managers', async (req, res) => {
  if (!['director', 'master'].includes(req.user?.role ?? '')) return res.status(403).json({ error: 'Director only' });
  const { name, email, password, permissions = [], notes, accessRole = 'manager' } = req.body;
  const normalizedAccessRole: AccessRoleKey = Object.prototype.hasOwnProperty.call(ACCESS_ROLE_LABELS, accessRole) ? accessRole : 'manager';
  const targetRole = normalizedAccessRole === 'director' || normalizedAccessRole === 'master'
    ? normalizedAccessRole
    : 'manager';
  if ((targetRole === 'director' || targetRole === 'master') && req.user!.role !== 'master') {
    return res.status(403).json({ error: `Only a master account can assign ${ACCESS_ROLE_LABELS[normalizedAccessRole]} access.` });
  }
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing) {
    if (existing.role === 'staff' || existing.role === 'manager' || (req.user!.role === 'master' && (existing.role === 'director' || existing.role === 'master'))) {
      await db.update(usersTable)
        .set({ role: targetRole as any, name, updatedAt: new Date() })
        .where(eq(usersTable.id, existing.id));
      if (targetRole === 'manager') {
        await db.insert(managerProfilesTable).values({
          userId: existing.id,
          permissions: JSON.stringify(permissions),
          createdByUserId: req.user!.id,
          notes: notes ?? null,
        }).onConflictDoUpdate({
          target: managerProfilesTable.userId,
          set: {
            permissions: JSON.stringify(permissions),
            notes: notes ?? null,
          },
        });
        await db.update(staffProfilesTable)
          .set({
            position: ACCESS_ROLE_LABELS[normalizedAccessRole],
            isManager: true,
            approvedByAdmin: true,
            updatedAt: new Date(),
          })
          .where(eq(staffProfilesTable.userId, existing.id));
      } else {
        await db.delete(managerProfilesTable).where(eq(managerProfilesTable.userId, existing.id));
      }
      return res.status(201).json({ data: { id: existing.id, name, email: email.toLowerCase(), role: targetRole, accessRole: normalizedAccessRole, permissions, notes } });
    }
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: email.toLowerCase(), passwordHash, role: targetRole as any, name });
  if (targetRole === 'manager') {
    await db.insert(staffProfilesTable).values({
      userId,
      employeeId: `EMP-${Date.now().toString(36).toUpperCase()}`,
      position: ACCESS_ROLE_LABELS[normalizedAccessRole],
      department: 'floor',
      isManager: true,
      approvedByAdmin: true,
      hourlyRateCents: 0,
      address: null,
      taxFileNumber: null,
    }).onConflictDoNothing();
    await db.insert(managerProfilesTable).values({
      userId,
      permissions: JSON.stringify(permissions),
      createdByUserId: req.user!.id,
      notes: notes ?? null,
    });
  }
  return res.status(201).json({ data: { id: userId, name, email: email.toLowerCase(), role: targetRole, accessRole: normalizedAccessRole, permissions, notes } });
});

router.patch('/managers/:id/permissions', async (req, res) => {
  if (!['director', 'master'].includes(req.user?.role ?? '')) return res.status(403).json({ error: 'Director only' });
  const { permissions, notes, accessRole } = req.body;
  const updates: Record<string, any> = {};
  if (Array.isArray(permissions)) updates.permissions = JSON.stringify(permissions);
  if (notes !== undefined) updates.notes = notes;
  const [updated] = await db.update(managerProfilesTable)
    .set(updates)
    .where(eq(managerProfilesTable.userId, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Manager not found' });
  if (isManagerFamilyRole(accessRole)) {
    await db.update(staffProfilesTable)
      .set({ position: ACCESS_ROLE_LABELS[accessRole], updatedAt: new Date() })
      .where(eq(staffProfilesTable.userId, req.params.id));
  }
  return res.json({ data: { ...updated, role: 'manager', accessRole: isManagerFamilyRole(accessRole) ? accessRole : 'manager', permissions: parsePerms(updated.permissions) } });
});

router.delete('/managers/:id', async (req, res) => {
  if (!['director', 'master'].includes(req.user?.role ?? '')) return res.status(403).json({ error: 'Director only' });
  await db.delete(managerProfilesTable).where(eq(managerProfilesTable.userId, req.params.id));
  await db.update(usersTable).set({ role: 'staff' as any }).where(eq(usersTable.id, req.params.id));
  await db.update(staffProfilesTable)
    .set({ position: 'Staff', isManager: false, updatedAt: new Date() })
    .where(eq(staffProfilesTable.userId, req.params.id));
  return res.json({ success: true });
});

// ── Director management (master only) ────────────────────────────────────────
router.get('/directors', async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Master account only' });
  const directors = await db.select({
    id:        usersTable.id,
    name:      usersTable.name,
    email:     usersTable.email,
    createdAt: usersTable.createdAt,
  }).from(usersTable)
    .where(eq(usersTable.role, 'director' as any))
    .orderBy(desc(usersTable.createdAt));
  return res.json({ data: directors });
});

router.post('/directors', async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Master account only' });
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: email.toLowerCase(), passwordHash, role: 'director' as any, name });
  return res.status(201).json({ data: { id: userId, name, email: email.toLowerCase(), role: 'director' } });
});

router.delete('/directors/:id', async (req, res) => {
  if (req.user?.role !== 'master') return res.status(403).json({ error: 'Master account only' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself.' });
  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.params.id));
  if (!target || target.role !== 'director') return res.status(404).json({ error: 'Director not found.' });
  await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
  return res.json({ success: true });
});

// ── Director: Wholesale Cards ─────────────────────────────────────────────────
router.get('/wholesale/:accountId/cards', async (req, res) => {
  const cards = await db.select().from(wholesaleCardsTable)
    .where(eq(wholesaleCardsTable.accountId, req.params.accountId))
    .orderBy(wholesaleCardsTable.createdAt);
  return res.json({ data: cards });
});

// ── Home Banner (director-configurable hero card) ─────────────────────────────
router.get('/home-banner', async (_req, res) => {
  const rows = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.key, 'home_banner'));
  if (!rows.length) return res.json({ data: null });
  try { return res.json({ data: JSON.parse(rows[0].value) }); }
  catch { return res.json({ data: null }); }
});

router.patch('/home-banner', async (req, res) => {
  const config = req.body;
  const value = JSON.stringify(config);
  const existing = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.key, 'home_banner'));
  if (existing.length) {
    await db.update(storeSettingsTable).set({ value, updatedAt: new Date(), updatedBy: req.user?.id }).where(eq(storeSettingsTable.key, 'home_banner'));
  } else {
    await db.insert(storeSettingsTable).values({ key: 'home_banner', value, updatedBy: req.user?.id });
  }
  return res.json({ data: config });
});

// ── App Sessions (hourly activity: logins + orders as proxy) ─────────────────
router.get('/sessions', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const lastWeekStart = new Date(todayStart.getTime() - 7 * 86400000);
    const lastWeekEnd   = new Date(lastWeekStart.getTime() + 86400000);

    const [todayOrders, lastWeekOrders, todayLogins, lastWeekLogins] = await Promise.all([
      db.select({ createdAt: ordersTable.createdAt }).from(ordersTable)
        .where(gte(ordersTable.createdAt, todayStart)),
      db.select({ createdAt: ordersTable.createdAt }).from(ordersTable)
        .where(and(gte(ordersTable.createdAt, lastWeekStart), lte(ordersTable.createdAt, lastWeekEnd))),
      db.select({ lastLogin: usersTable.lastLogin }).from(usersTable)
        .where(and(isNotNull(usersTable.lastLogin), gte(usersTable.lastLogin as any, todayStart))),
      db.select({ lastLogin: usersTable.lastLogin }).from(usersTable)
        .where(and(isNotNull(usersTable.lastLogin), gte(usersTable.lastLogin as any, lastWeekStart), lte(usersTable.lastLogin as any, lastWeekEnd))),
    ]);

    const todayByHour    = new Array(24).fill(0);
    const lastWeekByHour = new Array(24).fill(0);

    for (const o of todayOrders)    todayByHour[new Date(o.createdAt).getHours()]++;
    for (const o of lastWeekOrders) lastWeekByHour[new Date(o.createdAt).getHours()]++;
    for (const u of todayLogins)    if (u.lastLogin) todayByHour[new Date(u.lastLogin).getHours()]++;
    for (const u of lastWeekLogins) if (u.lastLogin) lastWeekByHour[new Date(u.lastLogin).getHours()]++;

    const totalToday    = todayByHour.reduce((a, b) => a + b, 0);
    const totalLastWeek = lastWeekByHour.reduce((a, b) => a + b, 0);
    const pctChange     = totalLastWeek > 0
      ? Math.round(((totalToday - totalLastWeek) / totalLastWeek) * 100)
      : null;
    const liveCount = todayLogins.filter(u =>
      u.lastLogin && (Date.now() - new Date(u.lastLogin).getTime()) < 30 * 60 * 1000,
    ).length;

    res.json({
      data: {
        today:        todayByHour.map((count, hour) => ({ hour, count })),
        lastWeek:     lastWeekByHour.map((count, hour) => ({ hour, count })),
        totalToday,
        totalLastWeek,
        pctChange,
        liveCount,
      },
    });
  } catch (e) {
    req.log.error(e, 'sessions error');
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

// ── Custom revenue range ─────────────────────────────────────────────────────
router.get('/stats/revenue', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required.' });
  const fromDate = new Date(from as string);
  const toDate   = new Date(to as string);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format.' });
  }
  const [result] = await db.select({ total: sum(ordersTable.totalCents) })
    .from(ordersTable)
    .where(and(
      gte(ordersTable.createdAt, fromDate),
      lte(ordersTable.createdAt, toDate),
      sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
    ));
  return res.json({ data: { total: Number(result.total ?? 0), from: fromDate.toISOString(), to: toDate.toISOString() } });
});

// ── Deleted accounts (30-day soft-delete recovery) ─────────────────────────
router.get('/deleted-accounts', async (req, res) => {
  const accounts = await db.select().from(deletedAccountsTable)
    .where(gte(deletedAccountsTable.expiresAt, new Date()))
    .orderBy(desc(deletedAccountsTable.deletedAt));
  return res.json({ data: accounts });
});

router.post('/deleted-accounts/:id/restore', async (req, res) => {
  const { id } = req.params;
  const [deleted] = await db.select().from(deletedAccountsTable).where(eq(deletedAccountsTable.id, id));
  if (!deleted) return res.status(404).json({ error: 'Deleted account not found or already expired.' });
  const snap = deleted.snapshot as any;
  if (snap.user) await db.insert(usersTable).values(snap.user).onConflictDoNothing();
  if (snap.customerProfile) await db.insert(customerProfilesTable).values(snap.customerProfile).onConflictDoNothing();
  if (snap.staffProfile) await db.insert(staffProfilesTable).values(snap.staffProfile).onConflictDoNothing();
  if (snap.wholesaleAccount) await db.insert(wholesaleAccountsTable).values(snap.wholesaleAccount).onConflictDoNothing();
  await db.delete(deletedAccountsTable).where(eq(deletedAccountsTable.id, id));
  return res.json({ success: true, data: { name: deleted.name, email: deleted.email } });
});

// ── Discount codes (director / master only) ───────────────────────────────

router.get('/discount-codes', async (req, res) => {
  const codes = await db
    .select()
    .from(discountCodesTable)
    .orderBy(desc(discountCodesTable.createdAt));
  return res.json({ data: codes });
});

router.post('/discount-codes', async (req, res) => {
  const {
    code, description, discountType, discountValue, maxDiscountCents, minOrderCents,
    startDate, expiresAt, isActive, usageLimitTotal, usageLimitPerCustomer,
    eligibleProducts, eligibleCategories, excludedProducts,
    customerEligibility, selectedCustomerIds, wholesaleEligible,
    orderTypeEligibility, stackable, internalNotes,
  } = req.body;

  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Code is required.' });
  if (!discountType) return res.status(400).json({ error: 'Discount type is required.' });
  if (discountValue === undefined || discountValue === null) return res.status(400).json({ error: 'Discount value is required.' });

  const normalised = code.trim().toUpperCase();
  const [existing] = await db.select({ id: discountCodesTable.id }).from(discountCodesTable).where(eq(discountCodesTable.code, normalised));
  if (existing) return res.status(409).json({ error: 'A discount code with this code already exists.' });

  const [created] = await db.insert(discountCodesTable).values({
    id: randomUUID(),
    code: normalised,
    description: description ?? null,
    discountType,
    discountValue: Number(discountValue),
    maxDiscountCents: maxDiscountCents ?? null,
    minOrderCents: minOrderCents ?? 0,
    startDate: startDate ? new Date(startDate) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    isActive: isActive !== false,
    usageLimitTotal: usageLimitTotal ?? null,
    usageLimitPerCustomer: usageLimitPerCustomer ?? 1,
    usageCount: 0,
    eligibleProducts: eligibleProducts ?? null,
    eligibleCategories: eligibleCategories ?? null,
    excludedProducts: excludedProducts ?? null,
    customerEligibility: customerEligibility ?? 'all',
    selectedCustomerIds: selectedCustomerIds ?? null,
    wholesaleEligible: wholesaleEligible ?? false,
    orderTypeEligibility: orderTypeEligibility ?? 'both',
    stackable: stackable ?? false,
    internalNotes: internalNotes ?? null,
    createdByUserId: req.user!.id,
  }).returning();

  return res.status(201).json({ data: created });
});

router.patch('/discount-codes/:id', async (req, res) => {
  const { id } = req.params;
  const [existing] = await db.select().from(discountCodesTable).where(eq(discountCodesTable.id, id));
  if (!existing) return res.status(404).json({ error: 'Discount code not found.' });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const allowed = [
    'description', 'discountType', 'discountValue', 'maxDiscountCents', 'minOrderCents',
    'startDate', 'expiresAt', 'isActive', 'usageLimitTotal', 'usageLimitPerCustomer',
    'eligibleProducts', 'eligibleCategories', 'excludedProducts',
    'customerEligibility', 'selectedCustomerIds', 'wholesaleEligible',
    'orderTypeEligibility', 'stackable', 'internalNotes',
  ];
  for (const key of allowed) {
    if (key in req.body) {
      if ((key === 'startDate' || key === 'expiresAt') && req.body[key]) {
        updates[key] = new Date(req.body[key]);
      } else {
        updates[key] = req.body[key];
      }
    }
  }
  if (req.body.code) {
    const newCode = req.body.code.trim().toUpperCase();
    const [conflict] = await db.select({ id: discountCodesTable.id }).from(discountCodesTable).where(eq(discountCodesTable.code, newCode));
    if (conflict && conflict.id !== id) return res.status(409).json({ error: 'Another discount code with this code already exists.' });
    updates['code'] = newCode;
  }

  const [updated] = await db.update(discountCodesTable).set(updates as any).where(eq(discountCodesTable.id, id)).returning();
  return res.json({ data: updated });
});

router.delete('/discount-codes/:id', async (req, res) => {
  const { id } = req.params;
  const [existing] = await db.select({ id: discountCodesTable.id }).from(discountCodesTable).where(eq(discountCodesTable.id, id));
  if (!existing) return res.status(404).json({ error: 'Discount code not found.' });
  await db.delete(discountCodesTable).where(eq(discountCodesTable.id, id));
  return res.json({ success: true });
});

// ── Staff invite tokens ───────────────────────────────────────────────────────
function generateInviteToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    if (i === 4 || i === 8) result += '-';
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ── Wholesale delivery settings ───────────────────────────────────────────────
router.get('/wholesale-delivery-settings', async (_req, res) => {
  const settings = await getOrCreateWholesaleDeliverySettings();
  const slots: WholesaleDeliverySlot[] = JSON.parse(settings.slotsJson || '[]');
  return res.json({
    data: {
      slots: slots.length ? slots : DEFAULT_DELIVERY_SLOTS,
      cutoffReminderEnabled: settings.cutoffReminderEnabled,
    },
  });
});

router.patch('/wholesale-delivery-settings', async (req, res) => {
  const callerId = (req as any).user?.id ?? null;
  const { slots, cutoffReminderEnabled } = req.body ?? {};

  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'slots must be a non-empty array.' });
  }
  for (const s of slots) {
    if (typeof s.deliveryDow !== 'number' || typeof s.cutoffDow !== 'number' || typeof s.cutoffHour !== 'number') {
      return res.status(400).json({ error: 'Each slot must have deliveryDow, cutoffDow, and cutoffHour.' });
    }
    if (s.cutoffHour < 0 || s.cutoffHour > 23) {
      return res.status(400).json({ error: 'cutoffHour must be 0–23.' });
    }
  }

  await getOrCreateWholesaleDeliverySettings();

  await db
    .update(wholesaleDeliverySettingsTable)
    .set({
      slotsJson: JSON.stringify(slots),
      cutoffReminderEnabled: typeof cutoffReminderEnabled === 'boolean' ? cutoffReminderEnabled : true,
      updatedAt: new Date(),
      updatedBy: callerId,
    })
    .where(eq(wholesaleDeliverySettingsTable.id, 'default'));

  return res.json({ success: true });
});

router.post('/staff-invites', async (req, res) => {
  const callerId = (req as any).user.id;
  const { note, expiryDays = 7 } = req.body;
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + Number(expiryDays) * 86400000);
  const id = randomUUID();
  const [row] = await db.insert(staffInviteTokensTable)
    .values({ id, token, createdByUserId: callerId, expiresAt, note: note?.trim() ?? null })
    .returning();
  return res.status(201).json({ data: row });
});

router.get('/staff-invites', async (_req, res) => {
  const rows = await db.select().from(staffInviteTokensTable)
    .orderBy(desc(staffInviteTokensTable.createdAt));
  return res.json({ data: rows });
});

router.delete('/staff-invites/:id', async (req, res) => {
  const { id } = req.params;
  const [row] = await db.select().from(staffInviteTokensTable).where(eq(staffInviteTokensTable.id, id));
  if (!row) return res.status(404).json({ error: 'Invite not found.' });
  await db.delete(staffInviteTokensTable).where(eq(staffInviteTokensTable.id, id));
  return res.json({ success: true });
});

// ── Audit Logs ───────────────────────────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  const { type, userId, actorName, from, to, page = '1', pageSize = '50' } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(pageSize) || 50, 200);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  const conditions: any[] = [];
  if (type) conditions.push(sql`${auditLogsTable.action} ILIKE ${`${type}%`}`);
  if (userId) conditions.push(eq(auditLogsTable.actorUserId, userId));
  if (actorName) conditions.push(sql`${auditLogsTable.actorName} ILIKE ${`%${actorName}%`}`);
  if (from) conditions.push(gte(auditLogsTable.createdAt, new Date(from)));
  if (to) conditions.push(lte(auditLogsTable.createdAt, new Date(to)));

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auditLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(auditLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return res.json({ data: rows, total, page: parseInt(page) || 1, pageSize: limit });
});

// ── Login History ─────────────────────────────────────────────────────────────
router.get('/login-history', async (req, res) => {
  const { userId, email, from, to, page = '1', pageSize = '50', success } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(pageSize) || 50, 200);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  const conditions: any[] = [];
  if (userId) conditions.push(eq(loginHistoryTable.userId, userId));
  if (email) conditions.push(sql`${loginHistoryTable.email} ILIKE ${`%${email}%`}`);
  if (from) conditions.push(gte(loginHistoryTable.createdAt, new Date(from)));
  if (to) conditions.push(lte(loginHistoryTable.createdAt, new Date(to)));
  if (success === 'true') conditions.push(eq(loginHistoryTable.success, true));
  if (success === 'false') conditions.push(eq(loginHistoryTable.success, false));

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(loginHistoryTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(loginHistoryTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(loginHistoryTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return res.json({ data: rows, total, page: parseInt(page) || 1, pageSize: limit });
});

// ── POS Thresholds settings ───────────────────────────────────────────────────
const POS_THRESHOLDS_KEY = 'pos_thresholds';
const DEFAULT_POS_THRESHOLDS = { refundRequiresPin: false, discountPinThresholdCents: 0 };

router.get('/pos-thresholds', async (_req, res) => {
  const [row] = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.key, POS_THRESHOLDS_KEY)).limit(1);
  if (!row?.value) return res.json({ data: DEFAULT_POS_THRESHOLDS });
  try {
    return res.json({ data: { ...DEFAULT_POS_THRESHOLDS, ...JSON.parse(row.value) } });
  } catch {
    return res.json({ data: DEFAULT_POS_THRESHOLDS });
  }
});

router.patch('/pos-thresholds', async (req, res) => {
  const { refundRequiresPin, discountPinThresholdCents } = req.body;
  const current: any = { ...DEFAULT_POS_THRESHOLDS };
  const [existing] = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.key, POS_THRESHOLDS_KEY)).limit(1);
  if (existing?.value) Object.assign(current, JSON.parse(existing.value));
  if (typeof refundRequiresPin === 'boolean') current.refundRequiresPin = refundRequiresPin;
  if (typeof discountPinThresholdCents === 'number') current.discountPinThresholdCents = discountPinThresholdCents;
  const value = JSON.stringify(current);
  if (existing) {
    await db.update(storeSettingsTable).set({ value, updatedAt: new Date() }).where(eq(storeSettingsTable.key, POS_THRESHOLDS_KEY));
  } else {
    await db.insert(storeSettingsTable).values({ key: POS_THRESHOLDS_KEY, value, updatedBy: req.user!.id });
  }
  recordAuditLog({ actor: req.user, action: 'director.pos_thresholds_update', entityType: 'settings', entityId: POS_THRESHOLDS_KEY, after: current });
  return res.json({ data: current });
});

// ── Refund operator breakdown (supplement to reports/refunds) ─────────────────
router.get('/reports/refund-operators', async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const allConditions: any[] = [sql`${auditLogsTable.action} IN ('pos.refund','pos.void','pos.discount')`];
  const refundConditions: any[] = [eq(auditLogsTable.action, 'pos.refund')];
  if (from) {
    allConditions.push(gte(auditLogsTable.createdAt, new Date(from)));
    refundConditions.push(gte(auditLogsTable.createdAt, new Date(from)));
  }
  if (to) {
    allConditions.push(lte(auditLogsTable.createdAt, new Date(to)));
    refundConditions.push(lte(auditLogsTable.createdAt, new Date(to)));
  }

  const [rows, refundEvents] = await Promise.all([
    db.select({
      actorUserId: auditLogsTable.actorUserId,
      actorName: auditLogsTable.actorName,
      actorRole: auditLogsTable.actorRole,
      action: auditLogsTable.action,
      count: count(),
    }).from(auditLogsTable)
      .where(and(...allConditions))
      .groupBy(auditLogsTable.actorUserId, auditLogsTable.actorName, auditLogsTable.actorRole, auditLogsTable.action)
      .orderBy(desc(count())),
    db.select({
      id: auditLogsTable.id,
      actorUserId: auditLogsTable.actorUserId,
      actorName: auditLogsTable.actorName,
      actorRole: auditLogsTable.actorRole,
      entityId: auditLogsTable.entityId,
      metadataJson: auditLogsTable.metadataJson,
      reason: auditLogsTable.reason,
      createdAt: auditLogsTable.createdAt,
    }).from(auditLogsTable)
      .where(and(...refundConditions))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(200),
  ]);

  const operatorMap = new Map<string, { userId: string; name: string; role: string; refunds: number; voids: number; discounts: number; totalRefundedCents: number }>();
  for (const r of rows) {
    const key = r.actorUserId ?? 'unknown';
    const ex = operatorMap.get(key) ?? { userId: key, name: r.actorName ?? 'Unknown', role: r.actorRole ?? '', refunds: 0, voids: 0, discounts: 0, totalRefundedCents: 0 };
    if (r.action === 'pos.void') ex.voids += Number(r.count);
    else if (r.action === 'pos.discount') ex.discounts += Number(r.count);
    else ex.refunds += Number(r.count);
    operatorMap.set(key, ex);
  }

  // Accumulate refunded totals from metadata
  let grandTotalRefundedCents = 0;
  const parsedRefunds = refundEvents.map(e => {
    let meta: Record<string, any> = {};
    try { meta = typeof e.metadataJson === 'string' ? JSON.parse(e.metadataJson) : (e.metadataJson as any) ?? {}; } catch { /**/ }
    const amountCents: number = typeof meta.refundAmountCents === 'number' ? meta.refundAmountCents : 0;
    grandTotalRefundedCents += amountCents;
    if (e.actorUserId) {
      const op = operatorMap.get(e.actorUserId);
      if (op) { op.totalRefundedCents += amountCents; operatorMap.set(e.actorUserId, op); }
    }
    return {
      id: e.id,
      orderId: e.entityId ?? null,
      operatorId: e.actorUserId ?? null,
      operatorName: e.actorName ?? 'Unknown',
      operatorRole: e.actorRole ?? '',
      refundAmountCents: amountCents,
      refundType: meta.refundType ?? null,
      reason: e.reason ?? meta.reason ?? null,
      createdAt: e.createdAt,
    };
  });

  return res.json({
    grandTotalRefundedCents,
    data: Array.from(operatorMap.values()).sort((a, b) => (b.refunds + b.voids) - (a.refunds + a.voids)),
    refunds: parsedRefunds,
  });
});

export default router;
