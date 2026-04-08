"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatTeeDateLong, formatTeeTime, buildIcsContent } from "@/lib/format";
import { Check, Flag, Clock, Users } from "lucide-react";

type InviteData = {
  invite: { status: string; inviter_name: string };
  teeTime: { course_name: string; tee_datetime: string; holes: number; max_players: number };
  group_name: string;
  open_spots: number;
};

export default function FillSpotPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<InviteData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptedInfo, setAcceptedInfo] = useState<{ courseName: string; teeDate: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/guest-invites?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setLoadError(d.error);
        else setData(d);
      })
      .catch(() => setLoadError("Failed to load invite"));
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/guest-invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name }),
    });

    setLoading(false);
    const result = await res.json();

    if (res.ok) {
      setAccepted(true);
      setAcceptedInfo({ courseName: result.courseName, teeDate: result.teeDate });
    } else {
      if (result.error === "already_claimed" || result.error === "no_spots") {
        setError("Sorry — this spot was just taken by someone else.");
      } else {
        setError(result.error ?? "Something went wrong");
      }
    }
  }

  function downloadIcs() {
    if (!data) return;
    const ics = buildIcsContent({
      summary: `Golf - ${data.teeTime.course_name}`,
      description: `Tee time with ${data.group_name}`,
      location: data.teeTime.course_name,
      startIso: data.teeTime.tee_datetime,
    });
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tee-time.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">⛳</div>
        <h1 className="text-xl font-bold text-white mb-2">
          {loadError === "not_found" ? "Invite not found" : "This spot is taken"}
        </h1>
        <p className="text-slate-400 text-sm max-w-xs">
          {loadError === "not_found"
            ? "This invite link is no longer valid."
            : "Someone already accepted this invite. First come, first served!"}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Already claimed / expired
  if (data.invite.status !== "pending") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">😬</div>
        <h1 className="text-xl font-bold text-white mb-2">This spot is taken</h1>
        <p className="text-slate-400 text-sm max-w-xs">
          Someone else accepted this invite first. Ask {data.invite.inviter_name ?? "your friend"} for a new link.
        </p>
      </div>
    );
  }

  // No open spots
  if (data.open_spots <= 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">🏌️</div>
        <h1 className="text-xl font-bold text-white mb-2">Tee time is full</h1>
        <p className="text-slate-400 text-sm">{data.teeTime.course_name} is fully booked.</p>
      </div>
    );
  }

  if (accepted && data) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mb-5">
          <Check size={32} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">You&apos;re in! 🎉</h1>
        <p className="text-slate-300 mb-1 font-medium">{data.teeTime.course_name}</p>
        <p className="text-slate-400 text-sm mb-1">
          {formatTeeDateLong(data.teeTime.tee_datetime)} at {formatTeeTime(data.teeTime.tee_datetime)}
        </p>
        <p className="text-slate-500 text-sm">{data.teeTime.holes} holes · with {data.group_name}</p>

        <button
          onClick={downloadIcs}
          className="mt-6 bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
        >
          📅 Add to calendar
        </button>
        <p className="text-slate-600 text-xs mt-3">
          Downloads an .ics file — open it to add to any calendar app
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="max-w-sm mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">⛳</div>
          <h1 className="text-2xl font-bold text-white">{data.teeTime.course_name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {data.invite.inviter_name} invited you to join {data.group_name}
          </p>
        </div>

        {/* Tee time details */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3 mb-6">
          <div className="flex items-center gap-3 text-slate-300">
            <Clock size={16} className="text-slate-500 shrink-0" />
            <span>{formatTeeDateLong(data.teeTime.tee_datetime)} at {formatTeeTime(data.teeTime.tee_datetime)}</span>
          </div>
          <div className="flex items-center gap-3 text-slate-300">
            <Flag size={16} className="text-slate-500 shrink-0" />
            <span>{data.teeTime.holes} holes</span>
          </div>
          <div className="flex items-center gap-3 text-slate-300">
            <Users size={16} className="text-slate-500 shrink-0" />
            <span>{data.open_spots} open spot{data.open_spots !== 1 ? "s" : ""} remaining</span>
          </div>
        </div>

        {/* Accept form */}
        <form onSubmit={handleAccept} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              required
              autoFocus
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-base"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg transition-colors"
          >
            {loading ? "Reserving spot…" : "Accept tee time"}
          </button>
          <p className="text-slate-600 text-xs text-center">
            First to accept gets the spot. No account needed.
          </p>
        </form>
      </div>
    </div>
  );
}
