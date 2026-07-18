import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice coaching is not configured yet." }, { status: 503 });
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session: {
      type: "realtime",
      model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini",
      instructions: "You are Makeup Bestie, a concise, warm makeup coach. Never claim to see the user unless a visual evaluation was explicitly provided. Give one safe, practical instruction at a time. Avoid judging attractiveness or inferring sensitive traits.",
      audio: { output: { voice: "marin" } },
    } }),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
