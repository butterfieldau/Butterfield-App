const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'Butterfield Cookies <onboarding@resend.dev>';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; devOtp?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY not set — email not sent. For dev, check server logs.');
    console.info(`[emailService] EMAIL TO: ${opts.to} | SUBJECT: ${opts.subject}`);
    const match = opts.html.match(/letter-spacing[^>]*>(\d{6})<\/span>/);
    if (match) console.info(`[emailService] OTP CODE: ${match[1]}`);
    return { success: false };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[emailService] Resend error:', err);
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
          <td style="background:linear-gradient(135deg,#4B72C4,#3058A8);padding:36px 40px;text-align:center;">
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
              <span style="font-size:42px;font-weight:800;color:#4B72C4;letter-spacing:12px;">${otp}</span>
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
