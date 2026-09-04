"use client";

import { Purchases, type PurchasesOffering } from "@revenuecat/purchases-capacitor";
import type { SubscriptionPlan } from "@/lib/account-types";

// RevenueCat setup this file assumes (create these in the RevenueCat
// dashboard — see docs/ios-app-setup.md):
//   - Two entitlements: "plus" and "unlimited"
//   - A "default" offering with two packages, identifiers "plus_monthly"
//     and "unlimited_monthly", each attached to the matching App Store
//     Connect auto-renewable subscription product.

let configured = false;

/**
 * Must be called once before any purchase/restore call, after the user is
 * signed in to Supabase. Passing the Supabase user id as appUserId lets the
 * RevenueCat webhook match purchases back to the right account server-side.
 */
export async function configureRevenueCat(supabaseUserId: string) {
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!apiKey) throw new Error("RevenueCat is not configured (missing NEXT_PUBLIC_REVENUECAT_IOS_API_KEY).");
  if (!configured) {
    await Purchases.configure({ apiKey, appUserID: supabaseUserId });
    configured = true;
  } else {
    await Purchases.logIn({ appUserID: supabaseUserId });
  }
}

async function currentOffering(): Promise<PurchasesOffering> {
  const { current } = await Purchases.getOfferings();
  if (!current) throw new Error("No RevenueCat offering is configured yet.");
  return current;
}

/** Starts the native Apple In-App Purchase sheet for the given plan. */
export async function purchasePlan(plan: SubscriptionPlan) {
  const offering = await currentOffering();
  const identifier = plan === "plus" ? "plus_monthly" : "unlimited_monthly";
  const pkg = offering.availablePackages.find((candidate) => candidate.identifier === identifier);
  if (!pkg) throw new Error(`The "${identifier}" package is not in the current RevenueCat offering yet.`);
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return activePlanFromEntitlements(customerInfo.entitlements.active);
}

/** Re-applies a purchase already made on this Apple ID (required by App Review). */
export async function restorePurchases() {
  const { customerInfo } = await Purchases.restorePurchases();
  return activePlanFromEntitlements(customerInfo.entitlements.active);
}

function activePlanFromEntitlements(active: Record<string, unknown>): SubscriptionPlan | null {
  if ("unlimited" in active) return "unlimited";
  if ("plus" in active) return "plus";
  return null;
}
