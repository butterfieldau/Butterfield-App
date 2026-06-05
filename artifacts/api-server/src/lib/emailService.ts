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
