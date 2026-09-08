"use client";

import { useEffect, useState, type ReactNode } from "react";

// One switch for all photography; failed requests always retain the warm wash.
const BRAND_MEDIA_ENABLED = true;

export function BrandSurface({ children, variant, className = "" }: { children: ReactNode; variant: "welcome" | "home" | "profile"; className?: string }) {
  const [hasMedia, setHasMedia] = useState(false);
  useEffect(() => {
    if (!BRAND_MEDIA_ENABLED) return;
    let active = true;
    const photo = new Image();
    photo.onload = () => { if (active) setHasMedia(true); };
    photo.src = `/${variant}-hero.jpg`;
    return () => { active = false; };
  }, [variant]);
  useEffect(() => {
    // The fixed guard retains this contrast even after the profile band scrolls away.
    document.documentElement.dataset.welcome = String(hasMedia);
    return () => { delete document.documentElement.dataset.welcome; };
  }, [hasMedia]);
  return <div className={`brand-image brand-${variant} ${hasMedia ? "has-media" : ""} ${className}`}>
    <div className="status-guard" aria-hidden="true"/>{children}
  </div>;
}

export function BrandHeader({ children, variant }: { children: ReactNode; variant: "profile" }) {
  return <BrandSurface variant={variant} className="brand-header brand-header-profile"><div className="brand-header-content">{children}</div></BrandSurface>;
}
