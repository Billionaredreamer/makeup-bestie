"use client";

import { useEffect, useRef, useState } from "react";

type View = "home" | "onboarding" | "session" | "import" | "market" | "profile";

const steps = [
  { title: "Prep your canvas", copy: "Press a hydrating primer into the center of your face, then blend outward.", time: "01:30", tip: "Warm the product between your fingertips first." },
  { title: "Even the base", copy: "Dot skin tint across your cheeks, forehead, and chin. Tap—don’t swipe—with a damp sponge.", time: "03:00", tip: "Keep the coverage sheer around the hairline." },
  { title: "Soft sculpt", copy: "Place cream bronzer just above the cheek hollow and blend up toward your temple.", time: "02:15", tip: "Looking lifted already. Keep that angle." },
  { title: "Blush & glow", copy: "Tap rose blush high on the apples, then add a whisper of glow to the cheekbones.", time: "02:00", tip: "Use what’s left on the brush across your nose." },
  { title: "Finish the lip", copy: "Trace your natural lip line with cocoa pencil and press muted rose gloss into the center.", time: "01:45", tip: "Perfect. This shade belongs to you." },
];

const buddies = [
  { name: "Maya", role: "Soft Glam Artist", tone: "Warm & encouraging", price: "$8", color: "#b76d52", initials: "MA" },
  { name: "Noor", role: "Editorial Beauty Pro", tone: "Precise & artistic", price: "$12", color: "#6d4638", initials: "NO" },
  { name: "Amara", role: "Melanin Makeup Expert", tone: "Honest & joyful", price: "$10", color: "#8f5547", initials: "AM" },
];

