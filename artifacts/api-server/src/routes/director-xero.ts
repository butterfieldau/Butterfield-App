import { Router } from "express";
import { count, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  wholesaleOrdersTable,
  xeroSyncLogsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { requireManagerPermission } from "../middlewares/managerPermission.js";
import {
  authoriseWholesaleOrderXeroInvoice,
  buildXeroConnectUrl,
  buildXeroInvoiceOpenUrl,
  createWholesaleOrderXeroInvoice,
  disconnectXero,
  getXeroConnection,
  handleXeroOAuthCallback,
  listWholesaleProductMappings,
  listXeroItems,
  listXeroTenants,
  manualLinkWholesaleOrderXeroInvoice,
  selectXeroTenant,
  sendWholesaleOrderXeroInvoice,
  syncWholesaleOrderFromXero,
  testXeroConnection,
  updateProductXeroMapping,
  updateXeroSettings,
} from "../lib/xeroService.js";
import { recordAuditLog } from "../lib/auditLog.js";

const router = Router();

function xeroSettingsPageHtml(title: string, message: string, tone: "success" | "error") {
  const accent = tone === "success" ? "#16A34A" : "#DC2626";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#F5F6FA; margin:0; padding:32px; color:#1C1C1E; }
      .card { max-width:560px; margin:0 auto; background:#fff; border-radius:20px; padding:28px; box-shadow:0 12px 36px rgba(0,0,0,.08); }
      .badge { display:inline-block; padding:6px 10px; border-radius:999px; background:${accent}18; color:${accent}; font-weight:700; font-size:12px; margin-bottom:14px; }
      h1 { margin:0 0 10px; font-size:28px; }
      p { margin:0; line-height:1.6; color:#475569; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">${tone === "success" ? "Connected" : "Could not connect"}</div>
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`;
}

function requireXeroSettingsAccess(req: any, res: any, next: any) {
  requireRole("director", "master")(req, res, next);
}

function requireXeroInvoiceAccess(req: any, res: any, next: any) {
  if (req.user?.role === "director" || req.user?.role === "master") {
    next();
    return;
  }
  return requireManagerPermission("invoices" as any)(req, res, next);
}

router.get("/director/xero/callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  if (!code || !state) {
    res.status(400).send(xeroSettingsPageHtml("Missing Xero data", "The Xero callback did not include the required authorisation data.", "error"));
    return;
  }
  try {
    const parsed = (await import("../lib/xeroService.js")).parseXeroConnectState(state);
    await handleXeroOAuthCallback(code, parsed.userId);
    await recordAuditLog({
      actorUserId: parsed.userId,
      actorRole: parsed.role,
      action: "xero_connected",
      entityType: "xero_connection",
      entityId: "primary",
      description: "Connected Xero OAuth credentials",
    });
    res.send(xeroSettingsPageHtml("Xero connected", "The Xero connection is saved. You can return to Butterfield and choose the correct organisation.", "success"));
  } catch (error: any) {
    res.status(400).send(xeroSettingsPageHtml("Xero connection failed", error.message ?? "The Xero connection could not be completed.", "error"));
  }
});

router.get("/director/xero/connection", requireXeroSettingsAccess, async (_req, res) => {
  const connection = await getXeroConnection();
  const [unsynced, synced, sent, paid, overdue, failed] = await Promise.all([
    db.select({ count: count() }).from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.xeroSyncStatus, "not_synced")),
    db.select({ count: count() }).from(wholesaleOrdersTable).where(inArray(wholesaleOrdersTable.xeroSyncStatus, ["draft_created", "authorised", "sent", "paid", "overdue"] as any)),
    db.select({ count: count() }).from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.xeroSyncStatus, "sent")),
    db.select({ count: count() }).from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.xeroSyncStatus, "paid")),
    db.select({ count: count() }).from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.xeroSyncStatus, "overdue")),
    db.select({ count: count() }).from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.xeroSyncStatus, "sync_failed")),
  ]);
  return res.json({
    data: {
      ...connection,
      encryptedAccessToken: undefined,
      encryptedRefreshToken: undefined,
      reports: {
        unsyncedOrders: unsynced[0]?.count ?? 0,
        syncedInvoices: synced[0]?.count ?? 0,
        sentInvoices: sent[0]?.count ?? 0,
        paidInvoices: paid[0]?.count ?? 0,
        overdueInvoices: overdue[0]?.count ?? 0,
        failedSyncs: failed[0]?.count ?? 0,
      },
    },
  });
});

router.get("/director/xero/connect-url", requireXeroSettingsAccess, async (req, res) => {
  return res.json({ data: { url: buildXeroConnectUrl(req.user!) } });
});

router.post("/director/xero/disconnect", requireXeroSettingsAccess, async (req, res) => {
  const data = await disconnectXero();
  await recordAuditLog({
    actorUserId: req.user!.id,
    actorRole: req.user!.role,
    action: "xero_disconnected",
    entityType: "xero_connection",
    entityId: "primary",
    description: "Disconnected Xero",
  });
  return res.json({ data });
});

router.get("/director/xero/tenants", requireXeroSettingsAccess, async (_req, res) => {
  const data = await listXeroTenants();
  return res.json({ data });
});

router.post("/director/xero/select-tenant", requireXeroSettingsAccess, async (req, res) => {
  const { tenantId, tenantName, tenantType } = req.body ?? {};
  if (!tenantId) return res.status(400).json({ error: "tenantId is required." });
  const data = await selectXeroTenant({ tenantId, tenantName, tenantType, actorUserId: req.user!.id });
  await recordAuditLog({
    actorUserId: req.user!.id,
    actorRole: req.user!.role,
    action: "xero_tenant_selected",
    entityType: "xero_connection",
    entityId: "primary",
    description: `Selected Xero organisation ${tenantName || tenantId}`,
  });
  return res.json({ data });
});

router.post("/director/xero/test", requireXeroSettingsAccess, async (_req, res) => {
  const data = await testXeroConnection();
  return res.json({ data });
});

router.patch("/director/xero/settings", requireXeroSettingsAccess, async (req, res) => {
  const data = await updateXeroSettings(req.body ?? {});
  await recordAuditLog({
    actorUserId: req.user!.id,
    actorRole: req.user!.role,
    action: "xero_settings_updated",
    entityType: "xero_connection",
    entityId: "primary",
    description: "Updated Xero settings",
    after: req.body ?? {},
  });
  return res.json({ data });
});

router.get("/director/xero/items", requireXeroSettingsAccess, async (_req, res) => {
  const data = await listXeroItems();
  return res.json({ data });
});

router.get("/director/xero/product-mappings", requireXeroSettingsAccess, async (_req, res) => {
  const data = await listWholesaleProductMappings();
  return res.json({ data });
});

router.patch("/director/xero/product-mappings/:productId", requireXeroSettingsAccess, async (req, res) => {
  const productId = String(req.params.productId);
  const data = await updateProductXeroMapping(productId, req.body ?? {});
  return res.json({ data });
});

router.post("/director/xero/wholesale-orders/:orderId/create-invoice", requireAuth, requireXeroInvoiceAccess, async (req, res) => {
  const orderId = String(req.params.orderId);
  const data = await createWholesaleOrderXeroInvoice(orderId, req.user!);
  return res.json({ data });
});

router.post("/director/xero/wholesale-orders/:orderId/authorise", requireAuth, requireXeroInvoiceAccess, async (req, res) => {
  const orderId = String(req.params.orderId);
  const data = await authoriseWholesaleOrderXeroInvoice(orderId, req.user!);
  return res.json({ data });
});

router.post("/director/xero/wholesale-orders/:orderId/send", requireAuth, requireXeroInvoiceAccess, async (req, res) => {
  const orderId = String(req.params.orderId);
  const data = await sendWholesaleOrderXeroInvoice(orderId, req.user!);
  return res.json({ data });
});

router.post("/director/xero/wholesale-orders/:orderId/sync", requireAuth, requireXeroInvoiceAccess, async (req, res) => {
  const orderId = String(req.params.orderId);
  const data = await syncWholesaleOrderFromXero(orderId, req.user!);
  return res.json({ data });
});

router.post("/director/xero/wholesale-orders/:orderId/retry", requireAuth, requireXeroInvoiceAccess, async (req, res) => {
  const orderId = String(req.params.orderId);
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ error: "Wholesale order not found." });
  const data = order.xeroInvoiceId
    ? await syncWholesaleOrderFromXero(orderId, req.user!)
    : await createWholesaleOrderXeroInvoice(orderId, req.user!);
  return res.json({ data });
});

router.post("/director/xero/wholesale-orders/:orderId/link", requireXeroSettingsAccess, async (req, res) => {
  const orderId = String(req.params.orderId);
  const { xeroInvoiceId } = req.body ?? {};
  if (!xeroInvoiceId) return res.status(400).json({ error: "xeroInvoiceId is required." });
  const data = await manualLinkWholesaleOrderXeroInvoice(orderId, String(xeroInvoiceId), req.user!);
  return res.json({ data });
});

router.get("/director/xero/sync-logs", requireXeroSettingsAccess, async (_req, res) => {
  const rows = await db.select().from(xeroSyncLogsTable).orderBy(desc(xeroSyncLogsTable.createdAt)).limit(100);
  return res.json({ data: rows });
});

router.get("/director/xero/wholesale-orders/:orderId/open-link", requireAuth, requireXeroInvoiceAccess, async (req, res) => {
  const orderId = String(req.params.orderId);
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId));
  if (!order?.xeroInvoiceId) return res.status(404).json({ error: "No Xero invoice is linked to this order." });
  return res.json({ data: { url: buildXeroInvoiceOpenUrl(order.xeroInvoiceId) } });
});

router.get("/wholesale/invoices/:orderId/download", requireRole("wholesale", "director", "manager", "master"), async (req, res) => {
  const orderId = String(req.params.orderId);
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId));
  if (!order || !order.invoiceUrl) return res.status(404).json({ error: "No invoice file is available for this order yet." });
  return res.json({ data: { invoiceUrl: order.invoiceUrl, invoiceNumber: order.xeroInvoiceNumber } });
});

export default router;
