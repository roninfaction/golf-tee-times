"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { pacificToUtcIso } from "@/lib/timezone";
import { CourseAutocomplete } from "@/components/CourseAutocomplete";
import type { CourseDetails } from "@/lib/google-places";
import type { TeeTime } from "@/lib/types";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

function utcToLocalParts(isoStr: string): { date: string; time: string } {
  const d = new Date(isoStr);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`,
  };
}

export default function EditTeeTimePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [courseName, setCourseName] = useState("");
  const [coursePlaceId, setCoursePlaceId] = useState<string | null>(null);
  const [courseDetails, setCourseDetails] = useState<CourseDetails | null>(null);
  const [teeDate, setTeeDate] = useState("");
  const [teeTime, setTeeTime] = useState("08:00");
  const [holes, setHoles] = useState<9 | 18>(18);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [notes, setNotes] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const res = await fetch(`/api/tee-times/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { router.push(`/tee-times/${id}`); return; }

      const tt = await res.json() as TeeTime;

      // Guard: only creator should land here (API also enforces this on PATCH)
      if (tt.created_by !== session.user.id) { router.push(`/tee-times/${id}`); return; }

      const { date, time } = utcToLocalParts(tt.tee_datetime);
      setCourseName(tt.course_name);
      setCoursePlaceId(tt.course_place_id ?? null);
      setTeeDate(date);
      setTeeTime(time);
      setHoles(tt.holes);
      setMaxPlayers(tt.max_players);
      setNotes(tt.notes ?? "");
      setConfirmationNumber(tt.confirmation_number ?? "");
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const res = await fetch(`/api/tee-times/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({
        course_name: courseName,
        course_place_id: coursePlaceId ?? null,
        course_details: courseDetails ?? null,
        tee_datetime: pacificToUtcIso(teeDate, teeTime),
        holes,
        max_players: maxPlayers,
        notes: notes || null,
        confirmation_number: confirmationNumber || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      router.push(`/tee-times/${id}`);
    } else {
      const err = await res.json();
      setError(err.error ?? "Something went wrong");
    }
  }

  const fieldStyle = "w-full px-4 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-5 flex items-center gap-3" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href={`/tee-times/${id}`} style={{ color: "#30D158" }} className="flex items-center gap-0.5 text-sm font-medium">
          <ChevronLeft size={18} strokeWidth={2} />
          Cancel
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16">Edit Tee Time</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pt-6 space-y-6">
        {/* Course */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Course</p>
          <CourseAutocomplete
            value={courseName}
            onChange={(name, placeId, details) => {
              setCourseName(name);
              setCoursePlaceId(placeId);
              setCourseDetails(details);
            }}
          />
        </div>

        {/* Date and time */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Date & Time</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <input
              type="date"
              value={teeDate}
              onChange={(e) => setTeeDate(e.target.value)}
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
          disabled={saving}
          className="w-full py-4 rounded-2xl text-base font-semibold text-black transition-opacity"
          style={{ background: "#30D158", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
