# iOS app handoff

Context document for Codex. Written after a working session that produced all the code below. Nothing here needs to be re-derived — the code is already applied to this working tree.

---

## 1. The goal

Ship **Makeup Bestie** as a real iOS app on the App Store.

Starting point: an existing Next.js 16 web app (React 19, Tailwind, Supabase, OpenAI, MediaPipe face landmarks, Stripe subscriptions) deployed on Vercel at `https://www.makeupbestie.app`. The Apple Developer enrollment is already active. There was no iOS project of any kind.

---

## 2. Decisions already made (do not relitigate)

**Wrapper approach.** The iOS app is a Capacitor 8 shell whose WebView loads the live production site. The app is not a static export — the Next.js server routes (OpenAI, Stripe, Supabase, realtime coach) must stay reachable, so `server.url` in `capacitor.config.ts` points at production. Camera, microphone, and WebRTC all work in the WKWebView given the Info.plist permission strings, which are in place.

**Billing is split by platform, deliberately.** App Store Review Guideline 3.1.1 requires Apple In-App Purchase for digital subscriptions sold inside an iOS app — Stripe checkout inside the app is a rejection. So:

- **Web keeps Stripe, completely unchanged.** This was an explicit requirement from the owner.
- **iOS uses Apple In-App Purchase via RevenueCat.** RevenueCat was chosen over hand-rolled StoreKit 2 because it handles receipt validation, renewal/cancellation events, and cross-platform entitlement state, which would otherwise be a large amount of bespoke server code.

The UI branches at runtime on `isNativeIOSApp()` (Capacitor native + platform iOS). In a normal mobile browser, nothing changes — it's still Stripe.

**No Mac.** The owner has a Windows laptop and an iPhone, no Mac. Builds therefore run on GitHub Actions macOS runners via fastlane, with signing handled automatically through an App Store Connect API key. There is no `match` / certificates repo by design. The iPhone is for TestFlight testing.

---

## 3. Current state of this working tree

**All the code below is already applied and uncommitted.** Do not re-apply anything from a zip; it has been extracted over this repo already.

Verified passing in a clean environment before delivery: `npx tsc --noEmit`, `npm run lint`, `npm test` (50/50).

Two caveats to check before committing:

1. `git checkout -b ios-app` was attempted and **failed** (git was not on PATH), so this tree is still on whatever branch it was on. Create the branch before committing.
2. There may be **pre-existing local changes unrelated to the iOS work** (`lib/application-order.ts`, `lib/placement-map.ts`, `lib/face-blueprint.ts` and others had recent mtimes). Run `git status` first and keep those separate from the iOS commit if they aren't meant to ship together.

**Environment note:** Windows PowerShell on this machine has no `git`, `node`, `npm`, `npx`, or `pnpm` on PATH, and Git is not in any standard install location. The Codex CLI terminal evidently does have tooling — use whatever shell Codex runs in. Installing Git for Windows + Node LTS natively was suggested but not completed.

---

## 4. What was added

| Path | Purpose |
|---|---|
| `capacitor.config.ts` | appId `com.makeupbestie.app`, `server.url` = `https://www.makeupbestie.app` |
| `ios/` | The Capacitor iOS project. **Swift Package Manager, not CocoaPods** — there is no Podfile and no `.xcworkspace`, only `ios/App/App.xcodeproj`. Info.plist carries `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`. |
| `lib/platform.ts` | `isNativeIOSApp()` — Capacitor native platform check |
| `lib/revenuecat.ts` | `configureRevenueCat(supabaseUserId)`, `purchasePlan(plan)`, `restorePurchases()`. Expects RevenueCat entitlements `plus` / `unlimited` and offering packages `plus_monthly` / `unlimited_monthly`. Passes the Supabase user id as the RevenueCat `appUserID` so webhooks map back to an account. |
| `app/api/billing/revenuecat-webhook/route.ts` | Mirrors the existing Stripe webhook. Auth is a shared secret compared against the `Authorization` header. Writes `subscriptions` rows with `source = 'apple'`. Handles INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE / TRANSFER (active), CANCELLATION (flags `cancel_at_period_end`, stays entitled until period end), EXPIRATION, BILLING_ISSUE. Ignores SANDBOX events in production unless `REVENUECAT_ACCEPT_SANDBOX=true`. |
| `supabase/migrations/202609040001_ios_iap_support.sql` | Additive only: adds `source`, `revenuecat_app_user_id`, `apple_original_transaction_id` to `public.subscriptions`, plus a partial unique index. Touches nothing existing. |
| `.github/workflows/ios-testflight.yml` | macOS-15 runner: checkout, Node 22, `npm ci`, `npx cap sync ios`, Ruby + bundler, `xcodebuild -resolvePackageDependencies`, then `fastlane ios beta`. Runs on `workflow_dispatch` and pushes to `main`. |
| `fastlane/Fastfile`, `fastlane/Appfile`, `Gemfile` | Build + sign + `upload_to_testflight`. Signing is automatic: `-allowProvisioningUpdates` with `CODE_SIGN_STYLE=Automatic` and `DEVELOPMENT_TEAM` passed via `xcargs`, authenticated by the App Store Connect API key. |
| `docs/ios-app-setup.md` | The account-setup checklist for the owner (Apple Developer, App Store Connect, RevenueCat, Vercel, GitHub secrets). Windows-oriented. |

