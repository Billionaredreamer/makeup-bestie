"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function BrandHeader({ children, variant }: { children: ReactNode; variant: "home" | "profile" }) {
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const update = () => {
      // The existing native bridge uses this signal for light status-bar text.
      const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-top")) || 0;
      document.documentElement.dataset.welcome = String((header.current?.getBoundingClientRect().bottom || 0) > safeTop);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      delete document.documentElement.dataset.welcome;
    };
  }, []);
  return <header ref={header} className={`brand-image brand-header brand-header-${variant}`}><div className="brand-header-content">{children}</div></header>;
}
