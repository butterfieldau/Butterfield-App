import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db, wholesaleOrdersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';
import {
  buildInvoiceAccessUrl,
  buildXeroAuthorizeUrl,
  connectXeroAccount,
  disconnectXeroAccount,
  ensureXeroIntegrationRow,
  fetchBrandingThemes,
  getInvoicePdfBuffer,
  getWholesaleAccountByUser,
  getWholesaleOrderForAccount,
  getWholesaleOrderWithInvoice,
  getXeroCapabilities,
  getXeroIntegration,
  saveXeroSettings,
  testXeroConnection,
  exchangeCodeForTokens,
} from '../lib/xero.js';
import { ensureXeroIntegrationSchemaReady } from '../lib/ensureXeroIntegrationSchemaReady.js';

const router = Router();
const AUTH_SECRET = process.env.SESSION_SECRET ?? 'butterfield-dev-only-not-for-production';
const XERO_STATE_SECRET = `${AUTH_SECRET}:xero-state`;
const XERO_INVOICE_SECRET = `${AUTH_SECRET}:xero-invoice`;

type XeroStatePayload = {
  userId: string;
  returnUrl: string;
};

function signState(payload: XeroStatePayload) {
  return jwt.sign(payload, XERO_STATE_SECRET, { expiresIn: '10m' });
}

function verifyState(state: string) {
  return jwt.verify(state, XERO_STATE_SECRET) as XeroStatePayload;
}

function signInvoiceToken(payload: { orderId: string; role: 'director' | 'manager' | 'master' | 'wholesale'; userId: string }) {
  return jwt.sign(payload, XERO_INVOICE_SECRET, { expiresIn: '15m' });
}

function verifyInvoiceToken(token: string) {
  return jwt.verify(token, XERO_INVOICE_SECRET) as { orderId: string; role: 'director' | 'manager' | 'master' | 'wholesale'; userId: string };
}

