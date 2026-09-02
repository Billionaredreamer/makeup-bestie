"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const update=async()=>{
    setBusy(true);
    const client=getSupabaseBrowserClient();
    if(!client){setMessage("Account service is not configured.");setBusy(false);return;}
    const {error}=await client.auth.updateUser({password});
    setBusy(false);setMessage(error?error.message:"Password updated. You can return to Makeup Bestie.");
  };
  return <main className="auth-screen"><section className="auth-card reset-card"><div className="auth-mark"><span>m</span><b>makeup bestie</b></div><p className="eyebrow">New password</p><h2>Choose something only you know.</h2><label><span>Password</span><input type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)}/></label>{message&&<p className="auth-message">{message}</p>}<button className="primary wide" disabled={busy||password.length<8} onClick={update}>{busy?"Saving…":"Update password"}</button><Link href="/">Return to Makeup Bestie</Link></section></main>;
}
