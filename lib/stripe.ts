import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured.");
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export const priceForPlan = (plan: "plus" | "unlimited") =>
  plan === "plus" ? process.env.STRIPE_PLUS_PRICE_ID : process.env.STRIPE_UNLIMITED_PRICE_ID;

export function planForPrice(priceId?: string | null) {
  if (priceId && priceId === process.env.STRIPE_PLUS_PRICE_ID) return "plus" as const;
  if (priceId && priceId === process.env.STRIPE_UNLIMITED_PRICE_ID) return "unlimited" as const;
  return null;
}
