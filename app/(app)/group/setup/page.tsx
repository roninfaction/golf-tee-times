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
      if (!session) { setError("Session expired — please sign in again."); setLoading(false); return; }
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: groupName }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.href = "/upcoming";
      } else {
        setError(body.error ?? `Error ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-5 flex items-center gap-3" style={{ borderBottom: "0.5px solid rgba(80,200,110,0.10)" }}>
        <Link href="/upcoming" className="flex items-center gap-0.5 text-sm font-medium" style={{ color: "#30D158" }}>
          <ChevronLeft size={18} strokeWidth={2} />
          Cancel
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16">New Group</h1>
      </div>

      <div className="px-4 pt-8">
        <p className="text-sm leading-relaxed mb-6" style={{ color: "rgba(255,255,255,0.45)" }}>
          Give your golf crew a name. You'll be the admin and can invite others with a shareable link.
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
