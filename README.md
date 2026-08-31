# Makeup Bestie

A privacy-first, tutorial-aware makeup coach built with Next.js, MediaPipe Face Landmarker, and OpenAI. It turns an accessible public tutorial link or permitted video upload into a personalized placement lesson using a single face scan. The default lesson is camera-free; part-by-part lessons can optionally open a silent local mirror.

## Launch flow

1. Complete skin, complexion, experience, and makeup-goal onboarding.
2. Take one bare-face photo for a private, on-device proportion scan and correct the estimate if needed.
3. Paste an accessible public tutorial link **or** attach a permitted video copy, optionally add preferences, and select products already owned.
4. Review the personalized plan and explicitly consent before sending one photo for an AI makeup preview.
5. The default **Entire routine** mode automatically plays the complete product order across the mapped face. **Part by part** is an optional alternative where the user taps an available area.
6. Follow placement zones, animated application arrows, personalized instructions, and timestamped tutorial clips. Part-by-part mode alone offers an optional silent live mirror beside the demonstration.

## Privacy

- The Glam Room never opens a microphone. The default full routine never opens the camera.
- Facial landmarks are computed on-device from the selected face-scan photo and anchor the placement overlays.
- Face shape is a fallible, editable estimate.
- Uploaded tutorial videos are sampled in the browser. Ordered still frames are used for one lesson-creation request and are not saved by the app.
- Pasted tutorial links are resolved only when they expose public video media. The resolver blocks private-network destinations, limits redirects and page size, does not use platform credentials, and requests an upload when the platform blocks video access.
- The face-scan photo stays local until the user separately opts into preview generation. Makeup Bestie does not save the generated-preview request or result.
- The selected upload or publicly resolved stream remains available only in the current browser session so the Glam Room can replay relevant timestamped segments.
- The optional part-by-part mirror uses local MediaPipe tracking. Camera frames are not uploaded, analyzed by OpenAI, recorded, or saved; closing the mirror or leaving the lesson stops every media track.

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
- `lib/placement-map.ts`: turns MediaPipe landmarks into the face chart — the outline of where each product goes and the direction it is blended. Pure geometry with no React or DOM, so it is unit tested directly.
- `app/placement-guide.tsx`: renders one lesson step of that chart over the scan — dashed outlines, animated direction arrows, numbered badges.
- `app/api/preview-look`: identity-preserving makeup preview edits.
- `app/api/import-look`: ordered tutorial-frame-to-structured-lesson analysis with uncertainty labels and conservative clip timestamps.
- `app/api/tutorial-media`: bounded public-video discovery and same-origin streaming with redirect and private-network protections.
- `lib/video-frames.ts`: browser-side, timeline-wide tutorial frame sampling with sample timestamps.

Raw video is not sent to a general-purpose model. The browser samples the visual timeline, and spoken-only details are explicitly treated as uncertain. MediaPipe assets currently load from Google/jsDelivr; self-host them before enforcing a restrictive production CSP.

The browser accepts either a link or an upload. For link-only input, the server checks direct video responses and public HTML video metadata, then streams accessible media so the browser can sample it. Many TikTok, Instagram, YouTube, private, login-gated, DRM-protected, and dynamically assembled videos will not expose usable media. Those cases return an honest upload request and never generate a generic lesson.

Lesson creation returns a concise six-to-fourteen-step structured routine in the tutorial’s observed product order. A step may cover several areas—for example, concealer can include the under-eyes, nose, and mouth area—while remaining one product checkpoint. The generated preview remains unmarked. Completed products remain as a subtle visual buildup while the default routine advances automatically; part-by-part mode filters the same analyzed sequence to a selected facial area.

## The face chart

The Glam Room's central output is a placement chart drawn over the user's own scan. Each zone is built from the landmarks it belongs to rather than from a generic template, and its shape depends on the technique, not just the area: concealer under an eye is the corner-to-corner triangle, contour on a cheek is the hollow sweeping back from the top of the ear, blush on the same cheek is the apple angled toward the temple, and highlighter is the sliver of cheekbone above the contour. Arrows show the direction the product is worked in — contour blends back toward the ear, lip colour is drawn from each corner inward, base is pressed at the centre and moved outward.

The face-shape estimate changes the geometry, not only the wording: a round face gets a steeper blush lift and a more diagonal contour, a long face gets horizontal blush and hairline shading added to shorten it, and a diamond face gets minimal cheek contour. The estimate stays editable, and correcting it redraws the chart.

Geometry is computed in a display space scaled by the photo's aspect ratio, so nothing is stretched by a portrait or landscape scan, and strokes do not scale with the SVG so outlines stay crisp at any size. Arrows animate by default, can be paused from the chart, and start paused for anyone whose system asks for reduced motion. If a scan is unusable, a generic fallback face is charted and flagged rather than pretending the map is personal.
