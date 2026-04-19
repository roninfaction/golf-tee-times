"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyInviteButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 text-sm font-semibold"
      style={{ color: copied ? "#30D158" : "rgba(255,255,255,0.7)" }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? "Link copied!" : "Copy invite link"}
    </button>
  );
}
