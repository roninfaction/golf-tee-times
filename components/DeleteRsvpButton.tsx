"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function DeleteRsvpButton({ rsvpId }: { rsvpId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/rsvps", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rsvpId }),
    });
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs font-semibold"
          style={{ color: "#FF453A", opacity: loading ? 0.5 : 1 }}
        >
          {loading ? "…" : "Remove"}
        </button>
        <button onClick={() => setConfirming(false)} className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="shrink-0 p-1"
      style={{ color: "rgba(255,69,58,0.4)" }}
    >
      <X size={14} />
    </button>
  );
}
