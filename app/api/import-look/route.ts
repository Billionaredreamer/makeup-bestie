import { NextRequest, NextResponse } from "next/server";
/* eslint-disable @typescript-eslint/no-explicit-any -- OpenAI REST response items are narrowed by runtime type tags */

export const runtime = "nodejs";
export const maxDuration = 60;

const regions = ["all-face","complexion","forehead","both-cheeks","left-cheek","right-cheek","both-eyes","left-eye","right-eye","brows","nose","lips","jaw","none"];
const techniques = ["prep","base","conceal","contour","blush","highlight","eyes","eyeliner","brow","lips","finish"];
const responseText = (data: any) => data?.output_text || data?.output?.flatMap((item:any) => item?.content || []).find((item:any) => item?.type === "output_text")?.text;

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Tutorial analysis needs OPENAI_API_KEY in the server environment." }, { status: 503 });
  let body: { frames?: unknown; sampleTimes?: unknown; description?: unknown; context?: unknown; duration?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Send extracted tutorial frames for analysis." }, { status: 400 }); }
  const frames = Array.isArray(body.frames) ? body.frames.filter((item): item is string => typeof item === "string" && item.startsWith("data:image/jpeg;base64,")).slice(0, 14) : [];
  const sampleTimes = Array.isArray(body.sampleTimes) ? body.sampleTimes.map(Number).filter(Number.isFinite).slice(0, frames.length) : [];
  const description = String(body.description || "").trim().slice(0, 3000);
  const context = String(body.context || "").slice(0, 6000);
  const duration = Math.max(0, Math.min(Number(body.duration) || 0, 3600));
  if (frames.length < 4) return NextResponse.json({ error: "The actual tutorial video is required. We could not extract enough frames to analyze its sequence." }, { status: 400 });
  if (frames.some(frame => frame.length > 900_000)) return NextResponse.json({ error: "One or more tutorial frames are too large to analyze." }, { status: 413 });

  const schema = { type: "object", additionalProperties: false, required: ["title","summary","adaptation","difficulty","estimatedMinutes","products","steps","uncertainties","analysisScope"], properties: {
    title: { type: "string" }, summary: { type: "string" }, adaptation: { type: "string" }, difficulty: { type: "string" }, estimatedMinutes: { type: "integer" },
    products: { type: "array", maxItems: 16, items: { type: "string" } }, analysisScope: { type: "string" }, uncertainties: { type: "array", maxItems: 6, items: { type: "string" } },
    steps: { type: "array", minItems: 1, maxItems: 14, items: { type: "object", additionalProperties: false, required: ["title","instruction","product","region","areas","technique","referenceCue","adaptation","checkpoint","startTimeSeconds","endTimeSeconds","uncertain"], properties: {
      title: { type: "string" }, instruction: { type: "string" }, product: { type: "string" }, region: { type: "string", enum: regions }, areas: { type:"array", minItems:1, maxItems:7, items:{ type:"string", enum:regions } }, technique: { type: "string", enum: techniques }, referenceCue: { type: "string" }, adaptation: { type: "string" }, checkpoint: { type:"string" }, startTimeSeconds: { type:"number", minimum:0 }, endTimeSeconds: { type:"number", minimum:0 }, uncertain: { type: "boolean" }
    } } } }
  };
  const visualContent = frames.flatMap((image_url, index) => [
    { type: "input_text" as const, text: `Timeline sample ${index + 1} at ${sampleTimes[index] ?? Math.round(((index + .5) / frames.length) * duration)} seconds.` },
    { type: "input_image" as const, image_url, detail: index % 3 === 0 ? "high" as const : "low" as const },
  ]);
  const sourceExplanation = `These ${frames.length} ordered still frames sample the uploaded ${Math.round(duration)} second tutorial from beginning to end. The lesson must be based on visible changes across these frames, not on a generic makeup routine. Spoken-only details and exact products may still be uncertain.`;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini", max_output_tokens: 6400, store: false, reasoning: { effort: "low" },
        text: { verbosity: "low", format: { type: "json_schema", name: "personalized_makeup_lesson", strict: true, schema } },
        input: [{ role: "user", content: [
          { type: "input_text", text: `Turn this into one concise chronological, product-by-product makeup lesson with 6-14 steps. ${sourceExplanation}\nUser request: ${description || "Recreate the visibly demonstrated tutorial style."}\nUser context: ${context}\nFirst identify the visible progression between ordered frames, then adapt that exact routine to the user's facial proportions, skin preference, skill level, and available products in the supplied context. Never default to a generic full-face routine. Preserve the tutorial's observed product order. Make each step one product or one distinct application pass; if the same product is used twice with a different shade, purpose, or face area, keep those as separate steps. Set region to the primary area and areas to every face area affected in that step. Give each step conservative startTimeSeconds and endTimeSeconds within the video duration so the user can replay the most relevant tutorial segment; use the supplied sample timestamps as evidence and never invent a time outside the video. Use product categories rather than invented brands, use available products when possible, and suggest simple category substitutes. Put specific visible tutorial evidence in referenceCue, face/skin/skill personalization in adaptation, and one visually checkable completion condition in checkpoint. Creator annotations such as arrows, circles, X marks, captions, and watermarks are evidence only and must never become part of the makeup result. Treat face shape as an adjustable estimate. Flag unsupported shades, products, spoken-only details, or hidden steps as uncertain. Keep the summary and adaptation under three short sentences, and every step field to one practical sentence.` },
          ...visualContent,
        ] }]
      })
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "Tutorial analysis failed." }, { status: response.status });
    try {
      const lesson = JSON.parse(responseText(data));
      lesson.analysisScope = `Analyzed ${frames.length} ordered frames sampled across the uploaded ${Math.round(duration)}-second tutorial, then adapted the observed sequence to the supplied face estimate, skin preferences, experience, and makeup bag.`;
      return NextResponse.json(lesson);
    } catch { return NextResponse.json({ error: data?.status === "incomplete" ? "The AI could not finish the lesson format. Please try once more." : "The personalized lesson could not be formatted." }, { status: 502 }); }
  } catch {
    return NextResponse.json({ error: "The tutorial analysis service could not be reached." }, { status: 502 });
  }
}
