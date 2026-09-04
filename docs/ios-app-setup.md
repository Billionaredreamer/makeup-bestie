# Shipping Makeup Bestie to iOS

This covers everything that has to happen under *your* Apple Developer / App Store Connect / GitHub login — none of it can be done for you, since it all requires your account credentials. Everything else (the Capacitor wrapper, the RevenueCat billing code, the CI workflow) is already in this branch.

Web stays exactly as it is today — Stripe, unchanged. Only the iOS app uses Apple In-App Purchase, via RevenueCat.

## 1. Apple Developer Portal

1. Sign in at developer.apple.com with your enrolled account.
2. Certificates, Identifiers & Profiles -> Identifiers -> **+** -> App IDs -> App.
3. Bundle ID: **explicit**, `com.makeupbestie.app` (must match `capacitor.config.ts` exactly — change both together if you use a different one).
4. Under Capabilities, enable **In-App Purchase**.

## 2. App Store Connect: create the app record

1. My Apps -> **+** -> New App.
2. Platform iOS, name "Makeup Bestie" (or whatever's available), bundle ID `com.makeupbestie.app`, add a SKU (any internal string, e.g. `makeupbestie-ios`).

## 3. App Store Connect: subscription products

1. Your app -> Subscriptions -> create a Subscription Group (e.g. "Makeup Bestie Plans").
2. Add two auto-renewable subscriptions in that group:
   - Reference name "Plus Monthly", Product ID `com.makeupbestie.app.plus.monthly`, price $12.99/month.
   - Reference name "Unlimited Monthly", Product ID `com.makeupbestie.app.unlimited.monthly`, price $49.99/month.
3. Each needs a subscription display name, description, and a review screenshot before it can go live — Apple won't approve the app without these filled in.

## 4. App Store Connect: API key (used by both CI and RevenueCat)

1. Users and Access -> Integrations -> App Store Connect API -> **+**.
2. Role: App Manager. Download the `.p8` file **immediately** — Apple only lets you download it once.
3. Note the **Key ID** and **Issuer ID** shown on that page.

## 5. RevenueCat

1. Create a free account at revenuecat.com, create a project, add an iOS app with bundle ID `com.makeupbestie.app`.
2. Connect it to App Store Connect using the API key from step 4 (RevenueCat's iOS setup guide walks through this screen — the exact fields may have changed since I last checked, so follow what's on screen there).
3. Create two **Entitlements**: `plus` and `unlimited` (these exact identifiers — the webhook code matches on them).
4. Create two **Products**, each attached to the matching App Store Connect subscription from step 3, and attach each product to its matching entitlement.
5. Create an **Offering** named `default`, mark it "current", and add two **Packages** inside it:
   - identifier `plus_monthly` -> the Plus product
   - identifier `unlimited_monthly` -> the Unlimited product
   (These identifiers must match `lib/revenuecat.ts` exactly.)
6. Copy the **public iOS API key** (Project settings -> API keys) — this is safe to embed in the app.
7. Project settings -> Integrations -> Webhooks -> add `https://www.makeupbestie.app/api/billing/revenuecat-webhook`, and set an Authorization header value — invent a long random string, this is your `REVENUECAT_WEBHOOK_SECRET`.

## 6. Environment variables

Add to Vercel (Project Settings -> Environment Variables), same as the existing Stripe/Supabase ones:

```
NEXT_PUBLIC_REVENUECAT_IOS_API_KEY=<the public iOS key from step 5.6>
REVENUECAT_WEBHOOK_SECRET=<the string you invented in step 5.7>
```

Redeploy after adding them.

## 7. Supabase migration

Apply `supabase/migrations/202609040001_ios_iap_support.sql` the same way you applied the others (SQL editor or CLI). It only adds columns — nothing about the existing Stripe flow changes.

## 8. GitHub repo secrets (for the CI workflow)

Repo -> Settings -> Secrets and variables -> Actions -> New repository secret:

```
APPLE_ID                       your Apple Developer account email
APPLE_TEAM_ID                  Membership tab in developer.apple.com (10-character ID)
APP_STORE_CONNECT_KEY_ID       from step 4
APP_STORE_CONNECT_ISSUER_ID    from step 4
APP_STORE_CONNECT_KEY_CONTENT  base64 of the .p8 file (see below)
```

To base64 the `.p8` file **on Windows**, open PowerShell in the folder where you downloaded it:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```

That puts the value on your clipboard — paste it straight into the GitHub secret. (On a Mac it'd be `base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy`.)

## 9. First build — no Mac required

You do **not** need a Mac or Xcode. GitHub's macOS runners do the building and signing for you, and the workflow tells Xcode to create the signing certificate and provisioning profile automatically using your App Store Connect API key.

From Windows:

```powershell
git checkout -b ios-app
# copy in the files from the zip, then:
pnpm install
npx cap sync ios
git add -A
git commit -m "Add iOS app: Capacitor wrapper + Apple In-App Purchase"
git push -u origin ios-app
```

Then in your GitHub repo: **Actions** tab -> "iOS build and TestFlight upload" -> **Run workflow** -> pick the `ios-app` branch. It takes roughly 10-20 minutes. When it goes green, the build appears in App Store Connect -> TestFlight.

If the run fails, the log tells you which step and why — send it to me and I'll fix it. The usual first-run causes are a mistyped secret or the App ID not having In-App Purchase enabled (step 1).

### App icon and splash screen, without Xcode

Capacitor ships placeholder art. You can replace it by swapping the PNG files directly in the repo on Windows — no Xcode needed:

- `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` — your app icon, exactly **1024x1024**, no transparency, no rounded corners (Apple rounds it for you).
- `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png` (and the `-1` / `-2` copies of the same file) — launch screen art, 2732x2732, with your logo centered in the middle third since the edges get cropped on most devices.

Keep the filenames identical, commit, and push — the next CI run picks them up.

## 10. Testing a real purchase

For this part you do need a **physical iPhone** (an iPad works too) — without a Mac there's no Simulator, so TestFlight on a real device is how you test. If you don't have one, borrowing one for an afternoon is enough to validate the purchase flow.

TestFlight builds only ever charge a **Sandbox** Apple ID, never a real card. Create one at App Store Connect -> Users and Access -> Sandbox testers, then on the iPhone sign into it under Settings -> Developer (or Settings -> App Store -> Sandbox Account) before testing the Plus/Unlimited buttons.

Install the build by adding yourself as an internal tester in App Store Connect -> TestFlight, then opening the TestFlight app on the iPhone.

## 10b. If you ever do need interactive Xcode

You won't for the normal path, but if something needs hands-on debugging that CI logs can't answer, you can rent a cloud Mac by the month (MacinCloud, MacStadium) and remote into it from Windows, rather than buying hardware. Prices change, so check their current plans. Treat this as a fallback, not a prerequisite.

## 11. Before you submit for review

- Fill in App Privacy details (camera, microphone, and account data usage) in App Store Connect.
- Add screenshots, description, and support/marketing URLs.
- Test the "Restore purchases" link and the delete-account flow (it now blocks account deletion while an active Apple subscription exists, and tells the person to cancel in Settings first — that's intentional, so Apple billing doesn't outlive the account).
- Apple's reviewers sometimes push back on apps that are mostly a website in a wrapper. Makeup Bestie's on-device camera/MediaPipe work and native purchase flow give it real native behavior, but be ready to explain that in the review notes if asked.
