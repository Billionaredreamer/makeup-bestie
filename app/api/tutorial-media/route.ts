import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REDIRECTS = 4;
const MAX_HTML_BYTES = 1_500_000;
const MAX_VIDEO_BYTES = 250_000_000;
const FETCH_HEADERS = {
  Accept: "video/*,text/html;q=0.9,*/*;q=0.5",
  "User-Agent": "Mozilla/5.0 (compatible; MakeupBestie/1.0; tutorial-analysis)",
};

class TutorialLinkError extends Error {
  constructor(message:string, readonly code:"invalid"|"blocked"|"inaccessible"|"unsupported"|"too-large") { super(message); }
}

function isPrivateIp(address:string) {
  const value=address.toLowerCase();
  if(value==="::"||value==="::1"||value.startsWith("fc")||value.startsWith("fd")||/^fe[89ab]/.test(value)) return true;
  const mapped=value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4=mapped||value;
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(ipv4)) return false;
  const [a,b]=ipv4.split(".").map(Number);
  return a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127);
}

async function publicUrl(raw:string) {
  let url:URL;
  try { url=new URL(raw); } catch { throw new TutorialLinkError("Paste a complete public tutorial link beginning with http:// or https://.","invalid"); }
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||!["","80","443"].includes(url.port)) throw new TutorialLinkError("Only standard public http or https tutorial links are supported.","invalid");
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")) throw new TutorialLinkError("Private or local network links cannot be accessed.","blocked");
  if(isIP(host)) {
    if(isPrivateIp(host)) throw new TutorialLinkError("Private or local network links cannot be accessed.","blocked");
  } else {
    let addresses;
    try { addresses=await lookup(host,{all:true,verbatim:true}); } catch { throw new TutorialLinkError("The tutorial host could not be reached.","inaccessible"); }
    if(!addresses.length||addresses.some(item=>isPrivateIp(item.address))) throw new TutorialLinkError("Private or local network links cannot be accessed.","blocked");
  }
  return url;
}

async function safeFetch(raw:string, range?:string) {
  let current=(await publicUrl(raw)).toString();
  for(let redirect=0;redirect<=MAX_REDIRECTS;redirect+=1) {
    const response=await fetch(current,{redirect:"manual",cache:"no-store",headers:{...FETCH_HEADERS,...(range?{Range:range}:{})},signal:AbortSignal.timeout(15_000)});
    if(response.status>=300&&response.status<400) {
      const location=response.headers.get("location");
      response.body?.cancel();
      if(!location||redirect===MAX_REDIRECTS) throw new TutorialLinkError("The tutorial link redirected too many times.","inaccessible");
      current=(await publicUrl(new URL(location,current).toString())).toString();
      continue;
    }
    if(!response.ok&&response.status!==206) {
      response.body?.cancel();
      throw new TutorialLinkError(response.status===401||response.status===403?"This platform requires sign-in or blocks automated tutorial access.":"The linked tutorial could not be downloaded.","inaccessible");
    }
    return {response,finalUrl:current};
  }
  throw new TutorialLinkError("The tutorial link could not be resolved.","inaccessible");
}

async function limitedHtml(response:Response) {
  const length=Number(response.headers.get("content-length")||0);
  if(length>MAX_HTML_BYTES) throw new TutorialLinkError("The linked page is too large to inspect safely.","too-large");
  if(!response.body) return "";
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  while(true) {
    const {done,value}=await reader.read();
    if(done) break;
    total+=value.byteLength;
    if(total>MAX_HTML_BYTES) { await reader.cancel(); throw new TutorialLinkError("The linked page is too large to inspect safely.","too-large"); }
    chunks.push(value);
  }
  const merged=new Uint8Array(total); let offset=0;
  for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(merged);
}

