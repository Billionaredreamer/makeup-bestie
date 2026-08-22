# Makeup Bestie

A privacy-first, tutorial-aware makeup coach built with Next.js, MediaPipe Face Landmarker, and OpenAI. Continuous tracking runs in the browser; OpenAI is used for user-triggered visual checks, tutorial-frame lesson creation, optional previews, and optional Realtime voice.

## Launch flow

1. Complete skin, complexion, experience, and makeup-goal onboarding.
2. Take one bare-face photo for a private, on-device proportion scan and correct the estimate if needed.
3. Paste the original tutorial link, attach a permitted video copy for required timeline analysis, optionally add preferences, and select products already owned.
4. Review the personalized plan and explicitly consent before sending one photo for an AI makeup preview.
5. Start one face-first, product-by-product lesson. The tutorial stays in the background while the user’s own live face remains the main studio view.
6. Each product step names every affected face area, provides a face-specific adjustment and completion checkpoint, and offers verbal coaching plus an optional user-triggered AI check.

## Privacy

- Camera footage is not recorded or permanently stored by the app.
- Facial landmarks are computed on-device. The live camera intentionally has no drawn arrows, circles, or placement markings.
- Face shape is a fallible, editable estimate.
- A reduced still frame is sent only after consent and only when **Check this step** is pressed.
- Uploaded tutorial videos are sampled in the browser. Ordered still frames are used for one lesson-creation request and are not saved by the app.
- Pasted tutorial links are saved with the in-memory lesson so users can reopen the original source. A link alone never creates a lesson. The app requires a video copy the user has permission to use, samples it locally, and analyzes those ordered frames.
- The face-scan photo stays local until the user separately opts into preview generation. Makeup Bestie does not save the generated-preview request or result.
- Voice is optional. The permanent key stays server-side; the browser receives a short-lived credential.
- **Stop camera & end session** stops media tracks, tracking, voice, and the peer connection.

Review OpenAI API data controls and configure account retention before production launch.

## Local setup

Requires Node.js 22.13+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add the key only to `.env.local` as `OPENAI_API_KEY`. Never use a `NEXT_PUBLIC_` prefix. `.env*` is ignored by Git. Camera and microphone require localhost or HTTPS. If the project is already linked with the Vercel CLI, `vercel env pull .env.local --environment=development` can securely create this ignored server-only file without copying the value through source code or chat.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Without a key, local landmarks still work and server-backed actions show honest configuration errors.

## Vercel deployment

1. Import `Billionaredreamer/makeup-bestie` at [Vercel](https://vercel.com/new).
2. Keep the Next.js preset and default build settings.
3. Go to **Project Settings → Environment Variables**.
4. Add `OPENAI_API_KEY` as a **Sensitive** variable. Paste it only into Vercel’s protected value field and select the environments you need.
5. Optionally add `OPENAI_VISION_MODEL`, `OPENAI_IMAGE_MODEL`, and `OPENAI_REALTIME_MODEL` from `.env.example`.
6. Deploy; redeploy after environment changes.

Never put the key in source, browser code, GitHub, issues, screenshots, logs, or chat. Rotate it immediately if exposed.

## Architecture and limits

- `lib/face-analysis.ts`: local proportion estimate and face-specific technique adaptations.
- `app/api/evaluate`: low-detail, single-frame evaluation.
- `app/api/realtime-session`: short-lived Realtime credentials.
- `app/api/preview-look`: identity-preserving makeup preview edits.
- `app/api/import-look`: ordered tutorial-frame-to-structured-lesson analysis with uncertainty labels.
- `lib/video-frames.ts`: browser-side, timeline-wide tutorial frame sampling.

Raw video is not sent to a general-purpose model. The browser samples the visual timeline, and spoken-only details are explicitly treated as uncertain. MediaPipe assets currently load from Google/jsDelivr; self-host them before enforcing a restrictive production CSP.

The browser validates `http://` and `https://` tutorial URLs, but the server does not scrape or download social-media videos. Lesson creation is blocked until the user attaches a permitted video copy. This avoids claiming that a link was viewed when the actual video frames were unavailable.

Lesson creation returns a concise six-to-fourteen-step structured routine in the tutorial’s observed product order. A step may cover several areas—for example, concealer can include the under-eyes, nose, and mouth area—while remaining one product checkpoint. The generated preview and live target both use the user’s unmarked face; creator footage and its arrows, circles, captions, and placement annotations are not reproduced in the studio. Continuous tracking remains local, while visual feedback is limited to the current product and its declared areas and is sent only after the user presses **Check this step**.
