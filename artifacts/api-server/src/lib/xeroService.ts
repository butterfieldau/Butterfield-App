import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import {
  db,
  productsTable,
  wholesaleAccountsTable,
  wholesaleOrdersTable,
  xeroConnectionsTable,
  xeroSyncLogsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage.js";
import { encryptSecret, decryptSecret } from "./xeroCrypto.js";
import { recordAuditLog } from "./auditLog.js";

const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";
const XERO_CONNECTION_ID = "primary";
const objectStorageService = new ObjectStorageService();
const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.transactions",
  "accounting.contacts",
  "accounting.settings",
];

export type XeroSyncStatus =
  | "not_synced"
  | "syncing"
  | "draft_created"
  | "authorised"
  | "sent"
  | "paid"
  | "overdue"
  | "sync_failed";

function xeroSecretOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured on the backend.`);
  return value;
}

function getPublicBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? "")
    .split(",")
    .map((d) => d.trim())
    .find(Boolean);
  if (!domain) throw new Error("Public base URL is not configured.");
  return `https://${domain}`;
}

export function getXeroRedirectUri(): string {
  return process.env.XERO_REDIRECT_URI || `${getPublicBaseUrl()}/api/director/xero/callback`;
}

function getXeroCredentials() {
  return {
    clientId: xeroSecretOrThrow("XERO_CLIENT_ID"),
    clientSecret: xeroSecretOrThrow("XERO_CLIENT_SECRET"),
  };
}

function getJwtSecret(): string {
  return process.env.SESSION_SECRET || "butterfield-dev-only-not-for-production";
}

export function buildXeroConnectUrl(actor: { id: string; role: string }) {
  const { clientId } = getXeroCredentials();
  const state = jwt.sign(
    { userId: actor.id, role: actor.role, kind: "xero-connect" },
    getJwtSecret(),
    { expiresIn: "15m" },
  );
  const url = new URL(XERO_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getXeroRedirectUri());
  url.searchParams.set("scope", XERO_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export function parseXeroConnectState(state: string) {
  return jwt.verify(state, getJwtSecret()) as { userId: string; role: string; kind: string };
}

async function getOrCreateConnectionRow() {
  const [existing] = await db.select().from(xeroConnectionsTable).where(eq(xeroConnectionsTable.id, XERO_CONNECTION_ID));
  if (existing) return existing;
  const [created] = await db.insert(xeroConnectionsTable).values({
    id: XERO_CONNECTION_ID,
    status: "disconnected",
  }).returning();
  return created;
}

export async function getXeroConnection() {
  return getOrCreateConnectionRow();
}

function isTokenExpired(expiresAt: Date | null | undefined) {
  if (!expiresAt) return true;
  return expiresAt.getTime() <= Date.now() + 60_000;
}

async function saveTokenSet(input: {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  actorUserId?: string | null;
}) {
  const expiresAt = new Date(Date.now() + input.expiresInSec * 1000);
  const [updated] = await db.update(xeroConnectionsTable)
    .set({
      status: "connected",
      encryptedAccessToken: encryptSecret(input.accessToken),
      encryptedRefreshToken: encryptSecret(input.refreshToken),
      accessTokenExpiresAt: expiresAt,
      lastRefreshedAt: new Date(),
      connectedByUserId: input.actorUserId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(xeroConnectionsTable.id, XERO_CONNECTION_ID))
    .returning();
  return updated;
}

async function exchangeToken(body: URLSearchParams) {
  const { clientId, clientSecret } = getXeroCredentials();
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || `Xero token exchange failed (${res.status})`);
  }
  return json;
}

export async function handleXeroOAuthCallback(code: string, actorUserId?: string | null) {
  await getOrCreateConnectionRow();
  const token = await exchangeToken(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getXeroRedirectUri(),
  }));
  const connection = await saveTokenSet({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresInSec: Number(token.expires_in ?? 1800),
    actorUserId,
  });
  return connection;
}

async function refreshConnectionTokenIfNeeded() {
  const connection = await getOrCreateConnectionRow();
  const refreshToken = decryptSecret(connection.encryptedRefreshToken);
  const accessToken = decryptSecret(connection.encryptedAccessToken);

  if (accessToken && !isTokenExpired(connection.accessTokenExpiresAt)) {
    return { connection, accessToken };
  }
  if (!refreshToken) {
    throw new Error("Xero is not connected.");
  }

  const token = await exchangeToken(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }));
  const updated = await saveTokenSet({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresInSec: Number(token.expires_in ?? 1800),
    actorUserId: connection.connectedByUserId,
  });
  return {
    connection: updated,
    accessToken: decryptSecret(updated.encryptedAccessToken)!,
  };
}

