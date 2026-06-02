import { randomUUID } from 'crypto';
import {
  db,
  wholesaleAccountsTable,
  wholesaleOrdersTable,
  xeroIntegrationsTable,
  type WholesaleAccount,
  type WholesaleOrder,
} from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { ensureXeroIntegrationSchemaReady } from './ensureXeroIntegrationSchemaReady.js';

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const XERO_ACCOUNTING_BASE = 'https://api.xero.com/api.xro/2.0';
const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'accounting.transactions',
  'accounting.contacts',
  'accounting.settings',
].join(' ');
const XERO_INTEGRATION_ID = 'xero-default';

type XeroBrandingTheme = {
  BrandingThemeID: string;
  Name?: string;
};

type XeroInvoiceStatus = 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED' | 'DELETED';

type XeroInvoicePayload = {
  Type: 'ACCREC';
  Contact: { ContactID: string };
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode: string;
    TaxType?: string;
  }>;
  Date: string;
  DueDate: string;
  Status: XeroInvoiceStatus;
  Reference?: string;
  BrandingThemeID?: string;
  CurrencyCode: 'AUD';
  LineAmountTypes: 'Exclusive' | 'Inclusive' | 'NoTax';
};

function getClientId() {
  return process.env.XERO_CLIENT_ID?.trim() ?? '';
}

function getClientSecret() {
  return process.env.XERO_CLIENT_SECRET?.trim() ?? '';
}

function hasCredentials() {
  return Boolean(getClientId() && getClientSecret());
}

function getPublicBaseUrl() {
  const domain = (
    process.env.EXPO_PUBLIC_DOMAIN ||
    process.env.REPLIT_DEV_DOMAIN ||
    process.env.REPLIT_DOMAINS?.split(',').map((value) => value.trim()).find(Boolean) ||
    ''
  ).trim();
  return domain ? `https://${domain}` : '';
}

export function getXeroCallbackUrl() {
  const base = getPublicBaseUrl();
  if (!base) throw new Error('Public app domain is not configured for Xero.');
  return `${base}/api/xero/callback`;
}

function getBasicAuthHeader() {
  return `Basic ${Buffer.from(`${getClientId()}:${getClientSecret()}`).toString('base64')}`;
}

function formatDateOnly(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function parseNetDays(paymentTerms: string | null | undefined) {
  if (!paymentTerms || paymentTerms === 'pay_on_order') return 0;
  const match = paymentTerms.match(/(\d+)/);
  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

function pickInvoiceStatus(order: WholesaleOrder): XeroInvoiceStatus {
  if (order.status === 'cancelled') return 'VOIDED';
  if (order.isPaid) return 'AUTHORISED';
  return 'AUTHORISED';
}

function normalizeXeroInvoiceStatus(status?: string | null) {
  switch ((status ?? '').toUpperCase()) {
    case 'DRAFT':
      return 'Draft';
    case 'SUBMITTED':
      return 'Sent';
    case 'AUTHORISED':
      return 'Sent';
    case 'PAID':
      return 'Paid';
    case 'VOIDED':
      return 'Voided';
    default:
      return status ?? 'Unknown';
  }
}

async function fetchInvoicePdfResponse(invoiceId: string, tenantId: string, accessToken: string) {
  const candidates = [
    `${XERO_ACCOUNTING_BASE}/Invoices/${invoiceId}`,
    `${XERO_ACCOUNTING_BASE}/Invoices/${invoiceId}/PDF`,
  ];

  let lastError: Error | null = null;
  for (const url of candidates) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/pdf',
        'xero-tenant-id': tenantId,
      },
    });
    if (response.ok) return response;
    const text = await response.text().catch(() => '');
    lastError = new Error(text || `Could not download Xero invoice PDF (${response.status})`);
  }

  throw lastError ?? new Error('Could not download Xero invoice PDF.');
}

async function xeroFetch(
  path: string,
  init: RequestInit & { tenantId?: string; accessToken?: string } = {},
) {
  const integration = await getXeroIntegration();
  if (!integration || integration.status !== 'connected') {
    throw new Error('Xero is not connected.');
  }
  const token = init.accessToken ?? await getValidAccessToken(integration.id);
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', headers.get('Accept') ?? 'application/json');
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  headers.set('xero-tenant-id', init.tenantId ?? integration.tenantId ?? '');

  const response = await fetch(`${XERO_ACCOUNTING_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Xero request failed (${response.status})`);
  }
  return response;
}

