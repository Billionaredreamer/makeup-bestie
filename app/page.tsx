"use client";
/* eslint-disable @next/next/no-img-element -- preparation photos use temporary local blob URLs */

import { useEffect, useRef, useState } from "react";
import { estimateFaceProfile, placementFor, type FaceProfile, type FaceShape, type Point } from "@/lib/face-analysis";
import { extractTutorialFrames } from "@/lib/video-frames";

type View = "home" | "onboarding" | "face-scan" | "studio-intake" | "look-brief" | "preview" | "session" | "import" | "profile";
type LessonRegion = "all-face" | "complexion" | "forehead" | "both-cheeks" | "left-cheek" | "right-cheek" | "both-eyes" | "left-eye" | "right-eye" | "brows" | "nose" | "lips" | "jaw" | "none";
type Technique = "prep"|"base"|"conceal"|"contour"|"blush"|"highlight"|"eyes"|"eyeliner"|"brow"|"lips"|"finish";
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
  return <div className="tutorial-clip">
    <div><span><b>FROM YOUR TUTORIAL</b><small>{Math.floor(safeStart/60)}:{String(Math.floor(safeStart%60)).padStart(2,"0")}–{Math.floor(safeEnd/60)}:{String(Math.floor(safeEnd%60)).padStart(2,"0")}</small></span><button onClick={replay}>↻ Replay clip</button></div>
    <video ref={clip} src={src} playsInline muted controls preload="metadata" aria-label={`${product} tutorial segment`} onLoadedMetadata={()=>{if(clip.current)clip.current.currentTime=safeStart;}} onTimeUpdate={()=>{if(clip.current&&clip.current.currentTime>=safeEnd){clip.current.pause();clip.current.currentTime=safeStart;}}}/>
  </div>;
}

type GuideSpot = { key:string; cx:number; cy:number; rx:number; ry:number; rotate?:number; side?:-1|0|1 };
function PlacementGuide({ points, areas, technique, shape }: { points:Point[]; areas:LessonRegion[]; technique:Technique; shape:FaceShape|null }) {
  const at = (index:number, fallback:Point) => points[index] || fallback;
  const leftEdge=at(234,{x:.2,y:.49}), rightEdge=at(454,{x:.8,y:.49}), top=at(10,{x:.5,y:.12}), chin=at(152,{x:.5,y:.9});
  const faceWidth=Math.max(.42,rightEdge.x-leftEdge.x), faceHeight=Math.max(.62,chin.y-top.y), centerX=(leftEdge.x+rightEdge.x)/2;
  const eyeLeft={x:(at(33,{x:.31,y:.39}).x+at(133,{x:.43,y:.39}).x)/2,y:(at(33,{x:.31,y:.39}).y+at(133,{x:.43,y:.39}).y)/2};
  const eyeRight={x:(at(362,{x:.57,y:.39}).x+at(263,{x:.69,y:.39}).x)/2,y:(at(362,{x:.57,y:.39}).y+at(263,{x:.69,y:.39}).y)/2};
  const mouth=at(13,{x:.5,y:.69}), nose=at(1,{x:.5,y:.53});
  const cheekY=(eyeLeft.y+mouth.y)/2+.02;
  const spotFor = (area:LessonRegion):GuideSpot[] => {
    const common={rx:faceWidth*.13,ry:faceHeight*.07};
    if(area==="all-face"||area==="complexion") return [{key:"face",cx:centerX,cy:(top.y+chin.y)/2,rx:faceWidth*.47,ry:faceHeight*.47,side:0}];
    if(area==="forehead") return [{key:"forehead",cx:centerX,cy:top.y+faceHeight*.19,rx:faceWidth*.33,ry:faceHeight*.11,side:0}];
    if(area==="both-cheeks") return [{key:"cheek-a",cx:leftEdge.x+faceWidth*.24,cy:cheekY,...common,rotate:-16,side:-1},{key:"cheek-b",cx:rightEdge.x-faceWidth*.24,cy:cheekY,...common,rotate:16,side:1}];
    if(area==="left-cheek") return [{key:"cheek-b",cx:rightEdge.x-faceWidth*.24,cy:cheekY,...common,rotate:16,side:1}];
    if(area==="right-cheek") return [{key:"cheek-a",cx:leftEdge.x+faceWidth*.24,cy:cheekY,...common,rotate:-16,side:-1}];
    if(area==="both-eyes") return [{key:"eye-a",cx:eyeLeft.x,cy:eyeLeft.y,rx:faceWidth*.12,ry:faceHeight*.045,side:-1},{key:"eye-b",cx:eyeRight.x,cy:eyeRight.y,rx:faceWidth*.12,ry:faceHeight*.045,side:1}];
    if(area==="left-eye") return [{key:"eye-b",cx:eyeRight.x,cy:eyeRight.y,rx:faceWidth*.12,ry:faceHeight*.045,side:1}];
    if(area==="right-eye") return [{key:"eye-a",cx:eyeLeft.x,cy:eyeLeft.y,rx:faceWidth*.12,ry:faceHeight*.045,side:-1}];
    if(area==="brows") return [{key:"brow-a",cx:eyeLeft.x,cy:eyeLeft.y-faceHeight*.085,rx:faceWidth*.13,ry:faceHeight*.035,side:-1},{key:"brow-b",cx:eyeRight.x,cy:eyeRight.y-faceHeight*.085,rx:faceWidth*.13,ry:faceHeight*.035,side:1}];
    if(area==="nose") return [{key:"nose",cx:nose.x,cy:nose.y+faceHeight*.05,rx:faceWidth*.07,ry:faceHeight*.17,side:0}];
    if(area==="lips") return [{key:"lips",cx:mouth.x,cy:mouth.y+faceHeight*.025,rx:faceWidth*.15,ry:faceHeight*.055,side:0}];
    if(area==="jaw") return [{key:"jaw-a",cx:leftEdge.x+faceWidth*.2,cy:chin.y-faceHeight*.15,rx:faceWidth*.2,ry:faceHeight*.055,rotate:28,side:-1},{key:"jaw-b",cx:rightEdge.x-faceWidth*.2,cy:chin.y-faceHeight*.15,rx:faceWidth*.2,ry:faceHeight*.055,rotate:-28,side:1}];
    return [];
  };
  const effectiveAreas = areas.some(area=>area==="all-face"||area==="complexion") ? (["complexion"] as LessonRegion[]) : areas;
  const spots=effectiveAreas.flatMap(spotFor);
  const lift = shape==="oblong"?.01:shape==="round"?.07:.045;
  return <svg className={`placement-overlay technique-${technique}`} viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label="Personalized product placement and application direction">
    <defs><marker id="guide-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z"/></marker></defs>
    {spots.map(spot=><g key={spot.key}>
      <ellipse className="placement-zone" cx={spot.cx} cy={spot.cy} rx={spot.rx} ry={spot.ry} transform={`rotate(${spot.rotate||0} ${spot.cx} ${spot.cy})`}/>
      <path className="application-arrow" markerEnd="url(#guide-arrow)" d={spot.key==="nose"?`M ${spot.cx} ${spot.cy-spot.ry*.55} L ${spot.cx} ${spot.cy+spot.ry*.55}`:technique==="lips"||spot.key==="lips"?`M ${spot.cx-spot.rx*.58} ${spot.cy} L ${spot.cx+spot.rx*.58} ${spot.cy}`:`M ${spot.cx-(spot.side||1)*spot.rx*.25} ${spot.cy+spot.ry*.28} Q ${spot.cx} ${spot.cy} ${spot.cx+(spot.side||1)*spot.rx*.9} ${spot.cy-lift}`}/>
    </g>)}
  </svg>;
}

