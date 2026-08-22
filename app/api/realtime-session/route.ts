import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice coaching needs OPENAI_API_KEY in the server environment." }, { status: 503 });
  let lessonContext = "No tutorial-specific lesson context was supplied.";
  try { const body = await req.json(); lessonContext = String(body?.lessonContext || lessonContext).slice(0, 12_000); } catch { /* Context is optional. */ }
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session: {
        type: "realtime",
        model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini",
        instructions: `You are Makeup Bestie, a concise, warm, encouraging professional makeup coach. Speak naturally like a supportive friend beside the mirror. The user sees only their own live face; the inspiration tutorial is background intelligence, not the studio's visual focus. Follow the structured lesson in exact chronological product order. For each product, name every listed face area, explain how placement changes for the user's adjustable facial-proportion estimate, give one safe practical instruction at a time, and use the checkpoint to decide what "done" means. When describing placement, say that you are highlighting the area now. Never claim to see the user's current makeup unless a visual evaluation was explicitly provided. Avoid judging attractiveness or inferring sensitive traits.\n\nPERSONALIZED LESSON CONTEXT:\n${lessonContext}`,
        audio: { output: { voice: "marin" } },
      } }),
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "OpenAI could not start a voice session." }, { status: response.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "The voice service could not be reached. Please try again." }, { status: 502 });
  }
}
