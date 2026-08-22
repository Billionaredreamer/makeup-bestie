"use client";
/* eslint-disable @next/next/no-img-element -- preparation photos use temporary local blob URLs */

import { useCallback, useEffect, useRef, useState } from "react";
import { estimateFaceProfile, placementFor, type FaceProfile, type FaceShape, type Point } from "@/lib/face-analysis";
import { extractTutorialFrames } from "@/lib/video-frames";

type View = "home" | "onboarding" | "face-scan" | "studio-intake" | "look-brief" | "preview" | "consent" | "session" | "import" | "profile";
type LessonRegion = "all-face" | "complexion" | "forehead" | "both-cheeks" | "left-cheek" | "right-cheek" | "both-eyes" | "left-eye" | "right-eye" | "brows" | "nose" | "lips" | "jaw" | "none";
type LessonStep = { title: string; instruction: string; product: string; region: LessonRegion; areas: LessonRegion[]; technique: "prep"|"base"|"conceal"|"contour"|"blush"|"highlight"|"eyes"|"eyeliner"|"brow"|"lips"|"finish"; referenceCue: string; adaptation: string; checkpoint: string; uncertain: boolean };
type LookBrief = { title: string; summary: string; adaptation: string; difficulty: string; time: string; products: string[]; uncertainties: string[]; analysisScope: string; steps: LessonStep[]; sourceUrl?: string; sourceVideoAnalyzed?: boolean };
type CameraState = "off" | "starting" | "tracking" | "denied" | "no-face" | "poor-light" | "error";
const defaultLesson: LessonStep[] = [
  { title:"Prep your canvas", instruction:"Press primer into the center, then blend outward.", product:"Primer", region:"all-face", areas:["all-face"], technique:"prep", referenceCue:"Foundation preparation", adaptation:"Use thin, comfortable layers.", checkpoint:"Skin feels comfortable and looks evenly prepped without visible buildup.", uncertain:false },
  { title:"Even the base", instruction:"Tap skin tint in thin layers; keep the hairline sheer.", product:"Skin tint or foundation", region:"complexion", areas:["complexion","forehead","both-cheeks","nose","jaw"], technique:"base", referenceCue:"Even complexion", adaptation:"Add coverage only where you want it.", checkpoint:"The complexion looks even while natural skin texture remains visible.", uncertain:false },
  { title:"Personalized sculpt", instruction:"Blend softly beneath the cheekbone.", product:"Contour", region:"both-cheeks", areas:["both-cheeks","forehead","nose","jaw"], technique:"contour", referenceCue:"Soft definition", adaptation:"Follow your adjustable proportion estimate.", checkpoint:"The sculpting reads as soft dimension with no hard or unblended edges.", uncertain:false },
  { title:"Blush & glow", instruction:"Place blush lightly, then soften every edge.", product:"Blush", region:"both-cheeks", areas:["both-cheeks"], technique:"blush", referenceCue:"Lifted cheek color", adaptation:"Adjust direction to your cheek proportions.", checkpoint:"Both cheeks carry a balanced wash of color in the intended direction.", uncertain:false },
  { title:"Frame the eyes", instruction:"Build the eye shape in light layers.", product:"Shadow or liner", region:"both-eyes", areas:["both-eyes"], technique:"eyeliner", referenceCue:"Soft eye definition", adaptation:"Follow your natural eye angle.", checkpoint:"The eye shape is balanced before adding more intensity.", uncertain:false },
  { title:"Finish the lip", instruction:"Trace your natural lip border and blend toward the center.", product:"Lip color", region:"lips", areas:["lips"], technique:"lips", referenceCue:"Finished lip", adaptation:"Keep your natural border visible.", checkpoint:"The lip edge is clean, softly blended, and close to the tutorial finish.", uncertain:false },
];

const productOptions = ["Primer", "Foundation or skin tint", "Concealer", "Contour or bronzer", "Blush", "Highlighter", "Brow product", "Eyeshadow", "Eyeliner", "Mascara", "Lip liner", "Lip color", "Setting powder or spray"];
const areaLabels: Record<LessonRegion, string> = { "all-face":"full face", complexion:"complexion", forehead:"forehead", "both-cheeks":"both cheeks", "left-cheek":"left cheek", "right-cheek":"right cheek", "both-eyes":"both eyes", "left-eye":"left eye", "right-eye":"right eye", brows:"brows", nose:"nose", lips:"lips", jaw:"jaw and chin", none:"finish" };
const stepAreas = (item: LessonStep) => [...new Set(item.areas?.length ? item.areas : [item.region])];
const areaSummary = (item: LessonStep) => stepAreas(item).map(area => areaLabels[area]).join(" · ");

const normalizeTutorialUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
};

