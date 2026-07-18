import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Tutorial analysis is not configured yet." }, { status: 503 });
  const form = await req.formData();
  const file = form.get("file");
  const context = String(form.get("context") || "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a screenshot to analyze." }, { status: 400 });
  if (!file.type.startsWith("image/") || file.size > 8_000_000) return NextResponse.json({ error: "Use a JPG, PNG, or WebP image under 8 MB." }, { status: 400 });
  const image = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini", max_output_tokens: 700,
      text: { format: { type: "json_schema", name: "makeup_guide", strict: true, schema: { type: "object", additionalProperties: false, required: ["title","summary","steps","uncertainties"], properties: {
        title: { type: "string" }, summary: { type: "string" }, steps: { type: "array", items: { type: "object", additionalProperties: false, required: ["title","instruction","product"], properties: { title: { type: "string" }, instruction: { type: "string" }, product: { type: "string" } } } }, uncertainties: { type: "array", items: { type: "string" } }
      } } } },
      input: [{ role: "user", content: [{ type: "input_text", text: `Turn this reference into a practical makeup guide. Adapt cautiously to this user context: ${context}. Describe product categories, not brands. Clearly flag shade/product guesses.` }, { type: "input_image", image_url: image, detail: "high" }] }]
    })
  });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data?.error?.message || "Analysis failed." }, { status: response.status });
  try { return NextResponse.json(JSON.parse(data.output_text)); } catch { return NextResponse.json({ error: "The guide could not be formatted." }, { status: 502 }); }
}