export async function ensureXeroIntegrationRow() {
  await ensureXeroIntegrationSchemaReady();
  const [existing] = await db
    .select()
    .from(xeroIntegrationsTable)
    .where(eq(xeroIntegrationsTable.id, XERO_INTEGRATION_ID))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(xeroIntegrationsTable)
    .values({
      id: XERO_INTEGRATION_ID,
      status: 'disconnected',
    })
    .returning();

  return created;
}

export async function getXeroIntegration() {
  await ensureXeroIntegrationSchemaReady();
  const [row] = await db
    .select()
    .from(xeroIntegrationsTable)
    .where(eq(xeroIntegrationsTable.id, XERO_INTEGRATION_ID))
    .limit(1);
  return row ?? null;
}

export async function saveXeroSettings(data: {
  defaultAccountCode?: string | null;
  defaultTaxType?: string | null;
  defaultInvoiceStatus?: string | null;
  brandingThemeId?: string | null;
  brandingThemeName?: string | null;
}) {
  const integration = await ensureXeroIntegrationRow();
  const [updated] = await db
    .update(xeroIntegrationsTable)
    .set({
      defaultAccountCode: data.defaultAccountCode?.trim() || null,
      defaultTaxType: data.defaultTaxType?.trim() || null,
      defaultInvoiceStatus: (data.defaultInvoiceStatus?.trim() || 'AUTHORISED') as XeroInvoiceStatus,
      brandingThemeId: data.brandingThemeId?.trim() || null,
      brandingThemeName: data.brandingThemeName?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(xeroIntegrationsTable.id, integration.id))
    .returning();
  return updated;
}

export async function buildXeroAuthorizeUrl(state: string) {
  if (!hasCredentials()) {
    throw new Error('Xero client credentials are not configured.');
  }
  const callbackUrl = getXeroCallbackUrl();
  const search = new URLSearchParams({
    response_type: 'code',
    client_id: getClientId(),
    redirect_uri: callbackUrl,
    scope: XERO_SCOPES,
    state,
  });
  return `${XERO_AUTH_URL}?${search.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getXeroCallbackUrl(),
  });
  const response = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Xero token exchange failed (${response.status})`);
  }
  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    scope: string;
    expires_in: number;
    token_type: string;
  }>;
}

export async function fetchXeroConnections(accessToken: string) {
  const response = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Xero connections lookup failed (${response.status})`);
  }
  return response.json() as Promise<Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    tenantType: string;
  }>>;
}

export async function connectXeroAccount(data: {
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresIn: number;
  connectedBy: string;
}) {
  const integration = await ensureXeroIntegrationRow();
  const connections = await fetchXeroConnections(data.accessToken);
  const connection = connections[0];
  if (!connection) throw new Error('No Xero organisation connection was returned.');

  const tokenExpiresAt = new Date(Date.now() + Math.max(0, data.expiresIn - 60) * 1000);
  const [updated] = await db
    .update(xeroIntegrationsTable)
    .set({
      status: 'connected',
      tenantId: connection.tenantId,
      tenantName: connection.tenantName,
      connectionId: connection.id,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      scope: data.scope,
      tokenExpiresAt,
      connectedBy: data.connectedBy,
      connectedAt: new Date(),
      disconnectedAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(xeroIntegrationsTable.id, integration.id))
    .returning();

  return updated;
}

export async function disconnectXeroAccount() {
  const integration = await getXeroIntegration();
  if (!integration) return null;

  if (integration.connectionId && integration.accessToken) {
    await fetch(`${XERO_CONNECTIONS_URL}/${integration.connectionId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        Accept: 'application/json',
      },
    }).catch(() => {});
  }

  const [updated] = await db
    .update(xeroIntegrationsTable)
    .set({
      status: 'disconnected',
      tenantId: null,
      tenantName: null,
      connectionId: null,
      accessToken: null,
      refreshToken: null,
      scope: null,
      tokenExpiresAt: null,
      connectedBy: null,
      disconnectedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(xeroIntegrationsTable.id, integration.id))
    .returning();

  return updated;
}