## 5. What was modified

| Path | Change |
|---|---|
| `app/pricing-screen.tsx` | Purchase branches: Apple IAP on native iOS, Stripe checkout on web (the Stripe path is byte-for-byte the old behavior). Adds a **Restore purchases** link, which Apple requires. `ManageBillingButton` deep-links to `itms-apps://apps.apple.com/account/subscriptions` on iOS instead of the Stripe portal. Configures RevenueCat on mount with the signed-in user's id. |
| `app/page.tsx` | Subscription copy reflects `source` — says "manage through your Apple ID subscriptions" for Apple-billed users instead of naming Stripe. |
| `app/api/account/route.ts` | Selects `source`. **Blocks account deletion (409) while an active Apple subscription exists**, telling the person to cancel in the App Store first — the server cannot cancel Apple billing, and deleting the account would otherwise leave Apple charging them. |
| `lib/account-types.ts` | Adds `source?: "stripe" \| "apple"` to `SubscriptionRecord`. |
| `.env.example` | Documents `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` and `REVENUECAT_WEBHOOK_SECRET`. |
| `package.json` | Adds `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@revenuecat/purchases-capacitor`; scripts `ios:sync`, `ios:open`. |
| `pnpm-lock.yaml` | Regenerated with the new dependencies. |

---

## 6. What Codex should do next

1. `git status` — confirm what's changed, separate any pre-existing unrelated work.
2. `git checkout -b ios-app`
3. `pnpm install` (lockfile is already updated; this just materializes it)
4. `npx cap sync ios`
5. Verify: `npx tsc --noEmit`, `npm run lint`, `npm test` — all three passed at delivery, so a failure means something got mangled in transit.
6. Commit and push the branch.
7. Once the owner has added the GitHub secrets (section 7), trigger the workflow: Actions tab → "iOS build and TestFlight upload" → Run workflow on `ios-app`. If it fails, read the failing step's log and fix. Likely causes in order: a missing or mistyped repo secret; the App ID lacking the In-App Purchase capability; signing (do **not** introduce `match` unless automatic signing is proven unworkable); Swift Package resolution.

---

## 7. What Codex cannot do — the owner must do these

These all require being logged into the owner's accounts. Full step-by-step is in `docs/ios-app-setup.md`.

- **Apple Developer Portal:** register App ID `com.makeupbestie.app` with the **In-App Purchase** capability enabled. Must match `capacitor.config.ts` exactly.
- **App Store Connect:** create the app record; create a subscription group with two auto-renewable subscriptions — `com.makeupbestie.app.plus.monthly` at $12.99/mo and `com.makeupbestie.app.unlimited.monthly` at $49.99/mo, each with display name, description, and review screenshot.
- **App Store Connect API key:** Users and Access → Integrations → App Store Connect API, App Manager role. Download the `.p8` (one download only), note Key ID and Issuer ID.
- **RevenueCat:** project + iOS app for that bundle ID, connected via the API key; entitlements `plus` and `unlimited`; products linked to the two App Store subscriptions and attached to those entitlements; an offering marked current containing packages `plus_monthly` and `unlimited_monthly`; a webhook pointing at `https://www.makeupbestie.app/api/billing/revenuecat-webhook` with an Authorization header value.
- **Vercel env vars:** `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` (RevenueCat public iOS SDK key) and `REVENUECAT_WEBHOOK_SECRET` (the header value above). Redeploy after.
- **Supabase:** apply `supabase/migrations/202609040001_ios_iap_support.sql`.
- **GitHub repo secrets:** `APPLE_ID`, `APPLE_TEAM_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_CONTENT` (base64 of the `.p8`).
- **App icon / splash:** replace `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024×1024, opaque, square) and the three `Splash.imageset/splash-2732x2732*.png` files. Same filenames, no Xcode needed.
- **Testing:** TestFlight on the owner's iPhone with a Sandbox tester Apple ID (App Store Connect → Users and Access → Sandbox testers). Sandbox never charges a real card.
- **Before review:** App Privacy answers (camera, microphone, account data), screenshots, description, support URL. `/privacy` and `/terms` already exist in the app.

---

## 8. Constraints to preserve

- **Never** show Stripe checkout, an external purchase link, or any non-Apple payment path inside the iOS app. That is a guaranteed App Store rejection.
- **Do not** change the web Stripe flow. It works, it's in production, it's out of scope.
- The identifiers `plus` / `unlimited` (entitlements) and `plus_monthly` / `unlimited_monthly` (packages) are referenced in `lib/revenuecat.ts` and `app/api/billing/revenuecat-webhook/route.ts` and are configured by hand in the RevenueCat dashboard. Changing one side requires changing the other.
- `capacitor.config.ts` `appId` must equal the Apple App ID.
- The iOS project uses Swift Package Manager. Do not add CocoaPods.
- Apple reviewers sometimes reject thin website wrappers. The on-device MediaPipe landmark work and the native purchase flow are the substantive defense; be ready to state that in review notes.
