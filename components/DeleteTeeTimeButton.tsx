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
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">Delete this tee time?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-red-400 text-sm font-semibold hover:text-red-300 disabled:opacity-50"
        >
          {loading ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-slate-500 text-sm hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 text-slate-600 hover:text-red-400 text-sm transition-colors"
    >
      <Trash2 size={14} />
      Delete
    </button>
  );
}