export async function getValidAccessToken(integrationId = XERO_INTEGRATION_ID) {
  const [integration] = await db
    .select()
    .from(xeroIntegrationsTable)
    .where(eq(xeroIntegrationsTable.id, integrationId))
    .limit(1);

  if (!integration || integration.status !== 'connected' || !integration.refreshToken) {
    throw new Error('Xero is not connected.');
  }

  if (integration.accessToken && integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() > Date.now() + 120_000) {
    return integration.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: integration.refreshToken,
  });
  const response = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    await db.update(xeroIntegrationsTable).set({
      status: 'error',
      lastError: text || `Could not refresh Xero token (${response.status})`,
      updatedAt: new Date(),
    }).where(eq(xeroIntegrationsTable.id, integration.id));
    throw new Error(text || `Xero token refresh failed (${response.status})`);
  }

  const payload = await response.json() as {
    access_token: string;
    refresh_token: string;
    scope: string;
    expires_in: number;
  };

  await db.update(xeroIntegrationsTable).set({
    status: 'connected',
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    scope: payload.scope,
    tokenExpiresAt: new Date(Date.now() + Math.max(0, payload.expires_in - 60) * 1000),
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(xeroIntegrationsTable.id, integration.id));

  return payload.access_token;
}

export async function fetchBrandingThemes() {
  const response = await xeroFetch('/BrandingThemes');
  const payload = await response.json() as { BrandingThemes?: XeroBrandingTheme[] };
  return payload.BrandingThemes ?? [];
}

async function findOrCreateXeroContact(account: WholesaleAccount) {
  if (account.xeroContactId) return account.xeroContactId;

  const query = encodeURIComponent(`ContactNumber=="${account.id}"`);
  const existingResponse = await xeroFetch(`/Contacts?where=${query}`);
  const existingPayload = await existingResponse.json() as {
    Contacts?: Array<{ ContactID: string }>;
  };
  const existingContact = existingPayload.Contacts?.[0];
  if (existingContact?.ContactID) {
    await db.update(wholesaleAccountsTable).set({
      xeroContactId: existingContact.ContactID,
      updatedAt: new Date(),
    }).where(eq(wholesaleAccountsTable.id, account.id));
    return existingContact.ContactID;
  }

  const payload = {
    Contacts: [
      {
        Name: account.companyName,
        ContactNumber: account.id,
        EmailAddress: account.accountsEmail || account.email || undefined,
        TaxNumber: account.abn || undefined,
        Phones: account.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: account.phone }] : undefined,
        Addresses: account.deliveryAddress ? [{
          AddressType: 'STREET',
          AddressLine1: account.deliveryAddress,
          City: account.suburb || undefined,
          Region: account.state || undefined,
          PostalCode: account.postcode || undefined,
          Country: 'Australia',
        }] : undefined,
        ContactPersons: account.contactName ? [{
          FirstName: account.contactName,
          EmailAddress: account.email || account.accountsEmail || undefined,
        }] : undefined,
      },
    ],
  };

  const response = await xeroFetch('/Contacts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = await response.json() as {
    Contacts?: Array<{ ContactID: string }>;
  };
  const contactId = body.Contacts?.[0]?.ContactID;
  if (!contactId) throw new Error('Xero contact could not be created.');

  await db.update(wholesaleAccountsTable).set({
    xeroContactId: contactId,
    updatedAt: new Date(),
  }).where(eq(wholesaleAccountsTable.id, account.id));

  return contactId;
}

function buildInvoiceLineItems(order: WholesaleOrder, integration: Awaited<ReturnType<typeof getXeroIntegration>>) {
  const defaultAccountCode = integration?.defaultAccountCode?.trim() || '200';
  const defaultTaxType = integration?.defaultTaxType?.trim() || 'OUTPUT';
  const items = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : [];

  const lineItems = items.map((item) => {
    const quantity = Math.max(1, Number(item.qty ?? item.quantity ?? 1) || 1);
    const unitCents = Math.max(0, Number(item.unitPriceCents ?? item.unitPrice ?? 0) || 0);
    const descriptionBase = String(item.productName ?? item.name ?? 'Wholesale Item');
    const priceLabel = typeof item.priceLabel === 'string' && item.priceLabel.trim() ? ` · ${item.priceLabel.trim()}` : '';
    return {
      Description: `${descriptionBase}${priceLabel}`,
      Quantity: quantity,
      UnitAmount: Number((unitCents / 100).toFixed(2)),
      AccountCode: defaultAccountCode,
      TaxType: defaultTaxType,
    };
  });

  const lineSubtotal = items.reduce((sum, item) => {
    const total = Number(item.totalCents ?? 0) || 0;
    return sum + total;
  }, 0);
  const remainder = Math.max(0, (order.totalCents ?? 0) - lineSubtotal);
  if (remainder > 0) {
    lineItems.push({
      Description: order.deliveryType === 'delivery' ? 'Delivery Fee' : 'Order Adjustment',
      Quantity: 1,
      UnitAmount: Number((remainder / 100).toFixed(2)),
      AccountCode: defaultAccountCode,
      TaxType: defaultTaxType,
    });
  }

  return lineItems;
}

