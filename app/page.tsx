"use client";
/* eslint-disable @next/next/no-img-element -- preparation photos use temporary local blob URLs */

import { useEffect, useRef, useState } from "react";
import { estimateFaceProfile, placementFor, type FaceProfile, type FaceShape, type Point } from "@/lib/face-analysis";
import { type LessonRegion, type Technique } from "@/lib/placement-map";
import { PlacementGuide } from "./placement-guide";
import { extractTutorialFrames, extractTutorialFramesFromUrl } from "@/lib/video-frames";

type View = "home" | "onboarding" | "face-scan" | "studio-intake" | "look-brief" | "preview" | "session" | "import" | "profile";
type LessonStep = { title: string; instruction: string; product: string; region: LessonRegion; areas: LessonRegion[]; technique: Technique; referenceCue: string; adaptation: string; checkpoint: string; startTimeSeconds: number; endTimeSeconds: number; uncertain: boolean };
type LookBrief = { title: string; summary: string; adaptation: string; difficulty: string; time: string; products: string[]; uncertainties: string[]; analysisScope: string; steps: LessonStep[]; sourceUrl?: string; sourceVideoAnalyzed?: boolean };
const defaultLesson: LessonStep[] = [
  { title:"Prep your canvas", instruction:"Press primer into the center, then blend outward.", product:"Primer", region:"all-face", areas:["all-face"], technique:"prep", referenceCue:"Foundation preparation", adaptation:"Use thin, comfortable layers.", checkpoint:"Skin feels comfortable and looks evenly prepped without visible buildup.", startTimeSeconds:0, endTimeSeconds:8, uncertain:false },
  { title:"Even the base", instruction:"Tap skin tint in thin layers; keep the hairline sheer.", product:"Skin tint or foundation", region:"complexion", areas:["complexion","forehead","both-cheeks","nose","jaw"], technique:"base", referenceCue:"Even complexion", adaptation:"Add coverage only where you want it.", checkpoint:"The complexion looks even while natural skin texture remains visible.", startTimeSeconds:8, endTimeSeconds:22, uncertain:false },
  { title:"Personalized sculpt", instruction:"Blend softly beneath the cheekbone.", product:"Contour", region:"both-cheeks", areas:["both-cheeks","forehead","nose","jaw"], technique:"contour", referenceCue:"Soft definition", adaptation:"Follow your adjustable proportion estimate.", checkpoint:"The sculpting reads as soft dimension with no hard or unblended edges.", startTimeSeconds:22, endTimeSeconds:35, uncertain:false },
  { title:"Blush & glow", instruction:"Place blush lightly, then soften every edge.", product:"Blush", region:"both-cheeks", areas:["both-cheeks"], technique:"blush", referenceCue:"Lifted cheek color", adaptation:"Adjust direction to your cheek proportions.", checkpoint:"Both cheeks carry a balanced wash of color in the intended direction.", startTimeSeconds:35, endTimeSeconds:45, uncertain:false },
  { title:"Frame the eyes", instruction:"Build the eye shape in light layers.", product:"Shadow or liner", region:"both-eyes", areas:["both-eyes"], technique:"eyeliner", referenceCue:"Soft eye definition", adaptation:"Follow your natural eye angle.", checkpoint:"The eye shape is balanced before adding more intensity.", startTimeSeconds:45, endTimeSeconds:58, uncertain:false },
  { title:"Finish the lip", instruction:"Trace your natural lip border and blend toward the center.", product:"Lip color", region:"lips", areas:["lips"], technique:"lips", referenceCue:"Finished lip", adaptation:"Keep your natural border visible.", checkpoint:"The lip edge is clean, softly blended, and close to the tutorial finish.", startTimeSeconds:58, endTimeSeconds:68, uncertain:false },
];

