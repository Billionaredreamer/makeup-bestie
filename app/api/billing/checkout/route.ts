import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe, priceForPlan } from "@/lib/stripe";

function isMissingStripeCustomer(error: unknown) {
  return error instanceof Stripe.errors.StripeInvalidRequestError
    && error.code === "resource_missing";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return NextResponse.json({ error: "Sign in before choosing a plan." }, { status: 401 });
  const body = await request.json();
  const plan = body.plan === "unlimited" ? "unlimited" : body.plan === "plus" ? "plus" : null;
  if (!plan) return NextResponse.json({ error: "Choose a valid Makeup Bestie plan." }, { status: 400 });
  const price = priceForPlan(plan);
  if (!price) return NextResponse.json({ error: "This subscription plan is not configured yet." }, { status: 503 });

  try {
    const admin = createSupabaseAdminClient();
    const stripe = getStripe();
    const { data: existing, error: subscriptionError } = await admin.from("subscriptions").select("stripe_customer_id,status").eq("user_id",auth.user.id).maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (existing && ["active","trialing","past_due"].includes(existing.status)) {
      return NextResponse.json({ error: "You already have a subscription. Manage it from your profile." }, { status: 409 });
    }
    let customerId = existing?.stripe_customer_id as string | undefined;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if ("deleted" in customer && customer.deleted) customerId = undefined;
      } catch (error) {
        if (!isMissingStripeCustomer(error)) throw error;
        customerId = undefined;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({ email: auth.user.email, metadata: { user_id: auth.user.id } });
      customerId = customer.id;
      const { error: saveCustomerError } = await admin.from("subscriptions").upsert(
        { user_id: auth.user.id, stripe_customer_id: customerId, status: "inactive" },
        { onConflict: "user_id" },
      );
      if (saveCustomerError) throw saveCustomerError;
    }
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer: customerId, client_reference_id: auth.user.id,
      integration_identifier: "makeup_bestie_qnrzwtkp",
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/?checkout=success`, cancel_url: `${origin}/?checkout=cancelled`,
      metadata: { user_id: auth.user.id, plan },
      subscription_data: { metadata: { user_id: auth.user.id, plan } },
    });
    if (!session.url) return NextResponse.json({ error: "Checkout could not be opened." }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout session creation failed:", error instanceof Error ? error.message : "Unknown billing error");
    return NextResponse.json({ error: "Secure checkout is temporarily unavailable. Please try again shortly." }, { status: 502 });
  }
}
