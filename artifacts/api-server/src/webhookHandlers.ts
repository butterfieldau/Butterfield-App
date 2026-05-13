import Stripe from "stripe";
import { getStripeClient, getStripeWebhookSigningSecret } from "./stripeClient.js";
import { logger } from "./lib/logger.js";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("STRIPE WEBHOOK ERROR: Payload must be a Buffer.");
    }

    const stripe = getStripeClient();
    const secret = getStripeWebhookSigningSecret();
    const event = stripe.webhooks.constructEvent(payload, signature, secret);

    switch (event.type) {
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
      case "charge.refunded":
        logger.info({ type: event.type, id: event.id }, "Stripe webhook received");
        break;
      default:
        logger.debug({ type: event.type, id: event.id }, "Unhandled Stripe webhook event");
        break;
    }
  }
}
