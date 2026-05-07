"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function DeleteTeeTimeButton({
  teeTimeId,
  redirectTo = "/upcoming",
  compact = false,
}: {
  teeTimeId: string;
  redirectTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
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
    if (compact) {
      router.refresh();
    } else {
      router.push(redirectTo);
    }
  }

  if (compact) {
    if (confirming) {
      return (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDelete}
            disabled={loading}
            className="text-xs font-semibold"
            style={{ color: "#FF453A", opacity: loading ? 0.5 : 1 }}
          >
            {loading ? "…" : "Delete"}
          </button>
          <button onClick={() => setConfirming(false)} className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Cancel
          </button>
        </div>
      );
    }
    return (
      <button onClick={() => setConfirming(true)} className="shrink-0 p-1" style={{ color: "rgba(255,69,58,0.5)" }}>
        <Trash2 size={14} />
      </button>
    );
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
