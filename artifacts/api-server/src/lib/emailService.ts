import { Resend } from 'resend';
// @replit/connectors-sdk — proxies Resend API with automatic auth/token refresh
import { ReplitConnectors } from '@replit/connectors-sdk';

// Replit Resend connector — fetches API key via connectors-sdk proxy each call (never cached)
async function getResendClient(): Promise<{ client: Resend; fromEmail: string } | null> {
  // Try connectors-sdk first (preferred: handles token refresh automatically)
  try {
    const connectors = new ReplitConnectors();
    const res = await connectors.proxy('resend', '/api-keys', { method: 'GET' });
    // If the proxy responds successfully, fetch the key via the v2 secrets endpoint
    // (connectors-sdk proxy doesn't surface the raw key directly; fall through to secrets fetch)
  } catch (_) {
    // connectors-sdk not available in this environment
  }

  // Fetch raw API key from the Replit connector secrets proxy
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (hostname && xReplitToken) {
    try {
      const res = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
        {
          headers: {
            'Accept': 'application/json',
            'X-Replit-Token': xReplitToken,
          },
        }
      );
      const data = await res.json() as { items?: Array<{ settings?: { api_key?: string } }> };
      const apiKey = data.items?.[0]?.settings?.api_key;
      if (apiKey) {
        const fromEmail = process.env.EMAIL_FROM ?? 'onboarding@resend.dev';
        return { client: new Resend(apiKey), fromEmail };
      }
    } catch (e) {
      console.error('[emailService] Connector proxy fetch failed:', e);
    }
  }

  // Final fallback: direct RESEND_API_KEY env var (dev/CI)
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const fromEmail = process.env.EMAIL_FROM ?? 'Butterfield Cookies <onboarding@resend.dev>';
    return { client: new Resend(apiKey), fromEmail };
  }

  return null;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean }> {
  const resend = await getResendClient();

  if (!resend) {
    console.warn('[emailService] Resend not configured — email not sent.');
    return { success: false };
  }

  try {
    const { error } = await resend.client.emails.send({
      from: resend.fromEmail,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) {
      console.error('[emailService] Resend error:', error);
      return { success: false };
    }
    return { success: true };
  } catch (e) {
    console.error('[emailService] Failed to send email:', e);
    return { success: false };
  }
}

export function buildInvoiceReminderEmail(opts: {
  companyName: string;
  contactName: string;
  invoiceNumber: string;
  totalAUD: string;
  dueDate: string;
  terms: string;
  isOverdue: boolean;
  daysOverdue?: number;
  daysRemaining?: number;
  invoiceUrl?: string;
}): string {
  const { companyName, contactName, invoiceNumber, totalAUD, dueDate, terms, isOverdue, daysOverdue, daysRemaining, invoiceUrl } = opts;
  const accent       = isOverdue ? '#DC2626' : '#1493FF';
  const badgeBg      = isOverdue ? '#FEE2E2' : '#DBEAFE';
  const badgeColor   = isOverdue ? '#991B1B' : '#1D4ED8';
  const badgeText    = isOverdue
    ? (daysOverdue ? `${daysOverdue} DAYS OVERDUE` : 'OVERDUE')
    : (daysRemaining !== undefined ? `DUE IN ${daysRemaining} DAYS` : 'PAYMENT DUE');
  const headerBg     = isOverdue ? 'linear-gradient(135deg,#DC2626,#EF4444)' : 'linear-gradient(135deg,#1A2B4A,#253B5E)';
  const heading      = isOverdue ? `Overdue invoice — action required` : `Invoice payment reminder`;
  const bodyText     = isOverdue
    ? (daysOverdue
        ? `This invoice is now <strong>${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue</strong>. Payment was due on ${dueDate} under your ${terms} terms. Please arrange payment as soon as possible to avoid any service interruption.`
        : `This invoice is now overdue. Please arrange payment as soon as possible to avoid any service interruption.`)
    : (daysRemaining !== undefined
        ? `This is a friendly reminder that the following invoice is due in <strong>${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</strong> on ${dueDate}.`
        : `This is a friendly reminder that the following invoice is due for payment on ${dueDate}.`);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F6FA;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FA;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${headerBg};padding:32px 40px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Butterfield Cookies</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">Wholesale Accounts</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#1C1C1E;">${heading}</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">Hi ${contactName},<br><br>${bodyText}</p>

            <!-- Invoice card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FB;border-radius:12px;border:1px solid #E5E7EB;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                    <div>
                      <div style="font-size:11px;font-weight:600;color:#8E8E93;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px;">Invoice Number</div>
                      <div style="font-size:18px;font-weight:700;color:#1C1C1E;">${invoiceNumber}</div>
                    </div>
                    <div style="background:${badgeBg};color:${badgeColor};font-size:11px;font-weight:700;padding:5px 12px;border-radius:20px;letter-spacing:0.5px;">${badgeText}</div>
                  </div>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;">
                        <span style="font-size:13px;color:#6B7280;">Billed to</span>
                        <span style="font-size:13px;font-weight:600;color:#1C1C1E;float:right;">${companyName}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;">
                        <span style="font-size:13px;color:#6B7280;">Payment terms</span>
                        <span style="font-size:13px;font-weight:600;color:#1C1C1E;float:right;">${terms}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;">
                        <span style="font-size:13px;color:#6B7280;">Due date</span>
                        <span style="font-size:13px;font-weight:600;color:${isOverdue ? '#DC2626' : '#1C1C1E'};float:right;">${dueDate}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:14px 0 4px;">
                        <span style="font-size:15px;font-weight:700;color:#1C1C1E;">Total amount due</span>
                        <span style="font-size:18px;font-weight:800;color:${accent};float:right;">${totalAUD}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Pay to details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-radius:12px;border:1px solid #BFDBFE;margin-bottom:28px;">
              <tr>
                <td style="padding:18px 24px;">
                  <div style="font-size:11px;font-weight:600;color:#1D4ED8;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:12px;">Pay To Details</div>
                  <div style="font-size:13px;color:#1C1C1E;line-height:1.8;">
                    <strong>Butterfield Cookies PTY LTD</strong><br>
                    BSB: 067 873 &nbsp;|&nbsp; Account: 1465 8181<br>
                    ABN: 24 680 761 166<br>
                    <span style="color:#6B7280;">Please use invoice number <strong>${invoiceNumber}</strong> as your payment reference.</span>
                  </div>
                </td>
              </tr>
            </table>

            ${invoiceUrl ? `
            <!-- View Invoice CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td align="center">
                  <a href="${invoiceUrl}" style="display:inline-block;background:${isOverdue ? '#DC2626' : '#1A2B4A'};color:#ffffff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.3px;">View Invoice →</a>
                </td>
              </tr>
            </table>` : ''}

            <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.6;">
              If you have already made payment, please disregard this reminder. For any queries, please contact your account manager.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:18px 40px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">
              Butterfield Cookies · Merrylands, Sydney NSW · ABN 24 680 761 166<br>
              This is an automated message from your account management system.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildPosReceiptEmail(opts: {
  orderNumber: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; unitPriceCents: number; variantName?: string }>;
  subtotalCents: number;
  surchargeCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string;
  loyaltyPointsEarned?: number | null;
  date: string;
}): string {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const { orderNumber, customerName, items, subtotalCents, surchargeCents, discountCents, totalCents, paymentMethod, loyaltyPointsEarned, date } = opts;

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-size:14px;color:#374151;">
        ${item.quantity}&times; ${item.name}${item.variantName ? ` <span style="color:#9CA3AF;">(${item.variantName})</span>` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #F3F4F6;font-size:14px;color:#374151;text-align:right;white-space:nowrap;">
        ${fmt(item.quantity * item.unitPriceCents)}
      </td>
    </tr>`).join('');

  const payLabel = paymentMethod === 'cash' ? 'Cash' : paymentMethod === 'eftpos' ? 'EFTPOS' : 'Split';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F6FA;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FA;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1A2B4A,#253B5E);padding:32px 40px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Butterfield Cookies</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">Cookies · Coffee · Desserts</div>
          </td>
        </tr>

        <!-- Order badge -->
        <tr>
          <td style="padding:24px 40px 0;text-align:center;">
            <div style="display:inline-block;background:#EFF6FF;border-radius:20px;padding:6px 18px;margin-bottom:4px;">
              <span style="font-size:13px;font-weight:700;color:#1D4ED8;letter-spacing:0.5px;">Order #${orderNumber}</span>
            </div>
            <p style="margin:8px 0 0;font-size:14px;color:#6B7280;">Hi ${customerName}, here is your receipt.</p>
            <p style="margin:4px 0 0;font-size:12px;color:#9CA3AF;">${date}</p>
          </td>
        </tr>

        <!-- Items -->
        <tr>
          <td style="padding:20px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:11px;font-weight:700;color:#9CA3AF;letter-spacing:0.8px;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #F3F4F6;">Item</td>
                <td style="font-size:11px;font-weight:700;color:#9CA3AF;letter-spacing:0.8px;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid #F3F4F6;text-align:right;">Price</td>
              </tr>
              ${itemRows}
            </table>
          </td>
        </tr>

        <!-- Totals -->
        <tr>
          <td style="padding:16px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;padding:14px 16px;">
              <tr>
                <td style="font-size:13px;color:#6B7280;padding:3px 0;">Subtotal</td>
                <td style="font-size:13px;color:#6B7280;text-align:right;padding:3px 0;">${fmt(subtotalCents)}</td>
              </tr>
              ${discountCents > 0 ? `
              <tr>
                <td style="font-size:13px;color:#16A34A;padding:3px 0;">Discount</td>
                <td style="font-size:13px;color:#16A34A;text-align:right;padding:3px 0;">-${fmt(discountCents)}</td>
              </tr>` : ''}
              ${surchargeCents > 0 ? `
              <tr>
                <td style="font-size:13px;color:#6B7280;padding:3px 0;">Surcharge</td>
                <td style="font-size:13px;color:#6B7280;text-align:right;padding:3px 0;">+${fmt(surchargeCents)}</td>
              </tr>` : ''}
              <tr>
                <td style="font-size:15px;font-weight:800;color:#1C1C1E;padding-top:8px;border-top:1px solid #E5E7EB;">Total</td>
                <td style="font-size:15px;font-weight:800;color:#1C1C1E;text-align:right;padding-top:8px;border-top:1px solid #E5E7EB;">${fmt(totalCents)}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#9CA3AF;padding-top:4px;">Payment</td>
                <td style="font-size:12px;color:#9CA3AF;text-align:right;padding-top:4px;">${payLabel}</td>
              </tr>
            </table>
          </td>
        </tr>

        ${loyaltyPointsEarned ? `
        <!-- Loyalty -->
        <tr>
          <td style="padding:12px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-radius:10px;padding:12px 16px;">
              <tr>
                <td style="font-size:13px;color:#1D4ED8;font-weight:600;">Points earned this order</td>
                <td style="font-size:15px;color:#1D4ED8;font-weight:800;text-align:right;">+${loyaltyPointsEarned}</td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;margin-top:24px;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;line-height:1.6;">
              Butterfield Cookies · Merrylands, Sydney NSW · ABN 24 680 761 166<br>
              Thank you for your visit!
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildOrderConfirmationEmail(opts: {
  customerName: string;
  orderNumber: string;
  shortOrderId: string;
  items: Array<{ name: string; quantity: number; isFreeReward?: boolean }>;
  totalCents: number;
  loyaltyPointsEarned: number;
  orderType: 'pickup' | 'delivery';
  scheduledFor?: string | null;
  storeName?: string | null;
  date: string;
}): string {
  const {
    customerName, orderNumber, shortOrderId, items, totalCents,
    loyaltyPointsEarned, orderType, scheduledFor, storeName, date,
  } = opts;
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const itemRows = items.filter(i => (i.quantity ?? 0) > 0).map(item => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:14px;color:#374151;">
        ${item.quantity}&times; ${item.name}${item.isFreeReward ? ' <span style="color:#16A34A;font-size:12px;font-weight:600;">(Free)</span>' : ''}
      </td>
    </tr>`).join('');

  const pickupInfo = scheduledFor
    ? `Scheduled ${orderType === 'delivery' ? 'delivery' : 'pickup'} · ${new Date(scheduledFor).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : orderType === 'delivery' ? 'Delivery order' : `Pickup${storeName ? ` · ${storeName}` : ''}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F6FA;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FA;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1493FF,#40C0F2);padding:32px 40px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Butterfield Cookies</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">Cookies · Coffee · Desserts</div>
          </td>
        </tr>

        <!-- Confirmation badge -->
        <tr>
          <td style="padding:28px 40px 0;text-align:center;">
            <div style="width:52px;height:52px;border-radius:50%;background:#DCFCE7;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <span style="font-size:26px;">✓</span>
            </div>
            <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#1C1C1E;">Order confirmed!</p>
            <p style="margin:0 0 4px;font-size:14px;color:#6B7280;">Hi ${customerName}, we've got your order.</p>
            <div style="display:inline-block;background:#EFF6FF;border-radius:20px;padding:5px 16px;margin-top:8px;">
              <span style="font-size:13px;font-weight:700;color:#1D4ED8;">Order #${orderNumber || shortOrderId}</span>
            </div>
            <p style="margin:8px 0 0;font-size:12px;color:#9CA3AF;">${date}</p>
          </td>
        </tr>

        <!-- Pickup / delivery info -->
        <tr>
          <td style="padding:16px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border-radius:10px;border:1px solid #BBF7D0;">
              <tr>
                <td style="padding:12px 16px;font-size:13px;color:#15803D;font-weight:600;">${pickupInfo}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Items -->
        <tr>
          <td style="padding:20px 40px 0;">
            <div style="font-size:11px;font-weight:700;color:#9CA3AF;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px;padding-bottom:8px;border-bottom:2px solid #F3F4F6;">Your order</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${itemRows}
            </table>
          </td>
        </tr>

        <!-- Total -->
        <tr>
          <td style="padding:12px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;padding:14px 16px;">
              <tr>
                <td style="font-size:15px;font-weight:800;color:#1C1C1E;">Total</td>
                <td style="font-size:15px;font-weight:800;color:#1C1C1E;text-align:right;">AUD ${fmt(totalCents)}</td>
              </tr>
            </table>
          </td>
        </tr>

        ${loyaltyPointsEarned > 0 ? `
        <!-- Loyalty -->
        <tr>
          <td style="padding:10px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-radius:10px;padding:12px 16px;">
              <tr>
                <td style="font-size:13px;color:#1D4ED8;font-weight:600;">Points earned this order</td>
                <td style="font-size:15px;color:#1D4ED8;font-weight:800;text-align:right;">+${loyaltyPointsEarned}</td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- Track CTA -->
        <tr>
          <td style="padding:20px 40px 0;text-align:center;">
            <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.6;">Open the <strong>Butterfield Cookies</strong> app to track your order in real time.</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;margin-top:24px;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;line-height:1.6;">
              Butterfield Cookies · Merrylands, Sydney NSW · ABN 24 680 761 166<br>
              You're receiving this because you placed an order with us.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildOrderReceiptEmail(opts: {
  customerName: string;
  orderNumber: string;
  shortOrderId: string;
  items: Array<{ name: string; quantity: number; isFreeReward?: boolean }>;
  totalCents: number;
  loyaltyPointsEarned: number;
  loyaltyPointsBalance: number;
  orderType: 'pickup' | 'delivery';
  date: string;
}): string {
  const {
    customerName, orderNumber, shortOrderId, items, totalCents,
    loyaltyPointsEarned, loyaltyPointsBalance, orderType, date,
  } = opts;
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const itemRows = items.filter(i => (i.quantity ?? 0) > 0).map(item => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:14px;color:#374151;">
        ${item.quantity}&times; ${item.name}${item.isFreeReward ? ' <span style="color:#16A34A;font-size:12px;font-weight:600;">(Free)</span>' : ''}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F6FA;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FA;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1493FF,#40C0F2);padding:32px 40px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Butterfield Cookies</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;">Cookies · Coffee · Desserts</div>
          </td>
        </tr>

        <!-- Receipt badge -->
        <tr>
          <td style="padding:28px 40px 0;text-align:center;">
            <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#1C1C1E;">Here's your receipt</p>
            <p style="margin:0 0 4px;font-size:14px;color:#6B7280;">Thanks for visiting, ${customerName}!</p>
            <div style="display:inline-block;background:#EFF6FF;border-radius:20px;padding:5px 16px;margin-top:8px;">
              <span style="font-size:13px;font-weight:700;color:#1D4ED8;">Order #${orderNumber || shortOrderId}</span>
            </div>
            <p style="margin:8px 0 0;font-size:12px;color:#9CA3AF;">${date} · ${orderType === 'delivery' ? 'Delivery' : 'Pickup'}</p>
          </td>
        </tr>

        <!-- Items -->
        <tr>
          <td style="padding:20px 40px 0;">
            <div style="font-size:11px;font-weight:700;color:#9CA3AF;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px;padding-bottom:8px;border-bottom:2px solid #F3F4F6;">Items</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${itemRows}
            </table>
          </td>
        </tr>

        <!-- Total -->
        <tr>
          <td style="padding:12px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border-radius:10px;padding:14px 16px;">
              <tr>
                <td style="font-size:15px;font-weight:800;color:#1C1C1E;">Total paid</td>
                <td style="font-size:15px;font-weight:800;color:#1C1C1E;text-align:right;">AUD ${fmt(totalCents)}</td>
              </tr>
            </table>
          </td>
        </tr>

        ${loyaltyPointsEarned > 0 || loyaltyPointsBalance > 0 ? `
        <!-- Loyalty summary -->
        <tr>
          <td style="padding:10px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border-radius:10px;padding:14px 16px;">
              ${loyaltyPointsEarned > 0 ? `
              <tr>
                <td style="font-size:13px;color:#1D4ED8;font-weight:600;padding-bottom:6px;">Earned this order</td>
                <td style="font-size:15px;color:#1D4ED8;font-weight:800;text-align:right;padding-bottom:6px;">+${loyaltyPointsEarned} pts</td>
              </tr>` : ''}
              <tr>
                <td style="font-size:13px;color:#1D4ED8;font-weight:600;border-top:1px solid #BFDBFE;padding-top:6px;">Points balance</td>
                <td style="font-size:15px;color:#1D4ED8;font-weight:800;text-align:right;border-top:1px solid #BFDBFE;padding-top:6px;">${loyaltyPointsBalance} pts</td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- Footer -->
        <tr>
          <td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;margin-top:24px;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;line-height:1.6;">
              Butterfield Cookies · Merrylands, Sydney NSW · ABN 24 680 761 166<br>
              Thank you for your visit — see you next time!
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildPasswordResetEmail(otp: string, name: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F6FA;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FA;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1493FF,#3CBBEE);padding:36px 40px;text-align:center;">
            <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Butterfield Cookies</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:6px;letter-spacing:1px;">COOKIES · COFFEE · DESSERTS</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1C1C1E;">Reset your password</p>
            <p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.6;">
              Hi ${name}, we received a request to reset your password. Enter the code below in the app to continue.
            </p>
            <div style="background:#F5F6FA;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
              <div style="font-size:12px;color:#8E8E93;letter-spacing:1px;margin-bottom:12px;text-transform:uppercase;">Your reset code</div>
              <span style="font-size:42px;font-weight:800;color:#1493FF;letter-spacing:12px;">${otp}</span>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#8E8E93;line-height:1.6;">
              This code expires in <strong>15 minutes</strong>. If you didn't request a password reset, you can safely ignore this email — your password won't change.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">
              Butterfield Cookies · Merrylands, Sydney NSW<br>
              This is an automated message, please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
