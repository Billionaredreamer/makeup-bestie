import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, planForPrice } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const periodEnd = (subscription: Stripe.Subscription) => {
  const item = subscription.items.data[0] as Stripe.SubscriptionItem & { current_period_end?: number };
  const legacy = subscription as Stripe.Subscription & { current_period_end?: number };
  return item?.current_period_end || legacy.current_period_end || null;
};

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const admin = createSupabaseAdminClient();
  const { data: existing, error: lookupError } = await admin.from("subscriptions").select("user_id,plan").eq("stripe_customer_id",customerId).maybeSingle();
  if (lookupError) throw lookupError;
  const userId = subscription.metadata.user_id || existing?.user_id;
  // Ignore subscriptions that do not belong to Makeup Bestie rather than
  // attaching an unrelated Stripe customer to an account.
  if (!userId) return false;
  const priceId = subscription.items.data[0]?.price.id || null;
  const plan = planForPrice(priceId) || subscription.metadata.plan || existing?.plan || null;
  if (plan !== "plus" && plan !== "unlimited") throw new Error("The subscription price is not mapped to a Makeup Bestie plan.");
  const { error } = await admin.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    price_id: priceId,
    plan,
    status: subscription.status,
    current_period_end: periodEnd(subscription) ? new Date(periodEnd(subscription)! * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
  return true;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "Webhook verification is not configured." }, { status: 503 });
  let event: Stripe.Event;
  try { event = getStripe().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 }); }
  try {
    if (["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subscription = typeof session.subscription === "string" ? await getStripe().subscriptions.retrieve(session.subscription) : session.subscription;
        await syncSubscription(subscription);
      }
    }
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ error: "Webhook processing failed and will be retried." }, { status: 500 }); }
}
