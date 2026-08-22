import { NextRequest, NextResponse } from "next/server";
/* eslint-disable @typescript-eslint/no-explicit-any -- OpenAI REST response items are narrowed by runtime type tags */

export const runtime = "nodejs";

const regions = ["all-face","complexion","forehead","both-cheeks","left-cheek","right-cheek","both-eyes","left-eye","right-eye","brows","nose","lips","jaw","none"];
const techniques = ["prep","base","conceal","contour","blush","highlight","eyes","eyeliner","brow","lips","finish"];
const responseText = (data: any) => data?.output_text || data?.output?.flatMap((item:any) => item?.content || []).find((item:any) => item?.type === "output_text")?.text;

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Tutorial analysis needs OPENAI_API_KEY in the server environment." }, { status: 503 });
  let body: { frames?: unknown; description?: unknown; context?: unknown; duration?: unknown; sourceMode?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Send a tutorial video analysis request or a written look description." }, { status: 400 }); }
  const frames = Array.isArray(body.frames) ? body.frames.filter((item): item is string => typeof item === "string" && item.startsWith("data:image/jpeg;base64,")).slice(0, 12) : [];
  const description = String(body.description || "").trim().slice(0, 3000);
  const context = String(body.context || "").slice(0, 6000);
  const duration = Math.max(0, Math.min(Number(body.duration) || 0, 3600));
  const sourceMode = body.sourceMode === "link" ? "link" : body.sourceMode === "video" ? "video" : "describe";
  if (!frames.length && !description) return NextResponse.json({ error: "Upload a tutorial video or describe the look you want." }, { status: 400 });
  if (frames.some(frame => frame.length > 900_000)) return NextResponse.json({ error: "One or more tutorial frames are too large to analyze." }, { status: 413 });

  const schema = { type: "object", additionalProperties: false, required: ["title","summary","adaptation","difficulty","estimatedMinutes","products","steps","uncertainties","analysisScope"], properties: {
    title: { type: "string" }, summary: { type: "string" }, adaptation: { type: "string" }, difficulty: { type: "string" }, estimatedMinutes: { type: "integer" },
    products: { type: "array", maxItems: 16, items: { type: "string" } }, analysisScope: { type: "string" }, uncertainties: { type: "array", maxItems: 6, items: { type: "string" } },
    steps: { type: "array", minItems: 1, maxItems: 14, items: { type: "object", additionalProperties: false, required: ["title","instruction","product","region","areas","technique","referenceCue","adaptation","checkpoint","uncertain"], properties: {
      title: { type: "string" }, instruction: { type: "string" }, product: { type: "string" }, region: { type: "string", enum: regions }, areas: { type:"array", minItems:1, maxItems:7, items:{ type:"string", enum:regions } }, technique: { type: "string", enum: techniques }, referenceCue: { type: "string" }, adaptation: { type: "string" }, checkpoint: { type:"string" }, uncertain: { type: "boolean" }
    } } } }
  };
  const visualContent = frames.map((image_url, index) => ({ type: "input_image" as const, image_url, detail: index % 3 === 0 ? "high" as const : "low" as const }));
  const sourceExplanation = frames.length
    ? `These ${frames.length} ordered still frames sample a ${Math.round(duration)} second tutorial from beginning to end. Infer only visually supported sequence changes. Spoken-only details and exact products may be missing.`
    : sourceMode === "link"
      ? "The user saved an external tutorial link, but the URL contents were not provided and must not be treated as viewed. Build the lesson only from the written description and say so plainly in analysisScope."
      : "The user supplied a written look description and no tutorial video.";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || "gpt-5.6-luna", max_output_tokens: 6400, store: false, reasoning: { effort: "low" },
        text: { verbosity: "low", format: { type: "json_schema", name: "personalized_makeup_lesson", strict: true, schema } },
        input: [{ role: "user", content: [
          { type: "input_text", text: `Turn this into one concise chronological, product-by-product makeup lesson with 6-14 steps. ${sourceExplanation}\nUser request: ${description || "Recreate the visible tutorial style."}\nUser context: ${context}\nThe user will see their own live face, never a generic face chart or creator video. Preserve the tutorial's observed product order. Make each step one product or one distinct application pass; if the same product is used twice with a different shade, purpose, or placement, keep those as separate steps. Set region to the primary area and areas to every face area affected in that step. Use product categories rather than invented brands, use available products when possible, and suggest simple category substitutes. Put tutorial evidence in referenceCue, face/skin/skill personalization in adaptation, and one visually checkable completion condition in checkpoint. Treat face shape as an adjustable estimate. Flag unsupported shades, products, or hidden steps as uncertain. Keep the summary and adaptation under three short sentences, and every step field to one practical sentence.` },
          ...visualContent,
        ] }]
      })
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "Tutorial analysis failed." }, { status: response.status });
    try { return NextResponse.json(JSON.parse(responseText(data))); } catch { return NextResponse.json({ error: data?.status === "incomplete" ? "The AI could not finish the lesson format. Please try once more." : "The personalized lesson could not be formatted." }, { status: 502 }); }
  } catch {
    return NextResponse.json({ error: "The tutorial analysis service could not be reached." }, { status: 502 });
  }
}
