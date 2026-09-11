"use client";

import type { Provider, SupabaseClient } from "@supabase/supabase-js";
import { isNativeIOSApp } from "@/lib/platform";

export type SocialProvider = "apple" | "google";

const GOOGLE_WEB_CLIENT_ID = "70136674621-i47hl8idmfg9euc3i0ua26h7egao3hl9.apps.googleusercontent.com";
const GOOGLE_IOS_CLIENT_ID = "70136674621-h8n2tadheesbk68uf64hhaea7mje57lv.apps.googleusercontent.com";

export class SocialAuthCancelledError extends Error {
  constructor() {
    super("Social sign-in was cancelled.");
    this.name = "SocialAuthCancelledError";
  }
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function nativeSignIn(client: SupabaseClient, provider: SocialProvider) {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const rawNonce = randomNonce();
  const nonceDigest = await sha256(rawNonce);

  await SocialLogin.initialize({
    google: {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iOSClientId: GOOGLE_IOS_CLIENT_ID,
      iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
      mode: "online",
    },
    apple: {
      clientId: "com.makeupbestie.app.signin",
      redirectUrl: "",
    },
  });

  if (provider === "google") {
    const response = await SocialLogin.login({
      provider: "google",
      options: { scopes: ["email", "profile"], nonce: nonceDigest, forcePrompt: true },
    });
    if (response.result.responseType !== "online" || !response.result.idToken) {
      throw new Error("Google did not return a valid identity token.");
    }
    const { error } = await client.auth.signInWithIdToken({
      provider: "google",
      token: response.result.idToken,
      nonce: rawNonce,
    });
    if (error) throw error;
    return;
  }

  const response = await SocialLogin.login({
    provider: "apple",
    options: { scopes: ["name", "email"], nonce: nonceDigest },
  });
  if (!response.result.idToken) throw new Error("Apple did not return a valid identity token.");
  const { error } = await client.auth.signInWithIdToken({
    provider: "apple",
    token: response.result.idToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  const fullName = [response.result.profile.givenName, response.result.profile.familyName].filter(Boolean).join(" ");
  if (fullName) {
    const { error: metadataError } = await client.auth.updateUser({
      data: {
        display_name: fullName,
        full_name: fullName,
        given_name: response.result.profile.givenName,
        family_name: response.result.profile.familyName,
      },
    });
    if (metadataError) throw metadataError;
  }
}

export async function signInWithSocialProvider(client: SupabaseClient, provider: SocialProvider) {
  if (!isNativeIOSApp()) {
    const { error } = await client.auth.signInWithOAuth({
      provider: provider as Provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return;
  }

  try {
    await nativeSignIn(client, provider);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "USER_CANCELLED") {
      throw new SocialAuthCancelledError();
    }
    throw error;
  }
}
