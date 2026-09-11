"use client";
/* eslint-disable @next/next/no-img-element -- preparation photos use temporary local blob URLs */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { estimateFaceProfile, placementFor, type FaceProfile, type FaceShape, type Point } from "@/lib/face-analysis";
import { type LessonRegion, type Technique } from "@/lib/placement-map";
import { PlacementGuide } from "./placement-guide";
import { ScanCamera } from "./scan-camera";
import { PrepCard } from "./prep-card";
import { LiveCoach } from "./live-coach";
import { extractTutorialFrames, extractTutorialFramesFromUrl } from "@/lib/video-frames";
import { CreatorStudio, DiscoverFeed } from "./routine-community";
import { CloudConfigurationScreen, CloudLoadingScreen, type LaunchAccount, useLaunchAccount } from "./launch-account";
import { UnauthenticatedShell } from "./welcome-screen";
import { BrandHeader, BrandSurface } from "./brand-header";
import { ManageBillingButton, PricingScreen } from "./pricing-screen";
import type { SavedLookRecord } from "@/lib/account-types";
import {
  profileRecordIsComplete,
  readOnboardingCache,
  resolveLaunchStage,
  subscriptionRecordIsActive,
  writeOnboardingCache,
  type LaunchStage,
} from "@/lib/onboarding-flow";
import {
  blueprintTechniqueNote,
  browArchOptions,
  cheekPlacementOptions,
  estimateFaceBlueprint,
  eyeDirectionOptions,
  eyeOpennessOptions,
  eyeSpacingOptions,
  faceBlueprintSummary,
  lipBalanceOptions,
  normalizeFaceBlueprint,
  noseLengthOptions,
  noseWidthOptions,
  skinConcernOptions,
  type FaceBlueprint,
  type SkinConcern,
} from "@/lib/face-blueprint";

type View = "confirm-features" | "finished" | "peek" | "pricing" | "home" | "discover" | "creator" | "my-looks" | "onboarding" | "face-scan" | "studio-intake" | "look-brief" | "session" | "import" | "profile";
type LessonStep = { title: string; instruction: string; product: string; region: LessonRegion; areas: LessonRegion[]; technique: Technique; referenceCue: string; adaptation: string; checkpoint: string; startTimeSeconds: number; endTimeSeconds: number; uncertain: boolean; addedByBestie?: boolean };
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

const titleCase = (value:string) => value.replace(/\b\w/g, character=>character.toUpperCase());
function BlueprintSelect({ label, value, options, onChange }: { label:string; value:string; options:readonly string[]; onChange:(value:string)=>void }) {
  return <label><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value)}>{options.map(option=><option key={option} value={option}>{titleCase(option)}</option>)}</select></label>;
}

function FaceBlueprintEditor({ value, onChange }: { value:FaceBlueprint; onChange:(value:FaceBlueprint)=>void }) {
  const toggleConcern=(concern:SkinConcern)=>onChange({...value,skinConcerns:value.skinConcerns.includes(concern)?value.skinConcerns.filter(item=>item!==concern):[...value.skinConcerns,concern]});
  return <section className="face-blueprint-card">

    <div className="blueprint-feature-grid">
      <details><summary>Eyes</summary><BlueprintSelect label="Visible lid" value={value.eyes.openness} options={eyeOpennessOptions} onChange={openness=>onChange({...value,eyes:{...value.eyes,openness:openness as FaceBlueprint["eyes"]["openness"]}})}/><BlueprintSelect label="Outer direction" value={value.eyes.direction} options={eyeDirectionOptions} onChange={direction=>onChange({...value,eyes:{...value.eyes,direction:direction as FaceBlueprint["eyes"]["direction"]}})}/><BlueprintSelect label="Spacing" value={value.eyes.spacing} options={eyeSpacingOptions} onChange={spacing=>onChange({...value,eyes:{...value.eyes,spacing:spacing as FaceBlueprint["eyes"]["spacing"]}})}/></details>
      <details><summary>Brows</summary><BlueprintSelect label="Natural line" value={value.brows.arch} options={browArchOptions} onChange={arch=>onChange({...value,brows:{arch:arch as FaceBlueprint["brows"]["arch"]}})}/><small>Density is not inferred from your photo.</small></details>
      <details><summary>Nose</summary><BlueprintSelect label="Visible width" value={value.nose.width} options={noseWidthOptions} onChange={width=>onChange({...value,nose:{...value.nose,width:width as FaceBlueprint["nose"]["width"]}})}/><BlueprintSelect label="Visible length" value={value.nose.length} options={noseLengthOptions} onChange={length=>onChange({...value,nose:{...value.nose,length:length as FaceBlueprint["nose"]["length"]}})}/></details>
      <details><summary>Lips</summary><BlueprintSelect label="Natural balance" value={value.lips.balance} options={lipBalanceOptions} onChange={balance=>onChange({...value,lips:{balance:balance as FaceBlueprint["lips"]["balance"]}})}/></details>
      <details><summary>Cheeks</summary><BlueprintSelect label="Cheekbone placement" value={value.cheeks.placement} options={cheekPlacementOptions} onChange={placement=>onChange({...value,cheeks:{placement:placement as FaceBlueprint["cheeks"]["placement"]}})}/><small>You confirm this because a flat photo cannot reliably measure bone prominence.</small></details>
    </div>
    <details className="skin-today"><summary>Skin today</summary><div><b>What should today’s lesson account for?</b><small>Optional · choose what you notice rather than what the camera guesses.</small></div><div>{skinConcernOptions.map(concern=><button key={concern} className={value.skinConcerns.includes(concern)?"selected":""} aria-pressed={value.skinConcerns.includes(concern)} onClick={()=>toggleConcern(concern)}>{value.skinConcerns.includes(concern)?"✓ ":"+ "}{concern}</button>)}</div></details>
    <p className="blueprint-honesty"><b>Beauty guidance, not a diagnosis.</b> Makeup Bestie uses these choices only to adjust placement, layering and blending.</p>
  </section>;
}

