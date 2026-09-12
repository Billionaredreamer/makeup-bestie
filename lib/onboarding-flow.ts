import type { BeautyProfileRecord, SubscriptionRecord } from "./account-types";

export type PaywallPosition = "before-personalization" | "after-personalization";
export type LaunchStage = "peek" | "onboarding" | "pricing" | "home";
export type GuestLaunchStage = "peek" | "onboarding" | "starting-profile" | "auth";

// This is deliberately the only switch that controls where the paywall sits.
export const PAYWALL_POSITION: PaywallPosition = "after-personalization";

const CACHE_PREFIX = "makeup-bestie-onboarding-v1";

export type OnboardingCache = {
  peekSeen: boolean;
  profileComplete: boolean;
};

const cacheKey = (userId?: string | null) => `${CACHE_PREFIX}:${userId || "local"}`;

export function readOnboardingCache(userId?: string | null): OnboardingCache {
  if (typeof window === "undefined") return { peekSeen: false, profileComplete: false };
  try {
    const value = JSON.parse(window.localStorage.getItem(cacheKey(userId)) || "{}") as Partial<OnboardingCache>;
    return { peekSeen: value.peekSeen === true, profileComplete: value.profileComplete === true };
  } catch {
    return { peekSeen: false, profileComplete: false };
  }
}

export function writeOnboardingCache(userId: string | null | undefined, value: Partial<OnboardingCache>) {
  if (typeof window === "undefined") return;
  const current = readOnboardingCache(userId);
  window.localStorage.setItem(cacheKey(userId), JSON.stringify({ ...current, ...value }));
}

export function migrateLocalOnboardingCache(userId: string): OnboardingCache {
  const accountCache = readOnboardingCache(userId);
  if (typeof window === "undefined") return accountCache;
  const localCache = readOnboardingCache(null);
  const migrated = {
    peekSeen: accountCache.peekSeen || localCache.peekSeen,
    profileComplete: accountCache.profileComplete || localCache.profileComplete,
  };
  window.localStorage.setItem(cacheKey(userId), JSON.stringify(migrated));
  window.localStorage.removeItem(cacheKey(null));
  return migrated;
}

export function clearOnboardingCache(userId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(cacheKey(userId));
}

export function profileRecordIsComplete(profile?: BeautyProfileRecord | null) {
  return Boolean(
    profile?.display_name?.trim() &&
    profile.skin_type &&
    profile.skin_tone &&
    profile.experience &&
    profile.makeup_goal,
  );
}

export function subscriptionRecordIsActive(subscription?: SubscriptionRecord | null) {
  return Boolean(subscription && ["active", "trialing"].includes(subscription.status));
}

type LaunchStageInput = {
  profileComplete: boolean;
  subscriptionActive: boolean;
  peekSeen: boolean;
  startingProfileSeen?: boolean;
};

export function resolveLaunchStage(input:LaunchStageInput&{authenticated:false}):GuestLaunchStage;
export function resolveLaunchStage(input:LaunchStageInput&{authenticated?:true}):LaunchStage;
export function resolveLaunchStage({
  profileComplete,
  subscriptionActive,
  peekSeen,
  authenticated = true,
  startingProfileSeen = false,
}: LaunchStageInput&{authenticated?:boolean}): LaunchStage|GuestLaunchStage {
  if(!authenticated){
    if(!profileComplete)return "onboarding";
    if(!startingProfileSeen)return "starting-profile";
    if(!peekSeen)return "peek";
    return "auth";
  }
  if (profileComplete && subscriptionActive) return "home";
  if (!peekSeen) return "peek";
  if (!subscriptionActive && PAYWALL_POSITION === "before-personalization") return "pricing";
  if (!profileComplete) return "onboarding";
  return "pricing";
}