function Logo({ home }: { home: () => void }) { return <button className="logo" onClick={home}><span>m</span> makeup bestie</button>; }

export default function App() {
  const [view, setView] = useState<View>("onboarding");
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
  const [lookNotes, setLookNotes] = useState("");
  const [lookUrl, setLookUrl] = useState("");
  const [lookFile, setLookFile] = useState<File | null>(null);
  const [lookReferenceFrame, setLookReferenceFrame] = useState("");
  const [lessonAnalyzing, setLessonAnalyzing] = useState(false);
  const [lessonStage, setLessonStage] = useState("");
  const [lessonError, setLessonError] = useState("");
  const [brief, setBrief] = useState<LookBrief | null>(null);
  const [ownedProducts, setOwnedProducts] = useState<string[]>([]);
  const [prepPhoto, setPrepPhoto] = useState("");
  const [mapStatus, setMapStatus] = useState<"idle"|"analyzing"|"ready"|"no-face"|"error">("idle");
  const [mapMessage, setMapMessage] = useState("Your photo stays on this device.");
  const [saveSessionPhotos, setSaveSessionPhotos] = useState(false);
  const [prepFile, setPrepFile] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState("");
  const [previewStatus, setPreviewStatus] = useState<"idle"|"generating"|"ready"|"error">("idle");
  const [previewError, setPreviewError] = useState("");
  const [previewConsent, setPreviewConsent] = useState(false);
  const [previewIntensity, setPreviewIntensity] = useState<"soft"|"reference"|"dramatic">("reference");
  const [targetVisible, setTargetVisible] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const peer = useRef<RTCPeerConnection | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const voiceChannel = useRef<RTCDataChannel | null>(null);
  const voiceAttempt = useRef(0);
  const voiceStarting = useRef(false);
  void profile;
  const fullLesson = brief?.steps?.length ? brief.steps : defaultLesson;
  const activeLesson = fullLesson;
  const currentLesson = activeLesson[Math.min(step, activeLesson.length - 1)];

  const go = (v: View) => { const needsSetup = (v === "consent" && !brief) || (v === "studio-intake" && mapStatus !== "ready"); const next = needsSetup ? "onboarding" : v; setView(next); window.scrollTo(0, 0); };
  const stopVoice = useCallback(() => { voiceAttempt.current += 1; voiceStarting.current = false; setVoiceConnecting(false); voiceChannel.current?.close(); voiceChannel.current = null; microphone.current?.getTracks().forEach(track => track.stop()); microphone.current = null; peer.current?.close(); peer.current = null; if (audio.current) { audio.current.pause(); audio.current.srcObject = null; audio.current.remove(); } audio.current = null; setVoiceActive(false); }, []);
  const stopCamera = useCallback((userAction?: unknown) => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setCamera("off"); stopVoice(); if (userAction) { setPaused(false); setFeedback("Session ended. Your camera and microphone are off."); setView("preview"); window.scrollTo(0, 0); } }, [stopVoice]);

  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => () => { if (prepPhoto) URL.revokeObjectURL(prepPhoto); }, [prepPhoto]);

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
          if (points) { misses = 0; const next = estimateFaceProfile(points); if (next) { setProfile(next); setShape(x => x || next.shape); } setCamera("tracking"); }
          else if (++misses > 20) setCamera("no-face");
        }
        raf.current = requestAnimationFrame(tick);
      }; tick(); setFeedback("Face tracking stays on this device. Your coach is ready for this product step.");
    } catch (e) { const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "PermissionDeniedError"); setCamera(denied ? "denied" : "error"); setFeedback(denied ? "Camera permission was denied. You can retry after enabling it in browser settings." : "Camera or face tracking could not start."); }
  }, [paused]);

  // Camera startup must follow the render that creates the video element.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (view === "session" && consent.local && camera === "off") startCamera(); }, [view, consent.local, camera, startCamera]);

  const aiCheck = async () => {
    if (!consent.frames || !video.current) return; setChecking(true); setFeedback("Sending one reduced still frame for this check…");
    try { const c = document.createElement("canvas"); c.width = 640; c.height = 480; c.getContext("2d")!.drawImage(video.current, 0, 0, 640, 480); const image = c.toDataURL("image/jpeg", .72);
      const r = await fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, step: currentLesson.title, product:currentLesson.product, placement:currentLesson.adaptation, checkpoint:currentLesson.checkpoint, profile: shape, focus:areaSummary(currentLesson), skinPreference:answers.skin }) });
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
      const lessonContext = JSON.stringify({ lessonStyle:"Follow the analyzed tutorial's chronological product order on the user's live face. Coach only the current product step with clear verbal guidance; there are no drawn placement markings.", look: brief ? { title:brief.title, summary:brief.summary, analysisScope:brief.analysisScope, sourceStatus:"The uploaded tutorial copy was visually analyzed and its original source link was saved.", steps:brief.steps } : null, currentStep:currentLesson, currentAreas:stepAreas(currentLesson), faceShapeEstimate:shape, skinPreference:answers.skin, experience:answers.level, availableProducts:ownedProducts });
      const tokenRes = await fetch("/api/realtime-session", { method: "POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ lessonContext }) });
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
      const dc = pendingPeer.createDataChannel("oai-events"); voiceChannel.current = dc;
      dc.onopen = () => { if (isCurrent()) dc.send(JSON.stringify({ type: "response.create", response: { instructions: `Greet the user briefly, confirm that you are following their analyzed tutorial, then coach this product step on their own face: ${currentLesson.product}. Areas: ${areaSummary(currentLesson)}. Instruction: ${currentLesson.instruction}. Face-specific adaptation: ${currentLesson.adaptation}. Checkpoint: ${currentLesson.checkpoint}. Give verbal directions only; do not claim that anything is highlighted or drawn on screen.` } })); };
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

  const nav = <header className="nav-shell"><nav className="nav"><Logo home={() => go("home")} /><div className="nav-links"><button onClick={() => go("home")}>Home</button><button onClick={() => go(brief?"preview":"onboarding")}>Studio</button><button onClick={() => go(mapStatus==="ready"?"studio-intake":"onboarding")}>Inspiration</button><button onClick={() => go("profile")}>My looks</button></div><button className="nav-cta" onClick={() => {setOnboard(0);go("onboarding");}}>Start my lesson →</button></nav></header>;

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
      setMapStatus("ready"); setMapMessage("Facial proportions mapped locally. Your tutorial can now be adapted to your face.");
    } catch { setMapStatus("error"); setMapMessage("The local face scan could not load. Please retry with another photo."); }
  };

  const generatePersonalizedPreview = async () => {
    if (!prepFile || !brief || !previewConsent) { setPreviewError("Confirm that you want to send this one photo for preview generation."); return; }
    setPreviewStatus("generating"); setPreviewError("");
    const form = new FormData(); form.append("face",prepFile); form.append("description",`${brief.title}. ${brief.summary}. ${lookNotes}`); form.append("intensity",previewIntensity);
    if (lookReferenceFrame) form.append("reference", await (await fetch(lookReferenceFrame)).blob(), "tutorial-finish.jpg");
    try { const response = await fetch("/api/preview-look",{method:"POST",body:form}); const data = await response.json(); if(!response.ok) throw new Error(data.error); setPreviewImage(data.image); setPreviewStatus("ready"); }
    catch(error) { setPreviewError(error instanceof Error?error.message:"Preview generation failed."); setPreviewStatus("error"); }
  };

  const createBrief = async () => {
    const sourceUrl = normalizeTutorialUrl(lookUrl);
    if (!sourceUrl) { setLessonError("Paste a complete tutorial link beginning with http:// or https://."); return; }
    if (!lookFile) { setLessonError("Add the tutorial video file so Makeup Bestie can analyze the actual sequence. A social link alone cannot provide reliable video frames."); return; }
    setLessonAnalyzing(true); setLessonError(""); setLessonStage("Reading the tutorial video on your device…");
    try {
      const tutorial = await extractTutorialFrames(lookFile, 14);
      setLessonStage(`Uploading ${tutorial.frames.length} timeline samples for visual analysis…`);
      setLookReferenceFrame(tutorial.frames.at(-1) || "");
      const context = JSON.stringify({ skin:answers.skin || "not provided", tone:answers.tone || "not provided", experience:answers.level || "not provided", goal:answers.goal || "not provided", faceShapeEstimate:shape || "pending and adjustable", availableProducts:ownedProducts, lessonStyle:"One chronological product-by-product lesson. Each product step may cover several precise face areas on the user's own face." });
      const response = await fetch("/api/import-look", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ frames:tutorial.frames, duration:tutorial.duration, description:lookNotes, context }), signal:AbortSignal.timeout(75_000) });
      const raw = await response.text();
      let data: Record<string, unknown>;
      try { data = JSON.parse(raw); }
      catch { throw new Error(response.status === 413 ? "The tutorial upload is still too large. Try a shorter or lower-resolution video." : `Tutorial analysis stopped on the server (${response.status}). Please try again.`); }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Tutorial analysis failed. Please try again.");
      setLessonStage("Turning the analyzed sequence into your personalized steps…");
      const guide = data as Omit<LookBrief,"time"> & { estimatedMinutes:number };
      setBrief({ ...guide, time:`${guide.estimatedMinutes} min`, sourceUrl, sourceVideoAnalyzed:true });
      setStep(0); go("look-brief");
    } catch (error) { setLessonError(error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError") ? "Tutorial analysis took too long. Please retry once; if it repeats, use a shorter tutorial." : error instanceof Error ? error.message : "The personalized lesson could not be created."); }
    finally { setLessonAnalyzing(false); setLessonStage(""); }
  };

  if (view === "face-scan") return <>
    {nav}
    <main className="simple-page page-enter">
      <section className="launch-scan-shell">
        <button className="back" onClick={() => { setOnboard(3); go("onboarding"); }}>← Back to your information</button>
        <div className="launch-scan-heading">
          <div><p className="eyebrow">Step 2 · Private face scan</p><h1>Let’s map your features.</h1><p>Take or choose one clear bare-face photo. MediaPipe estimates facial proportions on this device; the image is not sent anywhere during this scan.</p></div>
          <span className={`map-status ${mapStatus}`}>{mapStatus==="analyzing"?"Scanning…":mapStatus==="ready"?"Face map ready":mapStatus==="no-face"?"No face detected":"Photo needed"}</span>
        </div>
        <div className="launch-scan-grid">
          <div className="scan-photo-card">
            <label className="photo-capture">
              <b>{prepPhoto?"Retake or replace photo":"Take your face scan photo"}</b>
              <span>Face forward in soft, even light.</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={event=>{const file=event.target.files?.[0];if(file){setPrepFile(file);setPreviewImage("");setPreviewStatus("idle");analyzePreparationPhoto(file);}}}/>
            </label>
            {prepPhoto&&<div className="scan-photo"><img src={prepPhoto} alt="Your private face scan"/></div>}
            <p className={`map-message ${mapStatus}`}>{mapMessage}</p>
            {(mapStatus==="no-face"||mapStatus==="error")&&<p className="scan-retry-note">Choose another clear, front-facing photo to continue. The face scan is required for personalization.</p>}
          </div>
          <aside className="scan-result-card">
            <p className="eyebrow">Your editable estimate</p>
            <h2>{shape?`${shape}-shaped proportions`:"Waiting for your scan"}</h2>
            <p>This estimate helps tailor technique. It is not a judgment or permanent face classification.</p>
            {shape&&<label className="shape-correction"><span>Correct the estimate</span><select value={shape} onChange={event=>setShape(event.target.value as FaceShape)}>{["heart","oval","round","square","oblong","diamond"].map(item=><option key={item}>{item}</option>)}</select></label>}
            <div className="scan-privacy"><b>Private by default</b><span>Landmark coordinates stay in this browser. The photo is sent only later if you separately request an AI makeup preview.</span></div>
            <button className="primary wide" disabled={mapStatus!=="ready"} onClick={()=>go("studio-intake")}>Choose my tutorial →</button>
          </aside>
        </div>
      </section>
    </main>
  </>;

  if (view === "studio-intake") return <>
    {nav}
    <main className="simple-page page-enter">
      <section className="studio-intake-card">
        <button className="back" onClick={() => go("face-scan")}>← Back to face scan</button>
        <p className="eyebrow">Step 3 · Your inspiration</p>
        <h1>Which tutorial are we making yours?</h1>
        <p className="studio-lede">Save the original link, attach the tutorial video for real frame-by-frame analysis, and choose the makeup you already own.</p>
        <div className="tutorial-link-box launch-link-box">
          <label>
            <span>Paste the original tutorial link</span>
            <input type="url" inputMode="url" value={lookUrl} onChange={event => { setLookUrl(event.target.value); setLessonError(""); }} placeholder="https://www.tiktok.com/..."/>
          </label>
          <label className="upload-zone intake-upload required-upload">
            <span>Attach the tutorial video for analysis</span>
            <small>Required. Only upload a video you have permission to use.</small>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => { setLookFile(event.target.files?.[0] || null); setLessonError(""); }}/>
            {lookFile && <small>Attached: {lookFile.name}</small>}
          </label>
        </div>
        <label className="look-notes">
          <span>Anything you want the coach to prioritize? <small>(optional)</small></span>
          <textarea value={lookNotes} onChange={event => setLookNotes(event.target.value)} placeholder="Example: Keep the base light and make the wing beginner-friendly."/>
        </label>
        <section className="product-shelf">
          <div><p className="eyebrow">Your makeup bag</p><h2>What do you already have?</h2><p>Choose everything you own. Leave items unchecked and the lesson will suggest easy substitutes.</p></div>
          <div className="product-options">{productOptions.map(product=><label key={product} className={ownedProducts.includes(product)?"selected":""}><input type="checkbox" checked={ownedProducts.includes(product)} onChange={event=>setOwnedProducts(event.target.checked?[...ownedProducts,product]:ownedProducts.filter(item=>item!==product))}/><span>{product}</span><b>{ownedProducts.includes(product)?"✓":"+"}</b></label>)}</div>
        </section>
        <p className="honest-note"><b>No pretend analysis:</b> The link stays with your lesson, but social platforms do not reliably expose their video frames. Makeup Bestie creates the lesson only after analyzing the attached video from beginning to end.</p>
        {lessonAnalyzing&&<div className="analysis-progress" role="status"><i/><span><b>Analyzing your tutorial</b><small>{lessonStage}</small></span></div>}
        {lessonError && <p className="error">{lessonError}</p>}
        <button className="primary intake-continue" disabled={lessonAnalyzing || !lookUrl.trim() || !lookFile} onClick={createBrief}>
          {lessonAnalyzing ? "Studying every stage of the tutorial…" : "Analyze tutorial & create my lesson →"}
        </button>
      </section>
    </main>
  </>;
  if (view === "look-brief" && brief) return <>
    {nav}
    <main className="simple-page page-enter">
      <section className="brief-shell">
        <button className="back" onClick={() => go("studio-intake")}>← Change inspiration</button>
        <div className="brief-heading">
          <div><p className="eyebrow">Your personalized Look Brief</p><input aria-label="Look title" value={brief.title} onChange={event => setBrief({...brief,title:event.target.value})}/><p>{brief.summary}</p></div>
          <div className="brief-meta"><span><b>{brief.difficulty}</b> difficulty</span><span><b>{brief.time}</b> estimated</span><span><b>{brief.steps.length}</b> tutorial steps</span></div>
        </div>
        <div className="brief-grid">
          <article className="brief-adaptation">
            <small>HOW WE’LL MAKE IT YOURS</small><h2>Same energy. Your features.</h2>
            <textarea aria-label="Personalized adaptation" value={brief.adaptation} onChange={event => setBrief({...brief,adaptation:event.target.value})}/>
            <p className="analysis-scope"><b>What the AI reviewed:</b> {brief.analysisScope}</p>
            {brief.sourceUrl && <div className="saved-source"><div><small>ORIGINAL TUTORIAL</small><p>Linked source saved · tutorial video analyzed</p></div><a href={brief.sourceUrl} target="_blank" rel="noopener noreferrer">Open tutorial ↗</a></div>}
            <div className="uncertain"><b>What we’re not certain about</b><ul>{brief.uncertainties.map(item=><li key={item}>{item}</li>)}</ul></div>
          </article>
          <article className="product-check">
            <small>BEFORE YOU BEGIN</small><h2>Gather your products</h2><p>Check what you have. Missing products can be skipped or substituted during the lesson.</p>
            {brief.products.map(product=><label key={product}><input type="checkbox" checked={ownedProducts.includes(product)} onChange={event=>setOwnedProducts(event.target.checked?[...ownedProducts,product]:ownedProducts.filter(item=>item!==product))}/><span>{product}</span><small>{ownedProducts.includes(product)?"Ready":"Can substitute"}</small></label>)}
          </article>
        </div>
        <section className="lesson-outline">
          <p className="eyebrow">What your bestie learned</p><h2>The tutorial, turned into your lesson.</h2>
          <div>{brief.steps.map((item,index)=><article key={index}><span>{String(index+1).padStart(2,"0")}</span><div><b>{item.product}</b><p>{item.referenceCue}</p><small>{areaSummary(item)}</small><p className="step-checkpoint"><b>Checkpoint:</b> {item.checkpoint}</p>{item.uncertain&&<small>Uncertain tutorial detail</small>}</div></article>)}</div>
        </section>
        <div className="brief-actions">
          <button className="outline" onClick={() => go("studio-intake")}>Edit inspiration</button>
          <button className="primary" onClick={() => go("preview")}>See the tutorial on my face →</button>
        </div>
      </section>
    </main>
  </>;

  if (view === "preview" && brief) return <>
    {nav}
    <main className="simple-page page-enter">
      <section className="preview-shell">
        <button className="back" onClick={() => go("look-brief")}>← Back to Look Brief</button>
        <div className="preview-heading">
          <div>
            <p className="eyebrow">Your personalized visualization</p>
            <h1>See the look before you start.</h1>
            <p>This is the finish your coach will work toward while your own live face stays front and center.</p>
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
              {previewImage ? <div className="feature-preview"><img src={previewImage} alt="AI-generated personalized makeup preview on your face"/></div> : <div className="preview-placeholder">
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
            <label className="preview-consent"><input type="checkbox" checked={previewConsent} onChange={event=>{setPreviewConsent(event.target.checked);setPreviewError("");}}/><span><b>Generate my personalized preview</b><small>Send this one face photo to OpenAI for makeup visualization. It is not saved by Makeup Bestie.</small></span></label>
            <button className="primary wide" disabled={!prepFile || !previewConsent || previewStatus === "generating"} onClick={generatePersonalizedPreview}>
              {previewStatus === "generating" ? "Generating realistic preview…" : previewImage ? "Regenerate preview" : "Generate my preview"}
            </button>
          </div>
          <aside className="preview-plan face-first-plan">
            <p className="eyebrow">Your face-first lesson</p>
            <h2>One product at a time.</h2>
            <p className="face-first-copy">Your analyzed tutorial becomes one chronological routine on your face. Each product has its own instruction, face-specific adjustment, and finish checkpoint.</p>
            <div className="face-first-flow"><span><b>1</b>Analyzed tutorial</span><i>→</i><span><b>2</b>Your features</span><i>→</i><span><b>3</b>Live step</span></div>
            <div className="product-timeline"><small>YOUR ROUTINE</small>{brief.steps.map((item,index)=><div key={`${item.title}-${index}`}><b>{String(index+1).padStart(2,"0")}</b><span><strong>{item.product}</strong><small>{areaSummary(item)}</small></span></div>)}</div>
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
            <button className="primary wide" disabled={!previewImage} onClick={() => {setStep(0);go("consent");}}>Start my face-first lesson →</button>
          </aside>
        </div>
      </section>
    </main>
  </>;

  if (view === "onboarding") {
    const qs = [["skin","First, your canvas","How does your skin usually feel?",["Dry or tight","Oily or shiny","A little of both","Balanced","Sensitive"]],["tone","Your complexion","Which range feels closest to you?",["Fair","Light","Medium","Tan","Deep","Rich"]],["level","Your experience","Where are you in your makeup journey?",["Just starting","I know the basics","Confident","Basically an artist"]],["goal","Your moment","What do you want to learn first?",["Everyday natural","Soft glam","Full glam","Editorial color","Copy a saved look"]]] as const; const q = qs[onboard];
    return <>{nav}<main className="onboarding page-enter"><div className="progress"><span style={{width:`${(onboard+1)*25}%`}} /></div><button className="back" onClick={() => onboard ? setOnboard(onboard-1) : go("home")}>← Back</button><section className="question-card"><p className="eyebrow">{q[1]}</p><h1>{q[2]}</h1><p className="subcopy">This personalizes technique—not your beauty.</p><div className="choice-grid">{q[3].map(o => <button key={o} className={answers[q[0]]===o?"selected":""} onClick={() => setAnswers({...answers,[q[0]]:o})}>{o}<b>{answers[q[0]]===o?"✓":"○"}</b></button>)}</div><button className="primary wide" disabled={!answers[q[0]]} onClick={() => onboard===3?go("face-scan"):setOnboard(onboard+1)}>{onboard===3?"Scan my face":"Continue"} →</button></section></main></>;
  }

  if (view === "consent") return <>{nav}<main className="simple-page page-enter"><section className="consent-card"><p className="eyebrow">Before the camera turns on</p><h1>Your face stays yours.</h1><p>Makeup Bestie keeps your own live face on screen and follows the analyzed tutorial one product at a time. Facial geometry is used only for face-specific coaching, and face shape remains an adjustable estimate.</p><div className="privacy-grid"><article><b>On your device</b><p>Continuous landmark tracking with no drawn face markings. No camera footage is saved.</p></article><article><b>Only when you ask</b><p>One compressed frame can be sent to OpenAI for a visual makeup check.</p></article><article><b>Your control</b><p>Visible activity labels and an immediate stop-camera button.</p></article></div><label className="check"><input type="checkbox" checked={consent.local} onChange={e=>setConsent({...consent,local:e.target.checked})}/><span><b>Allow on-device face landmarks</b><small>Required for face-aware coaching.</small></span></label><label className="check"><input type="checkbox" checked={consent.frames} onChange={e=>setConsent({...consent,frames:e.target.checked})}/><span><b>Allow selected AI frame checks</b><small>Optional. Frames are sent only when you tap “Check this step.”</small></span></label><label className="check"><input type="checkbox" checked={consent.voice} onChange={e=>setConsent({...consent,voice:e.target.checked})}/><span><b>Allow microphone for voice coaching</b><small>Optional. Starts only when you tap “Start voice.”</small></span></label><button className="primary wide" disabled={!consent.local} onClick={() => go("session")}>Start my step-by-step camera lesson →</button></section></main></>;

  if (view === "session") {
    const placement = shape ? placementFor(shape) : null;
    const placementKey = currentLesson.technique as keyof ReturnType<typeof placementFor>;
    const personalizedPlacement = placement?.[placementKey] || currentLesson.adaptation;
    const moveToStep = (nextStep:number) => {
      const target = Math.max(0,Math.min(activeLesson.length-1,nextStep));
      setStep(target); setTargetVisible(false);
      const item = activeLesson[target];
      if (voiceChannel.current?.readyState==="open") {
        voiceChannel.current.send(JSON.stringify({ type:"conversation.item.create", item:{ type:"message", role:"user", content:[{ type:"input_text", text:`Move to product step ${target+1}: ${item.product}. Face areas: ${areaSummary(item)}. Tutorial cue: ${item.referenceCue}. Personalized adaptation: ${item.adaptation}. Checkpoint: ${item.checkpoint}.` }] } }));
        voiceChannel.current.send(JSON.stringify({ type:"response.create", response:{ instructions:"Briefly introduce the next product and its face areas. Give one face-specific verbal instruction and wait for the user." } }));
      }
    };
    const repeatInstruction = () => {
      if (voiceChannel.current?.readyState==="open") voiceChannel.current.send(JSON.stringify({ type:"response.create", response:{ instructions:`Repeat the current ${currentLesson.title} instruction more simply. Refer to the analyzed tutorial cue and give verbal directions only.` } }));
      setFeedback(currentLesson.instruction);
    };
    const finishSession = () => {
      stopCamera(); setPaused(false); setTargetVisible(false); setFeedback("Routine complete. Your camera and microphone are off."); go("preview");
    };
    return <>
      {nav}
      <main className="studio page-enter">
        <div className="studio-heading">
          <div><p className="eyebrow">Your face · Product {step+1} of {activeLesson.length}</p><h1>{brief?.title || "Your personalized lesson"}</h1></div>
          <div className={`live-pill ${camera}`}><i /> {camera==="tracking"?"Local tracking active":camera==="starting"?"Loading landmarks…":camera==="no-face"?"No face detected":camera==="denied"?"Permission denied":"Camera off"}</div>
        </div>
        <div className="studio-grid">
          <section className="camera-card">
            <video ref={video} autoPlay muted playsInline/>
            {previewImage&&targetVisible&&<div className="live-target"><div><small>YOUR FINISHED TARGET</small><b>{currentLesson.product}</b><span>{areaSummary(currentLesson)}</span></div><img src={previewImage} alt="Your personalized finished-look target"/></div>}
            <div className="camera-fallback"><div className="face-shape">♡</div><p>{feedback}</p>{(camera==="denied"||camera==="error"||camera==="off")&&<button className="cream-button" onClick={startCamera}>Retry camera</button>}</div>
            <div className="camera-top"><span>{camera==="tracking"?"CAMERA + LOCAL AI":"CAMERA OFF"}</span><span>{consent.frames?"Frame sharing: ask only":"Frames never shared"}</span></div>
            <div className="bestie-bubble"><div className="avatar small">M</div><p><b>Makeup Bestie</b><br/>{feedback}</p></div>
          </section>
          <aside className="lesson-card">
            <div className="lesson-progress"><span>Product {step+1} of {activeLesson.length}</span><span>On your face</span></div>
            <div className="dots">{activeLesson.map((_,index)=><i key={index} className={index<=step?"active":""}/>)}</div>
            <p className="eyebrow">Now we’re using</p><h2>{currentLesson.product}</h2>
            <div className="area-chips">{stepAreas(currentLesson).map(area=><span key={area}>{areaLabels[area]}</span>)}</div>
            <p className="instruction">{currentLesson.instruction}</p>
            <div className="tutorial-cue"><small>FROM YOUR TUTORIAL</small><p>{currentLesson.referenceCue}</p></div>
            {brief?.sourceUrl&&<a className="studio-source-link" href={brief.sourceUrl} target="_blank" rel="noopener noreferrer">Open original tutorial ↗</a>}
            <div className="step-target"><small>THIS STEP IS READY WHEN</small><p>{currentLesson.checkpoint}</p></div>
            {shape&&<div className="face-result"><small>ADJUSTABLE ESTIMATE</small><p>Your proportions appear closest to <b>{shape}-shaped</b>.</p><select aria-label="Correct face shape" value={shape} onChange={event=>setShape(event.target.value as FaceShape)}>{["heart","oval","round","square","oblong","diamond"].map(item=><option key={item}>{item}</option>)}</select><p>{personalizedPlacement}</p></div>}
            <div className="session-actions">
              {previewImage&&<button className="outline" onClick={()=>setTargetVisible(!targetVisible)}>{targetVisible?"Hide my target":"See the finished target on my face"}</button>}
              {consent.frames&&<button className="outline" onClick={aiCheck} disabled={checking||camera!=="tracking"}>{checking?"Checking one frame…":"Check this step"}</button>}
              {consent.voice&&!voiceActive&&<button className="outline" onClick={startVoice} disabled={voiceConnecting}>{voiceConnecting?"Connecting one coach…":"Start voice"}</button>}
              {step===activeLesson.length-1?<button className="primary wide" onClick={finishSession}>Finish routine ✓</button>:<button className="primary wide" onClick={()=>moveToStep(step+1)}>This product is done →</button>}
            </div>
            <div className="lesson-controls">
              <button onClick={()=>moveToStep(step-1)}>↶ Back</button>
              <button onClick={()=>{setPaused(!paused);setFeedback(paused?"Local tracking resumed.":"Analysis paused. No frames are being processed.")}}>{paused?"▶ Resume":"Ⅱ Pause"}</button>
              <button onClick={repeatInstruction}>↻ Repeat</button>
              <button onClick={()=>{setMuted(!muted);if(audio.current)audio.current.muted=!muted}}>{muted?"Unmute":"Mute"}</button>
            </div>
            <button className="stop-button" onClick={stopCamera}>Stop camera & end session</button>
          </aside>
        </div>
      </main>
    </>;
  }

  if (view === "import") return <>{nav}<main className="simple-page page-enter"><section className="import-card"><div className="import-icon">▶</div><p className="eyebrow">Tutorial-aware lessons</p><h1>Bring the tutorial. We’ll make it yours.</h1><p>Start with your skin information and private face scan, then paste the original tutorial link and tell us which products are already in your makeup bag.</p><button className="primary wide" onClick={()=>{setOnboard(0);go("onboarding");}}>Start my personalized lesson →</button></section></main></>;

  if (view === "profile") return <>{nav}<main className="profile page-enter"><section className="profile-top"><div className="avatar large">S</div><div><p className="eyebrow">Your beauty shelf</p><h1>Good to see you.</h1><p>{answers.skin||"Your"} skin · {answers.goal||"Personalized makeup"} · face estimate {shape||"not set"}</p></div></section><div className="stat-row"><div><b>2</b><span>Saved looks</span></div><div><b>Local</b><span>Face tracking</span></div><div><b>0</b><span>Saved face images</span></div></div></main></>;

  return <>{nav}<main className="home page-enter"><section className="hero"><div className="hero-copy"><p className="eyebrow">Your makeup artist. Your hype woman.</p><h1>Makeup finally<br/>feels like <em>you.</em></h1><p className="hero-text">A real tutorial analysis, adapted to your features and coached one product at a time—like FaceTiming your most talented friend.</p><div className="hero-actions"><button className="primary" onClick={()=>go("onboarding")}>Create my lesson →</button></div></div><div className="hero-visual"><div className="arch"><div className="portrait"><div className="hair"/><div className="head"><i className="eye one"/><i className="eye two"/><i className="mouth"/></div><div className="neck"/></div><div className="call-copy"><span>TUTORIAL-AWARE COACHING</span><b>Your tutorial. Your products. Your face, step by step.</b></div></div><div className="floating-note"><div className="avatar small">M</div><p><b>Your privacy comes first</b><br/>Landmarks stay on your device ✦</p></div></div></section><section className="logo-strip"><span>PERSONALIZED FOR</span><b>your face</b><i>✦</i><b>your products</b><i>✦</i><b>your pace</b></section><section className="how"><div className="section-heading"><div><p className="eyebrow">Real intelligence, honest controls</p><h2>From saved tutorial<br/>to your own routine.</h2></div><p>Face shape is estimated from visible proportions and stays editable. The actual tutorial video must be analyzed before a lesson is created.</p></div><div className="feature-grid"><article><span>01</span><div className="feature-icon">♡</div><h3>Map proportions locally</h3><p>MediaPipe estimates cheeks, jaw, forehead, eyes, brows, nose, and lips in your browser.</p></article><article><span>02</span><div className="feature-icon">▶</div><h3>Analyze the tutorial</h3><p>Ordered frames reveal the real product sequence instead of generating a generic routine.</p></article><article><span>03</span><div className="feature-icon">✦</div><h3>Coach every step</h3><p>Your live face stays clear while your bestie gives verbal guidance and optional AI checks.</p></article></div></section><section className="import-banner"><div><p className="eyebrow">Saw a look you love?</p><h2>Bring the tutorial.<br/>Make it <em>yours.</em></h2><p>Save its original link, attach the video for analysis, and follow the adapted routine product by product.</p><button className="cream-button" onClick={()=>go("import")}>Create my lesson →</button></div></section></main><footer><Logo home={()=>go("home")}/><p>Beauty guidance built around the person in the mirror.</p><span>© 2026 Makeup Bestie</span></footer></>;
}