export async function listXeroTenants() {
  const { accessToken } = await refreshConnectionTokenIfNeeded();
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => []);
  const errorMessage = (typeof data === "object" && data && "message" in data)
    ? String((data as { message?: string }).message)
    : null;
  if (!res.ok) throw new Error(errorMessage || "Could not load Xero organisations.");
  return Array.isArray(data) ? data : [];
}

export async function selectXeroTenant(input: { tenantId: string; tenantName?: string | null; tenantType?: string | null; actorUserId?: string | null }) {
  const [updated] = await db.update(xeroConnectionsTable)
    .set({
      tenantId: input.tenantId,
      tenantName: input.tenantName ?? null,
      tenantType: input.tenantType ?? null,
      selectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(xeroConnectionsTable.id, XERO_CONNECTION_ID))
    .returning();
  return updated;
}

export async function updateXeroSettings(input: {
  defaultSalesAccountCode?: string | null;
  defaultTaxType?: string | null;
  defaultPaymentTerms?: string | null;
  invoiceEmailMode?: string | null;
  autoCreateOnStatus?: string | null;
  autoSendOnAuthorise?: boolean | null;
}) {
  const [updated] = await db.update(xeroConnectionsTable)
    .set({
      defaultSalesAccountCode: input.defaultSalesAccountCode?.trim() || null,
      defaultTaxType: input.defaultTaxType?.trim() || "OUTPUT",
      defaultPaymentTerms: input.defaultPaymentTerms?.trim() || "30 days",
      invoiceEmailMode: input.invoiceEmailMode?.trim() || "manual",
      autoCreateOnStatus: input.autoCreateOnStatus?.trim() || "manual",
      autoSendOnAuthorise: input.autoSendOnAuthorise ?? false,
      updatedAt: new Date(),
    })
    .where(eq(xeroConnectionsTable.id, XERO_CONNECTION_ID))
    .returning();
  return updated;
}

export async function disconnectXero() {
  const [updated] = await db.update(xeroConnectionsTable)
    .set({
      status: "disconnected",
      tenantId: null,
      tenantName: null,
      tenantType: null,
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      accessTokenExpiresAt: null,
      lastRefreshedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(xeroConnectionsTable.id, XERO_CONNECTION_ID))
    .returning();
  return updated;
}

async function xeroApiRequest<T = any>(path: string, opts: {
  method?: string;
  body?: unknown;
  accept?: string;
  tenantId?: string | null;
  idempotencyKey?: string;
} = {}) {
  const { connection, accessToken } = await refreshConnectionTokenIfNeeded();
  if (!connection.tenantId && !opts.tenantId) {
    throw new Error("No Xero organisation is selected.");
  }
  const tenantId = opts.tenantId || connection.tenantId!;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "xero-tenant-id": tenantId,
    Accept: opts.accept || "application/json",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${XERO_API_BASE}${path}`, {
    method: opts.method || (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (opts.accept === "application/pdf") {
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new Error(raw || `Xero request failed (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer()) as T;
  }
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : {}; } catch {}
  if (!res.ok) {
    const elementError = json?.Elements?.[0]?.ValidationErrors?.[0]?.Message;
    throw new Error(elementError || json?.Message || json?.message || `Xero request failed (${res.status})`);
  }
  return json as T;
}

async function writeXeroSyncLog(input: {
  entityType: string;
  entityId: string;
  action: string;
  status: string;
  message?: string | null;
  details?: unknown;
  actorUserId?: string | null;
}) {
  await db.insert(xeroSyncLogsTable).values({
    id: randomUUID(),
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    status: input.status,
    message: input.message ?? null,
    detailsJson: input.details == null ? null : JSON.stringify(input.details),
    actorUserId: input.actorUserId ?? null,
  });
}

function sanitizeName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function computeDueDate(invoiceDate: Date, paymentTerms: string | null | undefined, fallbackTerms: string | null | undefined) {
  const terms = (paymentTerms || fallbackTerms || "30 days").toLowerCase();
  if (terms.includes("pay_on_order") || terms.includes("due on receipt")) return invoiceDate;
  const daysMatch = terms.match(/(\d+)\s*day/);
  const days = daysMatch ? Number(daysMatch[1]) : 30;
  const due = new Date(invoiceDate);
  due.setDate(due.getDate() + days);
  return due;
}

