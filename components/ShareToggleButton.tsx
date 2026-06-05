"use client";

import { useState } from "react";
import { Share2, Copy, Check, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";

interface Props {
  teeTimeId: string;
  initialIsShareable: boolean;
  shareUrl: string;
}

export function ShareToggleButton({ teeTimeId, initialIsShareable, shareUrl }: Props) {
  const [isShareable, setIsShareable] = useState(initialIsShareable);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function toggle() {
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/tee-times/${teeTimeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ is_shareable: !isShareable }),
    });
    setIsShareable(v => !v);
    setLoading(false);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (!isShareable) {
    return (
      <button
        onClick={toggle}
        disabled={loading}
        className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-medium transition-opacity"
        style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}`, color: "rgba(255,255,255,0.6)", opacity: loading ? 0.5 : 1 }}
      >
        <span className="flex items-center gap-2">
          <Share2 size={16} style={{ color: "#30D158" }} />
          {loading ? "Enabling…" : "Share results"}
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "0.5px solid rgba(80,200,110,0.10)" }}>
        <Share2 size={15} style={{ color: "#30D158", flexShrink: 0 }} />
        <p className="text-sm font-medium text-white flex-1">Results shared</p>
        <button
          onClick={toggle}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: "rgba(255,255,255,0.35)", opacity: loading ? 0.5 : 1 }}
        >
          <EyeOff size={12} />
          {loading ? "…" : "Stop sharing"}
        </button>
      </div>
      <button
        onClick={copyLink}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm"
        style={{ color: copied ? "#30D158" : "rgba(255,255,255,0.6)" }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "Link copied!" : "Copy share link"}
      </button>
    </div>
  );
}