function Logo() {
  return <button className="logo" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span>m</span> makeup bestie</button>;
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [onboardStep, setOnboardStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionStep, setSessionStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [importState, setImportState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [saved, setSaved] = useState(["Everyday Cloud Skin", "Rose Dinner Glow"]);
  const [toast, setToast] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (view === "session") {
      navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
        .then((stream) => { if (video) video.srcObject = stream; })
        .catch(() => undefined);
    }
    return () => {
      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [view]);

  const go = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const saveLook = (name: string) => { if (!saved.includes(name)) setSaved([...saved, name]); notify("Saved to your beauty shelf"); };

  const nav = (
    <header className="nav-shell">
      <nav className="nav">
        <Logo />
        <div className="nav-links">
          <button onClick={() => go("home")}>Home</button>
          <button onClick={() => go("session")}>Studio</button>
          <button onClick={() => go("market")}>Buddies</button>
          <button onClick={() => go("profile")}>My looks</button>
        </div>
        <button className="nav-cta" onClick={() => go("onboarding")}>Find my look <span>↗</span></button>
      </nav>
    </header>
  );

  if (view === "onboarding") {
    const questions = [
      { key: "skin", eyebrow: "First, your canvas", title: "How does your skin usually feel?", options: ["Dry or tight", "Oily or shiny", "A little of both", "Balanced", "Sensitive"] },
      { key: "tone", eyebrow: "Your complexion", title: "Which range feels closest to you?", options: ["Fair", "Light", "Medium", "Tan", "Deep", "Rich"] },
      { key: "level", eyebrow: "Your experience", title: "Where are you in your makeup journey?", options: ["Just starting", "I know the basics", "Confident", "Basically an artist"] },
      { key: "goal", eyebrow: "Your main character moment", title: "What do you want to learn first?", options: ["Everyday natural", "Soft glam", "Full glam", "Editorial color", "Copy a saved look"] },
    ];
    const q = questions[onboardStep];
    return <><>{nav}</><main className="onboarding page-enter">
      <div className="progress"><span style={{ width: `${((onboardStep + 1) / questions.length) * 100}%` }} /></div>
      <button className="back" onClick={() => onboardStep ? setOnboardStep(onboardStep - 1) : go("home")}>← Back</button>
      <section className="question-card">
        <p className="eyebrow">{q.eyebrow}</p><h1>{q.title}</h1>
        <p className="subcopy">No wrong answers—this helps your bestie personalize every step.</p>
        <div className="choice-grid">{q.options.map((option) => <button key={option} className={answers[q.key] === option ? "selected" : ""} onClick={() => setAnswers({ ...answers, [q.key]: option })}><span>{option}</span><b>{answers[q.key] === option ? "✓" : "○"}</b></button>)}</div>
        <button className="primary wide" disabled={!answers[q.key]} onClick={() => onboardStep === questions.length - 1 ? go("session") : setOnboardStep(onboardStep + 1)}>{onboardStep === questions.length - 1 ? "Meet my bestie" : "Continue"} →</button>
        <p className="step-count">{onboardStep + 1} of {questions.length}</p>
      </section>
    </main>{toast && <div className="toast">{toast}</div>}</>;
  }

  if (view === "session") {
    const step = steps[sessionStep];
    return <><>{nav}</><main className="studio page-enter">
      <div className="studio-heading"><div><p className="eyebrow">Live guided session</p><h1>Rose-lit soft glam</h1></div><div className="live-pill"><i /> Camera ready</div></div>
      <div className="studio-grid">
        <section className="camera-card">
          <video ref={videoRef} autoPlay muted playsInline />
          <div className="camera-fallback"><div className="face-shape">♡</div><p>Allow camera access to see yourself here</p></div>
          <div className="camera-top"><span>LIVE</span><span>Natural light</span></div>
          <div className="guide-line left" /><div className="guide-line right" />
          <div className="bestie-bubble"><div className="avatar small">M</div><p><b>Maya</b><br />{step.tip}</p></div>
        </section>
        <aside className="lesson-card">
          <div className="lesson-progress"><span>Step {sessionStep + 1} of {steps.length}</span><span>{step.time}</span></div>
          <div className="dots">{steps.map((_, i) => <i key={i} className={i <= sessionStep ? "active" : ""} />)}</div>
          <p className="eyebrow">Now we’re doing</p><h2>{step.title}</h2><p className="instruction">{step.copy}</p>
          <div className="product"><div className="product-art">MB</div><div><small>BESTIE PICK</small><b>Second Skin Essentials</b><span>Use what you already own—or tap for swaps.</span></div></div>
          <button className="primary wide" onClick={() => sessionStep < steps.length - 1 ? setSessionStep(sessionStep + 1) : saveLook("Rose-lit Soft Glam")}>{sessionStep < steps.length - 1 ? "Done with this step →" : "Finish & save my look"}</button>
          <div className="lesson-controls"><button onClick={() => setSessionStep(Math.max(0, sessionStep - 1))}>↶ Back</button><button onClick={() => setPaused(!paused)}>{paused ? "▶ Resume" : "Ⅱ Pause"}</button><button onClick={() => notify("Maya repeated the instruction")}>↻ Repeat</button></div>
        </aside>
      </div>
    </main>{toast && <div className="toast">{toast}</div>}</>;
  }

  if (view === "import") {
    const analyze = () => {
      if (!/^https?:\/\//.test(videoUrl)) { setImportState("error"); return; }
      setImportState("loading"); window.setTimeout(() => setImportState("done"), 1500);
    };
    return <><>{nav}</><main className="simple-page page-enter"><button className="back" onClick={() => go("home")}>← Back home</button><section className="import-card">
      <div className="import-icon">▶</div><p className="eyebrow">Turn inspiration into instruction</p><h1>Paste it. We’ll teach it.</h1><p>Drop a public makeup-video link and Makeup Bestie will turn the look into a personalized, step-by-step practice session.</p>
      <div className={`url-box ${importState === "error" ? "has-error" : ""}`}><input value={videoUrl} onChange={(e) => { setVideoUrl(e.target.value); setImportState("idle"); }} placeholder="https://youtube.com/watch?v=..." /><button onClick={analyze}>{importState === "loading" ? "Analyzing…" : "Create my guide"}</button></div>
      {importState === "error" && <p className="error">Please paste a full link beginning with http:// or https://</p>}
      {importState === "done" && <div className="analysis-result"><div className="look-preview">ROSE<br />GLOW</div><div><small>GUIDE READY</small><h3>Soft rose evening glam</h3><p>8 steps · 18 minutes · Beginner friendly</p><button className="text-button" onClick={() => go("session")}>Start guided session →</button></div></div>}
      <p className="privacy">🔒 Your links stay private and are never posted.</p>
    </section></main></>;
  }

  if (view === "market") return <><>{nav}</><main className="market page-enter"><section className="market-hero"><p className="eyebrow">The bestie collective</p><h1>Find the artist who <em>gets</em> you.</h1><p>Every buddy has a different specialty and teaching energy. Preview their style, then choose your perfect match.</p></section><div className="filter-row"><button className="active">All buddies</button><button>Natural</button><button>Soft glam</button><button>Melanin experts</button><button>Editorial</button></div><div className="buddy-grid">{buddies.map((buddy) => <article className="buddy-card" key={buddy.name}><div className="buddy-portrait" style={{ background: buddy.color }}><span>{buddy.initials}</span><button aria-label="Favorite" onClick={() => notify(`${buddy.name} added to favorites`)}>♡</button></div><div className="buddy-info"><small>{buddy.role}</small><h2>{buddy.name}</h2><p>“{buddy.tone}”</p><div><span>★ 4.9</span><span>127 sessions</span></div><button className="outline" onClick={() => notify(`${buddy.name} is ready for your next session`)}>Preview voice</button><button className="primary" onClick={() => go("session")}>Choose {buddy.name} · {buddy.price}/mo</button></div></article>)}</div></main>{toast && <div className="toast">{toast}</div>}</>;

  if (view === "profile") return <><>{nav}</><main className="profile page-enter"><section className="profile-top"><div className="avatar large">S</div><div><p className="eyebrow">Your beauty shelf</p><h1>Good to see you, gorgeous.</h1><p>{answers.skin || "Combination"} skin · {answers.goal || "Soft glam"} lover · Learning with Maya</p></div><button className="outline" onClick={() => go("onboarding")}>Edit preferences</button></section><div className="stat-row"><div><b>{saved.length}</b><span>Saved looks</span></div><div><b>6</b><span>Sessions finished</span></div><div><b>3.2h</b><span>Practice time</span></div></div><section className="shelf"><div className="section-heading"><div><p className="eyebrow">Saved for later</p><h2>Your looks</h2></div><button onClick={() => go("import")}>+ Add from video</button></div><div className="look-grid">{saved.map((look, i) => <article key={look} className={`look-card look-${i % 3}`}><div><span>{i === 0 ? "DAILY" : i === 1 ? "DINNER" : "NEW"}</span></div><h3>{look}</h3><p>{i === 0 ? "7 steps · 12 min" : "8 steps · 18 min"}</p><button onClick={() => go("session")}>Practice again →</button></article>)}</div></section></main></>;

  return <><>{nav}</><main className="home page-enter">
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">Your makeup artist. Your hype woman.</p><h1>Makeup finally<br />feels like <em>you.</em></h1><p className="hero-text">Real-time guidance that sees your face, understands your products, and talks you through every step—like FaceTiming your most talented friend.</p><div className="hero-actions"><button className="primary" onClick={() => go("onboarding")}>Find my perfect look <span>→</span></button><button className="play-link" onClick={() => go("session")}><i>▶</i> See how it works</button></div><div className="trust"><div className="faces"><span>S</span><span>N</span><span>A</span></div><div><b>Loved by 2,400+ beauty learners</b><span>★★★★★ 4.9 average</span></div></div></div>
      <div className="hero-visual"><div className="arch"><div className="portrait"><div className="hair" /><div className="head"><i className="eye one"/><i className="eye two"/><i className="mouth"/></div><div className="neck" /></div><div className="call-top"><span>09:41</span><span>● ● ●</span></div><div className="call-copy"><span>STEP 3 OF 7</span><b>Blend up toward your temple—yes, exactly like that.</b></div><div className="call-controls"><button>↻</button><button className="hang">⌄</button><button>•••</button></div></div><div className="floating-note"><div className="avatar small">M</div><p><b>Maya, your bestie</b><br />That placement is perfect ✨</p></div><div className="sparkle one">✦</div><div className="sparkle two">✧</div></div>
    </section>
    <section className="logo-strip"><span>PERSONALIZED FOR</span><b>your face</b><i>✦</i><b>your products</b><i>✦</i><b>your pace</b></section>
    <section className="how"><div className="section-heading"><div><p className="eyebrow">Makeup without the mystery</p><h2>From “where do I start?”<br />to “wait… I did that?”</h2></div><p>Whether you’re holding a brush for the first time or leveling up your technique, your bestie meets you exactly where you are.</p></div><div className="feature-grid"><article><span>01</span><div className="feature-icon">♡</div><h3>Tell us about you</h3><p>Your skin, your style, your comfort level. A two-minute chat makes every lesson yours.</p></article><article><span>02</span><div className="feature-icon">◉</div><h3>FaceTime your bestie</h3><p>Turn on your camera and get calm, real-time coaching while you apply—never rushed.</p></article><article><span>03</span><div className="feature-icon">✦</div><h3>Wear your confidence</h3><p>Save the look, master the technique, and come back whenever you want a little glow-up.</p></article></div></section>
    <section className="import-banner"><div><p className="eyebrow">Saw a look you love?</p><h2>Paste the video.<br />We’ll make it <em>teachable.</em></h2><p>From saved tutorials to red-carpet inspiration, turn any public video into guidance shaped for your features and products.</p><button className="cream-button" onClick={() => go("import")}>Try the video importer →</button></div><div className="video-stack"><div className="video-card back">GET<br />READY</div><div className="video-card front"><span>in 8 personalized steps</span><b>ROSE<br />GLOW</b><i>▶</i></div></div></section>
    <section className="cta"><p className="eyebrow">Ready when you are</p><h2>Your best makeup look<br />is the one you can do <em>yourself.</em></h2><button className="primary" onClick={() => go("onboarding")}>Meet my makeup bestie →</button><small>No pressure. No judgment. Just really good makeup.</small></section>
  </main><footer><Logo /><p>Beauty guidance built around the person in the mirror.</p><span>© 2026 Makeup Bestie · Sample MVP</span></footer>{toast && <div className="toast">{toast}</div>}</>;
}
