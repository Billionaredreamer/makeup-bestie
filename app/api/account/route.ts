import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
  const [{ data: profile }, { data: subscription }, { data: usage }] = await Promise.all([
    supabase.from("profiles").select("display_name,skin_type,skin_tone,experience,makeup_goal,products,face_shape").eq("user_id",auth.user.id).maybeSingle(),
    supabase.from("subscriptions").select("plan,status,current_period_end,cancel_at_period_end").eq("user_id",auth.user.id).maybeSingle(),
    supabase.from("ai_usage_events").select("operation,status,created_at").eq("user_id",auth.user.id).in("status",["reserved","completed"]).gte("created_at",monthStart.toISOString()),
  ]);
  const recentReservationCutoff = Date.now() - 15 * 60 * 1000;
  const countedUsage = (usage || []).filter(item => item.status === "completed" || new Date(item.created_at).getTime() >= recentReservationCutoff);
  return NextResponse.json({
    user: { id: auth.user.id, email: auth.user.email || "" }, profile, subscription,
    usage: {
      tutorialAnalyses: countedUsage.filter(item=>item.operation==="tutorial_analysis").length,
      previewGenerations: countedUsage.filter(item=>item.operation==="preview_generation").length,
    },
  });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Profile details were not valid." }, { status: 400 });
  const { data: current } = await supabase.from("profiles").select("display_name,skin_type,skin_tone,experience,makeup_goal,products,face_shape").eq("user_id",auth.user.id).maybeSingle();
  const profile = {
    user_id: auth.user.id,
    display_name: String(body.display_name ?? current?.display_name ?? "").trim().slice(0,80),
    skin_type: String(body.skin_type ?? current?.skin_type ?? "").slice(0,80),
    skin_tone: String(body.skin_tone ?? current?.skin_tone ?? "").slice(0,80),
    experience: String(body.experience ?? current?.experience ?? "").slice(0,80),
    makeup_goal: String(body.makeup_goal ?? current?.makeup_goal ?? "").slice(0,120),
    products: Array.isArray(body.products) ? body.products.map(String).slice(0,40) : current?.products ?? [],
    face_shape: body.face_shape === null ? null : body.face_shape ? String(body.face_shape).slice(0,30) : current?.face_shape ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("profiles").upsert(profile, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Your profile could not be saved." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const admin=createSupabaseAdminClient();
  const {data:subscription}=await admin.from("subscriptions").select("stripe_subscription_id,status").eq("user_id",auth.user.id).maybeSingle();
  if(subscription?.stripe_subscription_id&&["active","trialing","past_due"].includes(subscription.status)){
    try{await getStripe().subscriptions.cancel(subscription.stripe_subscription_id);}
    catch{return NextResponse.json({error:"Your subscription could not be cancelled, so your account was not deleted. Open billing or contact support."},{status:502});}
  }
  const {data:files}=await admin.storage.from("look-previews").list(auth.user.id,{limit:1000});
  if(files?.length)await admin.storage.from("look-previews").remove(files.map(file=>`${auth.user!.id}/${file.name}`));
  const {error}=await admin.auth.admin.deleteUser(auth.user.id);
  if(error)return NextResponse.json({error:"Your account could not be deleted."},{status:500});
  return NextResponse.json({ok:true});
}
