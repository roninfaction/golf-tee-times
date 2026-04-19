"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { registerPush } from "@/lib/onesignal-client";

export function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const isAndroid = /Android/.test(navigator.userAgent);
    if (!isStandalone && !isAndroid) return;

    (async () => {
      if (Notification.permission === "granted") {
        // Always silently re-register on launch — ensures subscription is saved even if a
        // previous registration attempt failed (e.g. after the OneSignal→native migration).
        // registerPush() reuses the existing pushManager subscription so this is cheap.
        await registerPush().catch(() => {});
      } else if (Notification.permission === "default" && !localStorage.getItem("push_dismissed")) {
        if (!localStorage.getItem("push_init_done")) {
          localStorage.setItem("push_init_done", "1");
          setShow(true);
        }
      }
    })();
  }, []);

  async function enable() {
    setShow(false);
    // Permission must be requested directly from a user gesture (iOS requirement).
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }
    await registerPush().catch(() => {});
  }

  function dismiss() {
    localStorage.setItem("push_dismissed", "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-50 rounded-2xl p-4 shadow-2xl"
      style={{ background: "rgba(7,30,18,0.97)", border: "0.5px solid rgba(80,200,110,0.35)" }}
    >
      <div className="flex items-start gap-3">
        <Bell size={20} style={{ color: "#30D158", flexShrink: 0, marginTop: 2 }} />
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Enable notifications</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
            Get alerted when tee times are added and before you tee off.
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={enable} className="text-black text-xs font-semibold px-4 py-2 rounded-xl" style={{ background: "#30D158" }}>
              Enable
            </button>
            <button onClick={dismiss} className="text-xs px-3 py-2" style={{ color: "rgba(255,255,255,0.35)" }}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
