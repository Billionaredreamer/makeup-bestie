import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { finishAiUsage, reserveAiUsage } from "@/lib/server/entitlements";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Choose a saved look to open." }, { status: 400 });

  // Confirm ownership before reserving usage so missing or forged ids can
  // never consume a subscriber's allowance.
  const { data: look, error } = await supabase
    .from("saved_looks")
    .select("id,title,tutorial_source,brief,created_at")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The saved look could not be opened." }, { status: 500 });
  if (!look) return NextResponse.json({ error: "That saved look is no longer available." }, { status: 404 });
  const savedBrief = look.brief as { steps?: unknown } | null;
  if (!savedBrief || !Array.isArray(savedBrief.steps) || savedBrief.steps.length === 0) {
    return NextResponse.json({ error: "This saved lesson has no steps to open." }, { status: 422 });
  }

  // A replay is a lesson session, so it belongs in the same Plus allowance as
  // a newly analyzed tutorial. The key is generated on the trusted server:
  // clients cannot reuse a key to reopen the same lesson without being metered.
  const reservation = await reserveAiUsage("tutorial_analysis", `saved-replay:${look.id}:${crypto.randomUUID()}`);
  if (!reservation.allowed) {
    const status = reservation.code === "authentication" ? 401 : reservation.code === "subscription_required" ? 402 : reservation.code === "configuration" ? 503 : 429;
    return NextResponse.json({ error: reservation.message, code: reservation.code }, { status });
  }

  await finishAiUsage(reservation.eventId, true);
  return NextResponse.json({ look });
}