const productOptions = ["Primer", "Foundation or skin tint", "Concealer", "Contour or bronzer", "Blush", "Highlighter", "Brow product", "Eyeshadow", "Eyeliner", "Mascara", "Lip liner", "Lip color", "Setting powder or spray"];
const areaLabels: Record<LessonRegion, string> = { "all-face":"full face", complexion:"complexion", forehead:"forehead", "both-cheeks":"both cheeks", "left-cheek":"left cheek", "right-cheek":"right cheek", "both-eyes":"both eyes", "left-eye":"left eye", "right-eye":"right eye", brows:"brows", nose:"nose", lips:"lips", jaw:"jaw and chin", none:"finish" };
const stepAreas = (item: LessonStep) => [...new Set(item.areas?.length ? item.areas : [item.region])];
const areaSummary = (item: LessonStep) => stepAreas(item).map(area => areaLabels[area]).join(" · ");
type FeatureKey = "complexion" | "cheeks" | "eyes" | "brows" | "nose" | "lips" | "jaw";
const featureLabels: Record<FeatureKey,string> = { complexion:"Complexion", cheeks:"Cheeks", eyes:"Eyes", brows:"Brows", nose:"Nose", lips:"Lips", jaw:"Jaw & chin" };
const featureRegions: Record<FeatureKey,LessonRegion[]> = {
  complexion:["all-face","complexion","forehead"], cheeks:["both-cheeks","left-cheek","right-cheek"], eyes:["both-eyes","left-eye","right-eye"], brows:["brows"], nose:["nose"], lips:["lips"], jaw:["jaw"],
};
const stepMatchesFeature = (item:LessonStep, feature:FeatureKey) => stepAreas(item).some(area=>featureRegions[feature].includes(area));
const stepAreasForFeature = (item:LessonStep, feature:FeatureKey) => stepAreas(item).filter(area=>featureRegions[feature].includes(area));

const normalizeTutorialUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
};

function TutorialClip({ src, start, end, product }: { src:string; start:number; end:number; product:string }) {
  const clip = useRef<HTMLVideoElement>(null);
  const safeStart = Math.max(0, start || 0);
  const safeEnd = Math.max(safeStart + 2, end || safeStart + 8);
  const replay = () => { if (!clip.current) return; clip.current.currentTime = safeStart; void clip.current.play(); };
  useEffect(()=>{
    const element=clip.current;
    if(!element||element.readyState<1) return;
    element.currentTime=safeStart;
    element.pause();
  },[safeStart,src]);
  return <div className="tutorial-clip">
    <div><span><b>FROM YOUR TUTORIAL</b><small>{Math.floor(safeStart/60)}:{String(Math.floor(safeStart%60)).padStart(2,"0")}–{Math.floor(safeEnd/60)}:{String(Math.floor(safeEnd%60)).padStart(2,"0")}</small></span><button onClick={replay}>↻ Replay clip</button></div>
    <video ref={clip} src={src} playsInline muted controls preload="metadata" aria-label={`${product} tutorial segment`} onLoadedMetadata={()=>{if(clip.current)clip.current.currentTime=safeStart;}} onTimeUpdate={()=>{if(clip.current&&clip.current.currentTime>=safeEnd){clip.current.pause();clip.current.currentTime=safeStart;}}}/>
  </div>;
}

function FaceFeaturePicker({ photo }: { photo:string }) {
  return <div className="feature-picker"><img src={photo} alt="Your clean scanned face before choosing a lesson area"/></div>;
}

