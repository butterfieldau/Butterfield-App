import { Resend } from 'resend';

// Replit Resend connector — fetches API key from the connector proxy each call (never cached)
async function getResendClient(): Promise<{ client: Resend; fromEmail: string } | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    // Connector not available — fall back to direct RESEND_API_KEY env var if set
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    const fromEmail = process.env.EMAIL_FROM ?? 'Butterfield Cookies <onboarding@resend.dev>';
    return { client: new Resend(apiKey), fromEmail };
  }

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
    const data = await res.json() as { items?: Array<{ settings?: { api_key?: string; from_email?: string } }> };
    const settings = data.items?.[0]?.settings;
    if (!settings?.api_key) return null;
    // Always use onboarding@resend.dev until butterfieldcookies.com.au is verified in Resend dashboard
    // Once verified, set EMAIL_FROM env var e.g. "Butterfield Cookies <noreply@butterfieldcookies.com.au>"
    const fromEmail = process.env.EMAIL_FROM ?? 'onboarding@resend.dev';
    return { client: new Resend(settings.api_key), fromEmail };
  } catch (e) {
    console.error('[emailService] Failed to fetch Resend credentials:', e);
    return null;
  }
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
}): string {
  const { companyName, contactName, invoiceNumber, totalAUD, dueDate, terms, isOverdue } = opts;
  const accent       = isOverdue ? '#DC2626' : '#1493FF';
  const badgeBg      = isOverdue ? '#FEE2E2' : '#DBEAFE';
  const badgeColor   = isOverdue ? '#991B1B' : '#1D4ED8';
  const badgeText    = isOverdue ? 'OVERDUE' : 'PAYMENT DUE';
  const headerBg     = isOverdue ? 'linear-gradient(135deg,#DC2626,#EF4444)' : 'linear-gradient(135deg,#1A2B4A,#253B5E)';
  const heading      = isOverdue ? `Overdue invoice — action required` : `Invoice payment reminder`;
  const bodyText     = isOverdue
    ? `This invoice is now overdue. Please arrange payment as soon as possible to avoid any service interruption.`
    : `This is a friendly reminder that the following invoice is due for payment.`;

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