function formatDateOnly(date: Date | string | null | undefined) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseXeroDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value === "string") {
    const match = value.match(/Date\((\d+)/);
    if (match) return new Date(Number(match[1])).toISOString().slice(0, 10);
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
}

function deriveLocalSyncStatus(invoice: any): XeroSyncStatus {
  const status = String(invoice?.Status ?? "").toUpperCase();
  const amountDueCents = Math.round((Number(invoice?.AmountDue ?? 0) || 0) * 100);
  const amountPaidCents = Math.round((Number(invoice?.AmountPaid ?? 0) || 0) * 100);
  const sentToContact = invoice?.SentToContact === true;
  const dueDate = parseXeroDate(invoice?.DueDateString ?? invoice?.DueDate);
  const isOverdue = !!dueDate && amountDueCents > 0 && new Date(`${dueDate}T23:59:59Z`).getTime() < Date.now();
  if (status === "PAID" || (amountDueCents <= 0 && amountPaidCents > 0)) return "paid";
  if (isOverdue) return "overdue";
  if (sentToContact) return "sent";
  if (status === "AUTHORISED" || status === "SUBMITTED") return "authorised";
  if (status === "DRAFT") return "draft_created";
  return "not_synced";
}

function buildXeroInvoiceUrl(invoiceId: string | null | undefined) {
  if (!invoiceId) return null;
  return `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`;
}

async function syncWholesaleAccountXeroContact(accountId: string, xeroContact: any) {
  const [updated] = await db.update(wholesaleAccountsTable)
    .set({
      xeroContactId: xeroContact.ContactID ?? null,
      xeroContactName: xeroContact.Name ?? null,
      xeroLastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(wholesaleAccountsTable.id, accountId))
    .returning();
  return updated;
}

async function findXeroContact(account: typeof wholesaleAccountsTable.$inferSelect) {
  if (account.xeroContactId) {
    const byId = await xeroApiRequest<any>(`/Contacts/${account.xeroContactId}`);
    return byId?.Contacts?.[0] ?? null;
  }
  const attempts = [
    account.accountsEmail || account.email ? `EmailAddress=="${(account.accountsEmail || account.email || "").replace(/"/g, '\\"')}"` : null,
    account.abn ? `TaxNumber=="${account.abn.replace(/"/g, '\\"')}"` : null,
    account.companyName ? `Name=="${account.companyName.replace(/"/g, '\\"')}"` : null,
  ].filter(Boolean) as string[];

  for (const where of attempts) {
    const result = await xeroApiRequest<any>(`/Contacts?where=${encodeURIComponent(where)}`);
    const found = result?.Contacts?.[0];
    if (found) return found;
  }
  return null;
}

async function ensureXeroContact(account: typeof wholesaleAccountsTable.$inferSelect) {
  const existing = await findXeroContact(account);
  if (existing) {
    await syncWholesaleAccountXeroContact(account.id, existing);
    return existing;
  }
  const payload = {
    Contacts: [{
      Name: sanitizeName(account.companyName || account.contactName || "Wholesale Customer"),
      EmailAddress: account.accountsEmail || account.email || undefined,
      ContactPerson: sanitizeName(account.contactName || account.companyName || "Wholesale Customer"),
      Phones: account.phone ? [{ PhoneType: "DEFAULT", PhoneNumber: account.phone }] : undefined,
      Addresses: account.deliveryAddress ? [{
        AddressType: "POBOX",
        AddressLine1: account.deliveryAddress,
        City: account.suburb || undefined,
        Region: account.state || undefined,
        PostalCode: account.postcode || undefined,
      }] : undefined,
      TaxNumber: account.abn || undefined,
    }],
  };
  const result = await xeroApiRequest<any>("/Contacts", {
    method: "POST",
    body: payload,
    idempotencyKey: `xero-contact-${account.id}`,
  });
  const created = result?.Contacts?.[0];
  if (!created?.ContactID) throw new Error("Xero did not return a contact for this wholesale customer.");
  await syncWholesaleAccountXeroContact(account.id, created);
  return created;
}

export async function listXeroItems() {
  const result = await xeroApiRequest<any>("/Items");
  return result?.Items ?? [];
}

export async function listWholesaleProductMappings() {
  const rows = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    sku: productsTable.sku,
    wholesalePriceCents: productsTable.wholesalePriceCents,
    xeroItemId: productsTable.xeroItemId,
    xeroItemCode: productsTable.xeroItemCode,
    xeroTaxType: productsTable.xeroTaxType,
    isWholesaleAvailable: productsTable.isWholesaleAvailable,
    isActive: productsTable.isActive,
  }).from(productsTable)
    .where(and(eq(productsTable.isActive, true), eq(productsTable.isWholesaleAvailable, true)));
  return rows;
}

