"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { AccountSnapshot, BeautyProfileRecord } from "@/lib/account-types";
import { cloudAccountsConfigured, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearGuestProfileDraft, readGuestProfileDraft, writeGuestProfileDraft } from "@/lib/guest-onboarding";
import { signInWithSocialProvider, SocialAuthCancelledError, type SocialProvider } from "@/lib/social-auth";

export type LaunchAccount = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  snapshot: AccountSnapshot | null;
  error: string;
  refresh: () => Promise<AccountSnapshot | null>;
  saveProfile: (profile: Partial<BeautyProfileRecord>) => Promise<void>;
  signOut: () => Promise<void>;
};

export function useLaunchAccount(): LaunchAccount {
  const [loading, setLoading] = useState(cloudAccountsConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!cloudAccountsConfigured) return null;
    const client = getSupabaseBrowserClient();
    const { data } = await client!.auth.getUser();
    if (!data.user) { setUser(null); setSnapshot(null); setError(""); setLoading(false); return null; }
    try {
      const response = await fetch("/api/account", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Your account could not be loaded.");
      const next = result as AccountSnapshot;
      // Commit the user and snapshot together so routing never sees a signed-in
      // user paired with an empty profile/subscription snapshot.
      setSnapshot(next); setUser(data.user); setError(""); setLoading(false);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your account could not be loaded.");
      setLoading(false);
      throw caught;
    }
  }, []);

  useEffect(() => {
    if (!cloudAccountsConfigured) return;
    queueMicrotask(() => { void refresh().catch(() => undefined); });
    const client = getSupabaseBrowserClient();
    const { data } = client!.auth.onAuthStateChange(() => { void refresh().catch(() => undefined); });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const saveProfile = useCallback(async (profile: Partial<BeautyProfileRecord>) => {
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Your profile could not be saved.");
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await getSupabaseBrowserClient()?.auth.signOut();
    clearGuestProfileDraft();
    window.localStorage.removeItem("makeup-bestie-profile-v1");
    setSnapshot(null); setUser(null);
  }, []);

  return { configured: cloudAccountsConfigured, loading, user, snapshot, error, refresh, saveProfile, signOut };
}

export function AuthScreen({ initialMode = "signup", onBack }: { initialMode?: "signin" | "signup"; onBack?: () => void } = {}) {
  const client = getSupabaseBrowserClient();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode);
  const [emailOpen,setEmailOpen]=useState(false);
  const [name, setName] = useState(()=>readGuestProfileDraft().name||"");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!client) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "forgot") {
        const { error: authError } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset-password` });
        if (authError) throw authError;
        setMessage("Check your email for a secure password-reset link.");
      } else if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Tell your bestie what to call you.");
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        writeGuestProfileDraft({name:name.trim()});
        const { data, error: authError } = await client.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback`, data: { display_name: name.trim() } },
        });
        if (authError) throw authError;
        if (!data.session) setMessage("Check your email to verify your account, then return here to sign in.");
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account access failed. Please try again.");
    } finally { setBusy(false); }
  };

  const switchMode=(next:"signin"|"signup"|"forgot")=>{setMode(next);setError("");setMessage("");setEmailOpen(next==="forgot");};
  const socialSignIn=async(provider:SocialProvider)=>{
    if(!client)return;
    setSocialBusy(provider);setError("");setMessage("");
    try{await signInWithSocialProvider(client,provider);}
    catch(caught){if(!(caught instanceof SocialAuthCancelledError))setError(caught instanceof Error?caught.message:`${provider==="apple"?"Apple":"Google"} sign-in failed. Please try again.`);}
    finally{setSocialBusy(null);}
  };
  const emailForm=<>
    {mode==="signup"&&<label><span>Your name</span><input autoComplete="name" value={name} onChange={event=>setName(event.target.value)} placeholder="What should your bestie call you?"/></label>}
    <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@example.com"/></label>
    {mode!=="forgot"&&<label><span>Password</span><input type="password" autoComplete={mode==="signup"?"new-password":"current-password"} value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters"/></label>}
    {error&&<p className="auth-error">{error}</p>}{message&&<p className="auth-message">{message}</p>}
    <button className="primary wide" disabled={busy||!email||((mode!=="forgot")&&!password)} onClick={submit}>{busy?"One moment…":mode==="signup"?"Create my account →":mode==="signin"?"Sign in →":"Send reset link →"}</button>
    <div className="auth-switch">
      {mode!=="signin"&&<button onClick={()=>switchMode("signin")}>Already have an account? Sign in</button>}
      {mode!=="signup"&&<button onClick={()=>switchMode("signup")}>New here? Create an account</button>}
      {mode==="signin"&&<button onClick={()=>switchMode("forgot")}>Forgot password?</button>}
    </div>
  </>;
  return <main className="auth-choice-screen page-enter">
    <section className="auth-choice-card">
      {onBack&&!message&&<button className="auth-back" onClick={emailOpen?()=>{setEmailOpen(false);setMode(initialMode);setError("");setMessage("");}:onBack}>← Back</button>}
      <div className="auth-choice-brand"><span>m</span><b>makeup bestie</b></div>
      <h1>{mode==="forgot"?"Reset your password.":"Makeup steps made for your features."}</h1>
      <p>{mode==="forgot"?"We’ll email you a secure link.":"Save your answers and start your first lesson."}</p>
      {emailOpen||mode==="forgot"?<div className="auth-email-form">{emailForm}</div>:<>
        <div className="auth-provider-list">
          <button className="auth-provider apple" disabled={Boolean(socialBusy)} onClick={()=>void socialSignIn("apple")}><AppleMark/>{socialBusy==="apple"?"Connecting to Apple…":"Continue with Apple"}</button>
          <button className="auth-provider google" disabled={Boolean(socialBusy)} onClick={()=>void socialSignIn("google")}><GoogleMark/>{socialBusy==="google"?"Connecting to Google…":"Continue with Google"}</button>
          <button className="auth-provider email" disabled={Boolean(socialBusy)} onClick={()=>setEmailOpen(true)}>Continue with email</button>
        </div>
        {error&&<p className="auth-error provider-error">{error}</p>}
        <button className="auth-existing" onClick={()=>{setMode(initialMode==="signin"?"signup":"signin");setEmailOpen(true);}}>{initialMode==="signin"?"New here? Create an account":"Already have an account? Sign in"}</button>
      </>}
      <small className="auth-legal">By continuing, you agree to the <Link href="/terms">Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</small>
    </section>
  </main>;
}

