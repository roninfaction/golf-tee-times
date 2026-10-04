"use client";

import { useState } from "react";
import { ChevronLeft, Share2, Copy, Check } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfpack.app";

export default function GroupSetupPage() {
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Set once the group exists: the next step is getting people into it, not an empty schedule.
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function shareInvite() {
    if (!inviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: groupName, text: `Join ${groupName} on GolfPack so you see our tee times.`, url: inviteUrl });
        return;
      } catch {
        // Share sheet dismissed: the copy button is right there.
      }
    }
    await copyInvite();
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Session expired — please sign in again."); setLoading(false); return; }
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: groupName }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setInviteUrl(body.invite_code ? `${APP_URL}/invite/${body.invite_code}` : null);
        if (!body.invite_code) window.location.href = "/upcoming";
      } else {
        setError(body.error ?? `Error ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (inviteUrl) {
    return (
      <div className="min-h-screen pb-52">
        <div className="px-4 pt-safe-top pb-5" style={{ borderBottom: "0.5px solid rgba(80,200,110,0.10)" }}>
          <h1 className="text-[17px] font-semibold text-white text-center">Add your crew</h1>
        </div>
        <div className="px-4 pt-8 space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
            <span className="text-white font-semibold">{groupName}</span> is ready. Text your friends the invite link so they see your tee times and can say they&apos;re in.
          </p>
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(201,168,76,0.10)", border: "0.5px solid rgba(201,168,76,0.22)" }}>
            <p className="text-xs font-mono break-all" style={{ color: "#C9A84C" }}>{inviteUrl}</p>
          </div>
          <button
            onClick={shareInvite}
            className="w-full py-4 rounded-2xl text-base font-semibold text-black flex items-center justify-center gap-2"
            style={{ background: "#30D158" }}
          >
            <Share2 size={18} /> Send the invite
          </button>
          <button
            onClick={copyInvite}
            className="w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: "rgba(255,255,255,0.07)", color: copied ? "#30D158" : "rgba(255,255,255,0.7)" }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Link copied" : "Copy link"}
          </button>
          <button
            onClick={() => { window.location.href = "/upcoming"; }}
            className="w-full py-3 text-sm font-medium"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            Done, take me to the schedule
          </button>
          <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
            The link also lives on your Group tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-safe-top pb-5 flex items-center gap-3" style={{ borderBottom: "0.5px solid rgba(80,200,110,0.10)" }}>
        <Link href="/upcoming" className="flex items-center gap-0.5 text-sm font-medium" style={{ color: "#30D158" }}>
          <ChevronLeft size={18} strokeWidth={2} />
          Cancel
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16 pointer-events-none">New Group</h1>
      </div>

      <div className="px-4 pt-8">
        <p className="text-sm leading-relaxed mb-6" style={{ color: "rgba(255,255,255,0.45)" }}>
          Give your golf crew a name. You&apos;ll be the admin and can invite others with a shareable link.
        </p>

        <form onSubmit={createGroup} className="space-y-4">
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.055)", border: "0.5px solid rgba(80,200,110,0.16)" }}>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="The Weekend Hackers"
              required
              autoFocus
              className="w-full px-4 py-3.5 text-white text-[15px] bg-transparent outline-none placeholder:text-white/20"
            />
          </div>

          {error && <p className="text-sm px-1" style={{ color: "#FF453A" }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl text-base font-semibold text-black transition-opacity"
            style={{ background: "#30D158", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Creating…" : "Create Group"}
          </button>
        </form>
      </div>
    </div>
  );
}
