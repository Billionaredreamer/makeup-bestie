import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "AI preview generation is not configured locally." }, { status: 503 });
  const form = await req.formData();
  const face = form.get("face");
  const reference = form.get("reference");
  const description = String(form.get("description") || "personalized makeup look");
  const intensity = String(form.get("intensity") || "reference");
  if (!(face instanceof File) || !face.type.startsWith("image/") || face.size > 8_000_000)
    return NextResponse.json({ error: "Choose a JPG, PNG, or WebP bare-face photo under 8 MB." }, { status: 400 });
  const body = new FormData();
  body.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2");
  body.append("image[]", face, "bare-face.jpg");
  if (reference instanceof File && reference.type.startsWith("image/") && reference.size <= 8_000_000) body.append("image[]", reference, "inspiration.jpg");
  body.append("prompt", `Create a clean, realistic finished-makeup visualization on the person in the first image. Preserve their identity, facial structure, expression, skin texture, lighting, hairstyle, and background. Apply only makeup—do not reshape features, retouch skin, change age, ethnicity, body, or attractiveness. Inspiration: ${description}. Intensity: ${intensity}. If a second image is supplied, transfer only its finished makeup style rather than the other person's identity. Never reproduce arrows, circles, X marks, guides, labels, captions, logos, watermarks, swatches, or any other tutorial annotation. Show a natural unmarked face. The result is an illustrative preview, not a guaranteed outcome.`);
  body.append("quality", "medium"); body.append("size", "1024x1536");
  try {
    const response = await fetch("https://api.openai.com/v1/images/edits", { method:"POST", headers:{ Authorization:`Bearer ${key}` }, body });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error:data?.error?.message || "Preview generation is temporarily unavailable." }, { status:response.status });
    const encoded = data?.data?.[0]?.b64_json;
    if (!encoded) return NextResponse.json({ error:"The preview could not be generated." }, { status:502 });
    return NextResponse.json({ image:`data:image/png;base64,${encoded}` });
  } catch {
    return NextResponse.json({ error:"The preview service could not be reached. Please try again." }, { status:502 });
  }
}
