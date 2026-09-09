"use client";
import { useEffect, useRef, useState } from "react";

export function ScanCamera({ onPhoto, onBack, busy, message }: { onPhoto:(file:File)=>void; onBack:()=>void; busy:boolean; message:string }) {
  const video=useRef<HTMLVideoElement>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let disposed=false; let stream:MediaStream|undefined;
    Promise.resolve().then(()=>{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera API unavailable");
      return navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"user"}},audio:false});
    }).then(async media=>{
      if(disposed){media.getTracks().forEach(track=>track.stop());return;}
      stream=media;if(video.current){video.current.srcObject=media;await video.current.play();}
    }).catch(()=>setError("Camera unavailable. Allow camera access or choose a photo below."));
    return()=>{disposed=true;stream?.getTracks().forEach(track=>track.stop());};
  },[]);
  const capture=()=>{
    const source=video.current;if(!source?.videoWidth)return;
    const canvas=document.createElement("canvas");canvas.width=source.videoWidth;canvas.height=source.videoHeight;
    canvas.getContext("2d")?.drawImage(source,0,0);
    canvas.toBlob(blob=>{if(blob)onPhoto(new File([blob],"face-scan.jpg",{type:"image/jpeg"}));},"image/jpeg",.9);
  };
  return <main className="scan-camera"><video ref={video} autoPlay muted playsInline/><button className="camera-close" onClick={onBack} aria-label="Back">←</button><div className="scan-controls"><p role="status">{error||(message==="Your photo stays on this device."?"":message)||"Face forward in even light."}</p><button className="scan-shutter" onClick={capture} disabled={busy||!!error} aria-label="Take face photo"/><p>On device. Nothing is uploaded.</p><label className="scan-file">Choose a photo<input type="file" accept="image/*" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)onPhoto(file);}}/></label></div></main>;
}
