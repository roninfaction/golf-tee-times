"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

declare global {
  interface Window {
    OneSignal?: {
      init: (config: { appId: string; allowLocalhostAsSecureOrigin?: boolean }) => Promise<void>;
      User: {
        pushSubscription: {
          optIn: () => Promise<void>;
          id: string | null | undefined;
        };
      };
    };
  }
}

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? "";

export function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const registered = localStorage.getItem("push_registered");
    if (registered || !ONESIGNAL_APP_ID) return;

    // Only show if in standalone mode (required for iOS push)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const isAndroid = /Android/.test(navigator.userAgent);
    if (!isStandalone && !isAndroid) return;

    // Check if push is supported
    if (!("Notification" in window)) return;

    setShow(true);
  }, []);

  async function enable() {
    setShow(false);
    try {
      if (!window.OneSignal) return;
      await window.OneSignal.User.pushSubscription.optIn();
      const playerId = window.OneSignal.User.pushSubscription.id;
      if (playerId) {
        await fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
        });
        localStorage.setItem("push_registered", "1");
      }
    } catch {
      // Silently fail — push is optional
    }
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-green-950 border border-green-800 rounded-2xl p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <Bell className="text-green-400 shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Enable notifications</p>
          <p className="text-green-300/70 text-xs mt-1 leading-relaxed">
            Get alerts when new tee times are added and reminders before you tee off.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={enable}
              className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Enable notifications
            </button>
            <button
              onClick={() => {
                localStorage.setItem("push_registered", "dismissed");
                setShow(false);
              }}
              className="text-slate-400 text-xs px-3"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