export async function createXeroInvoiceForWholesaleOrder(orderId: string) {
  await ensureXeroIntegrationSchemaReady();
  const integration = await getXeroIntegration();
  if (!integration || integration.status !== 'connected') return null;

  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId)).limit(1);
  if (!order) throw new Error('Wholesale order not found.');
  if (order.xeroInvoiceId) return order;

  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.id, order.accountId)).limit(1);
  if (!account) throw new Error('Wholesale account not found.');

  const contactId = await findOrCreateXeroContact(account);
  const invoiceDate = order.scheduledDate ? new Date(order.scheduledDate) : new Date(order.createdAt);
  const dueDate = addDays(invoiceDate, parseNetDays(account.paymentTerms));
  const payload: { Invoices: XeroInvoicePayload[] } = {
    Invoices: [
      {
        Type: 'ACCREC',
        Contact: { ContactID: contactId },
        LineItems: buildInvoiceLineItems(order, integration),
        Date: formatDateOnly(invoiceDate),
        DueDate: formatDateOnly(dueDate),
        Status: pickInvoiceStatus(order),
        Reference: order.poReference?.trim() || `Wholesale Order ${order.id.slice(0, 8).toUpperCase()}`,
        BrandingThemeID: integration.brandingThemeId || undefined,
        CurrencyCode: 'AUD',
        LineAmountTypes: 'Exclusive',
      },
    ],
  };

  const response = await xeroFetch('/Invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = await response.json() as {
    Invoices?: Array<{
      InvoiceID: string;
      InvoiceNumber?: string;
      Status?: string;
      DueDateString?: string;
      DueDate?: string;
    }>;
  };
  const invoice = body.Invoices?.[0];
  if (!invoice?.InvoiceID) {
    throw new Error('Xero invoice could not be created.');
  }

  let invoiceStatus = invoice.Status ?? 'AUTHORISED';

  if (order.isPaid) {
    await xeroFetch('/Payments', {
      method: 'POST',
      body: JSON.stringify({
        Payments: [
          {
            Invoice: { InvoiceID: invoice.InvoiceID },
            Account: { Code: integration.defaultAccountCode?.trim() || '200' },
            Date: formatDateOnly(new Date()),
            Amount: Number(((order.totalCents ?? 0) / 100).toFixed(2)),
            Reference: `Paid in app · ${order.id.slice(0, 8).toUpperCase()}`,
          },
        ],
      }),
    }).catch(() => {});
    invoiceStatus = 'PAID';
  }

  const invoiceUrl = `${getPublicBaseUrl()}/api/xero/invoice-proxy/${order.id}`;
  const [updated] = await db.update(wholesaleOrdersTable).set({
    invoiceUrl,
    invoiceNumber: invoice.InvoiceNumber ?? invoice.InvoiceID,
    invoiceStatus: normalizeXeroInvoiceStatus(invoiceStatus),
    invoiceDueDate: formatDateOnly(dueDate),
    xeroInvoiceId: invoice.InvoiceID,
    xeroInvoiceNumber: invoice.InvoiceNumber ?? invoice.InvoiceID,
    xeroInvoiceStatus: invoiceStatus,
    xeroInvoicePdfUrl: invoiceUrl,
    xeroInvoiceUpdatedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(wholesaleOrdersTable.id, order.id)).returning();

  await db.update(xeroIntegrationsTable).set({
    lastSyncAt: new Date(),
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(xeroIntegrationsTable.id, integration.id));

  return updated;
}

export async function fetchXeroInvoice(invoiceId: string) {
  const response = await xeroFetch(`/Invoices/${invoiceId}`);
  const payload = await response.json() as {
    Invoices?: Array<{
      InvoiceID: string;
      InvoiceNumber?: string;
      Status?: string;
      DueDateString?: string;
      DueDate?: string;
    }>;
  };
  return payload.Invoices?.[0] ?? null;
}

export async function syncWholesaleOrderInvoice(orderId: string) {
  await ensureXeroIntegrationSchemaReady();
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId)).limit(1);
  if (!order?.xeroInvoiceId) return order ?? null;

  const invoice = await fetchXeroInvoice(order.xeroInvoiceId).catch(() => null);
  if (!invoice) return order;

  const [updated] = await db.update(wholesaleOrdersTable).set({
    invoiceNumber: invoice.InvoiceNumber ?? order.invoiceNumber,
    invoiceStatus: normalizeXeroInvoiceStatus(invoice.Status),
    invoiceDueDate: invoice.DueDateString || invoice.DueDate || order.invoiceDueDate,
    xeroInvoiceNumber: invoice.InvoiceNumber ?? order.xeroInvoiceNumber,
    xeroInvoiceStatus: invoice.Status ?? order.xeroInvoiceStatus,
    xeroInvoiceUpdatedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(wholesaleOrdersTable.id, order.id)).returning();

  return updated;
}

