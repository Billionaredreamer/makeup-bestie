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
  const [selectedPlan,setSelectedPlan]=useState<SubscriptionPlan>("plus");
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
  const unavailable=Boolean(busy)||confirming||restoring;
  return <main className="launch-paywall">
    <div className="paywall-content">
      <header className="paywall-top"><span className="paywall-mark" aria-hidden="true">m</span><button className="paywall-close" onClick={onSignOut} disabled={unavailable} aria-label="Close and sign out" title="Close and sign out">×</button></header>
      <h1>Unlock your <em>bestie.</em></h1>
      <ul className="paywall-benefits">
        <li><span aria-hidden="true">✦</span>Any tutorial, rebuilt for your face</li>
        <li><span aria-hidden="true">✦</span>Step-by-step in the Glam Room, with placement guides</li>
        <li><span aria-hidden="true">✦</span>Your bestie on voice, hands-free</li>
      </ul>
      <fieldset className="paywall-plans" disabled={unavailable}>
        <legend className="sr-only">Choose your monthly plan</legend>
        <label className={selectedPlan==="plus"?"selected":""}><input type="radio" name="plan" value="plus" checked={selectedPlan==="plus"} onChange={()=>setSelectedPlan("plus")}/><span><b>Plus</b><small>15 adaptations / month</small></span><span className="paywall-price"><b>$12.99</b><small>/month</small></span></label>
        <label className={selectedPlan==="unlimited"?"selected":""}><input type="radio" name="plan" value="unlimited" checked={selectedPlan==="unlimited"} onChange={()=>setSelectedPlan("unlimited")}/><span><b>Unlimited</b><small>No monthly limit · personal use</small></span><span className="paywall-price"><b>$49.99</b><small>/month</small></span></label>
      </fieldset>
      <footer className="paywall-bottom">
        {confirming&&<p className="paywall-message" role="status">Payment received. We’re securely activating your plan…</p>}
        {error&&<p className="paywall-message" role="alert">{error}</p>}
        <button className="primary paywall-subscribe" disabled={unavailable} onClick={()=>checkout(selectedPlan)}>{busy?(nativeIOS?"Opening the App Store…":"Opening checkout…"):"Subscribe"}</button>
        <p className="paywall-renewal">Renews monthly until cancelled. {nativeIOS?"Billed through your Apple ID. Cancel anytime in Settings → Apple ID → Subscriptions.":"Cancel anytime from Profile → Manage subscription."}</p>
        <nav className="paywall-legal" aria-label="Subscription information">
          {nativeIOS&&<button disabled={unavailable} onClick={restore}>{restoring?"Restoring…":"Restore purchases"}</button>}
          <a href="/terms">Terms</a><a href="/privacy">Privacy</a>
        </nav>
      </footer>
    </div>
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
