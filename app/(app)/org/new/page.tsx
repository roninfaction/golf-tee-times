"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

export default function NewOrgPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [firstGroup, setFirstGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    // Create the org
    const orgRes = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim() || null }),
    });

    if (!orgRes.ok) {
      const err = await orgRes.json();
      setError(err.error ?? "Failed to create organization");
      setLoading(false);
      return;
    }

    const org = await orgRes.json();

    // Optionally create first group within the org
    if (firstGroup.trim()) {
      await fetch(`/api/orgs/${org.id}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: firstGroup.trim() }),
      });
    }

    router.push(`/org/${org.id}`);
  }

  const fieldStyle = "w-full px-4 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20";

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-5 flex items-center gap-3" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href="/groups" style={{ color: "#30D158" }} className="flex items-center gap-0.5 text-sm font-medium">
          <ChevronLeft size={18} strokeWidth={2} />
          Cancel
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16">New Organization</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pt-6 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Organization name</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Pebble Beach Golf Links"
              required
              className={fieldStyle}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
            URL slug <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, textTransform: "none" }}>optional</span>
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="pebble-beach-gc"
              className={fieldStyle}
            />
          </div>
          <p className="text-xs mt-1 px-1" style={{ color: "rgba(255,255,255,0.3)" }}>
            Used for your club&apos;s join page: golfpack.app/join/{slug || "your-slug"}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
            First group name <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, textTransform: "none" }}>optional</span>
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <input
              type="text"
              value={firstGroup}
              onChange={e => setFirstGroup(e.target.value)}
              placeholder="Men's Club"
              className={fieldStyle}
            />
          </div>
          <p className="text-xs mt-1 px-1" style={{ color: "rgba(255,255,255,0.3)" }}>
            You can add more groups later from the org dashboard.
          </p>
        </div>

        {error && <p className="text-sm px-1" style={{ color: "#FF453A" }}>{error}</p>}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full py-4 rounded-2xl text-base font-semibold text-black transition-opacity"
          style={{ background: "#30D158", opacity: loading || !name.trim() ? 0.5 : 1 }}
        >
          {loading ? "Creating…" : "Create Organization"}
        </button>
      </form>
    </div>
  );
}
