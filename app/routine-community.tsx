"use client";

type CreatorProps = {
  onCancel: () => void;
};

export function CreatorStudio({ onCancel }: CreatorProps) {
  return <main className="creator-studio app-screen page-enter community-coming-soon">
    <header className="creator-heading">
      <button className="back" onClick={onCancel}>← Back home</button>
      <div>
        <p className="eyebrow">Creator · Coming soon</p>
        <h1>Teach your<br/>signature look.</h1>
        <p>Create a complete makeup routine or focus on one feature, like eyes or lips. Share what you know and earn when others learn your look.</p>
      </div>
    </header>
    <div className="creator-layout creator-preview-layout">
      <section className="creator-camera creator-coming-camera" aria-label="Creator routine preview">
        <div className="creator-camera-empty">
          <span>＋</span>
          <b>Your routine camera</b>
          <small>FULL ROUTINE OR FEATURE FOCUS</small>
        </div>
        <div className="coming-soon-pill">Coming soon</div>
      </section>
      <section className="creator-details creator-coming-details">
        <p className="eyebrow">Choose what you teach</p>
        <h2>One look or one feature.</h2>
        <div className="creator-format-preview">
          <article><span>01</span><div><b>Complete routine</b><small>Teach your look from prep to finish.</small></div></article>
          <article><span>02</span><div><b>Feature focus</b><small>Share one technique for eyes, brows, cheeks, lips, or complexion.</small></div></article>
        </div>
        <button className="primary wide" disabled>Creator tools coming soon</button>
      </section>
    </div>
  </main>;
}

export function DiscoverFeed({ onCreate }: { onCreate: () => void }) {
  return <main className="discover-feed empty-discover page-enter">
    <section className="discover-video empty-card discover-coming-card">
      <div>
        <span>✦</span>
        <p className="eyebrow">Discover · Coming soon</p>
        <h1>Find your next<br/>signature look.</h1>
        <p>Discover routines made by real creators, personalize them to your face, and keep advancing your makeup skills.</p>
        <button className="primary" onClick={onCreate}>Preview creator tools →</button>
      </div>
    </section>
  </main>;
}
