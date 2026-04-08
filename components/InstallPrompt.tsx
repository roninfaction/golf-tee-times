"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Detects if running in iOS Safari (not standalone PWA)
function isIosSafariNotInstalled() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return isIos && !isStandalone;
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("install_prompt_dismissed");
    if (!dismissed && isIosSafariNotInstalled()) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="text-2xl">📲</div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Install TeeUp</p>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed">
            Tap <strong className="text-slate-300">Share</strong> then{" "}
            <strong className="text-slate-300">Add to Home Screen</strong> to get
            push notifications for tee times.
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.setItem("install_prompt_dismissed", "1");
            setShow(false);
          }}
          className="text-slate-500 hover:text-slate-300 mt-0.5 shrink-0"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