type MirrorStatus="starting"|"active"|"no-face"|"poor-light"|"denied"|"error";
type VideoLandmarker={detectForVideo:(video:HTMLVideoElement,time:number)=>{faceLandmarks:Point[][]};close:()=>void};
function SilentMirror({ areas, technique, shape, stepNumber, paused, onClose }: { areas:LessonRegion[]; technique:Technique; shape:FaceShape|null; stepNumber:number; paused:boolean; onClose:()=>void }) {
  const camera=useRef<HTMLVideoElement>(null);
  const [status,setStatus]=useState<MirrorStatus>("starting");
  const [livePoints,setLivePoints]=useState<Point[]>([]);
  // The chart is drawn in the camera's own aspect ratio, so zones sit on the
  // face rather than on a cropped guess at where the face might be.
  const [feedAspect,setFeedAspect]=useState(1);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const videoElement=camera.current;
    let disposed=false;
    let media:MediaStream|null=null;
    let frame=0;
    let raf=0;
    let landmarker:VideoLandmarker|null=null;
    const start=async()=>{
      setStatus("starting");setLivePoints([]);
      try {
        media=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720},height:{ideal:720}},audio:false});
        if(disposed){media.getTracks().forEach(track=>track.stop());return;}
        if(!videoElement) return;
        videoElement.srcObject=media;await videoElement.play();
        if(videoElement.videoWidth&&videoElement.videoHeight)setFeedAspect(videoElement.videoWidth/videoElement.videoHeight);
        const {FaceLandmarker,FilesetResolver}=await import("@mediapipe/tasks-vision");
        const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
        const originalError=console.error;console.error=(...args:unknown[])=>{if(typeof args[0]==="string"&&args[0].includes("Created TensorFlow Lite XNNPACK delegate"))return;originalError(...args);};
        try { landmarker=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",delegate:"GPU"},runningMode:"VIDEO",numFaces:1,minFaceDetectionConfidence:.55,minTrackingConfidence:.55}) as VideoLandmarker; }
        finally { console.error=originalError; }
        let lastTime=-1,misses=0;
        const lightCanvas=document.createElement("canvas");lightCanvas.width=24;lightCanvas.height=18;
        const lightContext=lightCanvas.getContext("2d",{willReadFrequently:true});
        const tick=()=>{
          if(disposed||!videoElement||!landmarker)return;
          if(videoElement.currentTime!==lastTime){
            lastTime=videoElement.currentTime;
            const points=landmarker.detectForVideo(videoElement,performance.now()).faceLandmarks[0];
            if(points){misses=0;setLivePoints(points);setStatus("active");}
            else if(++misses>18){setLivePoints([]);setStatus("no-face");}
            if(++frame%30===0&&lightContext){lightContext.drawImage(videoElement,0,0,24,18);const data=lightContext.getImageData(0,0,24,18).data;let total=0;for(let index=0;index<data.length;index+=4)total+=(data[index]+data[index+1]+data[index+2])/3;if(total/(data.length/4)<42)setStatus("poor-light");}
          }
          raf=requestAnimationFrame(tick);
        };
        tick();
      } catch(error) {
        const denied=error instanceof DOMException&&(error.name==="NotAllowedError"||error.name==="PermissionDeniedError");
        setStatus(denied?"denied":"error");
      }
    };
    void start();
    return()=>{disposed=true;cancelAnimationFrame(raf);landmarker?.close();media?.getTracks().forEach(track=>track.stop());if(videoElement)videoElement.srcObject=null;};
  },[retry]);
  const copy:Record<MirrorStatus,string>={starting:"Starting your private mirror…",active:"Private mirror active · landmarks stay on this device","no-face":"No face detected. Center the selected feature in view.","poor-light":"Lighting is too low for stable placement. Face a soft light.",denied:"Camera permission was denied.",error:"The private mirror could not start on this device."};
  return <div className="silent-mirror" style={{aspectRatio:String(feedAspect)}}>
    <video ref={camera} autoPlay muted playsInline/>
    {livePoints.length>0&&(
      <PlacementGuide id="mirror" mirrored focused points={livePoints} areas={areas} technique={technique} shape={shape} aspect={feedAspect} stepNumber={stepNumber} paused={paused}/>
    )}
    <div className={`mirror-status ${status}`}><i/><span>{copy[status]}</span></div>
    {(status==="denied"||status==="error")&&<button className="mirror-retry" onClick={()=>setRetry(value=>value+1)}>Retry camera</button>}
    <button className="mirror-close" onClick={onClose}>Stop mirror</button>
  </div>;
}

function Logo({ home }: { home: () => void }) { return <button className="logo" onClick={home}><span>m</span> makeup bestie</button>; }

