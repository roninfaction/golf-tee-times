"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

export function DeleteTeeTimeButton({ teeTimeId }: { teeTimeId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`/api/tee-times/${teeTimeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    window.location.href = "/upcoming";
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Delete this tee time?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-sm font-semibold"
          style={{ color: "#FF453A", opacity: loading ? 0.5 : 1 }}
        >
          {loading ? "Deleting…" : "Delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-sm"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 text-sm"
      style={{ color: "rgba(255,69,58,0.6)" }}
    >
      <Trash2 size={14} />
      Delete tee time
    </button>
  );
}
