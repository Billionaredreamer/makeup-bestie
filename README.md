# Makeup Bestie

A privacy-first, face-aware makeup coach built with Next.js, MediaPipe Face Landmarker, and OpenAI. Continuous tracking runs in the browser; OpenAI is used only for user-triggered visual checks, uploaded-reference analysis, and optional Realtime voice.

## Privacy

- Camera footage is not recorded or permanently stored by the app.
- Facial landmarks and moving overlays are computed on-device.
- Face shape is a fallible, editable estimate.
- A reduced still frame is sent only after consent and only when **Check my placement** is pressed.
- Uploaded screenshots are used for one analysis request and are not saved by the app.
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

Add the key only to `.env.local` as `OPENAI_API_KEY`. Never use a `NEXT_PUBLIC_` prefix. `.env*` is ignored by Git. Camera and microphone require localhost or HTTPS.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Without a key, local landmarks still work and server-backed actions show honest configuration errors.

## Vercel deployment

1. Import `Billionaredreamer/makeup-bestie` at [Vercel](https://vercel.com/new).
2. Keep the Next.js preset and default build settings.
3. Go to **Project Settings → Environment Variables**.
4. Add `OPENAI_API_KEY` as a **Sensitive** variable. Paste it only into Vercel’s protected value field and select the environments you need.
5. Optionally add `OPENAI_VISION_MODEL` and `OPENAI_REALTIME_MODEL` from `.env.example`.
6. Deploy; redeploy after environment changes.

Never put the key in source, browser code, GitHub, issues, screenshots, logs, or chat. Rotate it immediately if exposed.

## Architecture and limits

- `lib/face-analysis.ts`: local proportion estimate and placement adaptations.
- `app/api/evaluate`: low-detail, single-frame evaluation.
- `app/api/realtime-session`: short-lived Realtime credentials.
- `app/api/import-look`: screenshot-to-structured-guide analysis with uncertainty labels.

The importer intentionally accepts screenshots instead of claiming to download arbitrary social links. MediaPipe assets currently load from Google/jsDelivr; self-host them before enforcing a restrictive production CSP.
