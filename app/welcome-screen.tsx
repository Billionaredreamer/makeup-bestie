"use client";

import { useEffect, useState } from "react";
import { AuthScreen } from "./launch-account";

export function WelcomeScreen({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  useEffect(() => {
    document.documentElement.dataset.welcome = "true";
    return () => { delete document.documentElement.dataset.welcome; };
  }, []);

  return <main className="brand-image welcome-screen">
    <div className="welcome-content">
      <span className="welcome-mark" aria-label="Makeup Bestie">m</span>
      <h1>See a look.<br/>Make it yours.</h1>
      <p>Any tutorial, rebuilt for your skin, your features, your pace.</p>
      <button className="welcome-start" onClick={onStart}>Get started</button>
      <button className="welcome-signin" onClick={onSignIn}>I already have an account</button>
    </div>
  </main>;
}

export function UnauthenticatedShell() {
  const [screen, setScreen] = useState<"welcome" | "auth">("welcome");
  const [initialMode, setInitialMode] = useState<"signin" | "signup">("signup");
  const openAuth = (mode: "signin" | "signup") => {
    setInitialMode(mode);
    setScreen("auth");
    window.scrollTo(0, 0);
  };
  if (screen === "welcome") return <WelcomeScreen onStart={() => openAuth("signup")} onSignIn={() => openAuth("signin")}/>;
  return <AuthScreen initialMode={initialMode} onBack={() => setScreen("welcome")}/>;
}
