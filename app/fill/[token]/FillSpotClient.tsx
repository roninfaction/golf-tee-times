"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Flag, Clock, Users, MapPin, Trophy, CalendarPlus } from "lucide-react";
import { formatTeeDateLong, formatTeeTime, buildIcsContent } from "@/lib/format";
import { createClient } from "@/lib/supabase/browser";
import type { HubData } from "./page";

type LoggedInUser = { id: string; displayName: string };

const FORMAT_LABELS: Record<string, string> = {
  stroke: "Stroke Play", best_ball: "Best Ball",
  scramble: "Scramble", match_play: "Match Play", stableford: "Stableford",
};

function directionsUrl(data: HubData): string | null {
  const c = data.course;
  if (c?.maps_url) return c.maps_url;
  if (c?.lat != null && c?.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  }
  const dest = c?.address ?? data.teeTime.course_name;
  if (dest) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  return null;
}

export function FillSpotClient({ token, data, groupTz, loggedInUser: serverLoggedInUser }: { token: string; data: HubData; groupTz: string; loggedInUser: LoggedInUser | null }) {
  const router = useRouter();
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(serverLoggedInUser);
  // Access token for cases where session was detected client-side but cookies aren't synced yet
  const [clientAccessToken, setClientAccessToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [justAccepted, setJustAccepted] = useState(false);
  const [error, setError] = useState("");

  // Client-side auth check — catches cases where browser has a session the server didn't see
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

  const roundOver = data.scores.length > 0;
  const spotOpen = data.open_spots > 0;
  // The claim UI shows only while the invite is still pending, there's room, and the round hasn't happened.
  const claimable = data.invite.status === "pending" && spotOpen && !data.is_past && !roundOver && !justAccepted;

  async function handleAcceptAsMember() {
    setLoading(true);
    setError("");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clientAccessToken) headers["Authorization"] = `Bearer ${clientAccessToken}`;
    const res = await fetch("/api/guest-invites/accept-as-member", {
      method: "POST", headers, body: JSON.stringify({ token }),
    });
    setLoading(false);
    const result = await res.json();
    if (res.ok) {
      setJustAccepted(true);
      router.refresh();
    } else if (result.error === "already_claimed" || result.error === "no_spots") {
      setError("Sorry — this spot was just taken by someone else.");
      router.refresh();
    } else {
      setError(result.error ?? "Something went wrong");
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
      setJustAccepted(true);
      router.refresh();
    } else if (result.error === "already_claimed" || result.error === "no_spots") {
      setError("Sorry — this spot was just taken by someone else.");
      router.refresh();
    } else {
      setError(result.error ?? "Something went wrong");
    }
  }

  function downloadIcs() {
    const ics = buildIcsContent({
      summary: `Golf - ${data.teeTime.course_name}`,
      description: `Tee time with ${data.group_name}`,
      location: data.course?.address ?? data.teeTime.course_name,
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

  const dirUrl = directionsUrl(data);

  // ── Status banner shown above the details when not in the claim flow ──────
  function statusBanner() {
    if (claimable) return null;
    if (justAccepted || data.invite.status === "accepted") {
      return (
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 mb-6" style={{ background: "rgba(48,209,88,0.12)", border: "0.5px solid rgba(48,209,88,0.3)" }}>
          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0">
            <Check size={18} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-white">{roundOver ? "Thanks for playing!" : "You're in — see you at the course"}</p>
        </div>
      );
    }
    if (roundOver) return null; // results speak for themselves
    if (data.is_past) {
      return (
        <div className="rounded-2xl px-4 py-3.5 mb-6 text-sm text-slate-400" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
          This tee time has passed.
        </div>
      );
    }
    if (!spotOpen) {
      return (
        <div className="rounded-2xl px-4 py-3.5 mb-6 text-sm text-slate-400" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
          This tee time is full — but you can still see the details below.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="max-w-sm mx-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">⛳</div>
          <h1 className="text-2xl font-bold text-white">{data.teeTime.course_name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {claimable && data.invite.inviter_name
              ? `${data.invite.inviter_name} invited you to join ${data.group_name}`
              : data.group_name}
          </p>
        </div>

        {statusBanner()}

        {/* ── Tee time details ───────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3 mb-4">
          <div className="flex items-center gap-3 text-slate-300">
            <Clock size={16} className="text-slate-500 shrink-0" />
            <span>{formatTeeDateLong(data.teeTime.tee_datetime, groupTz)} at {formatTeeTime(data.teeTime.tee_datetime, groupTz)}</span>
          </div>
          <div className="flex items-center gap-3 text-slate-300">
            <Flag size={16} className="text-slate-500 shrink-0" />
            <span>
              {data.teeTime.holes} holes
              {data.teeTime.format ? ` · ${FORMAT_LABELS[data.teeTime.format] ?? data.teeTime.format}` : ""}
            </span>
          </div>
          {claimable && (
            <div className="flex items-center gap-3 text-slate-300">
              <Users size={16} className="text-slate-500 shrink-0" />
              <span>{data.open_spots} open spot{data.open_spots !== 1 ? "s" : ""} remaining</span>
            </div>
          )}
        </div>

        {/* ── Directions ─────────────────────────────────────────────────── */}
        {dirUrl && (
          <a
            href={dirUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-slate-900 rounded-2xl border border-slate-800 px-4 py-4 mb-4 active:opacity-60 transition-opacity"
          >
            <MapPin size={18} className="text-green-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Get directions</p>
              {data.course?.address && <p className="text-xs text-slate-500 truncate">{data.course.address}</p>}
            </div>
          </a>
        )}

        {/* ── Claim flow (still pending & room available) ─────────────────── */}
        {claimable && (loggedInUser ? (
          <div className="mb-6">
            <p className="text-slate-400 text-sm text-center mb-3">
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
        ) : (
          <form onSubmit={handleAccept} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Your name</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="John Smith" required autoFocus
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-base"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">
                Email <span className="text-slate-600">(optional — for reminders)</span>
              </label>
              <input
                type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 text-base"
              />
              <p className="text-xs text-slate-600 mt-1.5">We&apos;ll send you a reminder 24h and 2h before your tee time</p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg transition-colors"
            >
              {loading ? "Reserving spot…" : "Accept tee time"}
            </button>
            <p className="text-slate-600 text-xs text-center">First to accept gets the spot. No account needed.</p>
          </form>
        ))}

        {/* ── Add to calendar (accepted guests, upcoming round) ──────────── */}
        {(justAccepted || data.invite.status === "accepted") && !roundOver && !loggedInUser && (
          <button
            onClick={downloadIcs}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 text-white font-semibold py-3.5 rounded-xl text-sm mb-6 active:opacity-60 transition-opacity"
          >
            <CalendarPlus size={16} className="text-green-500" /> Add to calendar
          </button>
        )}

        {/* ── Who's playing ──────────────────────────────────────────────── */}
        {data.players.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1 text-slate-500">
              {data.is_past || roundOver ? "Who played" : "Who's playing"}
            </p>
            <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
              {data.players.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: i === data.players.length - 1 ? "none" : "0.5px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: p.kind === "guest" ? "rgba(48,209,88,0.15)" : "rgba(255,255,255,0.08)", color: p.kind === "guest" ? "#30D158" : "#fff" }}>
                      {p.name[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className="text-sm font-medium text-white truncate">
                      {p.name}
                      {p.kind === "guest" && <span className="text-xs ml-1.5 text-slate-500">guest</span>}
                    </span>
                  </div>
                  {p.handicap != null && <span className="text-xs text-slate-500 shrink-0">HCP {p.handicap}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Results (round played) ─────────────────────────────────────── */}
        {roundOver && (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: "#C9A84C" }}>Results</p>
            <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
              {data.scores.map((s, i) => (
                <div key={i} className="flex items-center px-4 py-3" style={{ borderBottom: i === data.scores.length - 1 ? "none" : "0.5px solid rgba(255,255,255,0.06)" }}>
                  <span className="text-xs font-bold text-slate-500 w-5 shrink-0">{i + 1}</span>
                  {i === 0 ? <Trophy size={13} style={{ color: "#C9A84C" }} className="mr-1.5 shrink-0" /> : <div className="w-[19px] shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{s.name}</p>
                    {s.handicap != null && (
                      <p className="text-xs text-slate-500">HCP {s.handicap}{s.net != null ? ` · Net ${s.net}` : ""}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-white text-lg">{s.gross}</p>
                    {s.net != null && s.handicap != null && <p className="text-xs text-slate-500">Net {s.net}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Grow-the-app CTA ───────────────────────────────────────────── */}
        {!loggedInUser && (
          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <p className="text-sm font-semibold text-white mb-1">Play golf with your crew?</p>
            <p className="text-xs text-slate-500 mb-4 max-w-[16rem] mx-auto">
              Start your own GolfPack — create a group, invite your friends, and run your own tee times.
            </p>
            <a
              href="/login?mode=signup&next=/group/setup"
              className="inline-block bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors"
            >
              Create your group — free
            </a>
            <p className="text-slate-600 text-xs mt-3">
              Already a member?{" "}
              <a href={`/login?next=/fill/${token}`} className="text-green-500 font-medium hover:text-green-400">Log in</a>
            </p>
          </div>
        )}

        {loggedInUser && (
          <div className="mt-6 text-center">
            <a href="/upcoming" className="text-sm text-green-500 font-medium hover:text-green-400">View in app →</a>
          </div>
        )}
      </div>
    </div>
  );
}
