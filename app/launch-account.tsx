"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { AccountSnapshot, BeautyProfileRecord } from "@/lib/account-types";
import { cloudAccountsConfigured, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearOnboardingCache } from "@/lib/onboarding-flow";
import { clearGuestProfileDraft, readGuestProfileDraft, writeGuestProfileDraft } from "@/lib/guest-onboarding";

export type LaunchAccount = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  snapshot: AccountSnapshot | null;
  refresh: () => Promise<void>;
  saveProfile: (profile: Partial<BeautyProfileRecord>) => Promise<void>;
  signOut: () => Promise<void>;
};

export function useLaunchAccount(): LaunchAccount {
  const [loading, setLoading] = useState(cloudAccountsConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);

  const refresh = useCallback(async () => {
    if (!cloudAccountsConfigured) return;
    const client = getSupabaseBrowserClient();
    const { data } = await client!.auth.getUser();
    setUser(data.user);
    if (!data.user) { setSnapshot(null); setLoading(false); return; }
    const response = await fetch("/api/account", { cache: "no-store" });
    if (response.ok) setSnapshot(await response.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!cloudAccountsConfigured) return;
    queueMicrotask(() => { void refresh(); });
    const client = getSupabaseBrowserClient();
    const { data } = client!.auth.onAuthStateChange(() => { void refresh(); });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const saveProfile = useCallback(async (profile: Partial<BeautyProfileRecord>) => {
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Your profile could not be saved.");
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    const currentUserId = user?.id;
    await getSupabaseBrowserClient()?.auth.signOut();
    clearOnboardingCache(currentUserId);
    clearGuestProfileDraft();
    window.localStorage.removeItem("makeup-bestie-profile-v1");
    setSnapshot(null); setUser(null);
  }, [user?.id]);

  return { configured: cloudAccountsConfigured, loading, user, snapshot, refresh, saveProfile, signOut };
}

export function AuthScreen({ initialMode = "signup", onBack }: { initialMode?: "signin" | "signup"; onBack?: () => void } = {}) {
  const client = getSupabaseBrowserClient();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode);
  const [emailOpen,setEmailOpen]=useState(false);
  const [name, setName] = useState(()=>readGuestProfileDraft().name||"");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
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
      {onBack&&<button className="auth-back" onClick={emailOpen?()=>{setEmailOpen(false);setMode(initialMode);setError("");setMessage("");}:onBack}>← Back</button>}
      <div className="auth-choice-brand"><span>m</span><b>makeup bestie</b></div>
      <h1>{mode==="forgot"?"Reset your password.":"Makeup steps made for your features."}</h1>
      <p>{mode==="forgot"?"We’ll email you a secure link.":"Save your answers and start your first lesson."}</p>
      {emailOpen||mode==="forgot"?<div className="auth-email-form">{emailForm}</div>:<>
        <div className="auth-provider-list">
          <button className="auth-provider apple" disabled aria-describedby="social-setup"><span aria-hidden="true">●</span>Continue with Apple</button>
          <button className="auth-provider google" disabled aria-describedby="social-setup"><span aria-hidden="true">G</span>Continue with Google</button>
          <button className="auth-provider email" onClick={()=>setEmailOpen(true)}>Continue with email</button>
        </div>
        <small id="social-setup" className="provider-setup">Apple and Google sign-in are being connected.</small>
        <button className="auth-existing" onClick={()=>{setMode(initialMode==="signin"?"signup":"signin");setEmailOpen(true);}}>{initialMode==="signin"?"New here? Create an account":"Already have an account? Sign in"}</button>
      </>}
      <small className="auth-legal">By continuing, you agree to the <Link href="/terms">Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</small>
    </section>
  </main>;
}

export function CloudLoadingScreen() {
  return <main className="cloud-loading"><span>m</span><b>Opening your Makeup Bestie…</b></main>;
}

export function CloudConfigurationScreen() {
  return <main className="cloud-loading configuration"><span>m</span><b>Makeup Bestie is completing account setup.</b><p>Please try again shortly. No payment or personal information has been collected.</p></main>;
}
