"use client";

import { useState } from "react";
import { Check, X, Clock } from "lucide-react";
import { clsx } from "clsx";

type RsvpStatus = "pending" | "accepted" | "declined";

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

  async function updateRsvp(newStatus: RsvpStatus) {
    if (newStatus === status || loading) return;
    setLoading(true);

    const res = await fetch("/api/rsvps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teeTimeId, status: newStatus }),
    });

    setLoading(false);
    if (res.ok) {
      setStatus(newStatus);
      onUpdate?.(newStatus);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => updateRsvp("accepted")}
        disabled={loading}
        className={clsx(
          "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
          status === "accepted"
            ? "bg-green-600 text-white"
            : "bg-slate-800 text-slate-300 hover:bg-green-900/50 hover:text-green-400"
        )}
      >
        <Check size={15} />
        In
      </button>
      <button
        onClick={() => updateRsvp("pending")}
        disabled={loading}
        className={clsx(
          "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
          status === "pending"
            ? "bg-yellow-600/80 text-white"
            : "bg-slate-800 text-slate-300 hover:bg-yellow-900/50 hover:text-yellow-400"
        )}
      >
        <Clock size={15} />
        Maybe
      </button>
      <button
        onClick={() => updateRsvp("declined")}
        disabled={loading}
        className={clsx(
          "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
          status === "declined"
            ? "bg-red-700 text-white"
            : "bg-slate-800 text-slate-300 hover:bg-red-900/50 hover:text-red-400"
        )}
      >
        <X size={15} />
        Out
      </button>
    </div>
  );
}
