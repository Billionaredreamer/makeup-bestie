import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { subscriptionRecordIsActive } from "@/lib/onboarding-flow";
import type { SubscriptionPlan } from "@/lib/account-types";

export const runtime = "nodejs";

type RevenueCatEntitlement = { expires_date?: string | null; product_identifier?: string };
type RevenueCatSubscriber = { subscriber?: { entitlements?: Record<string, RevenueCatEntitlement> } };

function activeEntitlement(entitlements: Record<string, RevenueCatEntitlement> | undefined) {
  for (const plan of ["unlimited", "plus"] as SubscriptionPlan[]) {
    const entitlement = entitlements?.[plan];
    if (!entitlement) continue;
    const expiresAt = entitlement.expires_date ? new Date(entitlement.expires_date).getTime() : Number.POSITIVE_INFINITY;
    if (expiresAt + 60 * 60 * 1000 > Date.now()) return { plan, entitlement };
  }
  return null;
}

export async function POST() {
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secret) return NextResponse.json({ error: "Purchase recovery is not configured yet." }, { status: 503 });
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in to restore purchases." }, { status: 401 });

  try {
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(auth.user.id)}`, {
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => null) as RevenueCatSubscriber | null;
    if (!response.ok) return NextResponse.json({ error: "RevenueCat could not verify this purchase." }, { status: 502 });
    const restored = activeEntitlement(data?.subscriber?.entitlements);
    if (!restored) return NextResponse.json({ error: "No active Makeup Bestie purchase was found for this Apple ID." }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const { data: existing, error: lookupError } = await admin.from("subscriptions").select("source,status,current_period_end,stripe_customer_id").eq("user_id", auth.user.id).maybeSingle();
    if (lookupError) throw lookupError;
    if ((existing?.source === "stripe" || existing?.stripe_customer_id) && subscriptionRecordIsActive(existing)) {
      return NextResponse.json({ error: "This account already has an active web subscription. Manage it from Profile before switching billing providers." }, { status: 409 });
    }
    const { error } = await admin.from("subscriptions").upsert({
      user_id: auth.user.id,
      source: "apple",
      revenuecat_app_user_id: auth.user.id,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      price_id: restored.entitlement.product_identifier || null,
      plan: restored.plan,
      status: "active",
      current_period_end: restored.entitlement.expires_date || null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw error;
    return NextResponse.json({ restored: true, plan: restored.plan });
  } catch {
    return NextResponse.json({ error: "Purchase recovery could not be completed. Please try again." }, { status: 502 });
  }
}
