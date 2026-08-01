"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element -- preparation photos use temporary local blob URLs */

import { useCallback, useEffect, useRef, useState } from "react";
import { estimateFaceProfile, placementFor, type FaceProfile, type FaceShape, type Point } from "@/lib/face-analysis";

type View = "home" | "onboarding" | "studio-intake" | "look-brief" | "preview" | "face-map" | "consent" | "session" | "import" | "profile";
type LookSource = "video" | "reference" | "curated" | "describe";
type LookBrief = { title: string; summary: string; adaptation: string; difficulty: string; time: string; products: string[]; uncertainties: string[] };
type GuidanceMode = "alternate" | "one-area" | "free";
type MapRegion = { id: string; label: string; x: number; y: number; instruction: string };
type CameraState = "off" | "starting" | "tracking" | "denied" | "no-face" | "poor-light" | "error";
type ImportedGuide = { title: string; summary: string; steps: { title: string; instruction: string; product: string }[]; uncertainties: string[] };
const lesson = [
  ["Prep your canvas", "Press primer into the center, then blend outward.", "prep"],
  ["Even the base", "Tap skin tint in thin layers; keep the hairline sheer.", "base"],
  ["Personalized sculpt", "Follow the live cheek guides and blend upward.", "contour"],
  ["Blush & glow", "Place blush inside the rose guides, then soften every edge.", "blush"],
  ["Frame the eyes", "Use the eye guides as direction, not a hard boundary.", "eyeliner"],
  ["Finish the lip", "Trace your natural lip border and blend toward the center.", "lips"],
] as const;

function Logo({ home }: { home: () => void }) { return <button className="logo" onClick={home}><span>m</span> makeup bestie</button>; }

