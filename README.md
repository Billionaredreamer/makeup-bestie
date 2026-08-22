# Makeup Bestie

A privacy-first, tutorial-aware makeup coach built with Next.js, MediaPipe Face Landmarker, and OpenAI. It turns a permitted tutorial video into a personalized placement lesson using a single face scan—without a continuous camera or microphone session.

## Launch flow

1. Complete skin, complexion, experience, and makeup-goal onboarding.
2. Take one bare-face photo for a private, on-device proportion scan and correct the estimate if needed.
3. Paste the original tutorial link, attach a permitted video copy for required timeline analysis, optionally add preferences, and select products already owned.
4. Review the personalized plan and explicitly consent before sending one photo for an AI makeup preview.
5. Choose **Entire routine** or **Part by part**. In part-by-part mode, tap an available area directly on the scanned face.
6. Enter the Glam Room to follow product placement zones, animated application arrows, personalized instructions, and timestamped clips from the uploaded tutorial.

## Privacy

- The Glam Room does not open a continuous camera or microphone.
- Facial landmarks are computed on-device from the selected face-scan photo and anchor the placement overlays.
- Face shape is a fallible, editable estimate.
- Uploaded tutorial videos are sampled in the browser. Ordered still frames are used for one lesson-creation request and are not saved by the app.
- Pasted tutorial links are saved with the in-memory lesson so users can reopen the original source. A link alone never creates a lesson. The app requires a video copy the user has permission to use, samples it locally, and analyzes those ordered frames.
- The face-scan photo stays local until the user separately opts into preview generation. Makeup Bestie does not save the generated-preview request or result.
- The uploaded video remains available only in the current browser session so the Glam Room can replay the relevant timestamped segment for each step.

Review OpenAI API data controls and configure account retention before production launch.

## Local setup

Requires Node.js 22.13+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add the key only to `.env.local` as `OPENAI_API_KEY`. Never use a `NEXT_PUBLIC_` prefix. `.env*` is ignored by Git. If the project is already linked with the Vercel CLI, `vercel env pull .env.local --environment=development` can securely create this ignored server-only file without copying the value through source code or chat.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Without a key, local landmarks still work and server-backed actions show honest configuration errors.

## Vercel deployment

1. Import `Billionaredreamer/makeup-bestie` at [Vercel](https://vercel.com/new).
2. Keep the Next.js preset and default build settings.
3. Go to **Project Settings → Environment Variables**.
4. Add `OPENAI_API_KEY` as a **Sensitive** variable. Paste it only into Vercel’s protected value field and select the environments you need.
5. Optionally add `OPENAI_VISION_MODEL` and `OPENAI_IMAGE_MODEL` from `.env.example`.
6. Deploy; redeploy after environment changes.

Never put the key in source, browser code, GitHub, issues, screenshots, logs, or chat. Rotate it immediately if exposed.

## Architecture and limits

- `lib/face-analysis.ts`: local proportion estimate and face-specific technique adaptations.
- `app/api/preview-look`: identity-preserving makeup preview edits.
- `app/api/import-look`: ordered tutorial-frame-to-structured-lesson analysis with uncertainty labels and conservative clip timestamps.
- `lib/video-frames.ts`: browser-side, timeline-wide tutorial frame sampling with sample timestamps.

Raw video is not sent to a general-purpose model. The browser samples the visual timeline, and spoken-only details are explicitly treated as uncertain. MediaPipe assets currently load from Google/jsDelivr; self-host them before enforcing a restrictive production CSP.

The browser validates `http://` and `https://` tutorial URLs, but the server does not scrape or download social-media videos. Lesson creation is blocked until the user attaches a permitted video copy. This avoids claiming that a link was viewed when the actual video frames were unavailable.

Lesson creation returns a concise six-to-fourteen-step structured routine in the tutorial’s observed product order. A step may cover several areas—for example, concealer can include the under-eyes, nose, and mouth area—while remaining one product checkpoint. The generated preview remains unmarked. The Glam Room then uses the locally mapped scan to draw its own product placement zones and animated application arrows, either across the complete routine or filtered to a facial area selected by the user.
