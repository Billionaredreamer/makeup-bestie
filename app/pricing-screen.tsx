"use client";

import { useEffect, useState } from "react";
import type { AccountSnapshot, SubscriptionPlan } from "@/lib/account-types";
import { isNativeIOSApp } from "@/lib/platform";
import { configureRevenueCat, purchasePlan, restorePurchases } from "@/lib/revenuecat";

type BillingPayload = { error?: string; url?: string };

async function readBillingPayload(response: Response): Promise<BillingPayload> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as BillingPayload; }
  catch { return {}; }
}

export function PricingScreen({account,onRefresh,onSignOut}:{account:AccountSnapshot;onRefresh:()=>Promise<void>;onSignOut:()=>Promise<void>}) {
  const [busy,setBusy]=useState<SubscriptionPlan|null>(null);
  const [error,setError]=useState("");
  const [confirming,setConfirming]=useState(false);
  const [restoring,setRestoring]=useState(false);
  const nativeIOS=isNativeIOSApp();
  useEffect(()=>{
    if(!nativeIOS)return;
    configureRevenueCat(account.user.id).catch((caught)=>{setError(caught instanceof Error?caught.message:"Could not connect to the App Store.");});
  },[nativeIOS,account.user.id]);
  useEffect(()=>{
    if(new URLSearchParams(window.location.search).get("checkout")!=="success")return;
    let cancelled=false;let attempts=0;let timer=0;queueMicrotask(()=>{if(!cancelled)setConfirming(true);});
    const poll=async()=>{attempts+=1;await onRefresh();if(cancelled)return;if(attempts>=10){setConfirming(false);setError("Your payment completed, but plan activation is taking longer than expected. Refresh this page in a moment; you will not be charged twice.");return;}timer=window.setTimeout(()=>void poll(),1500);};
    void poll();
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[onRefresh]);
  // Web keeps the existing Stripe Checkout redirect exactly as before.
  const checkoutWithStripe=async(plan:SubscriptionPlan)=>{
    try{const response=await fetch("/api/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan})});const data=await readBillingPayload(response);if(!response.ok)throw new Error(data.error||`Secure checkout is unavailable (${response.status}).`);if(!data.url)throw new Error("Secure checkout did not return a destination. Please try again.");window.location.assign(data.url);}
    catch(caught){setError(caught instanceof Error?caught.message:"Checkout could not be opened.");setBusy(null);}
  };
  // The iOS app must use Apple In-App Purchase for a digital subscription
  // (App Store Review Guideline 3.1.1) — Stripe is never shown here.
  const purchaseWithApple=async(plan:SubscriptionPlan)=>{
    try{
      const activePlan=await purchasePlan(plan);
      if(!activePlan)throw new Error("The purchase did not complete. Please try again.");
      await onRefresh();
      setBusy(null);
    }catch(caught){
      const message=caught instanceof Error?caught.message:"";
      if(!/cancel/i.test(message))setError(message||"Purchase could not be completed.");
      setBusy(null);
    }
  };
  const checkout=async(plan:SubscriptionPlan)=>{
    setBusy(plan);setError("");
    if(nativeIOS)await purchaseWithApple(plan);
    else await checkoutWithStripe(plan);
  };
  const restore=async()=>{
    setRestoring(true);setError("");
    try{const activePlan=await restorePurchases();if(!activePlan)throw new Error("No previous purchase was found for this Apple ID.");await onRefresh();}
    catch(caught){setError(caught instanceof Error?caught.message:"Restore could not be completed.");}
    finally{setRestoring(false);}
  };
  return <main className="pricing-screen page-enter">
    <header className="pricing-header"><div className="auth-mark"><span>m</span><b>makeup bestie</b></div><button onClick={onSignOut}>Sign out</button></header>
    <section className="pricing-intro"><p className="eyebrow">Your beauty profile is ready</p><h1>Choose how often we<br/><em>make a look yours.</em></h1><p>Both plans remember your skin, products, preferences, and saved lessons. Cancel anytime from your account.</p></section>
    <section className="pricing-grid">
      <article><small>MAKEUP BESTIE PLUS</small><h2><b>$12.99</b><span>/ month</span></h2><p>For learning new looks throughout the month.</p><ul><li>12 tutorial adaptations each month</li><li>One personalized preview per adaptation</li><li>Private saved looks and beauty profile</li><li>Unlimited lesson replays and Glam Room use</li></ul><button className="outline" disabled={Boolean(busy)||confirming} onClick={()=>checkout("plus")}>{busy==="plus"?(nativeIOS?"Opening the App Store…":"Opening checkout…"):"Choose Plus →"}</button></article>
      <article className="featured"><div className="plan-ribbon">MOST FLEXIBLE</div><small>MAKEUP BESTIE UNLIMITED</small><h2><b>$49.99</b><span>/ month</span></h2><p>For beauty lovers creating and practicing constantly.</p><ul><li>Unlimited adaptations for normal personal use</li><li>One personalized preview per adaptation</li><li>Private saved looks and beauty profile</li><li>Reasonable anti-automation protection only</li></ul><button className="primary" disabled={Boolean(busy)||confirming} onClick={()=>checkout("unlimited")}>{busy==="unlimited"?(nativeIOS?"Opening the App Store…":"Opening checkout…"):"Choose Unlimited →"}</button></article>
    </section>
    {confirming&&<p className="pricing-confirming">Payment received. We’re securely activating your plan…</p>}
    {error&&<p className="pricing-error">{error}</p>}
    {nativeIOS
      ? <p className="pricing-footnote">Purchases are billed through your Apple ID. Already subscribed on another device? <button className="link" disabled={restoring} onClick={restore}>{restoring?"Restoring…":"Restore purchases"}</button> Your current usage: {account.usage.tutorialAnalyses} tutorial adaptations this month.</p>
      : <p className="pricing-footnote">Secure checkout is provided by Stripe. Makeup Bestie never receives or stores your card number. Your current usage: {account.usage.tutorialAnalyses} tutorial adaptations this month.</p>}
  </main>;
}

export function ManageBillingButton() {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const nativeIOS=isNativeIOSApp();
  const open=async()=>{
    if(nativeIOS){window.location.assign("itms-apps://apps.apple.com/account/subscriptions");return;}
    setBusy(true);setError("");try{const response=await fetch("/api/billing/portal",{method:"POST"});const data=await readBillingPayload(response);if(!response.ok)throw new Error(data.error||`Billing is unavailable (${response.status}).`);if(!data.url)throw new Error("Billing did not return a destination. Please try again.");window.location.assign(data.url);}catch(caught){setError(caught instanceof Error?caught.message:"Billing could not be opened.");setBusy(false);}
  };
  return <span className="billing-action"><button className="outline" disabled={busy} onClick={open}>{busy?"Opening billing…":nativeIOS?"Manage in App Store":"Manage subscription"}</button>{error&&<small>{error}</small>}</span>;
}
