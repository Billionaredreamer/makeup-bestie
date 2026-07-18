"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from "react";
import { estimateFaceProfile, placementFor, type FaceProfile, type FaceShape, type Point } from "@/lib/face-analysis";

type View = "home" | "onboarding" | "consent" | "session" | "import" | "profile";
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
  const [importResult, setImportResult] = useState<ImportedGuide | null>(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const peer = useRef<RTCPeerConnection | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  void profile;

  const go = (v: View) => { setView(v); window.scrollTo(0, 0); };
  const stopVoice = useCallback(() => { peer.current?.close(); peer.current = null; audio.current?.remove(); audio.current = null; setVoiceActive(false); }, []);
  const stopCamera = useCallback(() => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setCamera("off"); stopVoice(); }, [stopVoice]);

  useEffect(() => () => stopCamera(), [stopCamera]);

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
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm");
      const landmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task", delegate: "GPU" }, runningMode: "VIDEO", numFaces: 1, minFaceDetectionConfidence: .55, minTrackingConfidence: .55 });
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
    try { setFeedback("Connecting your voice bestie…"); const tokenRes = await fetch("/api/realtime-session", { method: "POST" }); const token = await tokenRes.json(); if (!tokenRes.ok) throw new Error(token.error); const ephemeral = token.value || token.client_secret?.value;
      const pc = new RTCPeerConnection(); peer.current = pc; const el = document.createElement("audio"); el.autoplay = true; audio.current = el; pc.ontrack = e => { el.srcObject = e.streams[0]; };
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true }); mic.getTracks().forEach(t => pc.addTrack(t, mic)); const dc = pc.createDataChannel("oai-events"); dc.onopen = () => dc.send(JSON.stringify({ type: "response.create", response: { instructions: `Greet the user briefly and coach the current ${lesson[step][0]} step.` } }));
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer); const sdp = await fetch(`https://api.openai.com/v1/realtime/calls`, { method: "POST", headers: { Authorization: `Bearer ${ephemeral}`, "Content-Type": "application/sdp" }, body: offer.sdp }); if (!sdp.ok) throw new Error("Voice connection failed."); await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() }); setVoiceActive(true); setFeedback("Voice coaching is live. Camera frames are still not shared automatically.");
    } catch (e) { stopVoice(); setFeedback(e instanceof Error ? e.message : "Voice is unavailable."); }
  };

  const nav = <header className="nav-shell"><nav className="nav"><Logo home={() => go("home")} /><div className="nav-links"><button onClick={() => go("home")}>Home</button><button onClick={() => go("consent")}>Studio</button><button onClick={() => go("import")}>Import</button><button onClick={() => go("profile")}>My looks</button></div><button className="nav-cta" onClick={() => go("onboarding")}>Find my look →</button></nav></header>;

  if (view === "onboarding") {
    const qs = [["skin","First, your canvas","How does your skin usually feel?",["Dry or tight","Oily or shiny","A little of both","Balanced","Sensitive"]],["tone","Your complexion","Which range feels closest to you?",["Fair","Light","Medium","Tan","Deep","Rich"]],["level","Your experience","Where are you in your makeup journey?",["Just starting","I know the basics","Confident","Basically an artist"]],["goal","Your moment","What do you want to learn first?",["Everyday natural","Soft glam","Full glam","Editorial color","Copy a saved look"]]] as const; const q = qs[onboard];
    return <>{nav}<main className="onboarding page-enter"><div className="progress"><span style={{width:`${(onboard+1)*25}%`}} /></div><button className="back" onClick={() => onboard ? setOnboard(onboard-1) : go("home")}>← Back</button><section className="question-card"><p className="eyebrow">{q[1]}</p><h1>{q[2]}</h1><p className="subcopy">This personalizes technique—not your beauty.</p><div className="choice-grid">{q[3].map(o => <button key={o} className={answers[q[0]]===o?"selected":""} onClick={() => setAnswers({...answers,[q[0]]:o})}>{o}<b>{answers[q[0]]===o?"✓":"○"}</b></button>)}</div><button className="primary wide" disabled={!answers[q[0]]} onClick={() => onboard===3?go("consent"):setOnboard(onboard+1)}>{onboard===3?"Review camera privacy":"Continue"} →</button></section></main></>;
  }

  if (view === "consent") return <>{nav}<main className="simple-page page-enter"><section className="consent-card"><p className="eyebrow">Before the camera turns on</p><h1>Your face stays yours.</h1><p>Makeup Bestie uses facial geometry only to place guides. Face shape is an adjustable estimate—not a fact about you.</p><div className="privacy-grid"><article><b>On your device</b><p>Continuous landmarks and moving overlays. No camera footage is saved.</p></article><article><b>Only when you ask</b><p>One compressed frame can be sent to OpenAI for a visual makeup check.</p></article><article><b>Your control</b><p>Visible activity labels and an immediate stop-camera button.</p></article></div><label className="check"><input type="checkbox" checked={consent.local} onChange={e=>setConsent({...consent,local:e.target.checked})}/><span><b>Allow on-device face landmarks</b><small>Required for face-aware guides.</small></span></label><label className="check"><input type="checkbox" checked={consent.frames} onChange={e=>setConsent({...consent,frames:e.target.checked})}/><span><b>Allow selected AI frame checks</b><small>Optional. Frames are sent only when you tap “Check my placement.”</small></span></label><label className="check"><input type="checkbox" checked={consent.voice} onChange={e=>setConsent({...consent,voice:e.target.checked})}/><span><b>Allow microphone for voice coaching</b><small>Optional. Starts only when you tap “Start voice.”</small></span></label><button className="primary wide" disabled={!consent.local} onClick={() => go("session")}>Start private camera session →</button></section></main></>;

  if (view === "session") { const placement = shape ? placementFor(shape) : null; return <>{nav}<main className="studio page-enter"><div className="studio-heading"><div><p className="eyebrow">Face-aware guided session</p><h1>Rose-lit soft glam</h1></div><div className={`live-pill ${camera}`}><i /> {camera==="tracking"?"Local tracking active":camera==="starting"?"Loading landmarks…":camera==="no-face"?"No face detected":camera==="denied"?"Permission denied":"Camera off"}</div></div><div className="studio-grid"><section className="camera-card"><video ref={video} autoPlay muted playsInline/><canvas ref={canvas} className="face-overlay"/><div className="camera-fallback"><div className="face-shape">♡</div><p>{feedback}</p>{(camera==="denied"||camera==="error"||camera==="off")&&<button className="cream-button" onClick={startCamera}>Retry camera</button>}</div><div className="camera-top"><span>{camera==="tracking"?"CAMERA + LOCAL AI":"CAMERA OFF"}</span><span>{consent.frames?"Frame sharing: ask only":"Frames never shared"}</span></div><div className="bestie-bubble"><div className="avatar small">M</div><p><b>Makeup Bestie</b><br/>{feedback}</p></div></section><aside className="lesson-card"><div className="lesson-progress"><span>Step {step+1} of {lesson.length}</span><span>Face-aware</span></div><div className="dots">{lesson.map((_,i)=><i key={i} className={i<=step?"active":""}/>)}</div><p className="eyebrow">Now we’re doing</p><h2>{lesson[step][0]}</h2><p className="instruction">{lesson[step][1]}</p>{shape&&<div className="face-result"><small>ADJUSTABLE ESTIMATE</small><p>Your proportions appear closest to <b>{shape}-shaped</b>.</p><select aria-label="Correct face shape" value={shape} onChange={e=>setShape(e.target.value as FaceShape)}>{["heart","oval","round","square","oblong","diamond"].map(s=><option key={s}>{s}</option>)}</select>{placement&&<p>{placement[lesson[step][2] as keyof typeof placement] || placement.blush}</p>}</div>}<div className="session-actions">{consent.frames&&<button className="outline" onClick={aiCheck} disabled={checking||camera!=="tracking"}>{checking?"Checking one frame…":"Check my placement"}</button>}{consent.voice&&!voiceActive&&<button className="outline" onClick={startVoice}>Start voice</button>}<button className="primary wide" onClick={()=>setStep(Math.min(lesson.length-1,step+1))}>Next step →</button></div><div className="lesson-controls"><button onClick={()=>setStep(Math.max(0,step-1))}>↶ Back</button><button onClick={()=>{setPaused(!paused);setFeedback(paused?"Local tracking resumed.":"Analysis paused. No frames are being processed.")}}>{paused?"▶ Resume":"Ⅱ Pause"}</button><button onClick={()=>{audio.current?.play();setFeedback(lesson[step][1])}}>↻ Repeat</button><button onClick={()=>{setMuted(!muted);if(audio.current)audio.current.muted=!muted}}>{muted?"Unmute":"Mute"}</button></div><button className="stop-button" onClick={stopCamera}>Stop camera & end session</button></aside></div></main></> }

  if (view === "import") return <>{nav}<main className="simple-page page-enter"><section className="import-card"><div className="import-icon">↑</div><p className="eyebrow">Real tutorial importer</p><h1>Upload the inspiration.</h1><p>Start with a clear screenshot from a tutorial or finished look. Links aren’t downloaded. Uploaded files are analyzed for this request and aren’t saved by Makeup Bestie.</p><form onSubmit={async e=>{e.preventDefault();setImporting(true);setImportError("");setImportResult(null);const fd=new FormData(e.currentTarget);fd.set("context",JSON.stringify({answers,shape}));try{const r=await fetch("/api/import-look",{method:"POST",body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error);setImportResult(d)}catch(e){setImportError(e instanceof Error?e.message:"Import failed.")}finally{setImporting(false)}}}><label className="upload-zone"><span>Choose a tutorial screenshot</span><input name="file" type="file" accept="image/png,image/jpeg,image/webp" required/></label><button className="primary wide" disabled={importing}>{importing?"Analyzing the uploaded image…":"Create personalized guide"}</button></form>{importError&&<p className="error">{importError}</p>}{importResult&&<div className="guide-result"><small>AI-EXTRACTED GUIDE</small><h2>{importResult.title}</h2><p>{importResult.summary}</p>{importResult.steps?.map((s:any,i:number)=><article key={i}><b>{i+1}. {s.title}</b><p>{s.instruction}</p><small>{s.product}</small></article>)}{importResult.uncertainties?.length>0&&<div className="uncertain"><b>Uncertain guesses</b><ul>{importResult.uncertainties.map((u:string)=><li key={u}>{u}</li>)}</ul></div>}</div>}</section></main></>;

  if (view === "profile") return <>{nav}<main className="profile page-enter"><section className="profile-top"><div className="avatar large">S</div><div><p className="eyebrow">Your beauty shelf</p><h1>Good to see you.</h1><p>{answers.skin||"Your"} skin · {answers.goal||"Personalized makeup"} · face estimate {shape||"not set"}</p></div></section><div className="stat-row"><div><b>2</b><span>Saved looks</span></div><div><b>Local</b><span>Face tracking</span></div><div><b>0</b><span>Saved face images</span></div></div></main></>;

  return <>{nav}<main className="home page-enter"><section className="hero"><div className="hero-copy"><p className="eyebrow">Your makeup artist. Your hype woman.</p><h1>Makeup finally<br/>feels like <em>you.</em></h1><p className="hero-text">Face-aware placement, private on-device tracking, and optional AI feedback—like FaceTiming your most talented friend.</p><div className="hero-actions"><button className="primary" onClick={()=>go("onboarding")}>Find my perfect look →</button><button className="play-link" onClick={()=>go("consent")}><i>▶</i> Open the studio</button></div></div><div className="hero-visual"><div className="arch"><div className="portrait"><div className="hair"/><div className="head"><i className="eye one"/><i className="eye two"/><i className="mouth"/></div><div className="neck"/></div><div className="call-copy"><span>FACE-AWARE GUIDANCE</span><b>Blend along your own proportions—not a generic face chart.</b></div></div><div className="floating-note"><div className="avatar small">M</div><p><b>Your privacy comes first</b><br/>Landmarks stay on your device ✦</p></div></div></section><section className="logo-strip"><span>PERSONALIZED FOR</span><b>your face</b><i>✦</i><b>your products</b><i>✦</i><b>your pace</b></section><section className="how"><div className="section-heading"><div><p className="eyebrow">Real intelligence, honest controls</p><h2>Guidance that moves<br/>when you do.</h2></div><p>Face shape is estimated from visible proportions and always stays editable. AI visual checks happen only when you request one.</p></div><div className="feature-grid"><article><span>01</span><div className="feature-icon">♡</div><h3>Map proportions locally</h3><p>MediaPipe tracks cheeks, jaw, forehead, eyes, brows, nose, and lips in your browser.</p></article><article><span>02</span><div className="feature-icon">◉</div><h3>Follow live guides</h3><p>Subtle overlays adapt contour, blush, highlight, eyeliner, and brow direction.</p></article><article><span>03</span><div className="feature-icon">✦</div><h3>Ask for a check</h3><p>Send one selected frame for specific feedback. No continuous video upload.</p></article></div></section><section className="import-banner"><div><p className="eyebrow">Saw a look you love?</p><h2>Upload the reference.<br/>Make it <em>teachable.</em></h2><p>Use a tutorial screenshot for an honest first version. Product and shade guesses are labeled as uncertain.</p><button className="cream-button" onClick={()=>go("import")}>Try the real importer →</button></div></section></main><footer><Logo home={()=>go("home")}/><p>Beauty guidance built around the person in the mirror.</p><span>© 2026 Makeup Bestie</span></footer></>;
}