export default function App() {
  const [view, setView] = useState<View>("onboarding");
  const [onboard, setOnboard] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<FaceProfile | null>(null);
  const [shape, setShape] = useState<FaceShape | null>(null);
  const [facePoints, setFacePoints] = useState<Point[]>([]);
  const [photoAspect, setPhotoAspect] = useState(3/4);
  const [selectedFeature, setSelectedFeature] = useState<FeatureKey|null>(null);
  const [mirrorOpen,setMirrorOpen]=useState(false);
  const [tutorialClipOpen,setTutorialClipOpen]=useState(false);
  // Blending arrows animate by default, but anyone can freeze them — and they
  // start frozen for people who have asked their system to reduce motion.
  const [guideMotion,setGuideMotion]=useState(true);
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
  const [tutorialVideoUrl, setTutorialVideoUrl] = useState("");
  const fullLesson = brief?.steps?.length ? brief.steps : defaultLesson;
  const matchingLesson = selectedFeature ? fullLesson.filter(item=>stepMatchesFeature(item,selectedFeature)) : fullLesson;
  const activeLesson = selectedFeature && matchingLesson.length ? matchingLesson : fullLesson;
  const currentLesson = activeLesson[Math.min(step, activeLesson.length - 1)];

  const go = (v: View) => { const needsSetup = (v === "session" && !brief) || (v === "studio-intake" && mapStatus !== "ready"); const next = needsSetup ? "onboarding" : v; setView(next); window.scrollTo(0, 0); };
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setGuideMotion(!query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  useEffect(() => () => { if (prepPhoto) URL.revokeObjectURL(prepPhoto); }, [prepPhoto]);
  useEffect(() => () => { if (tutorialVideoUrl) URL.revokeObjectURL(tutorialVideoUrl); }, [tutorialVideoUrl]);
  const nav = <header className="nav-shell"><nav className="nav"><Logo home={() => go("home")} /><div className="nav-links"><button onClick={() => go("home")}>Home</button><button onClick={() => go(brief?"preview":"onboarding")}>Studio</button><button onClick={() => go(mapStatus==="ready"?"studio-intake":"onboarding")}>Inspiration</button><button onClick={() => go("profile")}>My looks</button></div><button className="nav-cta" onClick={() => {setOnboard(0);go("onboarding");}}>Start my lesson →</button></nav></header>;

  const analyzePreparationPhoto = async (file: File) => {
    if (prepPhoto) URL.revokeObjectURL(prepPhoto);
    const url = URL.createObjectURL(file); setPrepPhoto(url); setMapStatus("analyzing"); setMapMessage("Mapping facial regions privately on this device…");
    try {
      const image = new Image(); image.src = url; await image.decode(); setPhotoAspect(image.naturalWidth/image.naturalHeight);
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
      const originalConsoleError = console.error; console.error = (...args: unknown[]) => { if (typeof args[0] === "string" && args[0].includes("Created TensorFlow Lite XNNPACK delegate")) return; originalConsoleError(...args); };
      let detector;
      try { detector = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task", delegate: "GPU" }, runningMode: "IMAGE", numFaces: 1, minFaceDetectionConfidence: .55 }); }
      finally { console.error = originalConsoleError; }
      const points = detector.detect(image).faceLandmarks[0] as Point[] | undefined; detector.close();
      if (!points) { setMapStatus("no-face"); setMapMessage("No face was detected. Try a front-facing photo in even light, or use an approximate map."); return; }
      setFacePoints(points);
      const localProfile = estimateFaceProfile(points); if (localProfile) { setProfile(localProfile); setShape(localProfile.shape); }
      setMapStatus("ready"); setMapMessage("Facial proportions mapped locally. Your tutorial can now be adapted to your face.");
    } catch { setMapStatus("error"); setMapMessage("The local face scan could not load. Please retry with another photo."); }
  };

  const generatePersonalizedPreview = async () => {
    if (!prepFile || !brief || !previewConsent) { setPreviewError("Confirm that you want to send this one photo for preview generation."); return; }
    if(prepFile.size>3_500_000){setPreviewError("Choose a face photo under 3.5 MB for preview generation. Your local face map can still use the current photo.");return;}
    setPreviewStatus("generating"); setPreviewError("");
    const form = new FormData(); form.append("face",prepFile); form.append("description",`${brief.title}. ${brief.summary}. ${lookNotes}`); form.append("intensity",previewIntensity);
    if (lookReferenceFrame) form.append("reference", await (await fetch(lookReferenceFrame)).blob(), "tutorial-finish.jpg");
    try { const response = await fetch("/api/preview-look",{method:"POST",body:form}); const data = await response.json(); if(!response.ok) throw new Error(data.error); setPreviewImage(data.image); setPreviewStatus("ready"); }
    catch(error) { setPreviewError(error instanceof Error?error.message:"Preview generation failed."); setPreviewStatus("error"); }
  };

  const createBrief = async () => {
    const sourceUrl = normalizeTutorialUrl(lookUrl);
    if(lookUrl.trim()&&!sourceUrl){setLessonError("Paste a complete tutorial link beginning with http:// or https://, or clear it and upload a video.");return;}
    if(!sourceUrl&&!lookFile){setLessonError("Paste a public tutorial link or upload a permitted video copy.");return;}
    setLessonAnalyzing(true); setLessonError(""); setLessonStage(lookFile?"Reading the uploaded tutorial on your device…":"Checking whether this public tutorial link exposes video…");
    try {
      let tutorial;
      if(lookFile) tutorial=await extractTutorialFrames(lookFile,14);
      else {
        const linkResponse=await fetch("/api/tutorial-media",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:sourceUrl}),signal:AbortSignal.timeout(25_000)});
        const raw=await linkResponse.text();let linkData:Record<string,unknown>={};try{linkData=JSON.parse(raw);}catch{/* The status-specific fallback below is clearer than invalid server HTML. */}
        if(!linkResponse.ok||typeof linkData.streamUrl!=="string")throw new Error(typeof linkData.error==="string"?linkData.error:"This tutorial link could not be accessed. Upload a permitted video copy instead.");
        setTutorialVideoUrl(linkData.streamUrl);
        setLessonStage("Reading the publicly accessible tutorial timeline…");
        tutorial=await extractTutorialFramesFromUrl(linkData.streamUrl,14);
      }
      setLessonStage(`Uploading ${tutorial.frames.length} timeline samples for visual analysis…`);
      setLookReferenceFrame(tutorial.frames.at(-1) || "");
      const context = JSON.stringify({ skin:answers.skin || "not provided", tone:answers.tone || "not provided", experience:answers.level || "not provided", goal:answers.goal || "not provided", faceShapeEstimate:shape || "pending and adjustable", availableProducts:ownedProducts, lessonStyle:"One chronological product-by-product lesson. Each product step may cover several precise face areas on the user's own face." });
      const response = await fetch("/api/import-look", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ frames:tutorial.frames, sampleTimes:tutorial.sampleTimes, duration:tutorial.duration, description:lookNotes, context }), signal:AbortSignal.timeout(75_000) });
      const raw = await response.text();
      let data: Record<string, unknown>;
      try { data = JSON.parse(raw); }
      catch { throw new Error(response.status === 413 ? "The tutorial upload is still too large. Try a shorter or lower-resolution video." : `Tutorial analysis stopped on the server (${response.status}). Please try again.`); }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Tutorial analysis failed. Please try again.");
      setLessonStage("Turning the analyzed sequence into your personalized steps…");
      const guide = data as Omit<LookBrief,"time"> & { estimatedMinutes:number };
      setBrief({ ...guide, time:`${guide.estimatedMinutes} min`, sourceUrl:sourceUrl||undefined, sourceVideoAnalyzed:true });
      setSelectedFeature(null);setMirrorOpen(false);setStep(0);go("look-brief");
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
            {/* The measurement behind the guess, so a wrong estimate is obvious
                and correctable rather than presented as a verdict. */}
            {profile&&<div className="scan-measures">
              <div><b>{Math.round(profile.confidence*100)}%</b><small>Estimate confidence</small></div>
              <div><b>{profile.ratios.lengthToWidth.toFixed(2)}</b><small>Length to width</small></div>
              <div><b>{profile.ratios.foreheadToJaw.toFixed(2)}</b><small>Forehead to jaw</small></div>
            </div>}
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
        <p className="studio-lede">Paste a public tutorial link or upload a permitted video copy, then choose the makeup you already own.</p>
        <div className="tutorial-link-box launch-link-box">
          <label>
            <span>Paste the original tutorial link <small>or upload below</small></span>
            <input type="url" inputMode="url" value={lookUrl} onChange={event => { setLookUrl(event.target.value); setLessonError(""); }} placeholder="https://www.tiktok.com/..."/>
          </label>
          <label className="upload-zone intake-upload required-upload">
            <span>Upload the tutorial video <small>or paste a link above</small></span>
            <small>Only upload a video you have permission to use.</small>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => { const file=event.target.files?.[0]||null; setLookFile(file); setTutorialVideoUrl(file?URL.createObjectURL(file):""); setLessonError(""); }}/>
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
        <p className="honest-note"><b>No pretend analysis:</b> Makeup Bestie first tries to read a public linked video. If the platform blocks access, you’ll be asked for an upload. A lesson is created only after real tutorial frames are analyzed.</p>
        {lessonAnalyzing&&<div className="analysis-progress" role="status"><i/><span><b>Analyzing your tutorial</b><small>{lessonStage}</small></span></div>}
        {lessonError && <p className="error">{lessonError}</p>}
        <button className="primary intake-continue" disabled={lessonAnalyzing || (!lookUrl.trim() && !lookFile)} onClick={createBrief}>
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
            <p>This is the finish your personalized placement lesson will work toward on your own face.</p>
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
            <h2>One feature at a time.</h2>
            <p className="face-first-copy">Your analyzed tutorial stays in its original product order. In the Glam Room, choose a feature and see only the tutorial steps that affect that area.</p>
            <div className="face-first-flow"><span><b>1</b>Analyzed tutorial</span><i>→</i><span><b>2</b>Your features</span><i>→</i><span><b>3</b>Placement guide</span></div>
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
            <div className="part-by-part-ready"><small>YOUR LESSON FORMAT</small><b>Part by part</b><span>Tap eyes, cheeks, lips, or another available area and follow only the relevant tutorial steps.</span></div>
            <label className="save-photo-option">
              <input type="checkbox" checked={saveSessionPhotos} onChange={e => setSaveSessionPhotos(e.target.checked)}/>
              <span><b>Save this look</b><small>Off by default. Your face photo is not added to My Looks unless you choose this.</small></span>
            </label>
            <button className="primary wide" disabled={!prepPhoto} onClick={() => {setStep(0);setSelectedFeature(null);setMirrorOpen(false);go("session");}}>Choose a face area →</button>
          </aside>
        </div>
      </section>
    </main>
  </>;

  if (view === "onboarding") {
    const qs = [["skin","First, your canvas","How does your skin usually feel?",["Dry or tight","Oily or shiny","A little of both","Balanced","Sensitive"]],["tone","Your complexion","Which range feels closest to you?",["Fair","Light","Medium","Tan","Deep","Rich"]],["level","Your experience","Where are you in your makeup journey?",["Just starting","I know the basics","Confident","Basically an artist"]],["goal","Your moment","What do you want to learn first?",["Everyday natural","Soft glam","Full glam","Editorial color","Copy a saved look"]]] as const; const q = qs[onboard];
    return <>{nav}<main className="onboarding page-enter"><div className="progress"><span style={{width:`${(onboard+1)*25}%`}} /></div><button className="back" onClick={() => onboard ? setOnboard(onboard-1) : go("home")}>← Back</button><section className="question-card"><p className="eyebrow">{q[1]}</p><h1>{q[2]}</h1><p className="subcopy">This personalizes technique—not your beauty.</p><div className="choice-grid">{q[3].map(o => <button key={o} className={answers[q[0]]===o?"selected":""} onClick={() => setAnswers({...answers,[q[0]]:o})}>{o}<b>{answers[q[0]]===o?"✓":"○"}</b></button>)}</div><button className="primary wide" disabled={!answers[q[0]]} onClick={() => onboard===3?go("face-scan"):setOnboard(onboard+1)}>{onboard===3?"Scan my face":"Continue"} →</button></section></main></>;
  }

  if (view === "session") {
    const placement = shape ? placementFor(shape) : null;
    const placementKey = currentLesson.technique as keyof ReturnType<typeof placementFor>;
    const personalizedPlacement = placement?.[placementKey] || currentLesson.adaptation;
    const availableFeatures=(Object.keys(featureLabels) as FeatureKey[]).filter(feature=>fullLesson.some(item=>stepMatchesFeature(item,feature)));
    const moveToStep = (nextStep:number) => {
      const target = Math.max(0,Math.min(activeLesson.length-1,nextStep));
      setStep(target);
    };
    const chooseFeature=(feature:FeatureKey)=>{setSelectedFeature(feature);setMirrorOpen(true);setTutorialClipOpen(false);setStep(0);};
    const choosingFeature=!selectedFeature;
    const focusedFeature=Boolean(selectedFeature);
    const visibleAreas=(item:LessonStep)=>focusedFeature&&selectedFeature?stepAreasForFeature(item,selectedFeature):stepAreas(item);
    const personalizedGuide=(compact=false)=><div className={`glam-face${compact?" compact-guide":""}`} style={{aspectRatio:String(photoAspect)}}>
      <img src={prepPhoto} alt="Your face with a personalized makeup placement guide"/>
      {activeLesson.slice(0,step).map((item,index)=><PlacementGuide key={`${item.product}-${index}`} id={`complete-${compact?"pip-":""}${index}`} soft focused stepNumber={index+1} points={facePoints} areas={visibleAreas(item)} technique={item.technique} shape={shape} aspect={photoAspect}/>)}
      <PlacementGuide id={compact?"lesson-pip":"lesson"} focused points={facePoints} areas={visibleAreas(currentLesson)} technique={currentLesson.technique} shape={shape} aspect={photoAspect} stepNumber={step+1} paused={!guideMotion}/>
      {!compact&&<button className="guide-motion-toggle" aria-pressed={!guideMotion} onClick={()=>setGuideMotion(value=>!value)}>{guideMotion?"Ⅱ Pause arrows":"▶ Animate arrows"}</button>}
      {!compact&&<div className="placement-key"><span/><b>{currentLesson.product}</b><small>Outline = where it goes · arrows = which way to blend</small></div>}
    </div>;
    return <>
      {nav}
      <main className="glam-room page-enter">
        <div className="glam-heading">
          <div><p className="eyebrow">The Glam Room · Part-by-part lesson</p><h1>{brief?.title || "Your personalized lesson"}</h1><p>{choosingFeature?"Choose one available area on your face to begin.":mirrorOpen?"Your silent live mirror is open. Follow the animated placement preview in the corner.":"Your camera is paused. The personalized placement guide is still available."}</p></div>
          <div className={`offline-pill${mirrorOpen?" active":""}`}><i/> {mirrorOpen?"Private mirror active":choosingFeature?"Camera starts after your choice":"Camera paused"}</div>
        </div>
        <div className="glam-grid">
          <section className="glam-face-card">
            {choosingFeature?<FaceFeaturePicker photo={prepPhoto}/>:mirrorOpen?<div className="feature-mirror-stage">
              <SilentMirror areas={visibleAreas(currentLesson)} technique={currentLesson.technique} shape={shape} stepNumber={step+1} paused onClose={()=>setMirrorOpen(false)}/>
              <div className="animated-guide-pip">
                <div className="animated-guide-title"><span>YOUR ANIMATED GUIDE</span><b>{currentLesson.product}</b></div>
                {personalizedGuide(true)}
                <button className="pip-motion-toggle" aria-pressed={!guideMotion} onClick={()=>setGuideMotion(value=>!value)}>{guideMotion?"Ⅱ Pause arrows":"▶ Animate arrows"}</button>
              </div>
            </div>:personalizedGuide()}
            {!choosingFeature&&<div className="glam-face-caption"><span>{mirrorOpen?"Silent live mirror · on-device tracking":"Camera paused · scanned-face guide"}</span><b>{areaSummary(currentLesson)}</b></div>}
          </section>
          <aside className="glam-lesson-card">
            {choosingFeature?<div className="feature-welcome"><p className="eyebrow">Choose your lesson area</p><h2>Pick one feature.</h2><p>Select from the list below. We’ll gather every tutorial step that affects it and keep the original product order.</p><div className="available-list">{availableFeatures.map(feature=><button key={feature} onClick={()=>chooseFeature(feature)}>{featureLabels[feature]} <span>→</span></button>)}</div></div>:<>
              <div className="lesson-progress"><span>{selectedFeature?featureLabels[selectedFeature]:"Choose a feature"}</span><span>Step {step+1} of {activeLesson.length}</span></div>
              <div className="dots">{activeLesson.map((_,index)=><i key={index} className={index<=step?"active":""}/>)}</div>
              {selectedFeature&&<button className="change-feature" onClick={()=>{setSelectedFeature(null);setMirrorOpen(false);setStep(0);}}>← Choose another face area</button>}
              <p className="eyebrow">Now we’re using</p><h2>{currentLesson.product}</h2>
              <div className="area-chips">{visibleAreas(currentLesson).map(area=><span key={area}>{areaLabels[area]}</span>)}</div>
              <p className="instruction">{currentLesson.instruction}</p>
              {tutorialVideoUrl&&<div className="tutorial-clip-control"><button className="outline" onClick={()=>setTutorialClipOpen(value=>!value)}>{tutorialClipOpen?"Hide tutorial clip":"View tutorial clip"}</button>{tutorialClipOpen&&<TutorialClip src={tutorialVideoUrl} start={currentLesson.startTimeSeconds} end={currentLesson.endTimeSeconds} product={currentLesson.product}/>}</div>}
              {!tutorialVideoUrl&&<div className="tutorial-cue"><small>FROM YOUR TUTORIAL</small><p>{currentLesson.referenceCue}</p></div>}
              <div className="personalized-direction"><small>PLACEMENT FOR YOUR FACE</small><p>{currentLesson.adaptation}</p>{personalizedPlacement!==currentLesson.adaptation&&<p>{personalizedPlacement}</p>}</div>
              <div className="step-target"><small>THIS STEP IS READY WHEN</small><p>{currentLesson.checkpoint}</p></div>
              {currentLesson.uncertain&&<div className="uncertain-step"><b>Uncertain tutorial detail</b><span>This product, shade, or hidden technique could not be confirmed from the analyzed frames.</span></div>}
              {previewImage&&<div className="finished-mini"><img src={previewImage} alt="Your personalized finished look"/><span><small>YOUR FINISHED TARGET</small><b>{brief?.title}</b></span></div>}
              {!mirrorOpen&&<div className="mirror-option"><div><b>Silent mirror paused</b><span>Restart it whenever you are ready. Landmarks stay on this device; no frames are uploaded.</span></div><button className="outline" onClick={()=>setMirrorOpen(true)}>Restart silent mirror</button></div>}
              <div className="glam-actions">
                <button className="outline" disabled={step===0} onClick={()=>moveToStep(step-1)}>← Previous</button>
                {step===activeLesson.length-1?<button className="primary" onClick={()=>{setMirrorOpen(false);go("preview");}}>Finish {selectedFeature?featureLabels[selectedFeature].toLowerCase():"feature"} ✓</button>:<button className="primary" onClick={()=>moveToStep(step+1)}>Done—next product →</button>}
              </div>
            </>}
          </aside>
        </div>
      </main>
    </>;
  }

  if (view === "import") return <>{nav}<main className="simple-page page-enter"><section className="import-card"><div className="import-icon">▶</div><p className="eyebrow">Tutorial-aware lessons</p><h1>Bring the tutorial. We’ll make it yours.</h1><p>Start with your skin information and private face scan, then paste a public tutorial link or upload a permitted video and tell us which products are already in your makeup bag.</p><button className="primary wide" onClick={()=>{setOnboard(0);go("onboarding");}}>Start my personalized lesson →</button></section></main></>;

  if (view === "profile") {
    // Every number here is read from this session's real state. Nothing is
    // persisted yet, so the page says so rather than showing an invented total.
    const savedLooks = brief && saveSessionPhotos ? 1 : 0;
    const savedFaceImages = prepPhoto && saveSessionPhotos ? 1 : 0;
    return <>{nav}<main className="profile page-enter">
      <section className="profile-top">
        <div className="avatar large">{(answers.goal || "You").trim().charAt(0).toUpperCase()}</div>
        <div><p className="eyebrow">Your beauty shelf</p><h1>Good to see you.</h1><p>{answers.skin||"Your"} skin · {answers.goal||"Personalized makeup"} · face estimate {shape||"not set"}</p></div>
      </section>
      <div className="stat-row">
        <div><b>{savedLooks}</b><span>Saved looks</span></div>
        <div><b>{mapStatus==="ready"?"Local":"Not yet"}</b><span>Face mapping</span></div>
        <div><b>{savedFaceImages}</b><span>Saved face images</span></div>
      </div>
      <p className="profile-note">{brief
        ? `This session's lesson — ${brief.title} — lives in this browser only. Saved looks are not yet stored between visits.`
        : "Create a lesson and it will appear here for the rest of this session. Nothing is stored between visits."}</p>
    </main></>;
  }

  return <>{nav}<main className="home page-enter"><section className="hero"><div className="hero-copy"><p className="eyebrow">Your makeup artist. Your hype woman.</p><h1>Makeup finally<br/>feels like <em>you.</em></h1><p className="hero-text">A real tutorial analysis, adapted to your features and turned into focused placement lessons on your own face.</p><div className="hero-actions"><button className="primary" onClick={()=>go("onboarding")}>Create my lesson →</button></div></div><div className="hero-visual"><div className="arch"><div className="portrait"><div className="hair"/><div className="head"><i className="eye one"/><i className="eye two"/><i className="mouth"/></div><div className="neck"/></div><div className="call-copy"><span>YOUR PERSONALIZED GLAM ROOM</span><b>Your tutorial. Your products. Placements mapped to your face.</b></div></div><div className="floating-note"><div className="avatar small">M</div><p><b>Your privacy comes first</b><br/>Landmarks stay on your device ✦</p></div></div></section><section className="logo-strip"><span>PERSONALIZED FOR</span><b>your face</b><i>✦</i><b>your products</b><i>✦</i><b>your pace</b></section><section className="how"><div className="section-heading"><div><p className="eyebrow">Real intelligence, honest controls</p><h2>From saved tutorial<br/>to your own routine.</h2></div><p>Face shape is estimated from visible proportions and stays editable. The actual tutorial video must be analyzed before a lesson is created.</p></div><div className="feature-grid"><article><span>01</span><div className="feature-icon">♡</div><h3>Map proportions locally</h3><p>MediaPipe estimates cheeks, jaw, forehead, eyes, brows, nose, and lips in your browser.</p></article><article><span>02</span><div className="feature-icon">▶</div><h3>Analyze the tutorial</h3><p>Ordered frames reveal the real product sequence instead of generating a generic routine.</p></article><article><span>03</span><div className="feature-icon">✦</div><h3>Choose a face area</h3><p>Tap eyes, cheeks, lips, or another feature and follow only the tutorial steps that affect it.</p></article></div></section><section className="import-banner"><div><p className="eyebrow">Saw a look you love?</p><h2>Bring the tutorial.<br/>Make it <em>yours.</em></h2><p>Paste an accessible public link or upload the video, then follow the adapted routine product by product.</p><button className="cream-button" onClick={()=>go("import")}>Create my lesson →</button></div></section></main><footer><Logo home={()=>go("home")}/><p>Beauty guidance built around the person in the mirror.</p><span>© 2026 Makeup Bestie</span></footer></>;
}
