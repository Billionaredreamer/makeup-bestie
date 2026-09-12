import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionPlan } from "@/lib/account-types";
import { subscriptionRecordIsActive } from "@/lib/onboarding-flow";

export const runtime = "nodejs";

// RevenueCat webhook: Project settings → Integrations → Webhooks in the
// RevenueCat dashboard. Set the URL to
// https://www.makeupbestie.app/api/billing/revenuecat-webhook and the
// "Authorization header value" to the same string as
// REVENUECAT_WEBHOOK_SECRET below (RevenueCat sends it verbatim as the
// Authorization header — this is a shared secret, not a signature).
//
// This mirrors app/api/billing/webhook/route.ts (the Stripe webhook) but
// writes rows with source = 'apple' and never touches Stripe columns, so
// web subscriptions are completely unaffected.

type RevenueCatEvent = {
  type: string;
  app_user_id?: string;
  id?: string;
  event_timestamp_ms?: number;
  original_transaction_id?: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number | null;
  environment?: "SANDBOX" | "PRODUCTION";
  transferred_from?: string[];
  transferred_to?: string[];
};

const ACTIVE_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "NON_RENEWING_PURCHASE", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT"]);
const CANCELED_EVENTS = new Set(["CANCELLATION"]);
const EXPIRED_EVENTS = new Set(["EXPIRATION"]);
const BILLING_ISSUE_EVENTS = new Set(["BILLING_ISSUE"]);

function planFromEntitlements(entitlementIds: string[] | undefined): SubscriptionPlan | null {
  if (!entitlementIds) return null;
  if (entitlementIds.includes("unlimited")) return "unlimited";
  if (entitlementIds.includes("plus")) return "plus";
  return null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const provided = request.headers.get("authorization");
  if (!secret) return NextResponse.json({ error: "Webhook verification is not configured." }, { status: 503 });
  if (provided !== secret && provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Invalid webhook credentials." }, { status: 401 });
  }

  let body: { event?: RevenueCatEvent };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const event = body.event;
  if (!event?.type) return NextResponse.json({ received: true });

  // Sandbox events from TestFlight/App Review testing should not overwrite
  // a real subscriber's row in production.
  if (process.env.NODE_ENV === "production" && event.environment === "SANDBOX" && process.env.REVENUECAT_ACCEPT_SANDBOX !== "true") {
    return NextResponse.json({ received: true, skipped: "sandbox" });
  }

  const userId = event.app_user_id || event.transferred_to?.find(value => uuidPattern.test(value));
  const plan = planFromEntitlements(event.entitlement_ids);

  try {
    const admin = createSupabaseAdminClient();

    if (event.type === "TRANSFER") {
      if (!userId || !event.transferred_from?.length) {
        console.warn("RevenueCat TRANSFER could not be mapped to a Supabase user.");
        return NextResponse.json({ received: true, skipped: "unmapped-transfer" });
      }
      const { data: previous, error: previousError } = await admin.from("subscriptions").select("user_id,plan,status,current_period_end,cancel_at_period_end,apple_original_transaction_id").eq("source", "apple").in("revenuecat_app_user_id", event.transferred_from).maybeSingle();
      if (previousError) throw previousError;
      if (!previous) {
        console.warn("RevenueCat TRANSFER had no existing Apple subscription to move.");
        return NextResponse.json({ received: true, skipped: "missing-transfer-source" });
      }
      const { data: destination } = await admin.from("subscriptions").select("source,status,current_period_end,stripe_customer_id").eq("user_id", userId).maybeSingle();
      if ((destination?.source === "stripe" || destination?.stripe_customer_id) && subscriptionRecordIsActive(destination)) {
        console.warn("RevenueCat TRANSFER was not allowed to replace an active Stripe subscription.");
        return NextResponse.json({ received: true, skipped: "active-stripe" });
      }
      const { error: transferError } = await admin.from("subscriptions").upsert({ ...previous, user_id:userId, source:"apple", revenuecat_app_user_id:userId, updated_at:new Date().toISOString() }, { onConflict:"user_id" });
      if (transferError) throw transferError;
      if (previous.user_id !== userId) await admin.from("subscriptions").delete().eq("user_id", previous.user_id).eq("source", "apple");
      return NextResponse.json({ received: true });
    }

    if (!userId) {
      console.warn(`RevenueCat ${event.type} event had no usable app user id.`);
      return NextResponse.json({ received: true, skipped: "missing-user" });
    }

    const { data: existing, error: existingError } = await admin.from("subscriptions").select("source,status,current_period_end,updated_at,stripe_customer_id").eq("user_id", userId).maybeSingle();
    if (existingError) throw existingError;
    const eventTime = event.event_timestamp_ms ? new Date(event.event_timestamp_ms) : new Date();
    if (event.event_timestamp_ms && existing?.updated_at && new Date(existing.updated_at).getTime() >= event.event_timestamp_ms) {
      return NextResponse.json({ received: true, skipped: "stale-event" });
    }
    if ((existing?.source === "stripe" || existing?.stripe_customer_id) && subscriptionRecordIsActive(existing)) {
      console.warn(`RevenueCat ${event.type} was not allowed to replace an active Stripe subscription.`);
      return NextResponse.json({ received: true, skipped: "active-stripe" });
    }

    if (ACTIVE_EVENTS.has(event.type)) {
      if (plan !== "plus" && plan !== "unlimited") {
        console.warn(`RevenueCat ${event.type} event had no recognized Makeup Bestie entitlement.`);
        return NextResponse.json({ received: true, skipped: "unknown-entitlement" });
      }
      const { error } = await admin.from("subscriptions").upsert(
        {
          user_id: userId,
          source: "apple",
          revenuecat_app_user_id: userId,
          apple_original_transaction_id: event.original_transaction_id ?? null,
          plan,
          status: "active",
          current_period_end: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
          cancel_at_period_end: false,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          price_id: null,
          updated_at: eventTime.toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    } else if (CANCELED_EVENTS.has(event.type)) {
      // Apple subscriptions stay entitled until current_period_end even
      // after cancellation, so only flag it — do not deactivate yet.
      const { error } = await admin
        .from("subscriptions")
        .update({ cancel_at_period_end: true, updated_at: eventTime.toISOString() })
        .eq("user_id", userId)
        .eq("source", "apple");
      if (error) throw error;
    } else if (EXPIRED_EVENTS.has(event.type)) {
      const { error } = await admin
        .from("subscriptions")
        .update({ status: "expired", updated_at: eventTime.toISOString() })
        .eq("user_id", userId)
        .eq("source", "apple");
      if (error) throw error;
    } else if (BILLING_ISSUE_EVENTS.has(event.type)) {
      const { error } = await admin
        .from("subscriptions")
        .update({ status: "past_due", updated_at: eventTime.toISOString() })
        .eq("user_id", userId)
        .eq("source", "apple");
      if (error) throw error;
    } else console.warn(`RevenueCat event type ${event.type} is not used by Makeup Bestie.`);

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed and will be retried." }, { status: 500 });
  }
}
