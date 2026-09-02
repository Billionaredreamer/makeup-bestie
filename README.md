# Makeup Bestie

A privacy-first makeup lesson app built with Next.js, MediaPipe Face Landmarker, Supabase, Stripe, and OpenAI. Makeup Bestie analyzes a real, accessible tutorial, adapts its product order and techniques to a subscriber’s beauty profile and facial proportions, and presents feature-by-feature placement guidance in a portrait Glam Room.

## Launch experience

1. Create an email account and a persistent beauty profile with skin type, complexion, experience, makeup goal, and available products.
2. Subscribe to Plus ($12.99/month, 10 adaptations) or Unlimited ($49.99/month for normal personal use).
3. Paste an accessible public tutorial link **or** upload a permitted tutorial video.
4. The browser samples the real video timeline; OpenAI creates a structured product-by-product lesson only after those frames are reviewed.
5. Take a current bare-face photo. MediaPipe maps facial landmarks on the device and presents an editable face-shape estimate.
6. Optionally request a generated finished-look preview, then select eyes, brows, cheeks, nose, complexion, lips, or jaw.
7. Follow the matching tutorial steps in the portrait Glam Room. On phones, the mirror fills the viewport while the lesson, animated guide, and controls float above it. Landmark-aligned overlays stay on the device.
8. Optionally start the single-voice live coach for conversational help with the current product and face-specific instruction. Camera video is not sent to the voice coach.
9. Deliberately save a lesson and generated preview to the private account, or leave it session-only.

Home, Discover, Create, My Looks, and Profile remain in the mobile bottom navigation. Discover and creator publishing are currently on-device previews; shared creator publishing and marketplace payments are intentionally deferred.

## Plans and usage protection

- **Plus — $12.99/month:** 10 tutorial analyses per calendar month and up to one personalized preview per analysis. Saved lessons and Glam Room replays do not consume credits.
- **Unlimited — $49.99/month:** unlimited normal personal use, with a 30-request-per-operation rolling 24-hour anti-automation guard.
- Failed OpenAI requests are marked failed and do not count toward plan limits.
- Stripe Checkout collects payment details. The app stores Stripe customer/subscription identifiers and status, never full card numbers.

The database enforces entitlements in `supabase/migrations/202609010001_launch_accounts.sql`; hiding a button in the browser is not the security boundary.

## Privacy behavior

- Beauty-profile answers and deliberately saved looks sync to the signed-in user through Supabase Row Level Security.
- Facial landmark coordinates, Glam Room camera frames, and bare-face scan photos are not persisted.
- The camera starts only from the Glam Room and can be stopped immediately. Closing the mirror, changing features, or leaving the lesson stops all media tracks.
- The optional live coach requests microphone permission separately, uses a short-lived OpenAI Realtime client secret, and stops its microphone track when ended or when the Glam Room closes. The permanent OpenAI key never reaches the browser.
- The voice coach receives the current structured lesson and beauty-profile context. It does not receive the live camera feed and is instructed never to claim it can see the user.
- A bare-face photo is sent to OpenAI only after explicit preview consent.
- Saving is optional. A saved look contains the structured lesson and, when available, the generated makeup preview—not the bare-face scan.
- Uploaded or publicly accessible tutorial videos are sampled in the browser. Selected frames are sent for one tutorial-analysis request and are not stored by the app.
- Link-only analysis succeeds only when the public URL exposes usable video media. Blocked, private, login-gated, DRM-protected, or unsupported sources request a permitted upload and are never described as analyzed.
- The production privacy policy is available at `/privacy`; terms are at `/terms`. Have both reviewed for the business’s jurisdiction before launch.

## Local development

Requires Node.js 22.x.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Do not put real secrets in source control. `.env*` is ignored by Git. Add values directly to `.env.local` or use `vercel env pull .env.local --environment=development` for an already linked project.

### 1. Supabase

