"use client";

import { useState } from "react";
import { UserPlus, Share2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { formatTeeDate, formatTeeTime, guestInviteHeadline } from "@/lib/format";

type Props = {
  teeTimeId: string;
  openSpots: number;
  courseName: string;
  teeDatetime: string;
  timezone: string;
  inviterName: string | null;
};

export function InviteGuestButton({ teeTimeId, openSpots, courseName, teeDatetime, timezone, inviterName }: Props) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generateLink() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/guest-invites", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ teeTimeId }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setLink(data.url);
    } else {
      const err = await res.json();
      setError(err.error ?? "Could not generate link");
    }
  }

  // The text goes out with the link so friends see who it's from, not a bare URL.
  async function shareInvite() {
    if (!link) return;
    const text = `${guestInviteHeadline(inviterName)} at ${courseName} on ${formatTeeDate(teeDatetime, timezone)} at ${formatTeeTime(teeDatetime, timezone)}.`;
    if (navigator.share) {
      try { await navigator.share({ text, url: link }); return; } catch { /* dismissed: fall through to copy */ }
    }
    await navigator.clipboard.writeText(`${text} ${link}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>
        Invite a guest · {openSpots} spot{openSpots !== 1 ? "s" : ""} open
      </p>

      {!link ? (
        <>
          <button
            onClick={generateLink}
            disabled={loading}
            className="flex items-center gap-2 w-full rounded-xl py-3 text-sm font-semibold justify-center transition-opacity"
            style={{ background: "rgba(48,209,88,0.12)", color: "#30D158", opacity: loading ? 0.6 : 1 }}
          >
            <UserPlus size={15} />
            {loading ? "Generating…" : "Create invite link"}
          </button>
          <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
            No account needed — they just click and accept
          </p>
        </>
      ) : (
        <>
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.06)" }}>
            <p className="font-mono text-xs break-all" style={{ color: "#30D158" }}>{link}</p>
          </div>
          <button
            onClick={shareInvite}
            className="flex items-center gap-2 w-full rounded-xl py-3 text-sm font-semibold justify-center transition-opacity"
            style={{ background: "#30D158", color: "#000" }}
          >
            {copied ? <Check size={15} /> : <Share2 size={15} />}
            {copied ? "Copied!" : "Share invite"}
          </button>
          <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
            Share this one link with everyone — it stays live until every spot is filled
          </p>
        </>
      )}

      {error && <p className="text-xs" style={{ color: "#FF453A" }}>{error}</p>}
    </div>
  );
}