export default function App() {
  const [view, setView] = useState<View>("home");
  const [onboard, setOnboard] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState({ local: true, frames: false, voice: false });
  const [step, setStep] = useState(0);
  const [camera, setCamera] = useState<CameraState>("off");
  const [profile, setProfile] = useState<FaceProfile | null>(null);
  const [shape, setShape] = useState<FaceShape | null>(null);
  const [feedback, setFeedback] = useState("Local tracking is ready when you are.");
  const [checking, setChecking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [importResult, setImportResult] = useState<ImportedGuide | null>(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [lookSource, setLookSource] = useState<LookSource>("reference");
  const [lookNotes, setLookNotes] = useState("");
  const [lookFile, setLookFile] = useState<File | null>(null);
  const [brief, setBrief] = useState<LookBrief | null>(null);
  const [ownedProducts, setOwnedProducts] = useState<string[]>([]);
  const [prepPhoto, setPrepPhoto] = useState("");
  const [mapStatus, setMapStatus] = useState<"idle"|"analyzing"|"ready"|"no-face"|"error">("idle");
  const [mapMessage, setMapMessage] = useState("Your photo stays on this device.");
  const [mapRegions, setMapRegions] = useState<MapRegion[]>([]);
  const [selectedRegion, setSelectedRegion] = useState("complexion");
  const [guidanceMode, setGuidanceMode] = useState<GuidanceMode>("alternate");
  const [saveSessionPhotos, setSaveSessionPhotos] = useState(false);
  const [prepFile, setPrepFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState("");
  const [previewStatus, setPreviewStatus] = useState<"idle"|"generating"|"ready"|"error">("idle");
  const [previewError, setPreviewError] = useState("");
  const [previewIntensity, setPreviewIntensity] = useState<"soft"|"reference"|"dramatic">("reference");
  const [lessonMode, setLessonMode] = useState<"complete"|"feature">("complete");
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const peer = useRef<RTCPeerConnection | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const voiceAttempt = useRef(0);
  const voiceStarting = useRef(false);
  void profile;

  const go = (v: View) => { const next = v === "consent" && !brief ? "studio-intake" : v === "consent" && !prepPhoto ? "preview" : v; setView(next); window.scrollTo(0, 0); };
  const stopVoice = useCallback(() => { voiceAttempt.current += 1; voiceStarting.current = false; setVoiceConnecting(false); microphone.current?.getTracks().forEach(track => track.stop()); microphone.current = null; peer.current?.close(); peer.current = null; if (audio.current) { audio.current.pause(); audio.current.srcObject = null; audio.current.remove(); } audio.current = null; setVoiceActive(false); }, []);
  const stopCamera = useCallback((userAction?: unknown) => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setCamera("off"); stopVoice(); if (userAction) { setPaused(false); setFeedback("Session ended. Your camera and microphone are off."); setView("look-brief"); window.scrollTo(0, 0); } }, [stopVoice]);

  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => () => { if (prepPhoto) URL.revokeObjectURL(prepPhoto); }, [prepPhoto]);

  const drawGuides = useCallback((p: Point[]) => {
    const c = canvas.current, v = video.current;
    if (!c || !v || !v.videoWidth) return;
    c.width = v.clientWidth * devicePixelRatio; c.height = v.clientHeight * devicePixelRatio;
    const ctx = c.getContext("2d")!; ctx.scale(devicePixelRatio, devicePixelRatio); ctx.clearRect(0, 0, v.clientWidth, v.clientHeight);
    const xy = (i: number) => ({ x: (1 - p[i].x) * v.clientWidth, y: p[i].y * v.clientHeight });
    const line = (ids: number[], color: string, width = 3) => { ctx.beginPath(); ids.forEach((id, i) => { const q = xy(id); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.setLineDash([8, 8]); ctx.stroke(); };
    const kind = lesson[step][2];
    if (kind === "contour" || kind === "blush") { line([234, 117, 111, 50], "rgba(250,190,177,.9)", 5); line([454, 346, 340, 280], "rgba(250,190,177,.9)", 5); }
    if (kind === "eyeliner") { line([33, 130, 127], "rgba(243,215,182,.95)"); line([263, 359, 356], "rgba(243,215,182,.95)"); }
    if (kind === "lips") { line([61, 0, 291, 17, 61], "rgba(250,190,177,.9)"); }
  }, [step]);

  const startCamera = useCallback(async () => {
    setCamera("starting"); setFeedback("Loading private, on-device face tracking…");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      stream.current = s; if (!video.current) return; video.current.srcObject = s; await video.current.play();
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
      const originalConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        if (typeof args[0] === "string" && args[0].includes("Created TensorFlow Lite XNNPACK delegate")) return;
        originalConsoleError(...args);
      };
      let landmarker;
      try {
        landmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task", delegate: "GPU" }, runningMode: "VIDEO", numFaces: 1, minFaceDetectionConfidence: .55, minTrackingConfidence: .55 });
      } finally {
        console.error = originalConsoleError;
      }
      let lastVideoTime = -1, misses = 0;
      const tick = () => {
        if (!video.current || !stream.current) return;
        if (!paused && video.current.currentTime !== lastVideoTime) {
          lastVideoTime = video.current.currentTime;
          const result = landmarker.detectForVideo(video.current, performance.now());
          const points = result.faceLandmarks[0] as Point[] | undefined;
          if (points) { misses = 0; const next = estimateFaceProfile(points); if (next) { setProfile(next); setShape(x => x || next.shape); } drawGuides(points); setCamera("tracking"); }
          else if (++misses > 20) { setCamera("no-face"); canvas.current?.getContext("2d")?.clearRect(0, 0, canvas.current.width, canvas.current.height); }
        }
        raf.current = requestAnimationFrame(tick);
      }; tick(); setFeedback("Face landmarks stay on this device. Guides will move with you.");
    } catch (e) { const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "PermissionDeniedError"); setCamera(denied ? "denied" : "error"); setFeedback(denied ? "Camera permission was denied. You can retry after enabling it in browser settings." : "Camera or face tracking could not start."); }
  }, [drawGuides, paused]);

  // Camera startup must follow the render that creates the video element.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (view === "session" && consent.local && camera === "off") startCamera(); }, [view, consent.local, camera, startCamera]);

  const aiCheck = async () => {
    if (!consent.frames || !video.current) return; setChecking(true); setFeedback("Sending one reduced still frame for this check…");
    try { const c = document.createElement("canvas"); c.width = 640; c.height = 480; c.getContext("2d")!.drawImage(video.current, 0, 0, 640, 480); const image = c.toDataURL("image/jpeg", .72);
      const r = await fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, step: lesson[step][0], placement: shape ? placementFor(shape)[lesson[step][2] as keyof ReturnType<typeof placementFor>] : "natural proportions", profile: shape }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error); setFeedback(data.feedback);
    } catch (e) { setFeedback(e instanceof Error ? e.message : "The AI check is temporarily unavailable."); } finally { setChecking(false); }
  };

  const startVoice = async () => {
    if (voiceStarting.current || voiceActive) return;
    stopVoice();
    voiceStarting.current = true;
    setVoiceConnecting(true);
    const attempt = ++voiceAttempt.current;
    let pendingPeer: RTCPeerConnection | null = null;
    let pendingMic: MediaStream | null = null;
    const isCurrent = () => voiceAttempt.current === attempt;
    try {
      setFeedback("Connecting your voice bestie…");
      const tokenRes = await fetch("/api/realtime-session", { method: "POST" });
      const token = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(token.error);
      if (!isCurrent()) return;
      const ephemeral = token.value || token.client_secret?.value;
      if (!ephemeral) throw new Error("The voice session did not return a temporary connection token.");
      pendingPeer = new RTCPeerConnection();
      peer.current = pendingPeer;
      const el = document.createElement("audio"); el.autoplay = true; audio.current = el;
      pendingPeer.ontrack = event => { if (isCurrent()) el.srcObject = event.streams[0]; };
      pendingMic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!isCurrent()) return;
      microphone.current = pendingMic;
      pendingMic.getTracks().forEach(track => pendingPeer?.addTrack(track, pendingMic!));
      const dc = pendingPeer.createDataChannel("oai-events");
      dc.onopen = () => { if (isCurrent()) dc.send(JSON.stringify({ type: "response.create", response: { instructions: `Greet the user briefly, then coach the current ${lesson[step][0]} step. The current instruction is: ${lesson[step][1]}` } })); };
      dc.onerror = () => { if (isCurrent()) setFeedback("The voice conversation was interrupted. Tap Start voice to reconnect."); };
      const offer = await pendingPeer.createOffer(); await pendingPeer.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: `Bearer ${ephemeral}`, "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!sdp.ok) { const detail = await sdp.text(); throw new Error(detail.includes("model") ? "The configured voice model is unavailable." : "Voice connection failed. Please try again."); }
      if (!isCurrent()) return;
      await pendingPeer.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
      if (!isCurrent()) return;
      setVoiceActive(true); setFeedback("Voice coaching is live. Camera frames are still not shared automatically.");
    } catch (e) {
      if (isCurrent()) { stopVoice(); setFeedback(e instanceof Error ? e.message : "Voice is unavailable."); }
    } finally {
      if (!isCurrent()) { pendingMic?.getTracks().forEach(track => track.stop()); pendingPeer?.close(); }
      else { voiceStarting.current = false; setVoiceConnecting(false); }
    }
  };

  const nav = <header className="nav-shell"><nav className="nav"><Logo home={() => go("home")} /><div className="nav-links"><button onClick={() => go("home")}>Home</button><button onClick={() => go("studio-intake")}>Studio</button><button onClick={() => go("import")}>Import</button><button onClick={() => go("profile")}>My looks</button></div><button className="nav-cta" onClick={() => go("onboarding")}>Find my look →</button></nav></header>;

  const approximateMap = (): MapRegion[] => [
    { id:"complexion", label:"Full complexion", x:50, y:48, instruction:"Work in thin layers from the center outward. You choose which areas receive coverage." },
    { id:"forehead", label:"Forehead", x:50, y:20, instruction:"Blend toward the hairline with what remains on your tool." },
    { id:"left-cheek", label:"Left cheek", x:30, y:55, instruction:"Follow the personalized cheek placement and soften the upper edge." },
    { id:"right-cheek", label:"Right cheek", x:70, y:55, instruction:"Mirror the placement, then compare both sides in natural light." },
    { id:"left-eye", label:"Left eye", x:36, y:38, instruction:"Build the tutorial color in light layers across this eye region." },
    { id:"right-eye", label:"Right eye", x:64, y:38, instruction:"Match shape before matching intensity." },
    { id:"nose", label:"Nose", x:50, y:51, instruction:"Keep placement narrow and diffuse; skip this region if it is not part of your look." },
    { id:"lips", label:"Lips", x:50, y:69, instruction:"Follow your natural border, then concentrate color where the reference is deepest." },
    { id:"jaw", label:"Jaw & chin", x:50, y:84, instruction:"Blend edges into the neck so the complexion remains seamless." },
  ];

  const analyzePreparationPhoto = async (file: File) => {
    if (prepPhoto) URL.revokeObjectURL(prepPhoto);
    const url = URL.createObjectURL(file); setPrepPhoto(url); setMapStatus("analyzing"); setMapMessage("Mapping facial regions privately on this device…");
    try {
      const image = new Image(); image.src = url; await image.decode();
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
      const originalConsoleError = console.error; console.error = (...args: unknown[]) => { if (typeof args[0] === "string" && args[0].includes("Created TensorFlow Lite XNNPACK delegate")) return; originalConsoleError(...args); };
      let detector;
      try { detector = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task", delegate: "GPU" }, runningMode: "IMAGE", numFaces: 1, minFaceDetectionConfidence: .55 }); }
      finally { console.error = originalConsoleError; }
      const points = detector.detect(image).faceLandmarks[0] as Point[] | undefined; detector.close();
      if (!points) { setMapStatus("no-face"); setMapMessage("No face was detected. Try a front-facing photo in even light, or use an approximate map."); return; }
      const localProfile = estimateFaceProfile(points); if (localProfile) { setProfile(localProfile); setShape(localProfile.shape); }
      const pos = (id:string,label:string,index:number,instruction:string):MapRegion => ({ id,label,x:points[index].x*100,y:points[index].y*100,instruction });
      setMapRegions([
        pos("complexion","Full complexion",1,"Work in thin layers from the center outward. You choose which areas receive coverage."),
        pos("forehead","Forehead",10,"Blend toward the hairline with what remains on your tool."),
        pos("left-cheek","Left cheek",234,"Follow the personalized cheek placement and soften the upper edge."),
        pos("right-cheek","Right cheek",454,"Mirror the placement, then compare both sides in natural light."),
        pos("left-eye","Left eye",33,"Build the tutorial color in light layers across this eye region."),
        pos("right-eye","Right eye",263,"Match shape before matching intensity."),
        pos("nose","Nose",1,"Keep placement narrow and diffuse; skip this region if it is not part of your look."),
        pos("lips","Lips",13,"Follow your natural border, then concentrate color where the reference is deepest."),
        pos("jaw","Jaw & chin",152,"Blend edges into the neck so the complexion remains seamless."),
      ]);
      setMapStatus("ready"); setMapMessage("Face regions mapped locally. Tap any area to preview its personalized guidance.");
    } catch { setMapStatus("error"); setMapMessage("The local face map could not load. You can retry or continue with an approximate map."); }
  };

  const generatePersonalizedPreview = async () => {
    if (!prepFile || !brief) return;
    setPreviewStatus("generating"); setPreviewError("");
    const form = new FormData(); form.append("face",prepFile); form.append("description",`${brief.title}. ${brief.summary}. ${lookNotes}`); form.append("intensity",previewIntensity);
    if (lookFile?.type.startsWith("image/")) form.append("reference",lookFile);
    try { const response = await fetch("/api/preview-look",{method:"POST",body:form}); const data = await response.json(); if(!response.ok) throw new Error(data.error); setPreviewImage(data.image); setPreviewStatus("ready"); }
    catch(error) { setPreviewError(error instanceof Error?error.message:"Preview generation failed."); setPreviewStatus("error"); }
  };

  const createBrief = () => {
    const level = answers.level || "beginner-friendly";
    const skin = answers.skin || "your selected";
    const sourceLabel = lookSource === "video" ? "uploaded tutorial" : lookSource === "reference" ? "reference image" : lookSource === "curated" ? "curated rose-glow look" : "look description";
    setBrief({
      title: lookNotes.trim() || (lookSource === "curated" ? "Rose-lit soft glam" : "Your personalized statement look"),
      summary: `A polished look interpreted from your ${sourceLabel}, broken into calm, achievable layers.`,
      adaptation: `We’ll keep coverage comfortable for ${skin.toLowerCase()} skin and explain every technique at a ${level.toLowerCase()} pace. Placement will adjust after your optional face scan.`,
      difficulty: level === "Just starting" ? "Beginner" : "Intermediate",
      time: "20–30 min",
      products: ["Skin prep or moisturizer", "Base or concealer", "Cream or powder blush", "Neutral eye color", "Liner or deep shadow", "Lip color or gloss"],
      uncertainties: lookFile ? ["Exact shades and product formulas may differ from the reference."] : ["No visual reference was attached, so color and finish are based on your description."],
    });
    go("look-brief");
  };


  if (view === "studio-intake") return <>{nav}<main className="simple-page page-enter"><section className="studio-intake-card"><button className="back" onClick={() => go("home")}>← Back home</button><p className="eyebrow">Start with the vision</p><h1>What look are we creating?</h1><p className="studio-lede">Bring the inspiration first. Your bestie will explain the look, adapt it to you, and prepare every step before the camera opens.</p><div className="source-grid">{([
      ["video","▶","Upload a tutorial","Attach a video you want to recreate."],
      ["reference","▧","Upload a reference","Use a screenshot or finished-look photo."],
      ["curated","✦","Choose a Bestie look","Start with a ready-made editorial look."],
      ["describe","✎","Describe your idea","Tell us the mood, colors, and occasion."],
    ] as const).map(([id,icon,title,copy])=><button key={id} className={lookSource===id?"source-option selected":"source-option"} onClick={()=>{setLookSource(id);setLookFile(null)}}><i>{icon}</i><b>{title}</b><span>{copy}</span></button>)}</div>{(lookSource==="video"||lookSource==="reference")&&<label className="upload-zone intake-upload"><span>{lookSource==="video"?"Choose a tutorial video":"Choose a reference image"}</span><input type="file" accept={lookSource==="video"?"video/mp4,video/webm,video/quicktime":"image/png,image/jpeg,image/webp"} onChange={e=>setLookFile(e.target.files?.[0]||null)}/>{lookFile&&<small>Attached: {lookFile.name}</small>}</label>}{lookSource==="curated"&&<div className="curated-choice"><div><span>BESTIE ORIGINAL</span><b>Rose-lit soft glam</b><small>Satin skin · lifted rose blush · soft brown wing · glossy lip</small></div><strong>8 steps<br/>25 min</strong></div>}<label className="look-notes"><span>{lookSource==="describe"?"Describe your look":"Anything you want us to notice?"}</span><textarea value={lookNotes} onChange={e=>setLookNotes(e.target.value)} placeholder="Example: Keep the base light, make it beginner-friendly, and use a softer liner for hooded eyes."/></label>{lookSource==="video"&&<p className="honest-note"><b>Video preview:</b> We’ll use your attached tutorial as the session reference. Automatic frame-by-frame extraction is not active yet, so this first brief is guided by your description.</p>}<button className="primary intake-continue" disabled={lookSource==="describe"&&!lookNotes.trim()} onClick={createBrief}>Prepare my Look Brief →</button></section></main></>;

  if (view === "look-brief" && brief) return <>{nav}<main className="simple-page page-enter"><section className="brief-shell"><button className="back" onClick={() => go("studio-intake")}>← Change inspiration</button><div className="brief-heading"><div><p className="eyebrow">Your personalized Look Brief</p><input aria-label="Look title" value={brief.title} onChange={e=>setBrief({...brief,title:e.target.value})}/><p>{brief.summary}</p></div><div className="brief-meta"><span><b>{brief.difficulty}</b> difficulty</span><span><b>{brief.time}</b> estimated</span><span><b>6</b> guided steps</span></div></div><div className="brief-grid"><article className="brief-adaptation"><small>HOW WE’LL MAKE IT YOURS</small><h2>Same energy. Your features.</h2><textarea aria-label="Personalized adaptation" value={brief.adaptation} onChange={e=>setBrief({...brief,adaptation:e.target.value})}/><div className="uncertain"><b>What we’re not certain about</b><ul>{brief.uncertainties.map(item=><li key={item}>{item}</li>)}</ul></div></article><article className="product-check"><small>BEFORE YOU BEGIN</small><h2>Gather your products</h2><p>Check what you have. Missing products can be skipped or substituted during the lesson.</p>{brief.products.map(product=><label key={product}><input type="checkbox" checked={ownedProducts.includes(product)} onChange={e=>setOwnedProducts(e.target.checked?[...ownedProducts,product]:ownedProducts.filter(p=>p!==product))}/><span>{product}</span><small>{ownedProducts.includes(product)?"Ready":"Can substitute"}</small></label>)}</article></div><div className="brief-actions"><button className="outline" onClick={() => go("studio-intake")}>Edit inspiration</button><button className="primary" onClick={() => go("consent")}>Review privacy & open camera →</button></div></section></main></>;

  if (view === "face-map") { const active = mapRegions.find(region=>region.id===selectedRegion); return <>{nav}<main className="simple-page page-enter"><section className="map-shell"><button className="back" onClick={()=>go("look-brief")}>← Back to Look Brief</button><div className="map-heading"><div><p className="eyebrow">Your private preparation map</p><h1>See the plan on your face.</h1><p>Take or choose a clear front-facing photo. Facial landmarks and region coordinates stay in this browser.</p></div><span className={`map-status ${mapStatus}`}>{mapStatus==="analyzing"?"Mapping…":mapStatus==="ready"?"Local map ready":"Photo required"}</span></div><div className="map-layout"><div className="photo-map"><label className="photo-capture">{prepPhoto?<span>Replace preparation photo</span>:<><b>Take your preparation photo</b><span>Face forward in soft, even light. Remove glasses if comfortable.</span></>}<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={e=>{const file=e.target.files?.[0];if(file)analyzePreparationPhoto(file)}}/></label>{prepPhoto&&<div className="mapped-photo"><img src={prepPhoto} alt="Your private preparation preview"/>{mapStatus==="ready"&&mapRegions.map(region=><button aria-label={`Select ${region.label}`} title={region.label} key={region.id} className={`map-point ${selectedRegion===region.id?"active":""} region-${region.id}`} style={{left:`${region.x}%`,top:`${region.y}%`}} onClick={()=>setSelectedRegion(region.id)}><span>{region.label}</span></button>)}</div>}<p className={`map-message ${mapStatus}`}>{mapMessage}</p>{(mapStatus==="no-face"||mapStatus==="error")&&<button className="outline" onClick={()=>{setMapRegions(approximateMap());setMapStatus("ready");setMapMessage("Using an approximate map. Placement is guidance, not a detected measurement.")}}>Use approximate map</button>}</div><aside className="map-controls"><small>CURRENT REGION</small><h2>{active?.label||"Choose a region"}</h2><p>{active?.instruction||"Your region guidance will appear here after the map is ready."}</p>{shape&&<div className="map-estimate"><span>Adjustable estimate</span><b>{shape}-shaped proportions</b><select value={shape} onChange={e=>setShape(e.target.value as FaceShape)}>{["heart","oval","round","square","oblong","diamond"].map(item=><option key={item}>{item}</option>)}</select></div>}<small>HOW SHOULD WE GUIDE YOU?</small><div className="mode-options">{([
          ["alternate","Match both sides","Alternate left and right for easier balance."],
          ["one-area","Finish one area","Complete one eye or cheek before matching it."],
          ["free","Choose freely","Tap any region and work in your own order."],
        ] as const).map(([id,title,copy])=><button key={id} className={guidanceMode===id?"selected":""} onClick={()=>setGuidanceMode(id)}><b>{title}</b><span>{copy}</span></button>)}</div><label className="save-photo-option"><input type="checkbox" checked={saveSessionPhotos} onChange={e=>setSaveSessionPhotos(e.target.checked)}/><span><b>Save session photos</b><small>Off by default. If left off, preparation and checkpoint photos disappear when the session ends.</small></span></label><button className="primary wide" disabled={mapStatus!=="ready"} onClick={()=>go("consent")}>Use this map & review privacy →</button></aside></div></section></main></> }

  if (view === "preview" && brief) return <>
    {nav}
    <main className="simple-page page-enter">
      <section className="preview-shell">
        <button className="back" onClick={() => go("look-brief")}>← Back to Look Brief</button>
        <div className="preview-heading">
          <div>
            <p className="eyebrow">Your personalized visualization</p>
            <h1>See the look before you start.</h1>
            <p>Your facial geometry is mapped privately in the background. No technical markings are shown on this photo.</p>
          </div>
          <span>AI visualization · not a guaranteed result</span>
        </div>
        <div className="preview-layout">
          <div className="preview-stage">
            <div className="preview-column">
              <small>YOUR STARTING PHOTO</small>
              {prepPhoto ? <img src={prepPhoto} alt="Your private preparation photo"/> : <label className="preview-upload">
                <b>Take or choose a bare-face photo</b>
                <span>Face forward in soft, even light.</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPrepFile(file);
                    setPreviewImage("");
                    setPreviewStatus("idle");
                    analyzePreparationPhoto(file);
                  }
                }}/>
              </label>}
              <p>{mapStatus === "analyzing" ? "Mapping your features privately…" : mapStatus === "ready" ? "Private facial mapping complete." : mapStatus === "no-face" ? "No face detected—try another photo." : mapStatus === "error" ? "Local mapping is unavailable on this device." : "Photo remains on this device until you request a preview."}</p>
            </div>
            <div className="preview-arrow">→</div>
            <div className="preview-column result">
              <small>PERSONALIZED PREVIEW</small>
              {previewImage ? <img src={previewImage} alt="AI-generated personalized makeup preview"/> : <div className="preview-placeholder">
                <i>✦</i>
                <b>{previewStatus === "generating" ? "Creating your preview…" : "Your makeup preview appears here"}</b>
                <span>Identity-preserving makeup visualization</span>
              </div>}
              <p>{previewImage ? "Generated from your Look Brief and preparation photo." : "The preview changes makeup only—not your facial structure."}</p>
            </div>
            <div className="intensity-picker">
              <span>Preview intensity</span>
              {(["soft", "reference", "dramatic"] as const).map(item => <button key={item} className={previewIntensity === item ? "selected" : ""} onClick={() => {
                setPreviewIntensity(item);
                setPreviewImage("");
                setPreviewStatus("idle");
              }}>{item === "reference" ? "Match reference" : item}</button>)}
            </div>
            {previewError && <p className="error">{previewError}</p>}
            <button className="primary wide" disabled={!prepFile || previewStatus === "generating"} onClick={generatePersonalizedPreview}>
              {previewStatus === "generating" ? "Generating realistic preview…" : previewImage ? "Regenerate preview" : "Generate my preview"}
            </button>
          </div>
          <aside className="preview-plan">
            <p className="eyebrow">Choose your lesson</p>
            <h2>How do you want to learn?</h2>
            <button className={lessonMode === "complete" ? "lesson-mode selected" : "lesson-mode"} onClick={() => setLessonMode("complete")}>
              <span>01</span><div><b>Complete routine</b><p>Follow the full look from skin prep through the finishing lip.</p></div>
            </button>
            <button className={lessonMode === "feature" ? "lesson-mode selected" : "lesson-mode"} onClick={() => setLessonMode("feature")}>
              <span>02</span><div><b>Feature by feature</b><p>Choose complexion, eyes, cheeks, brows, or lips and practice only that area.</p></div>
            </button>
            <div className="preview-summary">
              <small>YOUR COACH ALREADY KNOWS</small>
              <ul>
                <li>{brief.title}</li>
                <li>{brief.difficulty} · {brief.time}</li>
                <li>{ownedProducts.length} products confirmed</li>
                <li>{shape ? `${shape}-shaped proportion estimate` : "Facial mapping pending"}</li>
              </ul>
            </div>
            <label className="save-photo-option">
              <input type="checkbox" checked={saveSessionPhotos} onChange={e => setSaveSessionPhotos(e.target.checked)}/>
              <span><b>Save session photos</b><small>Off by default. If left off, preparation and checkpoint photos disappear after the session.</small></span>
            </label>
            <button className="primary wide" disabled={!prepPhoto} onClick={() => go("consent")}>
              {previewImage ? "Use this preview & continue" : "Continue without preview"} →
            </button>
          </aside>
        </div>
      </section>
    </main>
  </>;

  if (view === "onboarding") {
    const qs = [["skin","First, your canvas","How does your skin usually feel?",["Dry or tight","Oily or shiny","A little of both","Balanced","Sensitive"]],["tone","Your complexion","Which range feels closest to you?",["Fair","Light","Medium","Tan","Deep","Rich"]],["level","Your experience","Where are you in your makeup journey?",["Just starting","I know the basics","Confident","Basically an artist"]],["goal","Your moment","What do you want to learn first?",["Everyday natural","Soft glam","Full glam","Editorial color","Copy a saved look"]]] as const; const q = qs[onboard];
    return <>{nav}<main className="onboarding page-enter"><div className="progress"><span style={{width:`${(onboard+1)*25}%`}} /></div><button className="back" onClick={() => onboard ? setOnboard(onboard-1) : go("home")}>← Back</button><section className="question-card"><p className="eyebrow">{q[1]}</p><h1>{q[2]}</h1><p className="subcopy">This personalizes technique—not your beauty.</p><div className="choice-grid">{q[3].map(o => <button key={o} className={answers[q[0]]===o?"selected":""} onClick={() => setAnswers({...answers,[q[0]]:o})}>{o}<b>{answers[q[0]]===o?"✓":"○"}</b></button>)}</div><button className="primary wide" disabled={!answers[q[0]]} onClick={() => onboard===3?go("consent"):setOnboard(onboard+1)}>{onboard===3?"Review camera privacy":"Continue"} →</button></section></main></>;
  }

  if (view === "consent") return <>{nav}<main className="simple-page page-enter"><section className="consent-card"><p className="eyebrow">Before the camera turns on</p><h1>Your face stays yours.</h1><p>Makeup Bestie uses facial geometry only to place guides. Face shape is an adjustable estimate—not a fact about you.</p><div className="privacy-grid"><article><b>On your device</b><p>Continuous landmarks and moving overlays. No camera footage is saved.</p></article><article><b>Only when you ask</b><p>One compressed frame can be sent to OpenAI for a visual makeup check.</p></article><article><b>Your control</b><p>Visible activity labels and an immediate stop-camera button.</p></article></div><label className="check"><input type="checkbox" checked={consent.local} onChange={e=>setConsent({...consent,local:e.target.checked})}/><span><b>Allow on-device face landmarks</b><small>Required for face-aware guides.</small></span></label><label className="check"><input type="checkbox" checked={consent.frames} onChange={e=>setConsent({...consent,frames:e.target.checked})}/><span><b>Allow selected AI frame checks</b><small>Optional. Frames are sent only when you tap “Check my placement.”</small></span></label><label className="check"><input type="checkbox" checked={consent.voice} onChange={e=>setConsent({...consent,voice:e.target.checked})}/><span><b>Allow microphone for voice coaching</b><small>Optional. Starts only when you tap “Start voice.”</small></span></label><button className="primary wide" disabled={!consent.local} onClick={() => go("session")}>Start private camera session →</button></section></main></>;

  if (view === "session") { const placement = shape ? placementFor(shape) : null; return <>{nav}<main className="studio page-enter"><div className="studio-heading"><div><p className="eyebrow">Face-aware guided session</p><h1>Rose-lit soft glam</h1></div><div className={`live-pill ${camera}`}><i /> {camera==="tracking"?"Local tracking active":camera==="starting"?"Loading landmarks…":camera==="no-face"?"No face detected":camera==="denied"?"Permission denied":"Camera off"}</div></div><div className="studio-grid"><section className="camera-card"><video ref={video} autoPlay muted playsInline/><canvas ref={canvas} className="face-overlay"/><div className="camera-fallback"><div className="face-shape">♡</div><p>{feedback}</p>{(camera==="denied"||camera==="error"||camera==="off")&&<button className="cream-button" onClick={startCamera}>Retry camera</button>}</div><div className="camera-top"><span>{camera==="tracking"?"CAMERA + LOCAL AI":"CAMERA OFF"}</span><span>{consent.frames?"Frame sharing: ask only":"Frames never shared"}</span></div><div className="bestie-bubble"><div className="avatar small">M</div><p><b>Makeup Bestie</b><br/>{feedback}</p></div></section><aside className="lesson-card"><div className="lesson-progress"><span>Step {step+1} of {lesson.length}</span><span>Face-aware</span></div><div className="dots">{lesson.map((_,i)=><i key={i} className={i<=step?"active":""}/>)}</div><p className="eyebrow">Now we’re doing</p><h2>{lesson[step][0]}</h2><p className="instruction">{lesson[step][1]}</p>{shape&&<div className="face-result"><small>ADJUSTABLE ESTIMATE</small><p>Your proportions appear closest to <b>{shape}-shaped</b>.</p><select aria-label="Correct face shape" value={shape} onChange={e=>setShape(e.target.value as FaceShape)}>{["heart","oval","round","square","oblong","diamond"].map(s=><option key={s}>{s}</option>)}</select>{placement&&<p>{placement[lesson[step][2] as keyof typeof placement] || placement.blush}</p>}</div>}<div className="session-actions">{consent.frames&&<button className="outline" onClick={aiCheck} disabled={checking||camera!=="tracking"}>{checking?"Checking one frame…":"Check my placement"}</button>}{consent.voice&&!voiceActive&&<button className="outline" onClick={startVoice} disabled={voiceConnecting}>{voiceConnecting?"Connecting one coach…":"Start voice"}</button>}<button className="primary wide" onClick={()=>setStep(Math.min(lesson.length-1,step+1))}>Next step →</button></div><div className="lesson-controls"><button onClick={()=>setStep(Math.max(0,step-1))}>↶ Back</button><button onClick={()=>{setPaused(!paused);setFeedback(paused?"Local tracking resumed.":"Analysis paused. No frames are being processed.")}}>{paused?"▶ Resume":"Ⅱ Pause"}</button><button onClick={()=>{audio.current?.play();setFeedback(lesson[step][1])}}>↻ Repeat</button><button onClick={()=>{setMuted(!muted);if(audio.current)audio.current.muted=!muted}}>{muted?"Unmute":"Mute"}</button></div><button className="stop-button" onClick={stopCamera}>Stop camera & end session</button></aside></div></main></> }

  if (view === "import") return <>{nav}<main className="simple-page page-enter"><section className="import-card"><div className="import-icon">↑</div><p className="eyebrow">Real tutorial importer</p><h1>Upload the inspiration.</h1><p>Start with a clear screenshot from a tutorial or finished look. Links aren’t downloaded. Uploaded files are analyzed for this request and aren’t saved by Makeup Bestie.</p><form onSubmit={async e=>{e.preventDefault();setImporting(true);setImportError("");setImportResult(null);const fd=new FormData(e.currentTarget);fd.set("context",JSON.stringify({answers,shape}));try{const r=await fetch("/api/import-look",{method:"POST",body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error);setImportResult(d)}catch(e){setImportError(e instanceof Error?e.message:"Import failed.")}finally{setImporting(false)}}}><label className="upload-zone"><span>Choose a tutorial screenshot</span><input name="file" type="file" accept="image/png,image/jpeg,image/webp" required/></label><button className="primary wide" disabled={importing}>{importing?"Analyzing the uploaded image…":"Create personalized guide"}</button></form>{importError&&<p className="error">{importError}</p>}{importResult&&<div className="guide-result"><small>AI-EXTRACTED GUIDE</small><h2>{importResult.title}</h2><p>{importResult.summary}</p>{importResult.steps?.map((s:any,i:number)=><article key={i}><b>{i+1}. {s.title}</b><p>{s.instruction}</p><small>{s.product}</small></article>)}{importResult.uncertainties?.length>0&&<div className="uncertain"><b>Uncertain guesses</b><ul>{importResult.uncertainties.map((u:string)=><li key={u}>{u}</li>)}</ul></div>}</div>}</section></main></>;

  if (view === "profile") return <>{nav}<main className="profile page-enter"><section className="profile-top"><div className="avatar large">S</div><div><p className="eyebrow">Your beauty shelf</p><h1>Good to see you.</h1><p>{answers.skin||"Your"} skin · {answers.goal||"Personalized makeup"} · face estimate {shape||"not set"}</p></div></section><div className="stat-row"><div><b>2</b><span>Saved looks</span></div><div><b>Local</b><span>Face tracking</span></div><div><b>0</b><span>Saved face images</span></div></div></main></>;

  return <>{nav}<main className="home page-enter"><section className="hero"><div className="hero-copy"><p className="eyebrow">Your makeup artist. Your hype woman.</p><h1>Makeup finally<br/>feels like <em>you.</em></h1><p className="hero-text">Face-aware placement, private on-device tracking, and optional AI feedback—like FaceTiming your most talented friend.</p><div className="hero-actions"><button className="primary" onClick={()=>go("onboarding")}>Find my perfect look →</button><button className="play-link" onClick={()=>go("consent")}><i>▶</i> Open the studio</button></div></div><div className="hero-visual"><div className="arch"><div className="portrait"><div className="hair"/><div className="head"><i className="eye one"/><i className="eye two"/><i className="mouth"/></div><div className="neck"/></div><div className="call-copy"><span>FACE-AWARE GUIDANCE</span><b>Blend along your own proportions—not a generic face chart.</b></div></div><div className="floating-note"><div className="avatar small">M</div><p><b>Your privacy comes first</b><br/>Landmarks stay on your device ✦</p></div></div></section><section className="logo-strip"><span>PERSONALIZED FOR</span><b>your face</b><i>✦</i><b>your products</b><i>✦</i><b>your pace</b></section><section className="how"><div className="section-heading"><div><p className="eyebrow">Real intelligence, honest controls</p><h2>Guidance that moves<br/>when you do.</h2></div><p>Face shape is estimated from visible proportions and always stays editable. AI visual checks happen only when you request one.</p></div><div className="feature-grid"><article><span>01</span><div className="feature-icon">♡</div><h3>Map proportions locally</h3><p>MediaPipe tracks cheeks, jaw, forehead, eyes, brows, nose, and lips in your browser.</p></article><article><span>02</span><div className="feature-icon">◉</div><h3>Follow live guides</h3><p>Subtle overlays adapt contour, blush, highlight, eyeliner, and brow direction.</p></article><article><span>03</span><div className="feature-icon">✦</div><h3>Ask for a check</h3><p>Send one selected frame for specific feedback. No continuous video upload.</p></article></div></section><section className="import-banner"><div><p className="eyebrow">Saw a look you love?</p><h2>Upload the reference.<br/>Make it <em>teachable.</em></h2><p>Use a tutorial screenshot for an honest first version. Product and shade guesses are labeled as uncertain.</p><button className="cream-button" onClick={()=>go("import")}>Try the real importer →</button></div></section></main><footer><Logo home={()=>go("home")}/><p>Beauty guidance built around the person in the mirror.</p><span>© 2026 Makeup Bestie</span></footer></>;
}