1. Create a Supabase project.
2. Apply every SQL file in `supabase/migrations` in filename order using the Supabase SQL editor or CLI. The later hardening migration makes usage completion server-only.
3. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the server-only `SUPABASE_SECRET_KEY`.
4. In **Authentication → URL Configuration**, set the site URL and add these redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/reset-password`
   - `https://YOUR-PRODUCTION-DOMAIN/auth/callback`
   - `https://YOUR-PRODUCTION-DOMAIN/auth/reset-password`
5. Configure an SMTP provider and customize confirmation/reset emails before accepting production signups.

The migration creates private profiles, subscriptions, saved looks, AI-usage records, and a private `look-previews` storage bucket with per-user policies.

### 2. Stripe

1. Create two recurring monthly Prices in Stripe:
   - Makeup Bestie Plus: **$12.99 USD/month**
   - Makeup Bestie Unlimited: **$49.99 USD/month**
2. Set `STRIPE_PLUS_PRICE_ID` and `STRIPE_UNLIMITED_PRICE_ID` to those Price IDs.
3. Add server-only `STRIPE_SECRET_KEY`.
4. For local webhook testing, forward Stripe events to `http://localhost:3000/api/billing/webhook` and set `STRIPE_WEBHOOK_SECRET` to the signing secret.
5. Listen for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Enable the Stripe Customer Portal, including plan switching/cancellation behavior and business contact details.

### 3. OpenAI and public configuration

- Set `OPENAI_API_KEY` server-side only. Never prefix it with `NEXT_PUBLIC_`.
- Optional model overrides are `OPENAI_VISION_MODEL`, `OPENAI_IMAGE_MODEL`, and `OPENAI_REALTIME_MODEL`.
- Set `NEXT_PUBLIC_APP_URL` to the exact local or production origin.
- Set `NEXT_PUBLIC_SUPPORT_EMAIL` to a public customer-support address shown in Terms and Privacy.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Manual launch checks should cover signup confirmation, sign-in/reset, both Stripe test checkouts, webhook activation, billing portal cancellation, Plus quota behavior, private saved-look access, account deletion, link-only and upload-only tutorials, camera denial, camera shutdown, microphone denial, coach mute/pause/repeat/end, a single audible coach, and mobile/desktop Glam Room layouts.

## Vercel deployment

1. Import `Billionaredreamer/makeup-bestie` in Vercel and keep the Next.js preset.
2. Add every variable from `.env.example` in **Project Settings → Environment Variables**. Mark OpenAI, Supabase secret, Stripe secret, and webhook secret as sensitive. Never copy them into GitHub or browser code.
3. Set `NEXT_PUBLIC_APP_URL` to `https://www.makeupbestie.app` for production.
4. Create the production Stripe webhook at `https://www.makeupbestie.app/api/billing/webhook` and save its signing secret only in Vercel.
5. Add the exact production callback/reset URLs in Supabase.
6. Redeploy after environment changes and run the manual checks above in Stripe test mode before enabling live payments.

## Relevant architecture

- `lib/face-analysis.ts`: on-device proportion estimate and face-specific technique adaptation.
- `lib/placement-map.ts`: landmark-based placement zones and blend direction geometry.
- `app/placement-guide.tsx`: placement outlines, animated arrows, and step badges.
- `app/api/import-look`: tutorial-frame analysis, protected by subscriber entitlements.
- `app/api/preview-look`: consented image preview generation, protected by subscriber entitlements.
- `app/api/realtime-session`: authenticated creation of short-lived Realtime client secrets; the permanent key remains server-only.
- `app/live-coach.tsx`: one WebRTC audio connection with mute, pause, repeat, and end controls.
- `app/api/tutorial-media`: bounded public-media discovery and streaming with redirect/private-network protections.
- `app/api/account`: persistent beauty profile, usage snapshot, and account deletion.
- `app/api/saved-looks`: private optional lesson and generated-preview storage.
- `app/api/billing/*`: Stripe Checkout, Customer Portal, and signed webhook synchronization.

MediaPipe runtime assets currently load from Google/jsDelivr. Self-host them before enforcing a restrictive production Content Security Policy.
