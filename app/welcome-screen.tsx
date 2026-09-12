"use client";

import { useState } from "react";
import { BrandSurface } from "./brand-header";
import { AuthScreen } from "./launch-account";
import { GuestOnboarding } from "./guest-onboarding";
import { guestProfileIsComplete, readGuestProfileDraft } from "@/lib/guest-onboarding";
import { readOnboardingCache, resolveLaunchStage, writeOnboardingCache } from "@/lib/onboarding-flow";
import { SneakPeek } from "./sneak-peek";

export function WelcomeScreen({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return <BrandSurface variant="welcome" className="welcome-screen">
    <div className="welcome-content">
      <span className="welcome-mark" aria-label="Makeup Bestie">m</span>
      <h1>See a look.<br/>Make it yours.</h1>
      <p>Any tutorial, rebuilt for your skin, your features, your pace.</p>
      <button className="welcome-start" onClick={onStart}>Get started</button>
      <button className="welcome-signin" onClick={onSignIn}>I already have an account</button>
    </div>
  </BrandSurface>;
}

export function UnauthenticatedShell() {
  const [screen, setScreen] = useState<"welcome" | "peek" | "onboarding" | "auth">("welcome");
  const [initialMode, setInitialMode] = useState<"signin" | "signup">("signup");
  const openAuth = (mode: "signin" | "signup") => {
    setInitialMode(mode);
    setScreen("auth");
    window.scrollTo(0, 0);
  };
  const startOnboarding=()=>{
    const draft=readGuestProfileDraft();
    const cached=readOnboardingCache(null);
    const next=resolveLaunchStage({profileComplete:guestProfileIsComplete(draft),subscriptionActive:false,peekSeen:cached.peekSeen,authenticated:false,startingProfileSeen:draft.startingProfileSeen===true});
    if(next==="peek")setScreen("peek");else if(next==="auth")openAuth("signup");else setScreen("onboarding");
    window.scrollTo(0,0);
  };
  const continueAfterProfile=()=>{
    const draft=readGuestProfileDraft();
    const cached=readOnboardingCache(null);
    const next=resolveLaunchStage({profileComplete:guestProfileIsComplete(draft),subscriptionActive:false,peekSeen:cached.peekSeen,authenticated:false,startingProfileSeen:draft.startingProfileSeen===true});
    if(next==="peek")setScreen("peek");else openAuth("signup");
    window.scrollTo(0,0);
  };
  const backFromAuth=()=>setScreen(initialMode==="signup"&&guestProfileIsComplete(readGuestProfileDraft())?"onboarding":"welcome");
  if (screen === "welcome") return <WelcomeScreen onStart={startOnboarding} onSignIn={() => openAuth("signin")}/>;
  if(screen==="peek")return <SneakPeek onFinish={()=>{writeOnboardingCache(null,{peekSeen:true});openAuth("signup");}}/>;
  if(screen==="onboarding")return <GuestOnboarding onBack={()=>setScreen("welcome")} onSave={continueAfterProfile}/>;
  return <AuthScreen initialMode={initialMode} onBack={backFromAuth}/>;
}
