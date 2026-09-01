"use client";

import { useEffect, useRef, useState } from "react";
import type { StoredRoutinePost } from "@/lib/routine-posts";

export type RoutinePost = StoredRoutinePost & { videoUrl: string };

type CreatorProps = {
  creator: string;
  products: string[];
  onCancel: () => void;
  onPublish: (post: StoredRoutinePost) => Promise<void>;
};

export function CreatorStudio({ creator, products, onCancel, onPublish }: CreatorProps) {
  const camera = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = () => {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (camera.current) camera.current.srcObject = null;
    setCameraActive(false);
  };

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach(track => track.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const startCamera = async () => {
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 }, aspectRatio: { ideal: 9 / 16 } },
        audio: false,
      });
      stream.current = media;
      if (camera.current) { camera.current.srcObject = media; await camera.current.play(); }
      setCameraActive(true);
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === "NotAllowedError" ? "Camera permission was denied. You can still upload a routine video." : "The creator camera could not start. Try an upload instead.");
      stopCamera();
    }
  };

  const startRecording = async () => {
    if (!stream.current) await startCamera();
    if (!stream.current || typeof MediaRecorder === "undefined") { setError("Video recording is not supported in this browser. Upload a video instead."); return; }
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type)) || "";
    chunks.current = [];
    const nextRecorder = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    nextRecorder.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
    nextRecorder.onstop = () => {
      const blob = new Blob(chunks.current, { type: nextRecorder.mimeType || "video/webm" });
      const file = new File([blob], `routine-${Date.now()}.webm`, { type: blob.type });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setVideo(file); setPreviewUrl(URL.createObjectURL(file)); setRecording(false); stopCamera();
      if (timer.current) clearInterval(timer.current);
    };
    recorder.current = nextRecorder;
    nextRecorder.start(500);
    setSeconds(0); setRecording(true);
    timer.current = setInterval(() => setSeconds(value => value + 1), 1000);
  };

  const stopRecording = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const selectVideo = (file: File | null) => {
    if (!file) return;
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setVideo(file); setPreviewUrl(URL.createObjectURL(file)); setError("");
  };

  const publish = async () => {
    if (!video || !title.trim() || !rightsConfirmed) { setError("Add a title, choose or record a video, and confirm you have permission to publish it."); return; }
    setPublishing(true); setError("");
    try {
      await onPublish({
        id: crypto.randomUUID(), creator, title: title.trim(), description: description.trim(), products: selectedProducts,
        createdAt: Date.now(), video, fileName: video.name,
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The routine could not be published on this device."); }
    finally { setPublishing(false); }
  };

  return <main className="creator-studio app-screen page-enter">
    <header className="creator-heading"><button className="back" onClick={() => { stopCamera(); onCancel(); }}>← Back home</button><div><p className="eyebrow">Create a Routine Post</p><h1>Teach it your way.</h1><p>Record or upload a vertical makeup routine. Your post stays on this device until shared accounts and video hosting are connected.</p></div></header>
    <div className="creator-layout">
      <section className="creator-camera">
        {previewUrl ? <video src={previewUrl} controls playsInline loop/> : <video ref={camera} autoPlay muted playsInline className={cameraActive ? "active" : ""}/>} 
        {!previewUrl && !cameraActive && <div className="creator-camera-empty"><span>＋</span><b>Your 9:16 routine camera</b><small>Silent recording for this prototype</small></div>}
        {recording && <div className="recording-pill"><i/> REC {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</div>}
        <div className="creator-camera-actions">
          {!previewUrl && !cameraActive && <button onClick={startCamera}>Open camera</button>}
          {cameraActive && !recording && <button className="record-button" onClick={startRecording}><i/>Record</button>}
          {recording && <button className="record-button recording" onClick={stopRecording}><i/>Stop</button>}
          {previewUrl && <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(""); setVideo(null); }}>Retake</button>}
          <label><span>Upload</span><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => selectVideo(event.target.files?.[0] || null)}/></label>
        </div>
      </section>
      <section className="creator-details">
        <p className="eyebrow">Post details</p><h2>Turn the video into a lesson.</h2>
        <label><span>Routine title</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Example: Five-minute lifted soft glam" maxLength={80}/></label>
        <label><span>What are you teaching?</span><textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe the finish, technique, or who this routine helps." maxLength={300}/></label>
        <div className="creator-products"><span>Products used</span><div>{products.map(product => <button type="button" key={product} className={selectedProducts.includes(product) ? "selected" : ""} onClick={() => setSelectedProducts(current => current.includes(product) ? current.filter(item => item !== product) : [...current, product])}>{selectedProducts.includes(product) ? "✓ " : "+ "}{product}</button>)}</div></div>
        <label className="creator-rights"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)}/><span><b>I made this video or have permission to publish it.</b><small>The AI will only call it analyzed after real frames are reviewed when someone personalizes the routine.</small></span></label>
        {error && <p className="error">{error}</p>}
        <button className="primary wide" disabled={publishing || !video || !title.trim() || !rightsConfirmed} onClick={publish}>{publishing ? "Publishing on this device…" : "Publish to Discover →"}</button>
      </section>
    </div>
  </main>;
}

export function DiscoverFeed({ posts, loading, onTry, onCreate }: { posts: RoutinePost[]; loading: boolean; onTry: (post: RoutinePost) => void; onCreate: () => void }) {
  if (loading) return <main className="discover-feed empty-discover page-enter"><section className="discover-video empty-card"><div><span className="discover-loader">✦</span><p className="eyebrow">Discover</p><h1>Opening your<br/>routine feed.</h1><p>Loading the videos published on this device…</p></div></section></main>;
  if (!posts.length) return <main className="discover-feed empty-discover page-enter"><section className="discover-video empty-card"><div><span>✦</span><p className="eyebrow">Your local Discover feed</p><h1>Makeup routines<br/>belong here.</h1><p>Publish the first routine from Create. It will appear as a full-height video post on this device.</p><button className="primary" onClick={onCreate}>Create a routine post →</button><small>No fake creators or purchased inventory.</small></div></section></main>;
  return <main className="discover-feed page-enter" aria-label="Routine video feed">{posts.map(post => <article className="discover-video" key={post.id}>
    <video src={post.videoUrl} autoPlay muted loop playsInline controls preload="metadata" aria-label={`${post.title} by ${post.creator}`}/>
    <div className="discover-gradient"/>
    <div className="discover-post-copy"><small>@{post.creator.toLowerCase().replace(/\s+/g, "")}</small><h2>{post.title}</h2>{post.description && <p>{post.description}</p>}<div>{post.products.slice(0, 4).map(product => <span key={product}>{product}</span>)}</div><button onClick={() => onTry(post)}>Try this routine →</button></div>
    <div className="discover-side-actions"><button onClick={() => onTry(post)}><span>✦</span><small>Try</small></button></div>
    <div className="local-post-label">Published on this device</div>
  </article>)}</main>;
}
