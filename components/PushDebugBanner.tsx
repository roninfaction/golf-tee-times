"use client";
import { useEffect, useState } from "react";

/**
 * Diagnostic component — listens for PUSH_RECEIVED messages from the service worker.
 * When a push arrives, shows a visible in-app banner for 10 seconds.
 * This confirms whether the SW push event is firing, independently of whether
 * showNotification is working.
 *
 * Remove this component once push notifications are confirmed working.
 */
export function PushDebugBanner() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED") {
        setMsg(`SW received push: "${event.data.title}" — ${event.data.body}`);
        setTimeout(() => setMsg(null), 10000);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  if (!msg) return null;

  return (
    <div
      style={{
        position: "fixed", top: 60, left: 12, right: 12, zIndex: 9999,
        background: "#1a3a2a", border: "1px solid #30D158",
        borderRadius: 12, padding: "12px 16px",
        color: "#30D158", fontSize: 13, fontFamily: "monospace",
      }}
    >
      ✓ {msg}
    </div>
  );
}
