import { Capacitor } from "@capacitor/core";

/**
 * True only when running inside the native iOS app shell (Capacitor),
 * never in Safari/Chrome or any other mobile browser. Used to switch the
 * billing flow to Apple In-App Purchase on iOS while leaving the regular
 * web app on Stripe untouched.
 */
export function isNativeIOSApp(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}
