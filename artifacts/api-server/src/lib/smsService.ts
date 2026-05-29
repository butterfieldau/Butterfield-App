const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM        = process.env.TWILIO_FROM_NUMBER ?? process.env.TWILIO_PHONE_NUMBER;

export async function sendSms(to: string, body: string): Promise<{ success: boolean }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
    console.warn('[smsService] Twilio not configured — SMS not sent.');
    return { success: false };
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const params = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[smsService] Twilio error:', body);
      return { success: false };
    }
    return { success: true };
  } catch (e) {
    console.error('[smsService] Failed to send SMS:', e);
    return { success: false };
  }
}

export function buildPasswordResetSms(otp: string): string {
  return `Your Butterfield Cookies password reset code is: ${otp}\n\nExpires in 15 minutes. If you didn't request this, ignore this message.`;
}