function AppleMark(){return <svg className="provider-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 12.54c-.02-2.25 1.84-3.34 1.93-3.39a4.15 4.15 0 0 0-3.27-1.77c-1.38-.15-2.72.83-3.42.83-.72 0-1.8-.82-2.97-.79a4.35 4.35 0 0 0-3.66 2.23c-1.59 2.75-.4 6.8 1.12 9.02.76 1.09 1.65 2.3 2.82 2.26 1.14-.05 1.57-.73 2.94-.73 1.36 0 1.77.73 2.96.7 1.23-.02 2-1.09 2.73-2.19a8.91 8.91 0 0 0 1.25-2.55 3.92 3.92 0 0 1-2.43-3.62ZM14.8 5.91a4 4 0 0 0 .92-2.87 4.08 4.08 0 0 0-2.64 1.36 3.82 3.82 0 0 0-.95 2.76 3.37 3.37 0 0 0 2.67-1.25Z"/></svg>}
function GoogleMark(){return <svg className="provider-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.56 12.23c0-.71-.06-1.4-.18-2.05H12v3.87h5.36a4.58 4.58 0 0 1-1.99 3v2.51h3.23c1.89-1.74 2.96-4.3 2.96-7.33Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.23-2.51c-.9.6-2.04.95-3.38.95-2.6 0-4.81-1.76-5.6-4.13H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.87A6 6 0 0 1 6.09 12c0-.65.11-1.28.31-1.87V7.54H3.06A10 10 0 0 0 2 12c0 1.61.39 3.13 1.06 4.46l3.34-2.59Z"/><path fill="#EA4335" d="M12 6c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.94 5.54l3.34 2.59C7.19 7.76 9.4 6 12 6Z"/></svg>}

export function CloudLoadingScreen() {
  return <main className="cloud-loading"><span>m</span><b>Opening your Makeup Bestie…</b></main>;
}

export function CloudAccountErrorScreen({ onRetry }: { onRetry: () => void }) {
  return <main className="cloud-loading configuration"><span>m</span><b>We couldn’t open your account.</b><p>Check your connection and try again. Your answers are still here.</p><button className="primary" onClick={onRetry}>Try again</button></main>;
}

export function CloudConfigurationScreen() {
  return <main className="cloud-loading configuration"><span>m</span><b>Makeup Bestie is completing account setup.</b><p>Please try again shortly. No payment or personal information has been collected.</p></main>;
}
