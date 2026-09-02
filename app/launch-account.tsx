"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import type { AccountSnapshot, BeautyProfileRecord } from "@/lib/account-types";
import { cloudAccountsConfigured, getSupabaseBrowserClient } from "@/lib/supabase/client";

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
    await getSupabaseBrowserClient()?.auth.signOut();
    setSnapshot(null); setUser(null);
  }, []);

  return { configured: cloudAccountsConfigured, loading, user, snapshot, refresh, saveProfile, signOut };
}

export function AuthScreen() {
  const client = getSupabaseBrowserClient();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signup");
  const [name, setName] = useState("");
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

  return <main className="auth-screen page-enter">
    <section className="auth-editorial"><p className="eyebrow">Makeup Bestie</p><h1>Your face.<br/><em>Your routine.</em></h1><p>Turn a makeup tutorial into private, personalized placement guidance made around your features and products.</p><div><span>✦</span><small>Facial landmarks stay on your device. Photos are saved only when you choose.</small></div></section>
    <section className="auth-card">
      <div className="auth-mark"><span>m</span><b>makeup bestie</b></div>
      <p className="eyebrow">{mode === "signup" ? "Create your account" : mode === "signin" ? "Welcome back" : "Reset your password"}</p>
      <h2>{mode === "signup" ? "Meet your new beauty profile." : mode === "signin" ? "Your looks are waiting." : "We’ll email you a secure link."}</h2>
      {mode === "signup"&&<label><span>Your name</span><input autoComplete="name" value={name} onChange={event=>setName(event.target.value)} placeholder="What should your bestie call you?"/></label>}
      <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@example.com"/></label>
      {mode !== "forgot"&&<label><span>Password</span><input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters"/></label>}
      {error&&<p className="auth-error">{error}</p>}{message&&<p className="auth-message">{message}</p>}
      <button className="primary wide" disabled={busy||!email||((mode!=="forgot")&&!password)} onClick={submit}>{busy?"One moment…":mode==="signup"?"Create my account →":mode==="signin"?"Sign in →":"Send reset link →"}</button>
      <div className="auth-switch">
        {mode!=="signin"&&<button onClick={()=>{setMode("signin");setError("");setMessage("");}}>Already have an account? Sign in</button>}
        {mode!=="signup"&&<button onClick={()=>{setMode("signup");setError("");setMessage("");}}>New here? Create an account</button>}
        {mode==="signin"&&<button onClick={()=>{setMode("forgot");setError("");setMessage("");}}>Forgot password?</button>}
      </div>
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
