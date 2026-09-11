"use client";
import { useEffect, useState } from "react";
import { prepLines, prepLineForDate } from "@/lib/prep-lines";

export function PrepCard() {
  const [line,setLine]=useState<string>(prepLines[0]);
  useEffect(()=>{queueMicrotask(()=>setLine(prepLineForDate(new Date())));},[]);
  return <aside className="prep-card" aria-label="Before you start">
    <h2>Before you start</h2>
    <ul>{["Clean face","Moisturiser on, given a minute","Hair back"].map(item=><li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
    <p>{line}</p>
  </aside>;
}
