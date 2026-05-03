import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    // Unsupported API version — pinned for compatibility with Stripe CLI
    // @ts-expect-error — apiVersion may be newer than SDK type
    client = new Stripe(key, { apiVersion: "2025-03-31.basil" });
  }
  return client;
}
