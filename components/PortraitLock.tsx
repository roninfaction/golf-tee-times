"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

export function PortraitLock() {
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    // Android PWA: try native API lock first (lock() is not in TS lib typings)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const so = screen.orientation as any;
    if (so?.lock) so.lock("portrait").catch(() => {});

    // iOS ignores both the manifest and the Screen Orientation API —
    // use a matchMedia overlay as the only reliable fallback.
    const mql = window.matchMedia("(orientation: landscape) and (max-width: 1024px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLandscape(mql.matches);
    const handler = (e: MediaQueryListEvent) => setLandscape(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  if (!landscape) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5"
      style={{ background: "#071510" }}
    >
      <RotateCcw size={48} style={{ color: "#30D158" }} />
      <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
        Please rotate your device to portrait
      </p>
    </div>
  );
}