export async function syncWholesaleInvoiceStatuses(orderIds: string[]) {
  const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));
  const results: Record<string, WholesaleOrder> = {};
  for (const orderId of uniqueIds.slice(0, 20)) {
    const updated = await syncWholesaleOrderInvoice(orderId).catch(() => null);
    if (updated) results[orderId] = updated;
  }
  return results;
}

export async function getInvoicePdfBuffer(invoiceId: string) {
  const integration = await getXeroIntegration();
  if (!integration || integration.status !== 'connected') {
    throw new Error('Xero is not connected.');
  }
  const tenantId = integration.tenantId ?? '';
  if (!tenantId) throw new Error('Xero tenant is not connected.');
  const token = await getValidAccessToken(integration.id);
  const response = await fetchInvoicePdfResponse(invoiceId, tenantId, token);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function buildInvoiceAccessUrl(orderId: string, token: string) {
  const base = getPublicBaseUrl();
  if (!base) throw new Error('Public app domain is not configured.');
  return `${base}/api/xero/invoice-proxy/${orderId}?token=${encodeURIComponent(token)}`;
}

export async function testXeroConnection() {
  const integration = await getXeroIntegration();
  if (!integration || integration.status !== 'connected') {
    throw new Error('Xero is not connected.');
  }
  const [connections, brandingThemes] = await Promise.all([
    fetchXeroConnections(await getValidAccessToken(integration.id)),
    fetchBrandingThemes().catch(() => []),
  ]);
  return {
    tenantName: integration.tenantName,
    tenantId: integration.tenantId,
    connected: true,
    connections,
    brandingThemes,
  };
}

export function getXeroCapabilities() {
  return {
    available: hasCredentials(),
    clientConfigured: Boolean(getClientId()),
    secretConfigured: Boolean(getClientSecret()),
  };
}

export async function markXeroError(message: string) {
  await ensureXeroIntegrationSchemaReady();
  await db.update(xeroIntegrationsTable).set({
    status: 'error',
    lastError: message,
    updatedAt: new Date(),
  }).where(eq(xeroIntegrationsTable.id, XERO_INTEGRATION_ID));
}

export async function getWholesaleOrderWithInvoice(orderId: string) {
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, orderId)).limit(1);
  if (!order) return null;
  if (!order.xeroInvoiceId) return order;
  return (await syncWholesaleOrderInvoice(orderId)) ?? order;
}

export async function getWholesaleAccountByUser(userId: string) {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, userId)).limit(1);
  return account ?? null;
}

export async function getWholesaleOrderForAccount(orderId: string, accountId: string) {
  const [order] = await db.select().from(wholesaleOrdersTable).where(and(eq(wholesaleOrdersTable.id, orderId), eq(wholesaleOrdersTable.accountId, accountId))).limit(1);
  return order ?? null;
}

export function createDefaultXeroIntegrationValues(createdBy: string) {
  return {
    id: randomUUID(),
    createdBy,
  };
}