export async function updateProductXeroMapping(productId: string, input: {
  xeroItemId?: string | null;
  xeroItemCode?: string | null;
  xeroTaxType?: string | null;
}) {
  const [updated] = await db.update(productsTable)
    .set({
      xeroItemId: input.xeroItemId?.trim() || null,
      xeroItemCode: input.xeroItemCode?.trim() || null,
      xeroTaxType: input.xeroTaxType?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(productsTable.id, productId))
    .returning();
  return updated;
}

async function loadWholesaleOrderOrThrow(orderId: string) {
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId));
  if (!order) throw new Error("Wholesale order not found.");
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.id, order.accountId));
  if (!account) throw new Error("Wholesale account not found.");
  return { order, account };
}

function getOrderItems(order: typeof wholesaleOrdersTable.$inferSelect) {
  return Array.isArray(order.items) ? order.items as any[] : [];
}

async function buildXeroLineItems(order: typeof wholesaleOrdersTable.$inferSelect, connection: typeof xeroConnectionsTable.$inferSelect) {
  const items = getOrderItems(order);
  const productIds = Array.from(new Set(items.map((item) => item?.productId).filter((id): id is string => !!id)));
  const products = productIds.length
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productMap = new Map(products.map((product) => [product.id, product]));
  const mappingErrors: string[] = [];
  const lineItems = items.map((item: any, index) => {
    const product = item?.productId ? productMap.get(item.productId) : null;
    const qty = Math.max(1, Number(item?.qty ?? item?.quantity ?? 1) || 1);
    const unitCents = Math.max(0, Number(item?.unitPriceCents ?? 0) || 0);
    const description = String(item?.productName || product?.name || `Line item ${index + 1}`);
    const xeroItemCode = product?.xeroItemCode || product?.sku || null;
    if (!xeroItemCode && !connection.defaultSalesAccountCode) {
      mappingErrors.push(`${description} has no Xero item mapping and no default sales account is configured.`);
    }
    return {
      Description: description,
      Quantity: qty,
      UnitAmount: Number((unitCents / 100).toFixed(2)),
      ItemCode: xeroItemCode || undefined,
      AccountCode: xeroItemCode ? undefined : connection.defaultSalesAccountCode || undefined,
      TaxType: product?.xeroTaxType || connection.defaultTaxType || "OUTPUT",
    };
  });
  if (mappingErrors.length > 0) {
    throw new Error(mappingErrors.join(" "));
  }
  return {
    lineItems,
    lineAmountTypes: products.some((product) => product.gstIncluded !== false) ? "Inclusive" : "Exclusive",
  };
}

async function uploadInvoicePdfSnapshot(orderId: string, invoiceId: string) {
  const pdfBuffer = await xeroApiRequest<Buffer>(`/Invoices/${invoiceId}`, {
    accept: "application/pdf",
  });
  const result = await objectStorageService.uploadToPath(
    pdfBuffer,
    "application/pdf",
    `invoices/xero/${orderId}-${invoiceId}.pdf`,
    { owner: "system", visibility: "private" },
  );
  return result;
}

