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
      className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? "Link copied!" : "Copy invite link"}
    </button>
  );
}