type MirrorStatus="starting"|"active"|"no-face"|"poor-light"|"denied"|"error";
type VideoLandmarker={detectForVideo:(video:HTMLVideoElement,time:number)=>{faceLandmarks:Point[][]};close:()=>void};
function SilentMirror({ areas, technique, shape, blueprint, stepNumber, paused, facingMode }: { areas:LessonRegion[]; technique:Technique; shape:FaceShape|null; blueprint:FaceBlueprint|null; stepNumber:number; paused:boolean; facingMode:"user"|"environment" }) {
  const stage=useRef<HTMLDivElement>(null);
  const camera=useRef<HTMLVideoElement>(null);
  const [status,setStatus]=useState<MirrorStatus>("starting");
  const [livePoints,setLivePoints]=useState<Point[]>([]);
  // The chart is drawn in the camera's own aspect ratio, so zones sit on the
  // face rather than on a cropped guess at where the face might be.
  const [feedAspect,setFeedAspect]=useState(1);
  const [displayAspect,setDisplayAspect]=useState(9/16);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const element=stage.current;
    if(!element)return;
    const measure=()=>{const bounds=element.getBoundingClientRect();if(bounds.width&&bounds.height)setDisplayAspect(bounds.width/bounds.height);};
    measure();
    const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[]);
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
        media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facingMode}},audio:false});
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
  },[facingMode,retry]);
  const copy:Record<MirrorStatus,string>={starting:"Starting your private mirror…",active:"Private mirror active · landmarks stay on this device","no-face":"No face detected. Center the selected feature in view.","poor-light":"Lighting is too low for stable placement. Face a soft light.",denied:"Camera permission was denied.",error:"The private mirror could not start on this device."};
  return <div ref={stage} className={`silent-mirror${facingMode==="user"?" front-camera":""}`} style={{aspectRatio:"9 / 16"}}>
    <div className="mirror-feed" style={{position:"absolute",width:"100%",height:"100%",maxWidth:`${feedAspect * displayAspect**-1 * 100}%`,maxHeight:`${displayAspect / feedAspect * 100}%`,top:"50%",left:"50%",transform:"translate(-50%,-50%)"}}><video ref={camera} className={facingMode==="user"?"mirrored":""} autoPlay muted playsInline/>
    {livePoints.length>0&&(
      <PlacementGuide id="mirror" mirrored={facingMode==="user"} focused points={livePoints} areas={areas} technique={technique} shape={shape} blueprint={blueprint} aspect={feedAspect} displayAspect={feedAspect} stepNumber={stepNumber} paused={paused}/>
    )}
    </div><div className={`mirror-status ${status}`}><i/><span>{copy[status]}</span></div>
    {(status==="denied"||status==="error")&&<button className="mirror-retry" onClick={()=>setRetry(value=>value+1)}>Retry camera</button>}
  </div>;
}

function Logo({ home }: { home: () => void }) { return <button className="logo" onClick={home}><span>m</span> makeup bestie</button>; }

const peekPanels = [
  { number:"01", icon:"↗", eyebrow:"Tutorial to technique", title:"A real routine, remade for you.", copy:"Bring a tutorial you love. Makeup Bestie studies the actual steps and keeps the creator’s product order while adapting technique to your face." },
  { number:"02", icon:"◎", eyebrow:"Private face mapping", title:"Your face stays yours.", copy:"Your feature map is created on your device. Bare-face photos and live camera footage are not saved unless you deliberately choose to save a finished look." },
  { number:"03", icon:"✦", eyebrow:"The Glam Room", title:"Practice one product at a time.", copy:"Use a full-screen mirror, animated placement arrows, the original tutorial cues, and an optional live coach while you apply each product." },
] as const;

function SneakPeek({ onFinish }: { onFinish: () => void }) {
  const [panel,setPanel]=useState(0);
  const track=useRef<HTMLDivElement>(null);
  const move=(next:number)=>{
    const target=Math.max(0,Math.min(peekPanels.length-1,next));
    track.current?.scrollTo({left:target*track.current.clientWidth,behavior:"smooth"});
    setPanel(target);
  };
  return <main className="peek-screen page-enter">
    <header className="peek-header"><div className="auth-mark"><span>m</span><b>makeup bestie</b></div><button onClick={onFinish}>Skip</button></header>
    <div className="peek-track" ref={track} onScroll={event=>{const width=event.currentTarget.clientWidth;if(width)setPanel(Math.round(event.currentTarget.scrollLeft/width));}}>
      {peekPanels.map(item=><section className="peek-panel" key={item.number}>
        <div className="peek-visual" aria-hidden="true"><span>{item.icon}</span><i>{item.number}</i><div/><div/></div>
        <div className="peek-copy"><p className="eyebrow">{item.eyebrow}</p><h1>{item.title}</h1><p>{item.copy}</p></div>
      </section>)}
    </div>
    <footer className="peek-controls">
      <div className="peek-dots" aria-label="Introduction progress">{peekPanels.map((item,index)=><button key={item.number} className={index===panel?"active":""} aria-label={`Show introduction ${index+1}`} onClick={()=>move(index)}/>)}</div>
      <button className="primary" onClick={()=>panel===peekPanels.length-1?onFinish():move(panel+1)}>{panel===peekPanels.length-1?"Personalize my bestie →":"Continue →"}</button>
    </footer>
  </main>;
}

