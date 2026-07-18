import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const MAX_IMAGE_CHARS = 2_800_000;

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "AI checks are not configured yet." }, { status: 503 });
  const { image, step, placement, profile } = await req.json();
  if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,") || image.length > MAX_IMAGE_CHARS)
    return NextResponse.json({ error: "Invalid or oversized camera frame." }, { status: 400 });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini",
      max_output_tokens: 180,
      input: [{ role: "user", content: [
        { type: "input_text", text: `Evaluate only visible makeup placement for the ${step} step. Local face estimate: ${profile}. Target placement: ${placement}. Give one brief, kind, side-specific correction if clearly supported; otherwise say placement looks even or that lighting/image quality prevents a reliable check. Never infer identity, health, ethnicity, age, emotion, or attractiveness.` },
        { type: "input_image", image_url: image, detail: "low" },
      ] }],
    }),
  });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data?.error?.message || "The AI check is temporarily unavailable." }, { status: response.status });
  return NextResponse.json({ feedback: data.output_text || "I couldn’t make a reliable assessment from that frame." });
}
