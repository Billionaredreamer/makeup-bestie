"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

const LOGO_BEAT_MS = 760;
const subscribe = () => () => undefined;
const nativeIOSSnapshot = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
const serverSnapshot = () => false;

/**
 * Bridges the native launch screen to the mounted web app. The overlay is
 * committed before the native splash is hidden, which prevents a white flash
 * while the remote WKWebView finishes its first paint.
 */
export function NativeLaunchMoment() {
  const nativeIOS = useSyncExternalStore(subscribe, nativeIOSSnapshot, serverSnapshot);
  const [finished, setFinished] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!nativeIOS) return;

    let disposed = false;
    let finishTimer = 0;

    // Two frames guarantee React has painted the matching web launch surface
    // underneath the native one before Capacitor removes it.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (disposed) return;
      void SplashScreen.hide().finally(() => {
        if (disposed) return;
        setPlaying(true);
        finishTimer = window.setTimeout(() => setFinished(true), LOGO_BEAT_MS);
      });
    }));

    return () => {
      disposed = true;
      window.clearTimeout(finishTimer);
    };
  }, [nativeIOS]);

  if (!nativeIOS || finished) return null;
  return (
    <div className={`native-launch-moment${playing ? " is-playing" : ""}`} aria-hidden="true">
      <div className="native-launch-logo"><span>m</span><b>makeup bestie</b></div>
    </div>
  );
}
