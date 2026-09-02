import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const decodeImage = (value: string) => {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 8_000_000) return null;
  return { bytes, mime: match[1], extension: match[1].split("/")[1].replace("jpeg","jpg") };
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data, error } = await supabase.from("saved_looks").select("id,title,tutorial_source,brief,preview_path,created_at").eq("user_id",auth.user.id).order("created_at",{ascending:false});
  if (error) return NextResponse.json({ error: "Saved looks could not be loaded." }, { status: 500 });
  const looks = await Promise.all((data||[]).map(async look=>{
    let preview_url:string|null=null;
    if(look.preview_path){const {data:signed}=await supabase.storage.from("look-previews").createSignedUrl(look.preview_path,3600);preview_url=signed?.signedUrl||null;}
    return {...look,preview_url};
  }));
  return NextResponse.json({ looks });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json();
  const brief = body.brief && typeof body.brief === "object" ? body.brief : null;
  const title = String(body.title || "Saved makeup look").trim().slice(0,120);
  if (!brief) return NextResponse.json({ error: "There is no personalized lesson to save." }, { status: 400 });
  let previewPath:string|null=null;
  if (typeof body.previewImage === "string" && body.previewImage) {
    const decoded=decodeImage(body.previewImage);
    if(!decoded)return NextResponse.json({error:"The preview image could not be saved."},{status:400});
    previewPath=`${auth.user.id}/${crypto.randomUUID()}.${decoded.extension}`;
    const {error:uploadError}=await supabase.storage.from("look-previews").upload(previewPath,decoded.bytes,{contentType:decoded.mime,upsert:false});
    if(uploadError)return NextResponse.json({error:"The private preview could not be stored."},{status:500});
  }
  const { data, error } = await supabase.from("saved_looks").insert({user_id:auth.user.id,title,tutorial_source:body.tutorialSource||null,brief,preview_path:previewPath}).select("id").single();
  if(error){if(previewPath)await supabase.storage.from("look-previews").remove([previewPath]);return NextResponse.json({error:"The look could not be saved."},{status:500});}
  return NextResponse.json({id:data.id});
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const id=new URL(request.url).searchParams.get("id");
  if(!id)return NextResponse.json({error:"Choose a look to delete."},{status:400});
  const {data}=await supabase.from("saved_looks").select("preview_path").eq("id",id).eq("user_id",auth.user.id).maybeSingle();
  const {error}=await supabase.from("saved_looks").delete().eq("id",id).eq("user_id",auth.user.id);
  if(error)return NextResponse.json({error:"The look could not be deleted."},{status:500});
  if(data?.preview_path)await supabase.storage.from("look-previews").remove([data.preview_path]);
  return NextResponse.json({ok:true});
}
