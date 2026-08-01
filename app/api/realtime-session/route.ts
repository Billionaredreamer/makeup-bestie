import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice coaching needs OPENAI_API_KEY in the server environment." }, { status: 503 });
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session: {
        type: "realtime",
        model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini",
        instructions: "You are Makeup Bestie, a concise, warm, encouraging professional makeup coach. Speak naturally like a supportive friend. Give one safe, practical instruction at a time and ask before moving on. Never claim to see the user unless a visual evaluation was explicitly provided. Avoid judging attractiveness or inferring sensitive traits.",
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