async function syncOrderFromXeroInvoice(orderId: string, invoice: any, actor?: { id?: string | null; role?: string | null }) {
  const syncStatus = deriveLocalSyncStatus(invoice);
  const amountDueCents = Math.round((Number(invoice?.AmountDue ?? 0) || 0) * 100);
  const amountPaidCents = Math.round((Number(invoice?.AmountPaid ?? 0) || 0) * 100);
  const invoiceDate = parseXeroDate(invoice?.DateString ?? invoice?.Date);
  const dueDate = parseXeroDate(invoice?.DueDateString ?? invoice?.DueDate);
  const pdf = await uploadInvoicePdfSnapshot(orderId, invoice.InvoiceID);
  const [updated] = await db.update(wholesaleOrdersTable)
    .set({
      xeroInvoiceId: invoice.InvoiceID ?? null,
      xeroInvoiceNumber: invoice.InvoiceNumber ?? null,
      xeroInvoiceStatus: invoice.Status ?? null,
      xeroSyncStatus: syncStatus,
      xeroSyncError: null,
      xeroTenantId: invoice?.TenantID ?? null,
      xeroInvoiceDate: invoiceDate,
      xeroDueDate: dueDate,
      xeroAmountPaidCents: amountPaidCents,
      xeroAmountDueCents: amountDueCents,
      xeroSentAt: invoice?.SentToContact ? new Date() : null,
      xeroLastSyncedAt: new Date(),
      invoiceUrl: pdf.servingUrl,
      isPaid: syncStatus === "paid",
      paidAt: syncStatus === "paid" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(wholesaleOrdersTable.id, orderId))
    .returning();
  await writeXeroSyncLog({
    entityType: "wholesale_order",
    entityId: orderId,
    action: "sync_invoice_status",
    status: syncStatus,
    message: `Synced invoice ${invoice.InvoiceNumber ?? invoice.InvoiceID}`,
    details: { invoiceId: invoice.InvoiceID, invoiceNumber: invoice.InvoiceNumber, status: invoice.Status },
    actorUserId: actor?.id ?? null,
  });
  await recordAuditLog({
    actorUserId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    action: "xero_invoice_synced",
    entityType: "wholesale_order",
    entityId: orderId,
    description: `Synced Xero invoice ${invoice.InvoiceNumber ?? invoice.InvoiceID}`,
    after: updated,
  });
  return updated;
}

export async function createWholesaleOrderXeroInvoice(orderId: string, actor: { id: string; role: string }) {
  const connection = await getOrCreateConnectionRow();
  if (!connection.tenantId) throw new Error("Select a Xero organisation before creating invoices.");
  const { order, account } = await loadWholesaleOrderOrThrow(orderId);
  if (order.xeroInvoiceId) {
    throw new Error("This wholesale order already has a Xero invoice linked.");
  }

  await db.update(wholesaleOrdersTable)
    .set({ xeroSyncStatus: "syncing", xeroSyncError: null, updatedAt: new Date() })
    .where(eq(wholesaleOrdersTable.id, orderId));

  try {
    const contact = await ensureXeroContact(account);
    const { lineItems, lineAmountTypes } = await buildXeroLineItems(order, connection);
    const invoiceDate = new Date();
    const dueDate = computeDueDate(invoiceDate, account.paymentTerms, connection.defaultPaymentTerms);
    const payload = {
      Type: "ACCREC",
      Contact: { ContactID: contact.ContactID },
      Date: formatDateOnly(invoiceDate),
      DueDate: formatDateOnly(dueDate),
      Status: "DRAFT",
      Reference: order.poReference || order.id,
      LineAmountTypes: lineAmountTypes,
      LineItems: lineItems,
    };
    const result = await xeroApiRequest<any>("/Invoices", {
      method: "POST",
      body: { Invoices: [payload] },
      idempotencyKey: `wholesale-order-${order.id}`,
    });
    const invoice = result?.Invoices?.[0];
    if (!invoice?.InvoiceID) throw new Error("Xero did not return an invoice.");
    const updated = await syncOrderFromXeroInvoice(order.id, invoice, actor);
    await writeXeroSyncLog({
      entityType: "wholesale_order",
      entityId: order.id,
      action: "create_invoice",
      status: updated?.xeroSyncStatus ?? "draft_created",
      message: `Created draft Xero invoice ${invoice.InvoiceNumber ?? invoice.InvoiceID}`,
      details: { invoiceId: invoice.InvoiceID, invoiceNumber: invoice.InvoiceNumber },
      actorUserId: actor.id,
    });
    await recordAuditLog({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "xero_invoice_created",
      entityType: "wholesale_order",
      entityId: order.id,
      description: `Created Xero invoice ${invoice.InvoiceNumber ?? invoice.InvoiceID}`,
      after: updated,
    });
    return updated;
  } catch (error: any) {
    await db.update(wholesaleOrdersTable)
      .set({ xeroSyncStatus: "sync_failed", xeroSyncError: error.message ?? "Unknown Xero error", updatedAt: new Date() })
      .where(eq(wholesaleOrdersTable.id, orderId));
    await writeXeroSyncLog({
      entityType: "wholesale_order",
      entityId: orderId,
      action: "create_invoice",
      status: "sync_failed",
      message: error.message ?? "Invoice creation failed",
      actorUserId: actor.id,
    });
    throw error;
  }
}

async function getXeroInvoiceOrThrow(invoiceId: string) {
  const result = await xeroApiRequest<any>(`/Invoices/${invoiceId}`);
  const invoice = result?.Invoices?.[0];
  if (!invoice?.InvoiceID) throw new Error("Xero invoice not found.");
  return invoice;
}

export async function authoriseWholesaleOrderXeroInvoice(orderId: string, actor: { id: string; role: string }) {
  const { order } = await loadWholesaleOrderOrThrow(orderId);
  if (!order.xeroInvoiceId) throw new Error("Create the Xero invoice first.");
  const result = await xeroApiRequest<any>("/Invoices", {
    method: "POST",
    body: { Invoices: [{ InvoiceID: order.xeroInvoiceId, Status: "AUTHORISED" }] },
    idempotencyKey: `xero-authorise-${order.id}`,
  });
  const invoice = result?.Invoices?.[0];
  const updated = await syncOrderFromXeroInvoice(order.id, invoice, actor);
  await writeXeroSyncLog({
    entityType: "wholesale_order",
    entityId: order.id,
    action: "authorise_invoice",
    status: updated?.xeroSyncStatus ?? "authorised",
    message: `Authorised Xero invoice ${invoice.InvoiceNumber ?? invoice.InvoiceID}`,
    actorUserId: actor.id,
  });
  return updated;
}

export async function sendWholesaleOrderXeroInvoice(orderId: string, actor: { id: string; role: string }) {
  const { order, account } = await loadWholesaleOrderOrThrow(orderId);
  if (!order.xeroInvoiceId) throw new Error("Create the Xero invoice first.");
  if (!(account.accountsEmail || account.email)) {
    throw new Error("This wholesale customer does not have an accounts email or contact email for invoice sending.");
  }
  await xeroApiRequest(`/Invoices/${order.xeroInvoiceId}/Email`, {
    method: "POST",
    body: {},
    idempotencyKey: `xero-send-${order.id}`,
  });
  const invoice = await getXeroInvoiceOrThrow(order.xeroInvoiceId);
  return syncOrderFromXeroInvoice(order.id, invoice, actor);
}

export async function syncWholesaleOrderFromXero(orderId: string, actor: { id?: string | null; role?: string | null }) {
  const { order } = await loadWholesaleOrderOrThrow(orderId);
  if (!order.xeroInvoiceId) throw new Error("No Xero invoice is linked to this wholesale order.");
  const invoice = await getXeroInvoiceOrThrow(order.xeroInvoiceId);
  return syncOrderFromXeroInvoice(order.id, invoice, actor);
}

export async function manualLinkWholesaleOrderXeroInvoice(orderId: string, xeroInvoiceId: string, actor: { id: string; role: string }) {
  const { order } = await loadWholesaleOrderOrThrow(orderId);
  if (order.xeroInvoiceId && order.xeroInvoiceId !== xeroInvoiceId) {
    throw new Error("This wholesale order already has a different Xero invoice linked.");
  }
  const invoice = await getXeroInvoiceOrThrow(xeroInvoiceId);
  const updated = await syncOrderFromXeroInvoice(order.id, invoice, actor);
  await writeXeroSyncLog({
    entityType: "wholesale_order",
    entityId: order.id,
    action: "manual_link_invoice",
    status: updated?.xeroSyncStatus ?? "authorised",
    message: `Linked existing Xero invoice ${invoice.InvoiceNumber ?? xeroInvoiceId}`,
    actorUserId: actor.id,
  });
  return updated;
}

export async function testXeroConnection() {
  const result = await xeroApiRequest<any>("/Organisation");
  return result?.Organisations?.[0] ?? null;
}

export async function getXeroSyncLogs(limit = 50) {
  return db.select().from(xeroSyncLogsTable).orderBy(xeroSyncLogsTable.createdAt).limit(limit);
}

export async function maybeAutoCreateWholesaleInvoice(orderId: string, status: string, actor: { id: string; role: string }) {
  const connection = await getOrCreateConnectionRow();
  const wanted = connection.autoCreateOnStatus || "manual";
  if (!connection.tenantId || wanted === "manual") return null;
  if (wanted === "approved" && status !== "processing") return null;
  if (wanted === "completed" && status !== "delivered") return null;
  const { order } = await loadWholesaleOrderOrThrow(orderId);
  if (order.xeroInvoiceId) return order;
  return createWholesaleOrderXeroInvoice(orderId, actor);
}

export function buildXeroInvoiceOpenUrl(invoiceId: string | null | undefined) {
  return buildXeroInvoiceUrl(invoiceId);
}
