import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionPlan } from "@/lib/account-types";

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
  app_user_id: string;
  original_transaction_id?: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number | null;
  environment?: "SANDBOX" | "PRODUCTION";
};

const ACTIVE_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "TRANSFER"]);
const CANCELED_EVENTS = new Set(["CANCELLATION"]);
const EXPIRED_EVENTS = new Set(["EXPIRATION"]);
const BILLING_ISSUE_EVENTS = new Set(["BILLING_ISSUE"]);

function planFromEntitlements(entitlementIds: string[] | undefined): SubscriptionPlan | null {
  if (!entitlementIds) return null;
  if (entitlementIds.includes("unlimited")) return "unlimited";
  if (entitlementIds.includes("plus")) return "plus";
  return null;
}

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
  if (!event?.app_user_id || !event.type) return NextResponse.json({ received: true });

  // Sandbox events from TestFlight/App Review testing should not overwrite
  // a real subscriber's row in production.
  if (process.env.NODE_ENV === "production" && event.environment === "SANDBOX" && process.env.REVENUECAT_ACCEPT_SANDBOX !== "true") {
    return NextResponse.json({ received: true, skipped: "sandbox" });
  }

  const userId = event.app_user_id;
  const plan = planFromEntitlements(event.entitlement_ids);

  try {
    const admin = createSupabaseAdminClient();

    if (ACTIVE_EVENTS.has(event.type)) {
      if (plan !== "plus" && plan !== "unlimited") {
        return NextResponse.json({ error: "Event has no recognized plan entitlement." }, { status: 422 });
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
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    } else if (CANCELED_EVENTS.has(event.type)) {
      // Apple subscriptions stay entitled until current_period_end even
      // after cancellation, so only flag it — do not deactivate yet.
      const { error } = await admin
        .from("subscriptions")
        .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("source", "apple");
      if (error) throw error;
    } else if (EXPIRED_EVENTS.has(event.type)) {
      const { error } = await admin
        .from("subscriptions")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("source", "apple");
      if (error) throw error;
    } else if (BILLING_ISSUE_EVENTS.has(event.type)) {
      const { error } = await admin
        .from("subscriptions")
        .update({ status: "past_due", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("source", "apple");
      if (error) throw error;
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed and will be retried." }, { status: 500 });
  }
}
