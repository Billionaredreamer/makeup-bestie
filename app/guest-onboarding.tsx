"use client";
import { useState } from "react";
import { guestProductOptions, guestProfileIsComplete, guestQuestions, readGuestProfileDraft, startingProfileLines, writeGuestProfileDraft, type GuestProfileDraft } from "@/lib/guest-onboarding";

export function GuestOnboarding({onBack,onSave,startAtSummary=false}:{onBack:()=>void;onSave:()=>void;startAtSummary?:boolean}){
  const [draft,setDraft]=useState<GuestProfileDraft>(()=>readGuestProfileDraft());
  const [step,setStep]=useState(()=>startAtSummary||guestProfileIsComplete(readGuestProfileDraft())?5:0);
  const update=(change:Partial<GuestProfileDraft>)=>{const next=writeGuestProfileDraft(change);setDraft(next);};
  if(step===5){
    const chips=[draft.goal,draft.skin,draft.tone&&`${draft.tone} depth`,draft.level].filter(Boolean) as string[];
    return <main className="guest-onboarding starting-profile page-enter"><button className="guest-back" onClick={()=>setStep(4)}>←</button><section>
      <h1>Here’s where<br/>we’ll start you.</h1>
      <div className="starting-chips">{chips.map(item=><span key={item}>{item}</span>)}</div>
      <div className="starting-lines">{startingProfileLines(draft).map(line=><p key={line}>{line}</p>)}</div>
      <button className="primary wide" onClick={()=>{update({startingProfileSeen:true});onSave();}}>Save my profile</button>
    </section></main>;
  }
  if(step===4)return <main className="guest-onboarding page-enter"><button className="guest-back" onClick={()=>setStep(3)}>← Back</button><section className="guest-question guest-products">
    <p className="eyebrow">Your makeup bag</p><h1>What do you already have?</h1><p className="guest-sub">Pick any you own, or skip this for now.</p>
    <div className="guest-product-chips">{guestProductOptions.map(product=><button key={product} aria-pressed={draft.products?.includes(product)||false} onClick={()=>update({products:draft.products?.includes(product)?draft.products.filter(item=>item!==product):[...(draft.products||[]),product]})}>{product}</button>)}</div>
    <button className="primary wide" onClick={()=>setStep(5)}>{draft.products?.length?"Continue":"Skip for now"} →</button>
  </section></main>;
  const question=guestQuestions[step];
  const value=draft[question.key];
  return <main className="guest-onboarding page-enter"><button className="guest-back" onClick={()=>step?setStep(step-1):onBack()}>← Back</button><section className="guest-question">
    <p className="eyebrow">{question.label}</p><h1>{question.title}</h1><p className="guest-sub">This personalizes technique—not your beauty.</p>
    <div className="guest-choices">{question.options.map(option=><button key={option} className={value===option?"selected":""} onClick={()=>update({[question.key]:option})}>{option}<span>{value===option?"✓":"○"}</span></button>)}</div>
    <button className="primary wide" disabled={!value} onClick={()=>setStep(step+1)}>Continue →</button>
  </section></main>;
}