function candidateMedia(html:string, base:string) {
  const patterns=[
    /<meta[^>]+(?:property|name)=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:video(?::secure_url|:url)?["']/gi,
    /<meta[^>]+(?:property|name)=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/gi,
    /<(?:video|source)[^>]+src=["']([^"']+)["']/gi,
  ];
  const found:string[]=[];
  for(const pattern of patterns) for(const match of html.matchAll(pattern)) {
    try { found.push(new URL(match[1].replaceAll("&amp;","&"),base).toString()); } catch { /* Ignore malformed page metadata. */ }
  }
  return [...new Set(found)].slice(0,6);
}

function isVideo(response:Response, url:string) {
  const type=(response.headers.get("content-type")||"").toLowerCase();
  return type.startsWith("video/")||((type.includes("octet-stream")||!type)&&/\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(url));
}

async function resolveTutorial(source:string, range?:string) {
  const initial=await safeFetch(source);
  if(isVideo(initial.response,initial.finalUrl)) {
    if(range) { initial.response.body?.cancel(); return safeFetch(initial.finalUrl,range); }
    return initial;
  }
  const type=(initial.response.headers.get("content-type")||"").toLowerCase();
  if(!type.includes("text/html")) { initial.response.body?.cancel(); throw new TutorialLinkError("This link does not expose a supported public video.","unsupported"); }
  const html=await limitedHtml(initial.response);
  for(const candidate of candidateMedia(html,initial.finalUrl)) {
    try {
      const media=await safeFetch(candidate,range||"bytes=0-1");
      if(isVideo(media.response,media.finalUrl)) return media;
      media.response.body?.cancel();
    } catch { /* Try the next public video candidate. */ }
  }
  throw new TutorialLinkError("This platform does not expose the tutorial video for direct analysis. Upload a permitted copy instead.","unsupported");
}

function errorResponse(error:unknown) {
  if(error instanceof TutorialLinkError) return NextResponse.json({error:error.message,code:error.code},{status:error.code==="invalid"?400:error.code==="blocked"?403:422});
  if(error instanceof DOMException&&error.name==="TimeoutError") return NextResponse.json({error:"The tutorial link took too long to respond. Upload the video instead.",code:"inaccessible"},{status:504});
  return NextResponse.json({error:"The tutorial link could not be accessed. Upload the video instead.",code:"inaccessible"},{status:502});
}

export async function POST(req:NextRequest) {
  try {
    const body=await req.json();
    const source=String(body?.source||"").trim().slice(0,2048);
    const resolved=await resolveTutorial(source,"bytes=0-1");
    const length=Number(resolved.response.headers.get("content-range")?.split("/").at(-1)||resolved.response.headers.get("content-length")||0);
    resolved.response.body?.cancel();
    if(length>MAX_VIDEO_BYTES) throw new TutorialLinkError("This tutorial is too large for link analysis. Upload a shorter copy instead.","too-large");
    return NextResponse.json({streamUrl:`/api/tutorial-media?source=${encodeURIComponent(source)}`,message:"Public tutorial video is accessible for analysis."});
  } catch(error) { return errorResponse(error); }
}

export async function GET(req:NextRequest) {
  try {
    const source=String(req.nextUrl.searchParams.get("source")||"").slice(0,2048);
    const resolved=await resolveTutorial(source,req.headers.get("range")||undefined);
    const length=Number(resolved.response.headers.get("content-length")||0);
    if(length>MAX_VIDEO_BYTES) { resolved.response.body?.cancel(); throw new TutorialLinkError("This tutorial is too large for link analysis. Upload a shorter copy instead.","too-large"); }
    const headers=new Headers({"Cache-Control":"private, no-store","Content-Type":resolved.response.headers.get("content-type")||"video/mp4","Content-Disposition":"inline"});
    for(const name of ["accept-ranges","content-length","content-range"]) { const value=resolved.response.headers.get(name); if(value) headers.set(name,value); }
    return new Response(resolved.response.body,{status:resolved.response.status===206?206:200,headers});
  } catch(error) { return errorResponse(error); }
}
