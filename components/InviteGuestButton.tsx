"use client";

import { useState } from "react";
import { UserPlus, Copy, Check } from "lucide-react";

export function InviteGuestButton({
  teeTimeId,
  openSpots,
}: {
  teeTimeId: string;
  openSpots: number;
}) {
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function generateLink() {
    setLoading(true);
    setError("");

    const res = await fetch("/api/guest-invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
      <p className="text-sm font-semibold text-slate-400 mb-3">
        Invite someone to fill a spot
        <span className="text-slate-600 font-normal ml-1">({openSpots} open)</span>
      </p>

      {!link ? (
        <>
          <button
            onClick={generateLink}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors w-full justify-center"
          >
            <UserPlus size={16} />
            {loading ? "Generating link…" : "Generate invite link"}
          </button>
          <p className="text-slate-600 text-xs mt-2 text-center">
            They don&apos;t need an account — just click and accept.
          </p>
        </>
      ) : (
        <>
          <div className="bg-slate-800 rounded-xl p-3 mb-3">
            <p className="text-green-400 text-xs font-mono break-all">{link}</p>
          </div>
          <button
            onClick={copyLink}
            className="flex items-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors justify-center"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied!" : "Copy link"}
          </button>
          <p className="text-slate-600 text-xs mt-2 text-center">
            Send via iMessage, WhatsApp, email — your choice.
            First to accept gets the spot.
          </p>
          <button
            onClick={generateLink}
            className="text-slate-500 text-xs mt-2 w-full text-center underline"
          >
            Generate another link
          </button>
        </>
      )}

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}
