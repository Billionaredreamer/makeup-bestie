"use client";

import { useEffect, useState } from "react";
import type { AccountSnapshot, SubscriptionPlan } from "@/lib/account-types";

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
  useEffect(()=>{
    if(new URLSearchParams(window.location.search).get("checkout")!=="success")return;
    let attempts=0;const timer=window.setInterval(()=>{attempts+=1;void onRefresh();if(attempts>=8)window.clearInterval(timer);},1500);
    return()=>window.clearInterval(timer);
  },[onRefresh]);
  const checkout=async(plan:SubscriptionPlan)=>{
    setBusy(plan);setError("");
    try{const response=await fetch("/api/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan})});const data=await readBillingPayload(response);if(!response.ok)throw new Error(data.error||`Secure checkout is unavailable (${response.status}).`);if(!data.url)throw new Error("Secure checkout did not return a destination. Please try again.");window.location.assign(data.url);}
    catch(caught){setError(caught instanceof Error?caught.message:"Checkout could not be opened.");setBusy(null);}
  };
  return <main className="pricing-screen page-enter">
    <header className="pricing-header"><div className="auth-mark"><span>m</span><b>makeup bestie</b></div><button onClick={onSignOut}>Sign out</button></header>
    <section className="pricing-intro"><p className="eyebrow">Your beauty profile is ready</p><h1>Choose how often we<br/><em>make a look yours.</em></h1><p>Both plans remember your skin, products, preferences, and saved lessons. Cancel anytime from your account.</p></section>
    <section className="pricing-grid">
      <article><small>MAKEUP BESTIE PLUS</small><h2><b>$12.99</b><span>/ month</span></h2><p>For learning new looks throughout the month.</p><ul><li>10 tutorial adaptations each month</li><li>One personalized preview per adaptation</li><li>Private saved looks and beauty profile</li><li>Unlimited lesson replays and Glam Room use</li></ul><button className="outline" disabled={Boolean(busy)} onClick={()=>checkout("plus")}>{busy==="plus"?"Opening checkout…":"Choose Plus →"}</button></article>
      <article className="featured"><div className="plan-ribbon">MOST FLEXIBLE</div><small>MAKEUP BESTIE UNLIMITED</small><h2><b>$49.99</b><span>/ month</span></h2><p>For beauty lovers creating and practicing constantly.</p><ul><li>Unlimited adaptations for normal personal use</li><li>One personalized preview per adaptation</li><li>Private saved looks and beauty profile</li><li>Reasonable anti-automation protection only</li></ul><button className="primary" disabled={Boolean(busy)} onClick={()=>checkout("unlimited")}>{busy==="unlimited"?"Opening checkout…":"Choose Unlimited →"}</button></article>
    </section>
    {error&&<p className="pricing-error">{error}</p>}
    <p className="pricing-footnote">Secure checkout is provided by Stripe. Makeup Bestie never receives or stores your card number. Your current usage: {account.usage.tutorialAnalyses} tutorial adaptations this month.</p>
  </main>;
}

export function ManageBillingButton() {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const open=async()=>{setBusy(true);setError("");try{const response=await fetch("/api/billing/portal",{method:"POST"});const data=await readBillingPayload(response);if(!response.ok)throw new Error(data.error||`Billing is unavailable (${response.status}).`);if(!data.url)throw new Error("Billing did not return a destination. Please try again.");window.location.assign(data.url);}catch(caught){setError(caught instanceof Error?caught.message:"Billing could not be opened.");setBusy(false);}};
  return <span className="billing-action"><button className="outline" disabled={busy} onClick={open}>{busy?"Opening billing…":"Manage subscription"}</button>{error&&<small>{error}</small>}</span>;
}
