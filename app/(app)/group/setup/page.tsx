"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

export default function GroupSetupPage() {
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError("Session expired — please sign out and sign in again.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: groupName }),
      });

      if (res.ok) {
        window.location.href = "/upcoming";
      } else {
        let msg = `Server error (${res.status})`;
        try {
          const err = await res.json();
          msg = err.error ?? msg;
        } catch { /* non-JSON response */ }
        setError(msg);
      }
    } catch (err) {
      setError(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/upcoming" className="text-slate-400 hover:text-white p-1 -ml-1">
          <ChevronLeft size={24} />
        </Link>
        <h1 className="text-xl font-bold text-white">Create your group</h1>
      </div>

      <p className="text-slate-400 text-sm mb-6 leading-relaxed">
        Give your golf crew a name. You&apos;ll be the admin and can invite others with a shareable link.
      </p>

      <form onSubmit={createGroup} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">Group name</label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="The Weekend Hackers"
            required
            autoFocus
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors"
        >
          {loading ? "Creating…" : "Create group"}
        </button>
      </form>
    </div>
  );
}
