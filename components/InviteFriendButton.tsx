"use client";

import { useState } from "react";
import { Copy, Check, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

const GOLD = "#C9A84C";

// Mints a reusable "join GolfPack" link the user can text to a friend. The
// friend signs up and gets their OWN group (they become admin) — this does NOT
// add them to any of the inviter's groups.
export function InviteFriendButton() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function createLink() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Session expired — sign in again."); return; }
      const res = await fetch("/api/app-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? `Error ${res.status}`); return; }
      setUrl(body.url);
      // Prefer the native share sheet on mobile; fall back to copy.
      if (navigator.share) {
        try {
          await navigator.share({ title: "GolfPack", text: "Join me on GolfPack — set up tee times for your own crew.", url: body.url });
        } catch {
          // User dismissed the share sheet; the link stays on screen to copy.
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
        Invite a friend to GolfPack. They&apos;ll create their own group and run tee times for their own crew — this doesn&apos;t add them to any of your groups.
      </p>

      {!url ? (
        <button
          onClick={createLink}
          disabled={loading}
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: "rgba(255,255,255,0.7)", opacity: loading ? 0.6 : 1 }}
        >
          <UserPlus size={15} />
          {loading ? "Creating link…" : "Create invite link"}
        </button>
      ) : (
        <>
          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(201,168,76,0.12)", border: "0.5px solid rgba(201,168,76,0.25)" }}>
            <p className="font-mono text-xs break-all" style={{ color: GOLD }}>{url}</p>
          </div>
          <button onClick={copyLink} className="flex items-center gap-2 text-sm font-semibold" style={{ color: copied ? "#30D158" : "rgba(255,255,255,0.7)" }}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied!" : "Copy link"}
          </button>
        </>
      )}

      {error && <p className="text-sm" style={{ color: "#FF453A" }}>{error}</p>}
    </div>
  );
}