function FaceFeaturePicker({ photo, available, onSelect }: { photo:string; available:FeatureKey[]; onSelect:(feature:FeatureKey)=>void }) {
  const positions:Record<FeatureKey,{left:string;top:string}>={complexion:{left:"50%",top:"51%"},cheeks:{left:"72%",top:"57%"},eyes:{left:"34%",top:"39%"},brows:{left:"66%",top:"31%"},nose:{left:"50%",top:"54%"},lips:{left:"50%",top:"70%"},jaw:{left:"31%",top:"77%"}};
  return <div className="feature-picker"><img src={photo} alt="Your face with selectable lesson areas"/>{available.map(feature=><button key={feature} style={positions[feature]} onClick={()=>onSelect(feature)}><span>{featureLabels[feature]}</span></button>)}<div className="picker-message"><b>Tap where you want to start</b><span>Only areas found in your analyzed tutorial are available.</span></div></div>;
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
  const [lessonMode, setLessonMode] = useState<"routine"|"feature">("routine");
  const [selectedFeature, setSelectedFeature] = useState<FeatureKey|null>(null);
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
  void profile;
  const fullLesson = brief?.steps?.length ? brief.steps : defaultLesson;
  const matchingLesson = selectedFeature ? fullLesson.filter(item=>stepMatchesFeature(item,selectedFeature)) : fullLesson;
  const activeLesson = lessonMode==="feature" && selectedFeature && matchingLesson.length ? matchingLesson : fullLesson;
  const currentLesson = activeLesson[Math.min(step, activeLesson.length - 1)];

  const go = (v: View) => { const needsSetup = (v === "session" && !brief) || (v === "studio-intake" && mapStatus !== "ready"); const next = needsSetup ? "onboarding" : v; setView(next); window.scrollTo(0, 0); };
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
      const response = await fetch("/api/import-look", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ frames:tutorial.frames, sampleTimes:tutorial.sampleTimes, duration:tutorial.duration, description:lookNotes, context }), signal:AbortSignal.timeout(75_000) });
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
            <h2>One product at a time.</h2>
            <p className="face-first-copy">Your analyzed tutorial becomes one chronological routine on your face. Each product has its own instruction, face-specific adjustment, and finish checkpoint.</p>
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
            <div className="lesson-mode-picker">
              <small>HOW DO YOU WANT TO LEARN?</small>
              <button className={lessonMode==="routine"?"selected":""} onClick={()=>{setLessonMode("routine");setSelectedFeature(null);setStep(0);}}><b>Entire routine</b><span>Follow every product in tutorial order.</span></button>
              <button className={lessonMode==="feature"?"selected":""} onClick={()=>{setLessonMode("feature");setSelectedFeature(null);setStep(0);}}><b>Part by part</b><span>Tap eyes, cheeks, lips, or another available area.</span></button>
            </div>
            <label className="save-photo-option">
              <input type="checkbox" checked={saveSessionPhotos} onChange={e => setSaveSessionPhotos(e.target.checked)}/>
              <span><b>Save this look</b><small>Off by default. Your face photo is not added to My Looks unless you choose this.</small></span>
            </label>
            <button className="primary wide" disabled={!prepPhoto} onClick={() => {setStep(0);setSelectedFeature(null);go("session");}}>Open my Glam Room →</button>
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
    const chooseFeature=(feature:FeatureKey)=>{setSelectedFeature(feature);setStep(0);};
    const choosingFeature=lessonMode==="feature"&&!selectedFeature;
    return <>
      {nav}
      <main className="glam-room page-enter">
        <div className="glam-heading">
          <div><p className="eyebrow">The Glam Room · {lessonMode==="routine"?`Product ${step+1} of ${activeLesson.length}`:"Part-by-part lesson"}</p><h1>{brief?.title || "Your personalized lesson"}</h1><p>No camera. Your private face map anchors every placement and arrow.</p></div>
          <div className="offline-pill"><i/> Placement guide active</div>
        </div>
        <div className="glam-grid">
          <section className="glam-face-card">
            {choosingFeature?<FaceFeaturePicker photo={prepPhoto} available={availableFeatures} onSelect={chooseFeature}/>:<div className="glam-face" style={{aspectRatio:String(photoAspect)}}>
              <img src={prepPhoto} alt="Your face with a personalized makeup placement guide"/>
              <PlacementGuide points={facePoints} areas={stepAreas(currentLesson)} technique={currentLesson.technique} shape={shape}/>
              <div className="placement-key"><span/><b>{currentLesson.product}</b><small>Color = placement · arrows = application direction</small></div>
            </div>}
            {!choosingFeature&&<div className="glam-face-caption"><span>Mapped to your scanned face</span><b>{areaSummary(currentLesson)}</b></div>}
          </section>
          <aside className="glam-lesson-card">
            <div className="glam-mode-toggle"><button className={lessonMode==="routine"?"selected":""} onClick={()=>{setLessonMode("routine");setSelectedFeature(null);setStep(0);}}>Entire routine</button><button className={lessonMode==="feature"?"selected":""} onClick={()=>{setLessonMode("feature");setSelectedFeature(null);setStep(0);}}>Part by part</button></div>
            {choosingFeature?<div className="feature-welcome"><p className="eyebrow">Choose on your face</p><h2>Where do you want to begin?</h2><p>Tap an available area on your photo. We’ll gather every tutorial step that affects it and keep the original product order.</p><div className="available-list">{availableFeatures.map(feature=><button key={feature} onClick={()=>chooseFeature(feature)}>{featureLabels[feature]} <span>→</span></button>)}</div></div>:<>
              <div className="lesson-progress"><span>{selectedFeature?featureLabels[selectedFeature]:"Entire routine"}</span><span>Step {step+1} of {activeLesson.length}</span></div>
              <div className="dots">{activeLesson.map((_,index)=><i key={index} className={index<=step?"active":""}/>)}</div>
              {selectedFeature&&<button className="change-feature" onClick={()=>{setSelectedFeature(null);setStep(0);}}>← Choose another face area</button>}
              <p className="eyebrow">Now we’re using</p><h2>{currentLesson.product}</h2>
              <div className="area-chips">{stepAreas(currentLesson).map(area=><span key={area}>{areaLabels[area]}</span>)}</div>
              <p className="instruction">{currentLesson.instruction}</p>
              {tutorialVideoUrl&&<TutorialClip src={tutorialVideoUrl} start={currentLesson.startTimeSeconds} end={currentLesson.endTimeSeconds} product={currentLesson.product}/>}
              {!tutorialVideoUrl&&<div className="tutorial-cue"><small>FROM YOUR TUTORIAL</small><p>{currentLesson.referenceCue}</p></div>}
              <div className="personalized-direction"><small>PLACEMENT FOR YOUR FACE</small><p>{currentLesson.adaptation}</p>{personalizedPlacement!==currentLesson.adaptation&&<p>{personalizedPlacement}</p>}</div>
              <div className="step-target"><small>THIS STEP IS READY WHEN</small><p>{currentLesson.checkpoint}</p></div>
              {previewImage&&<div className="finished-mini"><img src={previewImage} alt="Your personalized finished look"/><span><small>YOUR FINISHED TARGET</small><b>{brief?.title}</b></span></div>}
              <div className="glam-actions">
                <button className="outline" disabled={step===0} onClick={()=>moveToStep(step-1)}>← Previous</button>
                {step===activeLesson.length-1?<button className="primary" onClick={()=>go("preview")}>Finish {selectedFeature?featureLabels[selectedFeature].toLowerCase():"routine"} ✓</button>:<button className="primary" onClick={()=>moveToStep(step+1)}>Done—next product →</button>}
              </div>
            </>}
          </aside>
        </div>
      </main>
    </>;
  }

  if (view === "import") return <>{nav}<main className="simple-page page-enter"><section className="import-card"><div className="import-icon">▶</div><p className="eyebrow">Tutorial-aware lessons</p><h1>Bring the tutorial. We’ll make it yours.</h1><p>Start with your skin information and private face scan, then paste the original tutorial link and tell us which products are already in your makeup bag.</p><button className="primary wide" onClick={()=>{setOnboard(0);go("onboarding");}}>Start my personalized lesson →</button></section></main></>;

  if (view === "profile") return <>{nav}<main className="profile page-enter"><section className="profile-top"><div className="avatar large">S</div><div><p className="eyebrow">Your beauty shelf</p><h1>Good to see you.</h1><p>{answers.skin||"Your"} skin · {answers.goal||"Personalized makeup"} · face estimate {shape||"not set"}</p></div></section><div className="stat-row"><div><b>2</b><span>Saved looks</span></div><div><b>Local</b><span>Face mapping</span></div><div><b>0</b><span>Saved face images</span></div></div></main></>;

  return <>{nav}<main className="home page-enter"><section className="hero"><div className="hero-copy"><p className="eyebrow">Your makeup artist. Your hype woman.</p><h1>Makeup finally<br/>feels like <em>you.</em></h1><p className="hero-text">A real tutorial analysis, adapted to your features and turned into product-by-product placement guides on your own face.</p><div className="hero-actions"><button className="primary" onClick={()=>go("onboarding")}>Create my lesson →</button></div></div><div className="hero-visual"><div className="arch"><div className="portrait"><div className="hair"/><div className="head"><i className="eye one"/><i className="eye two"/><i className="mouth"/></div><div className="neck"/></div><div className="call-copy"><span>YOUR PERSONALIZED GLAM ROOM</span><b>Your tutorial. Your products. Placements mapped to your face.</b></div></div><div className="floating-note"><div className="avatar small">M</div><p><b>Your privacy comes first</b><br/>Landmarks stay on your device ✦</p></div></div></section><section className="logo-strip"><span>PERSONALIZED FOR</span><b>your face</b><i>✦</i><b>your products</b><i>✦</i><b>your pace</b></section><section className="how"><div className="section-heading"><div><p className="eyebrow">Real intelligence, honest controls</p><h2>From saved tutorial<br/>to your own routine.</h2></div><p>Face shape is estimated from visible proportions and stays editable. The actual tutorial video must be analyzed before a lesson is created.</p></div><div className="feature-grid"><article><span>01</span><div className="feature-icon">♡</div><h3>Map proportions locally</h3><p>MediaPipe estimates cheeks, jaw, forehead, eyes, brows, nose, and lips in your browser.</p></article><article><span>02</span><div className="feature-icon">▶</div><h3>Analyze the tutorial</h3><p>Ordered frames reveal the real product sequence instead of generating a generic routine.</p></article><article><span>03</span><div className="feature-icon">✦</div><h3>Follow your map</h3><p>See exactly where each product belongs and follow animated arrows for application direction.</p></article></div></section><section className="import-banner"><div><p className="eyebrow">Saw a look you love?</p><h2>Bring the tutorial.<br/>Make it <em>yours.</em></h2><p>Save its original link, attach the video for analysis, and follow the adapted routine product by product.</p><button className="cream-button" onClick={()=>go("import")}>Create my lesson →</button></div></section></main><footer><Logo home={()=>go("home")}/><p>Beauty guidance built around the person in the mirror.</p><span>© 2026 Makeup Bestie</span></footer></>;
}