function MakeupBestieExperience({account}:{account:LaunchAccount}) {
  const [view, setView] = useState<View>("peek");
  const swipeStart=useRef<number|null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [launchResolved,setLaunchResolved]=useState(false);
  const [onboard, setOnboard] = useState(0);
  const [profileName,setProfileName]=useState("");
  const [profileEmail,setProfileEmail]=useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [, setProfile] = useState<FaceProfile | null>(null);
  const [shape, setShape] = useState<FaceShape | null>(null);
  const [faceBlueprint, setFaceBlueprint] = useState<FaceBlueprint | null>(null);
  const [facePoints, setFacePoints] = useState<Point[]>([]);
  const [photoAspect, setPhotoAspect] = useState(3/4);
  const [mirrorOpen,setMirrorOpen]=useState(false);
  const [cameraFacing,setCameraFacing]=useState<"user"|"environment">("user");
  const [guideCorner,setGuideCorner]=useState<"left"|"right">("right");
  const [guideExpanded,setGuideExpanded]=useState(false);
  const [lessonPanelOpen,setLessonPanelOpen]=useState(false);
  const [tutorialClipOpen,setTutorialClipOpen]=useState(false);
  // Blending arrows animate by default, but anyone can freeze them — and they
  // start frozen for people who have asked their system to reduce motion.
  const [guideMotion,setGuideMotion]=useState(true);
  const [lookNotes] = useState("");
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
  const [savedLooks,setSavedLooks]=useState<SavedLookRecord[]>([]);
  const [saveStatus,setSaveStatus]=useState<"idle"|"saving"|"saved"|"error">("idle");
  const [saveError,setSaveError]=useState("");
  const lastHydratedUserId=useRef<string|null>(null);
  const fullLesson = brief?.steps?.length ? brief.steps : defaultLesson;
  const activeLesson = fullLesson;
  const currentLesson = activeLesson[Math.min(step, activeLesson.length - 1)];
  const profileComplete=Boolean(profileName&&answers.skin&&answers.tone&&answers.level&&answers.goal);
  const serverProfileComplete=account.configured?profileRecordIsComplete(account.snapshot?.profile):profileComplete;
  const subscriptionActive=subscriptionRecordIsActive(account.snapshot?.subscription);
  const onboardingCache=readOnboardingCache(account.user?.id);
  const launchStage:LaunchStage=resolveLaunchStage({profileComplete:serverProfileComplete,subscriptionActive,peekSeen:serverProfileComplete||onboardingCache.peekSeen});
  const firstName=profileName.trim().split(/\s+/)[0]||"Bestie";
  const homeFlowActive=["home","studio-intake","face-scan","look-brief","session"].includes(view);
  const immersiveLesson=view==="session";

  useEffect(()=>{
    document.body.classList.toggle("glam-room-open",immersiveLesson);
    return()=>document.body.classList.remove("glam-room-open");
  },[immersiveLesson]);

  const go = (v: View) => {
    let next=v;
    if(["home","discover","creator","studio-intake","my-looks","profile"].includes(v)&&!profileComplete)next="onboarding";
    if(v==="session"&&!brief)next="home";

    setView(next);window.scrollTo(0,0);
  };
  useEffect(()=>{
    const cloudProfile=account.snapshot?.profile;
    const cloudUserId=account.user?.id||null;
    const shouldChooseInitialView=Boolean(cloudUserId&&lastHydratedUserId.current!==cloudUserId);
    if(cloudUserId)lastHydratedUserId.current=cloudUserId;
    if(cloudProfile){
      writeOnboardingCache(cloudUserId,{peekSeen:true,profileComplete:true});
      const next=resolveLaunchStage({profileComplete:true,subscriptionActive:subscriptionRecordIsActive(account.snapshot?.subscription),peekSeen:true});
      queueMicrotask(()=>{setProfileName(cloudProfile.display_name);setProfileEmail(account.snapshot?.user.email||"");setAnswers({skin:cloudProfile.skin_type,tone:cloudProfile.skin_tone,level:cloudProfile.experience,goal:cloudProfile.makeup_goal});setOwnedProducts(cloudProfile.products||[]);if(cloudProfile.face_shape)setShape(cloudProfile.face_shape as FaceShape);setFaceBlueprint(normalizeFaceBlueprint(cloudProfile.face_blueprint));if(shouldChooseInitialView)setView(next);setLaunchResolved(true);});return;
    }
    if(account.configured&&account.user){
      let localName=String(account.user.user_metadata?.display_name||"");let localAnswers:Record<string,string>={};
      let localBlueprint:FaceBlueprint|null=null;let localProducts:string[]=[];
      try{const saved=window.localStorage.getItem("makeup-bestie-profile-v1");if(saved){const parsed=JSON.parse(saved) as {name?:string;answers?:Record<string,string>;products?:string[];faceBlueprint?:unknown};localName=parsed.name||localName;localAnswers=parsed.answers||{};localProducts=parsed.products||[];localBlueprint=normalizeFaceBlueprint(parsed.faceBlueprint);}}catch{/* Start with a clean cloud profile. */}
      const cached=readOnboardingCache(cloudUserId);
      writeOnboardingCache(cloudUserId,{profileComplete:false});
      const next=resolveLaunchStage({profileComplete:false,subscriptionActive:subscriptionRecordIsActive(account.snapshot?.subscription),peekSeen:cached.peekSeen});
      queueMicrotask(()=>{setProfileName(localName);setProfileEmail(account.user?.email||"");setAnswers(localAnswers);setOwnedProducts(localProducts);setFaceBlueprint(localBlueprint);if(shouldChooseInitialView)setView(next);setLaunchResolved(true);});return;
    }
    if(!account.configured)try {
      const saved=window.localStorage.getItem("makeup-bestie-profile-v1");
      const cached=readOnboardingCache(null);
      if(!saved){queueMicrotask(()=>{setView(cached.peekSeen?"onboarding":"peek");setLaunchResolved(true);});return;}
      const parsed=JSON.parse(saved) as {name?:string;email?:string;answers?:Record<string,string>;products?:string[];faceBlueprint?:unknown};
      const localComplete=Boolean(parsed.name&&parsed.answers?.skin&&parsed.answers?.tone&&parsed.answers?.level&&parsed.answers?.goal);
      if(localComplete)writeOnboardingCache(null,{peekSeen:true,profileComplete:true});
      queueMicrotask(()=>{setProfileName(parsed.name||"");setProfileEmail(parsed.email||"");setAnswers(parsed.answers||{});setOwnedProducts(parsed.products||[]);setFaceBlueprint(normalizeFaceBlueprint(parsed.faceBlueprint));setView(localComplete?"home":cached.peekSeen?"onboarding":"peek");setLaunchResolved(true);});
    } catch { queueMicrotask(()=>{setView("peek");setLaunchResolved(true);}); }
  },[account.configured,account.snapshot,account.user]);
  useEffect(()=>{
    if(view==="pricing"&&launchStage!=="pricing")queueMicrotask(()=>setView(launchStage));
  },[launchStage,view]);
  const loadSavedLooks=useCallback(async()=>{
    if(!account.configured||!account.user)return;
    const response=await fetch("/api/saved-looks",{cache:"no-store"});
    if(response.ok){const data=await response.json();setSavedLooks(data.looks||[]);}
  },[account.configured,account.user]);
  useEffect(()=>{queueMicrotask(()=>{void loadSavedLooks();});},[loadSavedLooks]);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setGuideMotion(!query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  useEffect(() => () => { if (prepPhoto) URL.revokeObjectURL(prepPhoto); }, [prepPhoto]);
  useEffect(() => () => { if (tutorialVideoUrl) URL.revokeObjectURL(tutorialVideoUrl); }, [tutorialVideoUrl]);
  const onboardingView=view==="peek"||view==="onboarding"||view==="pricing";
  const nav = <>{!immersiveLesson&&!onboardingView&&view!=="home"&&view!=="profile"&&<header className="nav-shell app-nav-shell"><nav className="nav app-nav"><Logo home={() => go("home")} />{profileComplete?<button className="account-chip" onClick={()=>go("profile")}><span>{firstName.charAt(0).toUpperCase()}</span><b>{firstName}</b></button>:<span className="local-profile-note">{account.configured?"Private account":"Local development profile"}</span>}</nav></header>}{!immersiveLesson&&profileComplete&&!onboardingView&&<nav className="bottom-nav" aria-label="Primary navigation">
    <button className={homeFlowActive?"active":""} onClick={()=>go("home")}><i>⌂</i><span>Home</span></button>
    <button className={view==="profile"||view==="my-looks"?"active":""} onClick={()=>go("profile")}><i><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></i><span>Profile</span></button>
  </nav>}</>;

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
      const localProfile = estimateFaceProfile(points); if (localProfile) { setProfile(localProfile); setShape(localProfile.shape);setFaceBlueprint(current=>{const estimated=estimateFaceBlueprint(points,localProfile);return current?{...estimated,skinConcerns:current.skinConcerns}:estimated;}); }
      setMapStatus("ready"); setMapMessage("Facial proportions mapped locally. Your tutorial can now be adapted to your face.");
    } catch { setMapStatus("error"); setMapMessage("The local face scan could not load. Please retry with another photo."); }
  };

  const generatePersonalizedPreview = async () => {
    if (!prepFile || !brief || !previewConsent) { setPreviewError("Confirm that you want to send this one photo for preview generation."); return; }
    if(prepFile.size>3_500_000){setPreviewError("Choose a face photo under 3.5 MB for preview generation. Your local face map can still use the current photo.");return;}
    setPreviewStatus("generating"); setPreviewError("");
    const form = new FormData(); form.append("face",prepFile); form.append("description",`${brief.title}. ${brief.summary}. ${lookNotes}. Confirmed feature context: ${faceBlueprintSummary(faceBlueprint)}.`); form.append("intensity",previewIntensity);
    if (lookReferenceFrame) form.append("reference", await (await fetch(lookReferenceFrame)).blob(), "tutorial-finish.jpg");
    try { const response = await fetch("/api/preview-look",{method:"POST",headers:{"x-usage-key":crypto.randomUUID()},body:form}); const data = await response.json(); if(!response.ok) throw new Error(data.error); setPreviewImage(data.image); setPreviewStatus("ready");if(account.configured)await account.refresh(); }
    catch(error) { setPreviewError(error instanceof Error?error.message:"Preview generation failed."); setPreviewStatus("error"); }
  };

  const saveCurrentLook = async () => {
    if(!brief)return;
    if(!account.configured){setSaveSessionPhotos(true);setSaveStatus("saved");return;}
    setSaveStatus("saving");setSaveError("");
    try{
      const response=await fetch("/api/saved-looks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:brief.title,tutorialSource:brief.sourceUrl||null,brief,previewImage:previewImage||null})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setSaveSessionPhotos(true);setSaveStatus("saved");await loadSavedLooks();
    }catch(error){setSaveStatus("error");setSaveError(error instanceof Error?error.message:"The look could not be saved.");}
  };
  const openSavedLook=(look:SavedLookRecord)=>{
    const restored=look.brief as unknown as LookBrief;
    if(!Array.isArray(restored.steps)||!restored.steps.length)return;
    setBrief(restored);setPreviewImage(look.preview_url||"");setSaveSessionPhotos(true);setSaveStatus("saved");setPrepPhoto("");setPrepFile(null);setMapStatus("idle");go("face-scan");
  };
  const deleteSavedLook=async(id:string)=>{
    const response=await fetch(`/api/saved-looks?id=${encodeURIComponent(id)}`,{method:"DELETE"});
    if(response.ok)setSavedLooks(current=>current.filter(item=>item.id!==id));
  };
  const deleteAccount=async()=>{
    if(!window.confirm("Delete your Makeup Bestie account, saved looks, profile, and subscription? This cannot be undone."))return;
    const response=await fetch("/api/account",{method:"DELETE"});const data=await response.json().catch(()=>({}));
    if(!response.ok){window.alert(data.error||"Your account could not be deleted.");return;}
    await account.signOut();
  };

  const continueFromFaceScan=async()=>{
    if(mapStatus!=="ready"||!faceBlueprint)return;
    try{
      if(account.configured)await account.saveProfile({display_name:profileName,skin_type:answers.skin||"",skin_tone:answers.tone||"",experience:answers.level||"",makeup_goal:answers.goal||"",products:ownedProducts,face_shape:shape,face_blueprint:faceBlueprint});
      else window.localStorage.setItem("makeup-bestie-profile-v1",JSON.stringify({name:profileName,email:profileEmail,answers,faceBlueprint}));
      go("look-brief");
    }catch{setMapMessage("Your Face Blueprint could not be saved. Please try once more.");}
  };

  const createBrief = async () => {
    const sourceUrl = normalizeTutorialUrl(lookUrl);
    if(lookUrl.trim()&&!sourceUrl){setLessonError("Paste a complete tutorial link beginning with http:// or https://, or clear it and upload a video.");return;}
    if(!sourceUrl&&!lookFile){setLessonError("Paste a public tutorial link or upload a permitted video copy.");return;}
    setLessonAnalyzing(true); setLessonError(""); setLessonStage(lookFile?"Reading the uploaded tutorial on your device…":"Checking whether this public tutorial link exposes video…");
    try {
      if(account.configured)await account.saveProfile({display_name:profileName,skin_type:answers.skin||"",skin_tone:answers.tone||"",experience:answers.level||"",makeup_goal:answers.goal||"",products:ownedProducts,face_shape:shape,face_blueprint:faceBlueprint});
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
      const context = JSON.stringify({ skin:answers.skin || "not provided", tone:answers.tone || "not provided", experience:answers.level || "not provided", goal:answers.goal || "not provided", faceShapeEstimate:shape || "pending and adjustable", confirmedFaceBlueprint:faceBlueprintSummary(faceBlueprint), availableProducts:ownedProducts, lessonStyle:"One chronological application-by-application lesson. Each product step appears once and may cover several precise face areas on the user's own face." });
      const response = await fetch("/api/import-look", { method:"POST", headers:{ "Content-Type":"application/json","x-usage-key":crypto.randomUUID() }, body:JSON.stringify({ frames:tutorial.frames, sampleTimes:tutorial.sampleTimes, duration:tutorial.duration, description:lookNotes, context }), signal:AbortSignal.timeout(75_000) });
      const raw = await response.text();
      let data: Record<string, unknown>;
      try { data = JSON.parse(raw); }
      catch { throw new Error(response.status === 413 ? "The tutorial upload is still too large. Try a shorter or lower-resolution video." : `Tutorial analysis stopped on the server (${response.status}). Please try again.`); }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Tutorial analysis failed. Please try again.");
      setLessonStage("Turning the analyzed sequence into your personalized steps…");
      const guide = data as Omit<LookBrief,"time"> & { estimatedMinutes:number };
      setBrief({ ...guide, time:`${guide.estimatedMinutes} min`, sourceUrl:sourceUrl||undefined, sourceVideoAnalyzed:true });
      setSaveSessionPhotos(false);setSaveStatus("idle");
      if(account.configured)await account.refresh();
      setMirrorOpen(false);setStep(0);go("face-scan");
    } catch (error) { setLessonError(error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError") ? "Tutorial analysis took too long. Please retry once; if it repeats, use a shorter tutorial." : error instanceof Error ? error.message : "The personalized lesson could not be created."); }
    finally { setLessonAnalyzing(false); setLessonStage(""); }
  };

  const finishPeek=()=>{
    writeOnboardingCache(account.user?.id,{peekSeen:true,profileComplete:serverProfileComplete});
    const next=resolveLaunchStage({profileComplete:serverProfileComplete,subscriptionActive,peekSeen:true});
    setView(next==="peek"?"onboarding":next);window.scrollTo(0,0);
  };
  if(!launchResolved)return <CloudLoadingScreen/>;
  if(view==="peek")return <SneakPeek onFinish={finishPeek}/>;

  const showPricing=Boolean(account.configured&&account.snapshot&&!subscriptionActive&&(launchStage==="pricing"||view==="pricing"));
  if(showPricing){
    return <PricingScreen account={account.snapshot!} onRefresh={account.refresh} onSignOut={account.signOut}/>;
  }

  if (view === "face-scan") return <ScanCamera onBack={()=>go("studio-intake")} busy={mapStatus==="analyzing"} message={mapMessage} onPhoto={async file=>{setPrepFile(file);setPreviewImage("");setPreviewStatus("idle");await analyzePreparationPhoto(file);go("confirm-features");}}/>;
  if(view==="confirm-features")return <main className="flow-screen"><button className="back" onClick={()=>go("face-scan")}>← Retake photo</button><h1>Make the analysis yours.</h1><p>We’ve analysed your scan. Change anything that’s off.</p>{shape&&<label>Face proportions<select value={shape} onChange={e=>setShape(e.target.value as FaceShape)}>{["heart","oval","round","square","oblong","diamond"].map(item=><option key={item}>{item}</option>)}</select></label>}{faceBlueprint&&<FaceBlueprintEditor value={faceBlueprint} onChange={setFaceBlueprint}/>}<p role="status">{mapMessage}</p><button className="primary" disabled={mapStatus!=="ready"||!faceBlueprint} onClick={()=>void continueFromFaceScan()}>Confirm features →</button></main>;
  if(view==="studio-intake"&&(lookUrl.trim()||lookFile))return <main className="flow-screen"><button className="back" disabled={lessonAnalyzing} onClick={()=>{go("home");setComposerOpen(true);}}>← Add tutorial</button><h1>Your makeup bag.</h1><p>Choose what you own. Missing products can be skipped or substituted.</p><div className="bag-chips">{productOptions.map(product=><button key={product} aria-pressed={ownedProducts.includes(product)} onClick={()=>setOwnedProducts(ownedProducts.includes(product)?ownedProducts.filter(item=>item!==product):[...ownedProducts,product])}>{product}</button>)}</div>{lessonAnalyzing&&<p role="status">Analyzing your tutorial · {lessonStage}</p>}{lessonError&&<p className="error">{lessonError}</p>}<div className="flow-actions"><button className="outline" disabled={lessonAnalyzing} onClick={createBrief}>Skip</button><button className="primary" disabled={lessonAnalyzing||(!lookUrl.trim()&&!lookFile)} onClick={createBrief}>{lessonAnalyzing?"Analyzing…":"Continue"}</button></div></main>;
  if(view==="look-brief"&&brief)return <main className="flow-screen"><button className="back" onClick={()=>go("confirm-features")}>← Features</button><h1>Your lesson.</h1><p>Application by application · One product at a time.</p><h2>{brief.title}</h2><p>{brief.difficulty} · {brief.time} · {brief.steps.length} applications</p><p>{brief.summary}</p><details><summary>Application order & uncertainties</summary><ol>{brief.steps.map((item,i)=><li key={i}>{item.product}{item.uncertain?" · uncertain detail":""}</li>)}</ol>{brief.uncertainties.map(item=><p key={item}>{item}</p>)}</details><button className="primary" onClick={()=>{setStep(0);setMirrorOpen(true);setCameraFacing("user");setLessonPanelOpen(false);go("session");}}>Enter the Glam Room →</button></main>;
  const renderPersonalizedPreview = () => brief ? <main className="flow-screen compact-preview"><div className="flow-actions"><button className="back" onClick={()=>go("look-brief")}>← Your lesson</button><button className="back" disabled={previewStatus==="generating"} onClick={()=>{setStep(0);setMirrorOpen(true);setCameraFacing("user");setLessonPanelOpen(false);go("session");}}>Skip →</button></div><h1>See the look before you start.</h1><p>Optional AI visualization—not a guaranteed result.</p><div className="preview-pair">{prepPhoto&&<img src={prepPhoto} alt="Your private starting photo"/>}{previewImage?<img src={previewImage} alt="Your personalized preview"/>:<div>Your preview appears here</div>}</div><div className="intensity-picker">
              <span>Preview intensity</span>
              {(["soft", "reference", "dramatic"] as const).map(item => <button key={item} className={previewIntensity === item ? "selected" : ""} onClick={() => {
                setPreviewIntensity(item);
                setPreviewImage("");
                setPreviewStatus("idle");
              }}>{item === "reference" ? "Match reference" : item}</button>)}
            </div>
            <label className="preview-consent"><input type="checkbox" checked={previewConsent} onChange={event=>{setPreviewConsent(event.target.checked);setPreviewError("");}}/><span><b>Generate my personalized preview</b><small>Send this one face photo to OpenAI for makeup visualization. It is not saved by Makeup Bestie.</small></span></label>
            <p className="preview-cost">Uses one preview from your monthly preview allowance.</p><button className="primary wide" disabled={!prepFile || !previewConsent || previewStatus === "generating"} onClick={generatePersonalizedPreview}>
              {previewStatus === "generating" ? "Generating realistic preview…" : previewImage ? "Regenerate preview" : "Generate my preview"}
            </button>{previewError&&<p className="error">{previewError}</p>}{previewImage&&<button className="outline" onClick={()=>{setStep(0);setMirrorOpen(true);setCameraFacing("user");setLessonPanelOpen(false);go("session");}}>Enter the Glam Room →</button>}</main> : null;
  // Retained for 1.1, deliberately not mounted or routed in 1.0.
  void renderPersonalizedPreview;
  if (view === "onboarding") {
    const qs = [["skin","First, your canvas","How does your skin usually feel?",["Dry or tight","Oily or shiny","A little of both","Balanced","Sensitive"]],["tone","Your complexion","Which range feels closest to you?",["Fair","Light","Medium","Tan","Deep","Rich"]],["level","Your experience","Where are you in your makeup journey?",["Just starting","I know the basics","Confident","Basically an artist"]],["goal","Your moment","What do you want to learn first?",["Everyday natural","Soft glam","Full glam","Editorial color","Copy a saved look"]]] as const;
    const finishProfile=async()=>{
      const nextAnswers={...answers};
      if(account.configured)await account.saveProfile({display_name:profileName.trim(),skin_type:nextAnswers.skin||"",skin_tone:nextAnswers.tone||"",experience:nextAnswers.level||"",makeup_goal:nextAnswers.goal||"",products:ownedProducts,face_shape:shape,face_blueprint:faceBlueprint});
      else window.localStorage.setItem("makeup-bestie-profile-v1",JSON.stringify({name:profileName.trim(),email:profileEmail.trim(),answers:nextAnswers,products:ownedProducts,faceBlueprint}));
      writeOnboardingCache(account.user?.id,{peekSeen:true,profileComplete:true});
      setView(account.configured?resolveLaunchStage({profileComplete:true,subscriptionActive,peekSeen:true}):"home");window.scrollTo(0,0);
    };
    if(onboard===0)return <>{nav}<main className="onboarding account-onboarding page-enter"><div className="progress"><span style={{width:"17%"}}/></div><section className="question-card account-card"><p className="eyebrow">Welcome to Makeup Bestie</p><h1>Create your beauty profile.</h1><p className="subcopy">Your answers make every tutorial specific to your skin, products, experience, and goals. {account.configured?"They sync privately with your account.":"In local development, they stay in this browser."}</p><div className="account-fields"><label><span>Your name</span><input value={profileName} onChange={event=>setProfileName(event.target.value)} autoComplete="name" placeholder="What should your bestie call you?"/></label><label><span>Email</span><input type="email" value={profileEmail} disabled={account.configured} onChange={event=>setProfileEmail(event.target.value)} autoComplete="email" placeholder="you@example.com"/></label></div><button className="primary wide" disabled={!profileName.trim()||!/^\S+@\S+\.\S+$/.test(profileEmail)} onClick={()=>setOnboard(1)}>Personalize my profile →</button></section></main></>;
    if(onboard===5)return <>{nav}<main className="onboarding page-enter"><div className="progress"><span style={{width:"100%"}} /></div><button className="back" onClick={()=>setOnboard(4)}>← Back</button><section className="question-card onboarding-products"><p className="eyebrow">Your makeup bag</p><h1>What do you already have?</h1><p className="subcopy">Choose as many as you like, or skip this for now. Your lesson will prioritize products you own and suggest substitutes for the rest.</p><div className="product-options">{productOptions.map(product=><label key={product} className={ownedProducts.includes(product)?"selected":""}><input type="checkbox" checked={ownedProducts.includes(product)} onChange={event=>setOwnedProducts(event.target.checked?[...ownedProducts,product]:ownedProducts.filter(item=>item!==product))}/><span>{product}</span><b>{ownedProducts.includes(product)?"✓":"+"}</b></label>)}</div><button className="primary wide" onClick={()=>void finishProfile()}>{ownedProducts.length?"Finish my profile":"Skip for now"} →</button></section></main></>;
    const q=qs[onboard-1];
    return <>{nav}<main className="onboarding page-enter"><div className="progress"><span style={{width:`${Math.round(((onboard+1)/6)*100)}%`}} /></div><button className="back" onClick={() => setOnboard(onboard-1)}>← Back</button><section className="question-card"><p className="eyebrow">{q[1]}</p><h1>{q[2]}</h1><p className="subcopy">This personalizes technique—not your beauty.</p><div className="choice-grid">{q[3].map(o => <button key={o} className={answers[q[0]]===o?"selected":""} onClick={() => setAnswers({...answers,[q[0]]:o})}>{o}<b>{answers[q[0]]===o?"✓":"○"}</b></button>)}</div><button className="primary wide" disabled={!answers[q[0]]} onClick={() => setOnboard(onboard+1)}>Continue →</button></section></main></>;
  }

  if(view==="creator")return <>{nav}<CreatorStudio onCancel={()=>go("home")}/></>;

  if(view==="finished")return <main className="flow-screen finished-screen"><span aria-hidden="true">✓</span><h1>That’s the look.</h1><p>{activeLesson.length} applications, start to finish.</p><button className="primary" disabled={saveStatus==="saving"||saveStatus==="saved"} onClick={saveCurrentLook}>{saveStatus==="saved"?"Saved ✓":saveStatus==="saving"?"Saving…":"Save this look"}</button><button className="back" onClick={()=>go("home")}>{saveStatus==="saved"?"Back home":"Not this time"}</button><p>Saving keeps the lesson. Your scan is never stored.</p>{saveError&&<p className="error">{saveError}</p>}</main>;
  if (view === "session") {
    const placement = shape ? placementFor(shape) : null;
    const placementKey = currentLesson.technique as keyof ReturnType<typeof placementFor>;
    const personalizedPlacement = placement?.[placementKey] || currentLesson.adaptation;
    const blueprintPlacement = blueprintTechniqueNote(faceBlueprint,currentLesson.technique);
    const moveToStep = (nextStep:number) => {
      if(nextStep>=activeLesson.length){setMirrorOpen(false);go("finished");return;}
      const target = Math.max(0,Math.min(activeLesson.length-1,nextStep));
      setStep(target);setTutorialClipOpen(false);setLessonPanelOpen(false);
    };
    const personalizedGuide=(compact=false)=><div className={`glam-face${compact?" compact-guide":""}`} style={{aspectRatio:String(photoAspect)}}>
      <img src={prepPhoto} alt="Your face with a personalized makeup placement guide"/>
      {activeLesson.slice(0,step).map((item,index)=><PlacementGuide key={`${item.product}-${index}`} id={`complete-${compact?"pip-":""}${index}`} soft focused stepNumber={index+1} points={facePoints} areas={stepAreas(item)} technique={item.technique} shape={shape} blueprint={faceBlueprint} aspect={photoAspect}/>)}
      <PlacementGuide id={compact?"lesson-pip":"lesson"} focused points={facePoints} areas={stepAreas(currentLesson)} technique={currentLesson.technique} shape={shape} blueprint={faceBlueprint} aspect={photoAspect} stepNumber={step+1} paused={!guideMotion}/>
      {!compact&&<button className="guide-motion-toggle" aria-pressed={!guideMotion} onClick={()=>setGuideMotion(value=>!value)}>{guideMotion?"Ⅱ Pause arrows":"▶ Animate arrows"}</button>}
      {!compact&&<div className="placement-key"><span/><b>{currentLesson.product}</b><small>Outline = where it goes · arrows = which way to blend</small></div>}
    </div>;
    return <>
      {nav}
      <main className="glam-room lesson-active minimalist-mirror" onTouchStart={e=>{if(!(e.target as HTMLElement).closest("button,aside,.live-coach-dock"))swipeStart.current=e.touches[0].clientY;}} onTouchEnd={e=>{if(swipeStart.current===null)return;const dy=e.changedTouches[0].clientY-swipeStart.current;swipeStart.current=null;if(Math.abs(dy)>70)moveToStep(step+(dy<0?1:-1));}}><button className="camera-close" onClick={()=>{setMirrorOpen(false);go("home");}} aria-label="Close Glam Room">✕</button><span className="mirror-count">{step+1} of {activeLesson.length}</span>
        <div className="glam-heading">
          <div><p className="eyebrow">The Glam Room · Application {step+1} of {activeLesson.length}</p><h1>{brief?.title || "Your personalized lesson"}</h1><p>{mirrorOpen?"Your live mirror is open. Move through the product queue here and turn on the coach whenever you want to talk.":"Your camera is paused. The personalized placement guide and full product queue are still available."}</p></div>
          <div className={`offline-pill${mirrorOpen?" active":""}`}><i/> {mirrorOpen?"Private camera active":"Camera paused"}</div>
        </div>
        <div className="glam-grid">
          <section className="glam-face-card">
            {mirrorOpen?<div className="feature-mirror-stage">
              <SilentMirror areas={stepAreas(currentLesson)} technique={currentLesson.technique} shape={shape} blueprint={faceBlueprint} stepNumber={step+1} paused facingMode={cameraFacing}/>
              <div className={`animated-guide-pip corner-${guideCorner}${guideExpanded?" expanded":""}`}>
                <div className="animated-guide-title"><span>YOUR ANIMATED GUIDE</span><b>{currentLesson.product}</b></div>
                {personalizedGuide(true)}
              </div>
              <LiveCoach context={{
                lookTitle:brief?.title||"Your personalized look",
                feature:areaSummary(currentLesson),
                product:currentLesson.product,
                instruction:currentLesson.instruction,
                adaptation:[currentLesson.adaptation,personalizedPlacement!==currentLesson.adaptation?personalizedPlacement:"",blueprintPlacement].filter(Boolean).join(" "),
                checkpoint:currentLesson.checkpoint,
                faceShape:shape||"Not estimated",
                skinType:answers.skin||"Not supplied",
                skinTone:answers.tone||"Not supplied",
                experience:answers.level||"Not supplied",
              }}/>
              <button className="mirror-product" onClick={()=>setLessonPanelOpen(true)}>{currentLesson.product} ⓘ</button><div className="mirror-toolbar" aria-label="Mirror controls">
                <button disabled={step===0} onClick={()=>moveToStep(step-1)}><span>←</span>Previous</button>
                {step===activeLesson.length-1?<button className="next-application" onClick={()=>{setMirrorOpen(false);go("finished");}}><span>✓</span>Finish look</button>:<button className="next-application" onClick={()=>moveToStep(step+1)}><span>→</span>Next product</button>}
                <button aria-pressed={!guideMotion} onClick={()=>setGuideMotion(value=>!value)}><span>{guideMotion?"Ⅱ":"▶"}</span>{guideMotion?"Pause arrows":"Play arrows"}</button>
                <button onClick={()=>setGuideCorner(value=>value==="right"?"left":"right")}><span>⇄</span>Move guide</button>
                <button aria-pressed={guideExpanded} onClick={()=>setGuideExpanded(value=>!value)}><span>{guideExpanded?"↙":"↗"}</span>{guideExpanded?"Shrink guide":"Expand guide"}</button>
                <button onClick={()=>setCameraFacing(value=>value==="user"?"environment":"user")}><span>↻</span>Flip camera</button>
                <button className="stop-camera" onClick={()=>setMirrorOpen(false)}><span>■</span>Stop camera</button>
              </div>
            </div>:personalizedGuide()}
            <div className="glam-face-caption"><span>{mirrorOpen?"Live mirror · on-device tracking":"Camera paused · scanned-face guide"}</span><b>{currentLesson.product} · {areaSummary(currentLesson)}</b></div>
          </section>
          <aside onTouchStart={e=>{swipeStart.current=e.touches[0].clientY;}} onTouchEnd={e=>{if(swipeStart.current!==null&&e.changedTouches[0].clientY-swipeStart.current>60)setLessonPanelOpen(false);swipeStart.current=null;}} className={`glam-lesson-card${lessonPanelOpen?" panel-open":" panel-closed"}`}>
            <button className="lesson-panel-handle" aria-expanded={lessonPanelOpen} onClick={()=>setLessonPanelOpen(value=>!value)}><span/><b>{currentLesson.product} · Step {step+1}</b><small>{lessonPanelOpen?"Hide":"Details"}</small></button>
            <div className="lesson-panel-content">
              <div className="sheet-tools"><button className="outline" onClick={()=>setGuideMotion(value=>!value)}>{guideMotion?"Pause arrows":"Animate arrows"}</button><button className="outline" onClick={()=>setCameraFacing(value=>value==="user"?"environment":"user")}>Flip camera</button><button className="outline" onClick={()=>setMirrorOpen(value=>!value)}>{mirrorOpen?"Stop camera":"Restart camera"}</button></div>
              <div className="lesson-progress"><span>Application queue</span><span>Step {step+1} of {activeLesson.length}</span></div>
              <div className="dots">{activeLesson.map((_,index)=><i key={index} className={index<=step?"active":""}/>)}</div>
              <p className="eyebrow">Now we’re using</p><h2>{currentLesson.product}</h2>
              <div className="area-chips">{stepAreas(currentLesson).map(area=><span key={area}>{areaLabels[area]}</span>)}</div>
              <p className="instruction">{currentLesson.instruction}</p>
              {tutorialVideoUrl&&!currentLesson.addedByBestie&&<div className="tutorial-clip-control"><button className="outline" onClick={()=>setTutorialClipOpen(value=>!value)}>{tutorialClipOpen?"Hide tutorial clip":"View tutorial clip"}</button>{tutorialClipOpen&&<TutorialClip src={tutorialVideoUrl} start={currentLesson.startTimeSeconds} end={currentLesson.endTimeSeconds} product={currentLesson.product}/>}</div>}
              {(!tutorialVideoUrl||currentLesson.addedByBestie)&&<div className="tutorial-cue"><small>{currentLesson.addedByBestie?"ADDED FOR CORRECT APPLICATION":"FROM YOUR TUTORIAL"}</small><p>{currentLesson.referenceCue}</p></div>}
              <div className="personalized-direction"><small>PLACEMENT FOR YOUR FACE</small><p>{currentLesson.adaptation}</p>{personalizedPlacement!==currentLesson.adaptation&&<p>{personalizedPlacement}</p>}{blueprintPlacement&&<p className="blueprint-direction"><b>From your Face Blueprint:</b> {blueprintPlacement}</p>}</div>
              <div className="step-target"><small>THIS STEP IS READY WHEN</small><p>{currentLesson.checkpoint}</p></div>
              {currentLesson.uncertain&&<div className="uncertain-step"><b>{currentLesson.addedByBestie?"Preparation recommendation":"Uncertain tutorial detail"}</b><span>{currentLesson.addedByBestie?"This necessary preparation was not visible in the sampled tutorial, so it is clearly identified as Makeup Bestie guidance.":"This product, shade, or hidden technique could not be confirmed from the analyzed frames."}</span></div>}
              {previewImage&&<div className="finished-mini"><img src={previewImage} alt="Your personalized finished look"/><span><small>YOUR FINISHED TARGET</small><b>{brief?.title}</b></span></div>}
              {!mirrorOpen&&<div className="mirror-option"><div><b>Live mirror paused</b><span>Restart it whenever you are ready. Landmarks stay on this device; no camera frames are uploaded.</span></div><button className="outline" onClick={()=>setMirrorOpen(true)}>Restart live mirror</button></div>}
              <div className="glam-actions">
                <button className="outline" disabled={step===0} onClick={()=>moveToStep(step-1)}>← Previous</button>
                {step===activeLesson.length-1?<button className="primary" onClick={()=>{setMirrorOpen(false);go("finished");}}>Finish look ✓</button>:<button className="primary" onClick={()=>moveToStep(step+1)}>Done—next product →</button>}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>;
  }

  if (view === "import") return <>{nav}<main className="simple-page page-enter app-screen"><section className="import-card"><div className="import-icon">▶</div><p className="eyebrow">Tutorial-aware lessons</p><h1>Bring the tutorial. We’ll make it yours.</h1><p>Paste a public tutorial link or upload a permitted video. After the tutorial is analyzed, Makeup Bestie asks for today’s face photo and adapts the lesson.</p><button className="primary wide" onClick={()=>go("studio-intake")}>Create my lesson →</button></section></main></>;

  if(view==="discover")return <>{nav}<DiscoverFeed onCreate={()=>go("creator")}/></>;

  if(view==="my-looks")return <>{nav}<main className="app-screen looks-screen page-enter"><header className="screen-heading"><div><p className="eyebrow">My Looks</p><h1>Your beauty shelf.</h1></div><p>Only looks you deliberately save sync to your private account. Bare-face scans are never stored.</p></header><div className="cloud-look-grid">{brief&&!saveSessionPhotos&&<article className="saved-look-card current-look">{previewImage||prepPhoto?<img src={previewImage||prepPhoto} alt="Your current personalized look"/>:<div className="saved-look-placeholder">✦</div>}<div><small>CURRENT SESSION · NOT SAVED</small><h2>{brief.title}</h2><p>{brief.difficulty} · {brief.time} · {brief.steps.length} tutorial steps</p><div><button className="outline" onClick={()=>go(mapStatus==="ready"?"look-brief":"face-scan")}>Review look</button><button className="primary" onClick={saveCurrentLook}>Save look</button></div></div></article>}{savedLooks.map(look=><article className="saved-look-card" key={look.id}>{look.preview_url?<img src={look.preview_url} alt={`${look.title} personalized preview`}/>:<div className="saved-look-placeholder">✦</div>}<div><small>SAVED PRIVATELY</small><h2>{look.title}</h2><p>{new Date(look.created_at).toLocaleDateString()} · Personalized lesson</p><div><button className="primary" onClick={()=>openSavedLook(look)}>Open look →</button><button className="text-button danger" onClick={()=>void deleteSavedLook(look.id)}>Delete</button></div></div></article>)}</div>{!brief&&!savedLooks.length&&<section className="looks-empty"><span>♡</span><h2>Your first look starts with a tutorial.</h2><p>Paste a link or upload a permitted video, then Makeup Bestie will turn it into a personalized lesson.</p><button className="primary" onClick={()=>go("studio-intake")}>Create my first look →</button></section>}</main></>;

  if (view === "profile") {
    const savedLookCount = account.configured?savedLooks.length:(brief&&saveSessionPhotos?1:0);
    return <>{nav}<main className="profile app-screen band-page">
      <BrandHeader variant="profile"><div className="profile-banner-identity">
        <div className="avatar large">{firstName.charAt(0).toUpperCase()}</div>
        <div><h1>{profileName}</h1><span className="profile-plan-pill">{account.snapshot?.subscription?.plan==="unlimited"?"Unlimited":account.snapshot?.subscription?.plan==="plus"?"Makeup Bestie Plus":"Beauty profile"}</span></div>
      </div></BrandHeader>
      <div className="working-surface">
      <section className="profile-summary-row"><div><p className="eyebrow">Your private beauty profile</p><p>{profileEmail} · {answers.skin||"Skin not set"} · {answers.goal||"Goal not set"}</p></div>
        <button className="outline" onClick={()=>{setOnboard(0);setView("onboarding");window.scrollTo(0,0);}}>Edit profile</button>
      </section>
      <div className="stat-row">
        <div><b>{savedLookCount}</b><span>Saved looks</span></div>
        <div><b>{account.snapshot?.subscription?.plan==="unlimited"?"Unlimited":account.snapshot?.usage.tutorialAnalyses??0}</b><span>{account.snapshot?.subscription?.plan==="unlimited"?"Current plan":"Lessons used this month"}</span></div>
        <div><b>{shape||"Not yet"}</b><span>Face estimate</span></div>
      </div>
      <button className="profile-looks-link" onClick={()=>go("my-looks")}><span><small>MY LOOKS</small><b>Open your private beauty shelf</b><em>{savedLookCount} saved</em></span><i>→</i></button>
      <section className="profile-details"><div><small>SKIN</small><b>{answers.skin}</b></div><div><small>COMPLEXION</small><b>{answers.tone}</b></div><div><small>EXPERIENCE</small><b>{answers.level}</b></div><div><small>MAKEUP GOAL</small><b>{answers.goal}</b></div></section>
      {faceBlueprint&&<section className="profile-blueprint"><div><small>FACE BLUEPRINT</small><h2>Your confirmed feature fit</h2></div><p>{faceBlueprintSummary(faceBlueprint)}</p><span>Update it the next time you take a face scan.</span></section>}
      <section className="account-management"><div><small>SUBSCRIPTION</small><b>{account.snapshot?.subscription?.plan==="unlimited"?"Makeup Bestie Unlimited":"Makeup Bestie Plus"}</b><p>{account.snapshot?.subscription?.cancel_at_period_end?"Cancels at the end of the current billing period.":account.snapshot?.subscription?.source==="apple"?"Active · manage or cancel through your Apple ID subscriptions.":"Active · manage or cancel securely through Stripe."}</p></div>{account.configured&&<ManageBillingButton/>}</section>
      <p className="profile-note">Your beauty preferences and deliberately saved looks sync privately to your account. Landmark coordinates and Glam Room camera footage remain on your device. Bare-face scans are not stored.</p>
      {account.configured&&<><div className="profile-legal-links"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div><div className="profile-account-actions"><button className="text-button" onClick={()=>void account.signOut()}>Sign out</button><button className="text-button danger" onClick={()=>void deleteAccount()}>Delete account and data</button></div></>}
      </div>
    </main></>;
  }

  if (composerOpen||view==="studio-intake") return <main className="composer-sheet"><div className="status-guard" aria-hidden="true"/><div className="composer-sheet-content"><button className="auth-back" onClick={()=>{setComposerOpen(false);go("home");}}>← Back to Home</button><section className="routine-composer"><div className="composer-heading"><span>＋</span><div><small>CREATE A PERSONALIZED LESSON</small><h2>Drop the routine here.</h2></div></div><p className="home-intro">Bring the tutorial first. We’ll study it before asking for today’s face photo.</p><label className="dashboard-link"><span>↗</span><input type="url" inputMode="url" value={lookUrl} onChange={event=>{setLookUrl(event.target.value);setLessonError("");}} placeholder="Paste a TikTok, Instagram, YouTube, or public video link"/></label><div className="composer-divider"><span>or</span></div><label className="dashboard-upload"><span>▶</span><div><b>{lookFile?lookFile.name:"Upload the tutorial video"}</b><small>MP4, WebM, or MOV · only content you can use</small></div><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event=>{const file=event.target.files?.[0]||null;setLookFile(file);setTutorialVideoUrl(file?URL.createObjectURL(file):"");setLessonError("");}}/></label><button className="primary composer-continue" disabled={!lookUrl.trim()&&!lookFile} onClick={()=>{setComposerOpen(false);go("studio-intake");}}>Continue with this routine →</button></section><section className="dashboard-steps" hidden><article><span>01</span><b>We study the tutorial</b><p>Real frames, product order, and technique.</p></article><article><span>02</span><b>You take today’s photo</b><p>Local face mapping adapts the routine.</p></article><article><span>03</span><b>You enter the Glam Room</b><p>Application-by-application guidance on a large live mirror.</p></article></section></div></main>;
  return <>{nav}<BrandSurface variant="home" className="home-poster"><main className="home-poster-content"><p className="poster-greeting">Hello {firstName},</p><h1>What routine do you have in mind?</h1>{brief&&<section className="continue-card"><div><small>CONTINUE WHERE YOU LEFT OFF</small><h2>{brief.title}</h2><p>{mapStatus==="ready"?"Your application queue is ready.":"Tutorial analyzed · today’s face photo is next."}</p></div><button className="outline" onClick={()=>go(mapStatus==="ready"?"look-brief":"face-scan")}>Continue →</button></section>}<PrepCard/><button className="primary poster-start" onClick={()=>setComposerOpen(true)}>Start a routine</button></main></BrandSurface></>;
}

export default function App() {
  const account=useLaunchAccount();
  if(process.env.NODE_ENV==="production"&&!account.configured)return <CloudConfigurationScreen/>;
  if(account.loading)return <CloudLoadingScreen/>;
  if(account.configured&&!account.user)return <UnauthenticatedShell/>;
  return <MakeupBestieExperience account={account}/>;
}
