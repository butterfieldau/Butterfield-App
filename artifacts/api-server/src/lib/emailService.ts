// @replit/connectors-sdk — proxies Resend API with automatic auth/token refresh
import { ReplitConnectors } from '@replit/connectors-sdk';
import { Resend } from 'resend';

const FALLBACK_FROM = 'Butterfield Cookies <onboarding@resend.dev>';

/** Fetch the verified from_email configured in the Resend connector settings. */
async function getConnectorFromEmail(): Promise<string | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;
  if (!hostname || !xReplitToken) return null;
  try {
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set('include_secrets', 'true');
    url.searchParams.set('connector_names', 'resend');
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'X-Replit-Token': xReplitToken },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { items?: Array<{ settings?: { from_email?: string } }> };
    return data.items?.[0]?.settings?.from_email ?? null;
  } catch {
    return null;
  }
}

interface EmailAttachment {
  filename: string;
  content:  Buffer | string;
  contentType?: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean }> {
  // Connector from_email is authoritative when using the proxy; env var is for the SDK fallback.
  const connectorFrom = await getConnectorFromEmail();

  // ── Primary: Replit Resend connector proxy (handles auth/token refresh automatically) ──
  // connectors.proxy() returns a Fetch Response — must check .ok and parse .json().
  // Only fall through to the SDK path when the connector is entirely unavailable (ENOTFOUND /
  // thrown exception), NOT when the connector responds with an HTTP error (that is a real failure).
  let connectorUnavailable = false;
  try {
    const fromEmail = connectorFrom ?? process.env.EMAIL_FROM ?? FALLBACK_FROM;
    const connectors = new ReplitConnectors();
    const body: Record<string, unknown> = {
      from: fromEmail,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.text) body.text = opts.text;
    if (opts.attachments && opts.attachments.length > 0) {
      body.attachments = opts.attachments.map(a => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content)
          ? a.content.toString('base64')
          : (typeof a.content === 'string' ? a.content : String(a.content)),
        ...(a.contentType ? { type: a.contentType } : {}),
      }));
    }
    const response = await connectors.proxy('resend', '/emails', {
      method: 'POST',
      body,
    }) as unknown as Response;

    let data: Record<string, unknown> = {};
    try { data = await response.json() as Record<string, unknown>; } catch { /* non-JSON body */ }

    if (response.ok && data && 'id' in data) {
      return { success: true };
    }
    // HTTP error from Resend (e.g. 403 bad sender, 422 invalid payload) — real failure, do not fall through.
    console.error('[emailService] Resend connector HTTP error', response.status, data);
    return { success: false };
  } catch (connectorErr: any) {
    // Connector infrastructure not reachable — fall through to RESEND_API_KEY SDK path.
    connectorUnavailable = true;
    const msg: string = connectorErr?.message ?? '';
    if (!msg.includes('ENOTFOUND') && !msg.includes('not connected') && !msg.includes('not found')) {
      console.error('[emailService] Resend connector proxy threw:', msg || connectorErr);
    }
  }

  // ── Fallback: direct RESEND_API_KEY env var (local dev / CI only) ─────────
  if (!connectorUnavailable) return { success: false };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[emailService] Resend not configured — email not sent (no connector or RESEND_API_KEY).');
    return { success: false };
  }
  try {
    const fromEmail = process.env.EMAIL_FROM ?? FALLBACK_FROM;
    const client = new Resend(apiKey);
    const { error } = await client.emails.send({
      from: fromEmail,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(opts.attachments && opts.attachments.length > 0
        ? { attachments: opts.attachments.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType })) }
        : {}),
    });
    if (error) {
      console.error('[emailService] Resend SDK error:', error);
      return { success: false };
    }
    return { success: true };
  } catch (e) {
    console.error('[emailService] Resend SDK send failed:', e);
    return { success: false };
  }
}

// ── Wholesale invoice email (used for initial send + revised resend) ──────────
export interface WholesaleInvoiceEmailOpts {
  invoiceNumber: string;
  status: string;
  invoiceDate: Date | string;
  dueDate: Date | string;
  paymentTerms: string;
  companyName: string;
  abn: string | null | undefined;
  email: string | null | undefined;
  items: Array<{ description: string; qty: number; unitCents: number }>;
  totalCents: number;
  deliveryFeeCents?: number;
  poReference: string | null | undefined;
  notes: string | null | undefined;
  isRevised?: boolean;
  logoUrl?: string;
}

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
}

function fmtEmailDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function buildWholesaleInvoiceEmail(opts: WholesaleInvoiceEmailOpts): string {
  const {
    invoiceNumber, status, invoiceDate, dueDate, paymentTerms,
    companyName, abn, email, items, totalCents, deliveryFeeCents = 0,
    poReference, notes, isRevised = false, logoUrl,
  } = opts;

  const subtotalCents = items.reduce((s, i) => s + i.qty * i.unitCents, 0) + deliveryFeeCents;
  const gstCents      = Math.round(subtotalCents / 11);
  const exclGstCents  = subtotalCents - gstCents;
  const total         = totalCents || subtotalCents;

  const statusMap: Record<string, { bg: string; color: string }> = {
    paid:      { bg: 'rgba(16,185,129,0.18)', color: '#D1FAE5' },
    overdue:   { bg: 'rgba(220,38,38,0.18)',  color: '#FEE2E2' },
    draft:     { bg: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)' },
    revised:   { bg: 'rgba(47,128,237,0.22)', color: '#BFDBFE' },
    pending:   { bg: 'rgba(245,158,11,0.18)', color: '#FDE68A' },
  };
  const sc = statusMap[(status ?? 'draft').toLowerCase()] ?? statusMap['draft'];
  const statusLabel = isRevised ? 'REVISED' : (status ?? 'INVOICE').toUpperCase();

  const itemRows = items.map(i => {
    const lineTotal = i.qty * i.unitCents;
    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #E4E8F0;vertical-align:top;">
          <div style="color:#172033;font-size:16px;font-weight:800;font-family:Arial,sans-serif;">${i.description}</div>
          <div style="color:#7A8496;font-size:14px;margin-top:4px;font-family:Arial,sans-serif;">Qty ${i.qty} × ${fmtCents(i.unitCents)}</div>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #E4E8F0;text-align:right;vertical-align:top;">
          <div style="color:#172033;font-size:16px;font-weight:800;font-family:Arial,sans-serif;">${fmtCents(lineTotal)}</div>
        </td>
      </tr>`;
  }).join('');

  const CARD  = 'background:#ffffff;border:1px solid #E4E8F0;border-radius:24px;padding:24px 28px;';
  const LABEL = 'color:#7A8496;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-family:Arial,sans-serif;';
  const VALUE = 'color:#172033;font-size:14px;font-weight:800;font-family:Arial,sans-serif;';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${invoiceNumber}</title>
  <style>
    @media only screen and (max-width:600px){
      .wrapper{padding:12px !important;}
      .card{border-radius:18px !important;padding:18px !important;}
      .total-amount{font-size:38px !important;}
      .detail-grid td{display:block;width:100% !important;padding-right:0 !important;margin-bottom:10px;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F6F8FB;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FB;">
<tr><td align="center" class="wrapper" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

  <!-- Header card -->
  <tr><td style="background:#12213A;border-radius:24px;padding:24px 28px;" class="card">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;font-family:Arial,sans-serif;">Butterfield</div>
        <div style="color:rgba(255,255,255,0.6);font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-top:8px;font-family:Arial,sans-serif;">Cookies · Coffee · Desserts</div>
      </td>
      <td align="right" valign="top">
        <span style="background:${sc.bg};color:${sc.color};font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:7px 14px;border-radius:999px;font-family:Arial,sans-serif;">${statusLabel}</span>
      </td>
    </tr></table>
  </td></tr>

  <tr><td height="16"></td></tr>

  <!-- Total due card -->
  <tr><td style="${CARD}" class="card">
    <div style="color:#7A8496;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;font-family:Arial,sans-serif;">Total Due</div>
    <div class="total-amount" style="color:#12213A;font-size:44px;font-weight:900;letter-spacing:-1.5px;margin-top:8px;font-family:Arial,sans-serif;">${fmtCents(total)}</div>
    <div style="color:#2F80ED;font-size:15px;font-weight:700;margin-top:6px;font-family:Arial,sans-serif;">${invoiceNumber}</div>
  </td></tr>

  <tr><td height="16"></td></tr>

  <!-- Billed To -->
  <tr><td style="${CARD}" class="card">
    <div style="color:#12213A;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:14px;font-family:Arial,sans-serif;">Billed To</div>
    <div style="color:#172033;font-size:19px;font-weight:800;margin-bottom:8px;font-family:Arial,sans-serif;">${companyName}</div>
    ${abn ? `<div style="color:#7A8496;font-size:14px;font-family:Arial,sans-serif;">ABN: ${abn}</div>` : ''}
    ${email ? `<div style="color:#2F80ED;font-size:14px;font-weight:600;margin-top:6px;font-family:Arial,sans-serif;">${email}</div>` : ''}
  </td></tr>

  <tr><td height="16"></td></tr>

  <!-- Invoice details (single card with separators) -->
  <tr><td style="${CARD}" class="card">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:0 0 14px;vertical-align:top;">
          <div style="${LABEL}">Issue Date</div>
          <div style="${VALUE}font-size:15px;">${fmtEmailDate(invoiceDate)}</div>
        </td>
      </tr>
      <tr><td style="padding:0;"><div style="height:1px;background:#E4E8F0;margin-bottom:14px;"></div></td></tr>
      <tr>
        <td style="padding:0 0 14px;vertical-align:top;">
          <div style="${LABEL}">Due Date</div>
          <div style="${VALUE}font-size:15px;">${fmtEmailDate(dueDate)}</div>
        </td>
      </tr>
      <tr><td style="padding:0;"><div style="height:1px;background:#E4E8F0;margin-bottom:14px;"></div></td></tr>
      <tr>
        <td style="padding:0;vertical-align:top;">
          <div style="${LABEL}">Terms</div>
          <div style="${VALUE}font-size:15px;">${paymentTerms}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td height="16"></td></tr>

  <!-- Order summary -->
  <tr><td style="${CARD}" class="card">
    <div style="color:#12213A;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:4px;font-family:Arial,sans-serif;">Order Summary</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${itemRows}
    </table>
  </td></tr>

  <tr><td height="16"></td></tr>

  <!-- Totals -->
  <tr><td style="${CARD}" class="card">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="color:#7A8496;font-size:15px;font-weight:600;padding:9px 0;font-family:Arial,sans-serif;">Subtotal excl. GST</td>
        <td style="color:#172033;font-size:15px;font-weight:800;text-align:right;padding:9px 0;font-family:Arial,sans-serif;">${fmtCents(exclGstCents)}</td>
      </tr>
      <tr>
        <td style="color:#7A8496;font-size:15px;font-weight:600;padding:9px 0;font-family:Arial,sans-serif;">GST 10%</td>
        <td style="color:#172033;font-size:15px;font-weight:800;text-align:right;padding:9px 0;font-family:Arial,sans-serif;">${fmtCents(gstCents)}</td>
      </tr>
      ${deliveryFeeCents > 0 ? `<tr>
        <td style="color:#7A8496;font-size:15px;font-weight:600;padding:9px 0;font-family:Arial,sans-serif;">Delivery fee</td>
        <td style="color:#172033;font-size:15px;font-weight:800;text-align:right;padding:9px 0;font-family:Arial,sans-serif;">${fmtCents(deliveryFeeCents)}</td>
      </tr>` : ''}
      <tr><td colspan="2" style="padding:0;"><div style="height:1px;background:#E4E8F0;margin:8px 0;"></div></td></tr>
      <tr>
        <td style="color:#12213A;font-size:18px;font-weight:900;padding:8px 0;font-family:Arial,sans-serif;">Total Due</td>
        <td style="color:#12213A;font-size:26px;font-weight:900;letter-spacing:-0.5px;text-align:right;padding:8px 0;font-family:Arial,sans-serif;">${fmtCents(total)}</td>
      </tr>
    </table>
  </td></tr>

  <tr><td height="16"></td></tr>

  <!-- Bank details -->
  <tr><td style="background:#12213A;border-radius:24px;padding:24px 28px;" class="card">
    <div style="color:#ffffff;font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:18px;font-family:Arial,sans-serif;">Bank Transfer</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:14px;vertical-align:top;">
          <div style="color:rgba(255,255,255,0.55);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;font-family:Arial,sans-serif;">Account Name</div>
          <div style="color:#ffffff;font-size:16px;font-weight:800;font-family:Arial,sans-serif;">Butterfield Cookies PTY LTD</div>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:14px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="width:50%;vertical-align:top;">
              <div style="color:rgba(255,255,255,0.55);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;font-family:Arial,sans-serif;">BSB</div>
              <div style="color:#ffffff;font-size:16px;font-weight:800;font-family:Arial,sans-serif;">067 873</div>
            </td>
            <td style="width:50%;vertical-align:top;">
              <div style="color:rgba(255,255,255,0.55);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;font-family:Arial,sans-serif;">Account Number</div>
              <div style="color:#ffffff;font-size:16px;font-weight:800;font-family:Arial,sans-serif;">1465 8181</div>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr><td>
        <div style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.16);border-radius:16px;padding:16px 18px;margin-top:4px;">
          <div style="color:rgba(255,255,255,0.55);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-family:Arial,sans-serif;">Payment Reference</div>
          <div style="color:#ffffff;font-size:20px;font-weight:900;letter-spacing:-0.3px;font-family:Arial,sans-serif;">${invoiceNumber}</div>
        </div>
      </td></tr>
    </table>
  </td></tr>

  ${notes ? `
  <tr><td height="16"></td></tr>
  <tr><td style="background:#FFF8E8;border:1px solid #F0D99A;border-radius:24px;padding:24px 28px;" class="card">
    <div style="color:#9B5D18;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-family:Arial,sans-serif;">Notes</div>
    <div style="color:#6F4212;font-size:15px;font-weight:700;font-family:Arial,sans-serif;">${notes}</div>
  </td></tr>` : ''}

  ${poReference ? `
  <tr><td height="16"></td></tr>
  <tr><td style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:24px;padding:24px 28px;" class="card">
    <div style="color:#1E40AF;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-family:Arial,sans-serif;">PO Reference</div>
    <div style="color:#1E3A8A;font-size:15px;font-weight:800;font-family:Arial,sans-serif;">${poReference}</div>
  </td></tr>` : ''}

  <tr><td height="32"></td></tr>

  <!-- Footer -->
  <tr><td style="text-align:center;padding:0 10px 8px;">
    <div style="color:#12213A;font-size:16px;font-weight:900;margin-bottom:10px;font-family:Arial,sans-serif;">Butterfield Cookies PTY LTD</div>
    <div style="color:#7A8496;font-size:13px;line-height:22px;font-family:Arial,sans-serif;">2 Main Lane, Merrylands NSW 2160</div>
    <div style="color:#7A8496;font-size:13px;line-height:22px;font-family:Arial,sans-serif;">ABN: 24 680 761 166</div>
    <div style="margin:4px 0;"><a href="mailto:accounts@butterfieldcookies.com.au" style="color:#2F80ED;font-size:13px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;">accounts@butterfieldcookies.com.au</a></div>
    <div style="color:#7A8496;font-size:13px;line-height:22px;font-family:Arial,sans-serif;">0480 769 995</div>
    <div style="color:#172033;font-size:14px;font-weight:700;margin-top:18px;font-family:Arial,sans-serif;">Thank you for your continued partnership.</div>
  </td></tr>

  <tr><td height="24"></td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
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
  items: Array<{ name: string; quantity: number; isFreeReward?: boolean; unitPriceCents?: number; lineCents?: number }>;
  totalCents: number;
  loyaltyPointsEarned: number;
  rewardSavingsCents?: number | null;
  rewardName?: string | null;
  orderType: 'pickup' | 'delivery';
  scheduledFor?: string | null;
  storeName?: string | null;
  date: string;
  trackingUrl?: string | null;
  paymentMethodType?: string | null;
}): string {
  const {
    customerName, orderNumber, shortOrderId, items, totalCents,
    loyaltyPointsEarned, rewardSavingsCents, rewardName,
    orderType, scheduledFor, storeName, date, trackingUrl,
    paymentMethodType,
  } = opts;
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const hasPrices = items.some(i => (i.lineCents ?? 0) > 0 || (i.unitPriceCents ?? 0) > 0);

  const itemRows = items.filter(i => (i.quantity ?? 0) > 0).map(item => {
    const rowPrice = hasPrices
      ? `<td style="padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:14px;color:#6B7280;text-align:right;white-space:nowrap;">${item.isFreeReward ? '<span style="color:#16A34A;font-weight:600;">Free</span>' : item.lineCents ? fmt(item.lineCents) : ''}</td>`
      : '';
    return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:14px;color:#374151;">
        ${item.quantity}&times; ${item.name}${item.isFreeReward && !hasPrices ? ' <span style="color:#16A34A;font-size:12px;font-weight:600;">(Free)</span>' : ''}
      </td>
      ${rowPrice}
    </tr>`;
  }).join('');

  const isPayAtPickup = paymentMethodType === 'pay_at_pickup';
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
        <!-- Loyalty points earned -->
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

        ${rewardSavingsCents && rewardSavingsCents > 0 ? `
        <!-- Reward savings -->
        <tr>
          <td style="padding:8px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border-radius:10px;border:1px solid #BBF7D0;padding:12px 16px;">
              <tr>
                <td style="font-size:13px;color:#15803D;font-weight:600;">You saved with ${rewardName ?? 'your reward'}</td>
                <td style="font-size:15px;color:#15803D;font-weight:800;text-align:right;">-${fmt(rewardSavingsCents)}</td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        ${isPayAtPickup ? `
        <!-- Pay at pickup notice -->
        <tr>
          <td style="padding:10px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;border-radius:10px;border:1px solid #FED7AA;">
              <tr>
                <td style="padding:12px 16px;font-size:13px;color:#C2410C;font-weight:600;">💳 Pay at pickup — please have your payment ready when you collect your order.</td>
              </tr>
            </table>
          </td>
        </tr>` : ''}

        <!-- Track CTA -->
        <tr>
          <td style="padding:20px 40px 0;text-align:center;">
            <a href="${trackingUrl || 'https://apps.apple.com/au/app/butterfield-cookies/id6748634016'}"
               style="display:inline-block;background:#D20001;color:#ffffff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.3px;">
              Track your order →
            </a>
            <p style="margin:10px 0 0;font-size:12px;color:#9CA3AF;">Open in the Butterfield Cookies app to follow your order live.</p>
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
  items: Array<{ name: string; quantity: number; isFreeReward?: boolean; unitPriceCents?: number; lineCents?: number }>;
  totalCents: number;
  loyaltyPointsEarned: number;
  loyaltyPointsBalance: number;
  orderType: 'pickup' | 'delivery';
  scheduledFor?: string | null;
  storeName?: string | null;
  date: string;
  orderUrl?: string | null;
}): string {
  const {
    customerName, orderNumber, shortOrderId, items, totalCents,
    loyaltyPointsEarned, loyaltyPointsBalance, orderType, scheduledFor,
    storeName, date, orderUrl,
  } = opts;
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const hasPrices = items.some(i => (i.lineCents ?? 0) > 0 || (i.unitPriceCents ?? 0) > 0);

  const itemRows = items.filter(i => (i.quantity ?? 0) > 0).map(item => {
    const rowPrice = hasPrices
      ? `<td style="padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:14px;color:#6B7280;text-align:right;white-space:nowrap;">${item.isFreeReward ? '<span style="color:#16A34A;font-weight:600;">Free</span>' : item.lineCents ? fmt(item.lineCents) : ''}</td>`
      : '';
    return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:14px;color:#374151;">
        ${item.quantity}&times; ${item.name}${item.isFreeReward && !hasPrices ? ' <span style="color:#16A34A;font-size:12px;font-weight:600;">(Free)</span>' : ''}
      </td>
      ${rowPrice}
    </tr>`;
  }).join('');

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
            <p style="margin:8px 0 0;font-size:12px;color:#9CA3AF;">${date}</p>
          </td>
        </tr>

        <!-- Fulfillment info -->
        <tr>
          <td style="padding:16px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border-radius:10px;border:1px solid #BBF7D0;">
              <tr>
                <td style="padding:12px 16px;font-size:13px;color:#15803D;font-weight:600;">${
                  scheduledFor
                    ? `Scheduled ${orderType === 'delivery' ? 'delivery' : 'pickup'} · ${new Date(scheduledFor).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                    : orderType === 'delivery' ? 'Delivery order' : `Pickup${storeName ? ` · ${storeName}` : ''}`
                }</td>
              </tr>
            </table>
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

        <!-- View order CTA -->
        <tr>
          <td style="padding:20px 40px 0;text-align:center;">
            <a href="${orderUrl || 'https://apps.apple.com/au/app/butterfield-cookies/id6748634016'}"
               style="display:inline-block;background:#D20001;color:#ffffff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.3px;">
              View your order →
            </a>
            <p style="margin:10px 0 0;font-size:12px;color:#9CA3AF;">Open in the Butterfield Cookies app.</p>
          </td>
        </tr>

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
