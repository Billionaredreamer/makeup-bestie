# Makeup Bestie

A privacy-first, face-aware makeup coach built with Next.js, MediaPipe Face Landmarker, and OpenAI. Continuous tracking runs in the browser; OpenAI is used for user-triggered visual checks, tutorial-frame or text lesson creation, optional previews, and optional Realtime voice.

## Launch flow

1. Complete skin, complexion, experience, and makeup-goal onboarding.
2. Take one bare-face photo for a private, on-device proportion scan and correct the estimate if needed.
3. Paste the original tutorial link, optionally upload a permitted video copy for timeline analysis, describe the look, and select products already owned.
4. Review the personalized plan and explicitly consent before sending one photo for an AI makeup preview.
5. Start one face-first, product-by-product lesson. The tutorial stays in the background while the user’s own live face remains the main studio view.
6. Each product step names every affected face area, provides a personalized completion checkpoint, and offers temporary moving placement guidance plus an optional user-triggered AI check.

## Privacy

- Camera footage is not recorded or permanently stored by the app.
- Facial landmarks and moving overlays are computed on-device.
- Face shape is a fallible, editable estimate.
- A reduced still frame is sent only after consent and only when **Check my placement** is pressed.
- Uploaded tutorial videos are sampled in the browser. Ordered still frames are used for one lesson-creation request and are not saved by the app.
- Pasted tutorial links are saved with the in-memory lesson so users can reopen the original source. The app does not download or claim to analyze protected social videos from a URL; users can optionally upload a copy they have permission to use.
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

- `lib/face-analysis.ts`: local proportion estimate and placement adaptations.
- `app/api/evaluate`: low-detail, single-frame evaluation.
- `app/api/realtime-session`: short-lived Realtime credentials.
- `app/api/preview-look`: identity-preserving makeup preview edits.
- `app/api/import-look`: ordered tutorial-frame or text-to-structured-lesson analysis with uncertainty labels.
- `lib/video-frames.ts`: browser-side, timeline-wide tutorial frame sampling.

Raw video is not sent to a general-purpose model. The browser samples the visual timeline, and spoken-only details are explicitly treated as uncertain. MediaPipe assets currently load from Google/jsDelivr; self-host them before enforcing a restrictive production CSP.

For link-based lessons, the browser validates `http://` and `https://` URLs but the server never fetches them. If no video copy is uploaded, the AI builds the lesson from the user’s written description and labels the linked video as not analyzed.

Lesson creation returns a concise six-to-fourteen-step structured routine in the tutorial’s observed product order. A step may cover several areas—for example, concealer can include the under-eyes, nose, and mouth area—while remaining one product checkpoint. The generated preview and live target both use the user’s face; creator footage is not shown in the studio. Continuous tracking remains local, while visual feedback is limited to the current product and its declared areas and is sent only after the user presses **Check my placement**.