function buildRedirectHtml(target: string) {
  const safeTarget = JSON.stringify(target);
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Butterfield Xero</title>
      <script>window.location.replace(${safeTarget});</script>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px;">
      <p>Returning to Butterfield…</p>
      <p><a href=${safeTarget}>Tap here if nothing happens.</a></p>
    </body>
  </html>`;
}

router.get('/status', requireRole('director', 'manager', 'master'), requireManagerPermission('settings'), async (_req, res) => {
  await ensureXeroIntegrationSchemaReady();
  const capabilities = getXeroCapabilities();
  const integration = await ensureXeroIntegrationRow();
  const brandingThemes = integration.status === 'connected'
    ? await fetchBrandingThemes().catch(() => [])
    : [];

  return res.json({
    data: {
      ...capabilities,
      status: integration.status,
      connected: integration.status === 'connected',
      tenantId: integration.tenantId,
      tenantName: integration.tenantName,
      defaultAccountCode: integration.defaultAccountCode,
      defaultTaxType: integration.defaultTaxType,
      defaultInvoiceStatus: integration.defaultInvoiceStatus,
      brandingThemeId: integration.brandingThemeId,
      brandingThemeName: integration.brandingThemeName,
      connectedAt: integration.connectedAt,
      disconnectedAt: integration.disconnectedAt,
      lastSyncAt: integration.lastSyncAt,
      lastError: integration.lastError,
      brandingThemes,
    },
  });
});

router.post('/connect-url', requireRole('director', 'manager', 'master'), requireManagerPermission('settings'), async (req, res) => {
  await ensureXeroIntegrationSchemaReady();
  const { returnUrl } = req.body ?? {};
  const safeReturnUrl = typeof returnUrl === 'string' && returnUrl.startsWith('butterfield://')
    ? returnUrl
    : 'butterfield://xero-auth';
  const authUrl = await buildXeroAuthorizeUrl(signState({ userId: req.user!.id, returnUrl: safeReturnUrl }));
  return res.json({ data: { authUrl } });
});

router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>;
  if (!state) {
    return res.status(400).send(buildRedirectHtml('butterfield://xero-auth?status=error&message=Missing%20state'));
  }

  let decoded: XeroStatePayload;
  try {
    decoded = verifyState(state);
  } catch {
    return res.status(400).send(buildRedirectHtml('butterfield://xero-auth?status=error&message=Invalid%20state'));
  }

  if (error) {
    const message = encodeURIComponent(error_description || error || 'Xero connection failed.');
    return res.send(buildRedirectHtml(`${decoded.returnUrl}?status=error&message=${message}`));
  }

  if (!code) {
    return res.status(400).send(buildRedirectHtml(`${decoded.returnUrl}?status=error&message=Missing%20authorization%20code`));
  }

  try {
    const tokenPayload = await exchangeCodeForTokens(code);
    await connectXeroAccount({
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token,
      scope: tokenPayload.scope,
      expiresIn: tokenPayload.expires_in,
      connectedBy: decoded.userId,
    });
    return res.send(buildRedirectHtml(`${decoded.returnUrl}?status=success`));
  } catch (connectError) {
    const message = encodeURIComponent(connectError instanceof Error ? connectError.message : 'Could not connect Xero');
    return res.status(500).send(buildRedirectHtml(`${decoded.returnUrl}?status=error&message=${message}`));
  }
});

router.patch('/settings', requireRole('director', 'manager', 'master'), requireManagerPermission('settings'), async (req, res) => {
  const updated = await saveXeroSettings(req.body ?? {});
  return res.json({ data: updated });
});

router.post('/disconnect', requireRole('director', 'manager', 'master'), requireManagerPermission('settings'), async (_req, res) => {
  const updated = await disconnectXeroAccount();
  return res.json({ data: updated, success: true });
});

router.post('/test', requireRole('director', 'manager', 'master'), requireManagerPermission('settings'), async (_req, res) => {
  const result = await testXeroConnection();
  return res.json({ data: result, success: true });
});

router.get('/my-orders/:orderId/invoice-link', requireRole('wholesale'), async (req, res) => {
  await ensureXeroIntegrationSchemaReady();
  const account = await getWholesaleAccountByUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found.' });

  const order = await getWholesaleOrderForAccount(req.params.orderId, account.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!order.xeroInvoiceId) return res.status(404).json({ error: 'No Xero invoice is linked to this order.' });

  const token = signInvoiceToken({ orderId: order.id, role: 'wholesale', userId: req.user!.id });
  const url = await buildInvoiceAccessUrl(order.id, token);
  return res.json({
    data: {
      url,
      invoiceNumber: order.invoiceNumber ?? order.xeroInvoiceNumber,
      invoiceStatus: order.invoiceStatus ?? order.xeroInvoiceStatus,
    },
  });
});

router.get('/orders/:orderId/invoice-link', requireRole('director', 'manager', 'master'), requireManagerPermission('orders'), async (req, res) => {
  const order = await getWholesaleOrderWithInvoice(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!order.xeroInvoiceId) return res.status(404).json({ error: 'No Xero invoice is linked to this order.' });

  const token = signInvoiceToken({ orderId: order.id, role: req.user!.role as 'director' | 'manager' | 'master', userId: req.user!.id });
  const url = await buildInvoiceAccessUrl(order.id, token);
  return res.json({
    data: {
      url,
      invoiceNumber: order.invoiceNumber ?? order.xeroInvoiceNumber,
      invoiceStatus: order.invoiceStatus ?? order.xeroInvoiceStatus,
    },
  });
});

router.get('/invoice-proxy/:orderId', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(401).json({ error: 'Missing invoice token.' });

  let payload: { orderId: string; role: 'director' | 'manager' | 'master' | 'wholesale'; userId: string };
  try {
    payload = verifyInvoiceToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired invoice token.' });
  }

  if (payload.orderId !== req.params.orderId) {
    return res.status(403).json({ error: 'Invoice token does not match the order.' });
  }

  const order = await getWholesaleOrderWithInvoice(req.params.orderId);
  if (!order?.xeroInvoiceId) return res.status(404).json({ error: 'Invoice not found.' });

  if (payload.role === 'wholesale') {
    const account = await getWholesaleAccountByUser(payload.userId);
    if (!account || account.id !== order.accountId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } else {
    const [storedOrder] = await db.select({ id: wholesaleOrdersTable.id }).from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, order.id)).limit(1);
    if (!storedOrder) return res.status(404).json({ error: 'Order not found.' });
  }

  const pdfBuffer = await getInvoicePdfBuffer(order.xeroInvoiceId);
  const filename = `${order.invoiceNumber ?? order.xeroInvoiceNumber ?? order.id}.pdf`.replace(/[^a-z0-9._-]+/gi, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  return res.send(pdfBuffer);
});

export default router;
