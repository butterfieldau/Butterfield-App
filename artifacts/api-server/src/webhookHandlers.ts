import { getStripeSync } from './stripeClient.js';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error('STRIPE WEBHOOK ERROR: Payload must be a Buffer.');
    }
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }
}
