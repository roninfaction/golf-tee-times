"use client";

import { useState, useEffect } from "react";
import { Check, Flag, Clock, Users } from "lucide-react";
import { formatTeeDateLong, formatTeeTime, buildIcsContent } from "@/lib/format";
import { createClient } from "@/lib/supabase/browser";

type InviteData = {
  invite: { status: string; inviter_name: string };
  teeTime: { course_name: string; tee_datetime: string; holes: number; max_players: number };
  group_name: string;
  open_spots: number;
};

type LoggedInUser = { id: string; displayName: string };

export function FillSpotClient({ token, data, groupTz, loggedInUser: serverLoggedInUser }: { token: string; data: InviteData; groupTz: string; loggedInUser: LoggedInUser | null }) {
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(serverLoggedInUser);
  // Access token for cases where session was detected client-side but cookies aren't synced yet
  const [clientAccessToken, setClientAccessToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  // Client-side auth check — catches cases where browser has a session the server didn't see
  // (e.g., session stored in localStorage but cookies not yet synced to this browser context)
  useEffect(() => {
    if (serverLoggedInUser) return;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      setClientAccessToken(session.access_token);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", session.user.id)
        .maybeSingle();
      setLoggedInUser({
        id: session.user.id,
        displayName: (profile as { display_name: string } | null)?.display_name ?? session.user.email ?? "You",
      });
    });
  }, [serverLoggedInUser]);

  async function handleAcceptAsMember() {
    setLoading(true);
    setError("");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clientAccessToken) headers["Authorization"] = `Bearer ${clientAccessToken}`;

    const res = await fetch("/api/guest-invites/accept-as-member", {
      method: "POST",
      headers,
      body: JSON.stringify({ token }),
    });

    setLoading(false);
    const result = await res.json();

    if (res.ok) {
      setAccepted(true);
    } else {
      if (result.error === "already_claimed" || result.error === "no_spots") {
        setError("Sorry — this spot was just taken by someone else.");
      } else {
        setError(result.error ?? "Something went wrong");
      }
    }
  }

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/guest-invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, email: email.trim() || null }),
    });

    setLoading(false);
    const result = await res.json();

    if (res.ok) {
      setAccepted(true);
    } else {
      if (result.error === "already_claimed" || result.error === "no_spots") {
        setError("Sorry — this spot was just taken by someone else.");
      } else {
        setError(result.error ?? "Something went wrong");
      }
    }
  }

  function downloadIcs() {
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

  if (accepted) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mb-5">
          <Check size={32} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">You&apos;re in! 🎉</h1>
        <p className="text-slate-300 mb-1 font-medium">{data.teeTime.course_name}</p>
        <p className="text-slate-400 text-sm mb-1">
          {formatTeeDateLong(data.teeTime.tee_datetime, groupTz)} at {formatTeeTime(data.teeTime.tee_datetime, groupTz)}
        </p>
        <p className="text-slate-500 text-sm">{data.teeTime.holes} holes · with {data.group_name}</p>
        {loggedInUser ? (
          <a
            href="/upcoming"
            className="mt-6 inline-block bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
          >
            View in app →
          </a>
        ) : (
          <>
            {email && (
              <p className="text-slate-500 text-xs mt-3">Reminders will be sent to {email}</p>
            )}
            <button
              onClick={downloadIcs}
              className="mt-6 bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
            >
              📅 Add to calendar
            </button>
            <p className="text-slate-600 text-xs mt-3">
              Downloads an .ics file — open it to add to any calendar app
            </p>
          </>
        )}
      </div>
    );
  }

  // Tee time details card — shared between logged-in and guest flows
  const detailsCard = (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3 mb-6">
      <div className="flex items-center gap-3 text-slate-300">
        <Clock size={16} className="text-slate-500 shrink-0" />
        <span>{formatTeeDateLong(data.teeTime.tee_datetime, groupTz)} at {formatTeeTime(data.teeTime.tee_datetime, groupTz)}</span>
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
  );

  // Simplified one-tap accept for users already logged into the app
  if (loggedInUser) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10">
        <div className="max-w-sm mx-auto">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">⛳</div>
            <h1 className="text-2xl font-bold text-white">{data.teeTime.course_name}</h1>
            <p className="text-slate-400 text-sm mt-1">
              {data.invite.inviter_name} invited you to join {data.group_name}
            </p>
          </div>
          {detailsCard}
          <p className="text-slate-400 text-sm text-center mb-4">
            Accepting as <span className="text-white font-medium">{loggedInUser.displayName}</span>
          </p>
          {error && <p className="text-red-400 text-sm text-center mb-3">{error}</p>}
          <button
            onClick={handleAcceptAsMember}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg transition-colors"
          >
            {loading ? "Reserving spot…" : "Accept tee time"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">⛳</div>
          <h1 className="text-2xl font-bold text-white">{data.teeTime.course_name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {data.invite.inviter_name} invited you to join {data.group_name}
          </p>
        </div>

        {detailsCard}

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

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">
              Email <span className="text-slate-600">(optional — for reminders)</span>
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-base"
            />
            <p className="text-xs text-slate-600 mt-1.5">We&apos;ll send you a reminder 24h and 2h before your tee time</p>
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

        <div className="mt-6 pt-5 border-t border-slate-800 text-center">
          <p className="text-slate-500 text-sm">
            Already a GolfPack member?{" "}
            <a
              href={`/login?next=/fill/${token}`}
              className="text-green-500 font-medium hover:text-green-400"
            >
              Log in to accept
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
