"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";

type RsvpStatus = "pending" | "accepted" | "declined";

const savedLabels: Record<RsvpStatus, string> = {
  accepted: "You're going!",
  pending: "Marked as maybe",
  declined: "Marked as can't go",
};

export function RsvpButtons({
  teeTimeId,
  currentStatus,
  onUpdate,
}: {
  teeTimeId: string;
  currentStatus: RsvpStatus;
  onUpdate?: (newStatus: RsvpStatus) => void;
}) {
  const [status, setStatus] = useState<RsvpStatus>(currentStatus);
  const [loading, setLoading] = useState(false);
  const [savedStatus, setSavedStatus] = useState<RsvpStatus | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function updateRsvp(newStatus: RsvpStatus) {
    if (newStatus === status || loading) return;
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/rsvps", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ teeTimeId, status: newStatus }),
    });
    setLoading(false);
    if (res.ok) {
      setStatus(newStatus);
      onUpdate?.(newStatus);
      setSavedStatus(newStatus);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setSavedStatus(null), 2200);
    }
  }

  const options: { value: RsvpStatus; label: string }[] = [
    { value: "accepted", label: "Going" },
    { value: "pending", label: "Maybe" },
    { value: "declined", label: "Can't go" },
  ];

  return (
    <div>
      <div
        className="flex rounded-xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "0.5px solid rgba(255,255,255,0.1)",
          opacity: loading ? 0.6 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {options.map(({ value, label }, i) => {
          const isActive = status === value;
          const activeColors: Record<RsvpStatus, { bg: string; text: string }> = {
            accepted: { bg: "#30D158", text: "#000" },
            pending: { bg: "rgba(255,214,10,0.9)", text: "#000" },
            declined: { bg: "rgba(255,69,58,0.9)", text: "#fff" },
          };
          return (
            <button
              key={value}
              onClick={() => updateRsvp(value)}
              disabled={loading}
              style={{
                flex: 1,
                padding: "10px 0",
                fontSize: "13px",
                fontWeight: isActive ? 600 : 400,
                letterSpacing: "-0.1px",
                background: isActive ? activeColors[value].bg : "transparent",
                color: isActive ? activeColors[value].text : "rgba(255,255,255,0.5)",
                borderRight: i < options.length - 1 ? "0.5px solid rgba(255,255,255,0.1)" : "none",
                transition: "all 0.15s ease",
                cursor: loading ? "default" : "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          height: "20px",
          marginTop: "8px",
          paddingLeft: "2px",
          opacity: savedStatus ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      >
        {savedStatus && (
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>
            ✓ {savedLabels[savedStatus]}
          </span>
        )}
      </div>
    </div>
  );
}
