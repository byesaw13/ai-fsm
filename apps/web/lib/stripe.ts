import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client = new Stripe(key, { apiVersion: "2025-03-31.basil" as any });
  }
  return client;
}
