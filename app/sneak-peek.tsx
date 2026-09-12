"use client";

import { useRef, useState } from "react";

const peekPanels = [
  { number:"01", visual:"tutorial", eyebrow:"Tutorial to technique", title:"A real routine, remade for you.", copy:"Bring a tutorial you love. Makeup Bestie studies the actual steps and keeps the creator’s product order while adapting technique to your face." },
  { number:"02", visual:"mapping", eyebrow:"Private face mapping", title:"Your face stays yours.", copy:"Your feature map is created on your device. Bare-face photos and live camera footage are not saved unless you deliberately choose to save a finished look." },
  { number:"03", visual:"mirror", eyebrow:"The Glam Room", title:"Practice one product at a time.", copy:"Use a full-screen mirror, animated placement arrows, the original tutorial cues, and an optional live coach while you apply each product." },
] as const;

function PeekIllustration({ kind }: { kind: typeof peekPanels[number]["visual"] }) {
  if (kind === "tutorial") return <svg viewBox="0 0 120 120" focusable="false">
    <path d="M16 44v32l27-16-27-16Z"/>
    <path d="M48 60c12-19 25-25 38-22"/>
    <path d="m79 32 8 6-7 7"/>
    <path d="M99 48c8 0 13 7 13 17 0 13-6 25-17 25S78 78 78 65c0-10 6-17 14-17"/>
    <path d="M86 65h1m15 0h1M90 77c4 3 8 3 12 0"/>
  </svg>;
  if (kind === "mapping") return <svg viewBox="0 0 120 120" focusable="false">
    <rect x="20" y="10" width="80" height="100" rx="15"/>
    <path d="M60 28c15 0 24 12 24 29 0 22-9 39-24 39S36 79 36 57c0-17 9-29 24-29Z"/>
    <circle cx="48" cy="54" r="3"/><circle cx="72" cy="54" r="3"/>
    <circle cx="60" cy="67" r="3"/><circle cx="70" cy="77" r="3"/>
    <path d="M47 84c8 5 18 5 26 0"/>
  </svg>;
  return <svg viewBox="0 0 120 120" focusable="false">
    <rect x="25" y="8" width="70" height="104" rx="28"/>
    <path d="M60 27c14 0 23 12 23 29 0 23-9 39-23 39S37 79 37 56c0-17 9-29 23-29Z"/>
    <path d="M44 67c10-8 21-9 32-2"/>
    <path d="m70 59 7 6-6 7"/>
  </svg>;
}

export function SneakPeek({ onFinish }: { onFinish: () => void }) {
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
        <div className="peek-visual" aria-hidden="true"><PeekIllustration kind={item.visual}/><i>{item.number}</i></div>
        <div className="peek-copy"><p className="eyebrow">{item.eyebrow}</p><h1>{item.title}</h1><p>{item.copy}</p></div>
      </section>)}
    </div>
    <footer className="peek-controls">
      <div className="peek-dots" aria-label="Introduction progress">{peekPanels.map((item,index)=><button key={item.number} className={index===panel?"active":""} aria-label={`Show introduction ${index+1}`} onClick={()=>move(index)}/>)}</div>
      <button className="primary" onClick={()=>panel===peekPanels.length-1?onFinish():move(panel+1)}>{panel===peekPanels.length-1?"Continue to sign up →":"Continue →"}</button>
    </footer>
  </main>;
}
