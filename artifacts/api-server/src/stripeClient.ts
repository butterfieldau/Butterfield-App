import Stripe from "stripe";

function getStripeSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is required. Set it in your Railway deployment."
    );
  }
  return secretKey;
}

function getStripeWebhookSecret(): string {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET environment variable is required for webhook verification."
    );
  }
  return webhookSecret;
}

export function getStripeClient(): Stripe {
  return new Stripe(getStripeSecretKey());
}

export function getUncachableStripeClient(): Promise<Stripe> {
  return Promise.resolve(getStripeClient());
}

export function getStripeWebhookSigningSecret(): string {
  return getStripeWebhookSecret();
}
