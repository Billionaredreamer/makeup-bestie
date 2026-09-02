import { createSupabaseServerClient, serverCloudConfigured } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AiOperation = "tutorial_analysis" | "preview_generation";

type Reservation = { allowed: boolean; eventId: string | null; message?: string; code?: string };

export async function reserveAiUsage(operation: AiOperation, requestKey: string): Promise<Reservation> {
  if (!serverCloudConfigured && process.env.NODE_ENV !== "production") return { allowed: true, eventId: null };
  if (!serverCloudConfigured) return { allowed: false, eventId: null, code: "configuration", message: "Subscriber accounts are temporarily unavailable." };
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { allowed: false, eventId: null, code: "authentication", message: "Sign in to use personalized AI lessons." };
  const { data, error } = await supabase.rpc("reserve_ai_usage", {
    requested_operation: operation,
    requested_key: requestKey.slice(0, 120),
  });
  if (error) return { allowed: false, eventId: null, code: "entitlement", message: "We could not verify your plan. Please refresh and try again." };
  const result = data as { allowed?: boolean; event_id?: string; message?: string; code?: string } | null;
  return {
    allowed: Boolean(result?.allowed),
    eventId: result?.event_id || null,
    message: result?.message,
    code: result?.code,
  };
}

export async function finishAiUsage(eventId: string | null, success: boolean) {
  if (!eventId) return;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const admin = createSupabaseAdminClient();
    await admin.from("ai_usage_events").update({ status: success ? "completed" : "failed" }).eq("id", eventId).eq("user_id", auth.user.id);
  } catch {
    // Entitlement cleanup must never replace the real API response.
  }
}
