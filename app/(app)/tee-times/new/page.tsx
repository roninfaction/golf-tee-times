"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { localToUtcIso } from "@/lib/timezone";
import { CourseAutocomplete } from "@/components/CourseAutocomplete";
import type { CourseDetails } from "@/lib/google-places";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

export default function NewTeeTimePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupTz, setGroupTz] = useState("America/Los_Angeles");
  const [defaultInterval, setDefaultInterval] = useState(10);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  // After first creation: id of the created tee time + list of linked ones
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [addingLinked, setAddingLinked] = useState(false);

  useEffect(() => {
    const cookieMatch = document.cookie.match(/golfpack_active_group=([^;]+)/);
    const cookieGroupId = cookieMatch ? cookieMatch[1] : null;
    setActiveGroupId(cookieGroupId);

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      let q = supabase
        .from("group_members")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("group_id, group:groups(timezone,default_tee_interval)")
        .eq("user_id", session.user.id);
      if (cookieGroupId) q = (q as typeof q).eq("group_id", cookieGroupId);
      else q = (q as typeof q).order("joined_at", { ascending: true });
      q.maybeSingle().then(({ data }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const g = (data as any)?.group;
          if (g?.timezone) setGroupTz(g.timezone);
          if (g?.default_tee_interval) setDefaultInterval(g.default_tee_interval);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!cookieGroupId && (data as any)?.group_id) setActiveGroupId((data as any).group_id);
        });
    });
  }, []);

  const [courseName, setCourseName] = useState("");
  const [coursePlaceId, setCoursePlaceId] = useState<string | null>(null);
  const [courseDetails, setCourseDetails] = useState<CourseDetails | null>(null);
  const [teeDate, setTeeDate] = useState("");
  const [teeTime, setTeeTime] = useState("08:00");
  const [holes, setHoles] = useState<9 | 18>(18);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [notes, setNotes] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");

  async function postTeeTime(parentId: string | null, datetime: string, slotOrder: number) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return fetch("/api/tee-times", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({
        course_name: courseName,
        course_place_id: coursePlaceId ?? null,
        course_details: courseDetails ?? null,
        tee_datetime: datetime,
        holes,
        max_players: maxPlayers,
        notes: notes || null,
        confirmation_number: confirmationNumber || null,
        parent_tee_time_id: parentId,
        slot_order: slotOrder,
        group_id: activeGroupId,
      }),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const datetime = localToUtcIso(teeDate, teeTime, groupTz);
    const res = await postTeeTime(null, datetime, 0);
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setCreatedId(data.id);
      setLinkedIds([data.id]);
    } else {
      const err = await res.json();
      setError(err.error ?? "Something went wrong");
    }
  }

  async function addLinkedSlot(intervalMin: number) {
    if (!createdId || linkedIds.length >= 6) return;
    setAddingLinked(true);
    // Compute time of next slot based on the last linked slot
    const lastUtc = new Date(localToUtcIso(teeDate, teeTime, groupTz));
    lastUtc.setMinutes(lastUtc.getMinutes() + intervalMin * linkedIds.length);
    const res = await postTeeTime(createdId, lastUtc.toISOString(), linkedIds.length);
    setAddingLinked(false);
    if (res.ok) {
      const data = await res.json();
      setLinkedIds(prev => [...prev, data.id]);
    }
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, "0"),
    String(tomorrow.getDate()).padStart(2, "0"),
  ].join("-");

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
          <CourseAutocomplete
            value={courseName}
            onChange={(name, placeId, details) => {
              setCourseName(name);
              setCoursePlaceId(placeId);
              setCourseDetails(details);
            }}
            autoFocus
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
            {[2, 3, 4, 5].map((n) => (
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

        {!createdId ? (
          <>
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
          </>
        ) : (
          <div className="space-y-4">
            {/* Slot list */}
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {linkedIds.map((lid, i) => (
                <div key={lid} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: i < linkedIds.length - 1 ? `0.5px solid ${DIVIDER}` : "none" }}>
                  <span className="text-sm text-white">Slot {i + 1}</span>
                  <span className="text-xs font-semibold" style={{ color: "#30D158" }}>Added ✓</span>
                </div>
              ))}
            </div>

            {/* Add another slot */}
            {linkedIds.length < 6 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
                  Add another tee time
                </p>
                <div className="flex gap-2">
                  {[8, 10, 12, 15].map(n => (
                    <button
                      key={n}
                      type="button"
                      disabled={addingLinked}
                      onClick={() => addLinkedSlot(n)}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold"
                      style={{
                        background: defaultInterval === n ? "rgba(201,168,76,0.15)" : CARD_BG,
                        border: `0.5px solid ${defaultInterval === n ? "rgba(201,168,76,0.4)" : CARD_BORDER}`,
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      +{n}m
                    </button>
                  ))}
                </div>
                {addingLinked && <p className="text-xs mt-2 px-1" style={{ color: "rgba(255,255,255,0.35)" }}>Adding slot…</p>}
              </div>
            )}

            {/* Done */}
            <button
              type="button"
              onClick={() => router.push(`/tee-times/${createdId}`)}
              className="w-full py-4 rounded-2xl text-base font-semibold text-black"
              style={{ background: "#30D158" }}
            >
              Done — view tee time{linkedIds.length > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
