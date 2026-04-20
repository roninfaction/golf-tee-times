"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { pacificToUtcIso } from "@/lib/timezone";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

export default function NewTeeTimePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [courseName, setCourseName] = useState("");
  const [teeDate, setTeeDate] = useState("");
  const [teeTime, setTeeTime] = useState("08:00");
  const [holes, setHoles] = useState<9 | 18>(18);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [notes, setNotes] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/tee-times", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({
        course_name: courseName,
        tee_datetime: pacificToUtcIso(teeDate, teeTime),
        holes,
        max_players: maxPlayers,
        notes: notes || null,
        confirmation_number: confirmationNumber || null,
      }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/tee-times/${data.id}`);
    } else {
      const err = await res.json();
      setError(err.error ?? "Something went wrong");
    }
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  const fieldStyle = "w-full px-4 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20";

  return (
    <div className="min-h-screen pb-52">
      {/* Header */}
      <div className="px-4 pt-12 pb-5 flex items-center gap-3" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href="/upcoming" style={{ color: "#30D158" }} className="flex items-center gap-0.5 text-sm font-medium">
          <ChevronLeft size={18} strokeWidth={2} />
          Cancel
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16">New Tee Time</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pt-6 space-y-6">
        {/* Course */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Course</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Pine Valley Golf Club"
              required
              autoFocus
              className={fieldStyle}
            />
          </div>
        </div>

        {/* Date and time */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Date & Time</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <input
              type="date"
              value={teeDate}
              onChange={(e) => setTeeDate(e.target.value)}
              min={minDate}
              required
              className={fieldStyle}
              style={{ borderBottom: `0.5px solid ${DIVIDER}`, colorScheme: "dark" }}
            />
            <input
              type="time"
              value={teeTime}
              onChange={(e) => setTeeTime(e.target.value)}
              required
              className={fieldStyle}
              style={{ colorScheme: "dark" }}
            />
          </div>
        </div>

        {/* Holes */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Holes</p>
          <div className="flex gap-3">
            {([18, 9] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHoles(h)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: holes === h ? "#30D158" : CARD_BG,
                  color: holes === h ? "#000" : "rgba(255,255,255,0.5)",
                  border: holes === h ? "none" : `0.5px solid ${CARD_BORDER}`,
                }}
              >
                {h} holes
              </button>
            ))}
          </div>
        </div>

        {/* Max players */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Max players</p>
          <div className="flex gap-3">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMaxPlayers(n)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: maxPlayers === n ? "#30D158" : CARD_BG,
                  color: maxPlayers === n ? "#000" : "rgba(255,255,255,0.5)",
                  border: maxPlayers === n ? "none" : `0.5px solid ${CARD_BORDER}`,
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Optional fields */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
            Details <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>optional</span>
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <input
              type="text"
              value={confirmationNumber}
              onChange={(e) => setConfirmationNumber(e.target.value)}
              placeholder="Confirmation number"
              className={fieldStyle}
              style={{ borderBottom: `0.5px solid ${DIVIDER}` }}
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (cart included, check in early…)"
              rows={2}
              className={`${fieldStyle} resize-none`}
            />
          </div>
        </div>

        {error && <p className="text-sm px-1" style={{ color: "#FF453A" }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-2xl text-base font-semibold text-black transition-opacity"
          style={{ background: "#30D158", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Adding…" : "Add Tee Time"}
        </button>

        <p className="text-xs text-center pb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
          Got a confirmation email? Forward it to your GolfPack address in{" "}
          <a href="/profile" style={{ color: GOLD }}>Profile</a> instead.
        </p>
      </form>
    </div>
  );
}
