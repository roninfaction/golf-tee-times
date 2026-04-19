import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { formatTeeDateLong, formatTeeTime } from "@/lib/format";
import { RsvpButtons } from "@/components/RsvpButtons";
import { InviteGuestButton } from "@/components/InviteGuestButton";
import { DeleteTeeTimeButton } from "@/components/DeleteTeeTimeButton";
import { ChevronLeft, Clock, Flag, Users, Hash, FileText } from "lucide-react";
import Link from "next/link";
import type { TeeTime, Rsvp, GuestInvite, Profile } from "@/lib/types";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

const statusConfig = {
  accepted: { bg: "rgba(48,209,88,0.15)", color: "#30D158", label: "Going" },
  declined: { bg: "rgba(255,69,58,0.12)", color: "#FF453A", label: "Can't go" },
  pending:  { bg: "rgba(201,168,76,0.15)", color: GOLD, label: "Pending" },
};

type PageProps = { params: Promise<{ id: string }> };

export default async function TeeTimeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: tt } = await svc
    .from("tee_times")
    .select(`*, rsvps(*, profile:profiles(id, display_name)), guest_invites(*)`)
    .eq("id", id)
    .single();

  if (!tt) notFound();

  const teeTime = tt as TeeTime & { rsvps: (Rsvp & { profile: Profile })[]; guest_invites: GuestInvite[] };

  const isPast = new Date(teeTime.tee_datetime) < new Date();

  // Auto-create a pending RSVP for group members who joined after this tee time was created
  let myRsvp = teeTime.rsvps.find((r) => r.user_id === user.id);
  if (!myRsvp && !isPast) {
    const { data: newRsvp } = await svc
      .from("rsvps")
      .upsert({ tee_time_id: teeTime.id, user_id: user.id, status: "pending" }, { onConflict: "tee_time_id,user_id" })
      .select("*, profile:profiles(id, display_name)")
      .single();
    if (newRsvp) {
      teeTime.rsvps.push(newRsvp as Rsvp & { profile: Profile });
      myRsvp = newRsvp as Rsvp & { profile: Profile };
    }
  }

  const acceptedGroup = teeTime.rsvps.filter((r) => r.status === "accepted");
  const acceptedGuests = teeTime.guest_invites.filter((g) => g.status === "accepted");
  const pendingGuests = teeTime.guest_invites.filter((g) => g.status === "pending");
  const totalAccepted = acceptedGroup.length + acceptedGuests.length;
  const openSpots = Math.max(0, teeTime.max_players - totalAccepted);

  const backHref = isPast ? "/past" : "/upcoming";

  return (
    <div className="min-h-screen pb-52">
      {/* Hero header */}
      <div className="px-4 pt-12 pb-6" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href={backHref} className="inline-flex items-center gap-1 mb-4 text-sm font-medium" style={{ color: "#30D158" }}>
          <ChevronLeft size={18} strokeWidth={2} />
          {isPast ? "History" : "Schedule"}
        </Link>
        <h1 className="text-[26px] font-bold text-white tracking-tight leading-tight mb-1">{teeTime.course_name}</h1>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          {formatTeeDateLong(teeTime.tee_datetime)} at {formatTeeTime(teeTime.tee_datetime)}
        </p>
        {isPast && (
          <span className="inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(201,168,76,0.15)", color: GOLD }}>
            Past tee time
          </span>
        )}
      </div>

      <div className="px-4 pt-5 space-y-4">

        {/* Details card */}
        <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
            <Clock size={15} style={{ color: GOLD, flexShrink: 0 }} />
            <span className="text-sm text-white">{formatTeeDateLong(teeTime.tee_datetime)} at {formatTeeTime(teeTime.tee_datetime)}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
            <Flag size={15} style={{ color: GOLD, flexShrink: 0 }} />
            <span className="text-sm text-white">{teeTime.holes} holes</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: (teeTime.confirmation_number || teeTime.notes) ? `0.5px solid ${DIVIDER}` : "none" }}>
            <Users size={15} style={{ color: GOLD, flexShrink: 0 }} />
            <span className="text-sm text-white">
              {totalAccepted} of {teeTime.max_players} confirmed
              {openSpots > 0 && <span style={{ color: "rgba(255,255,255,0.35)" }}> · {openSpots} spot{openSpots !== 1 ? "s" : ""} open</span>}
            </span>
          </div>
          {teeTime.confirmation_number && (
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: teeTime.notes ? `0.5px solid ${DIVIDER}` : "none" }}>
              <Hash size={15} style={{ color: GOLD, flexShrink: 0 }} />
              <span className="text-sm text-white font-mono">{teeTime.confirmation_number}</span>
            </div>
          )}
          {teeTime.notes && (
            <div className="flex items-start gap-3 px-4 py-3.5">
              <FileText size={15} style={{ color: GOLD, flexShrink: 0, marginTop: 1 }} />
              <span className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>{teeTime.notes}</span>
            </div>
          )}
        </div>

        {/* RSVP — only for future tee times */}
        {!isPast && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Your response</p>
            <RsvpButtons
              teeTimeId={teeTime.id}
              currentStatus={myRsvp?.status ?? "pending"}
            />
          </div>
        )}

        {/* Attendees */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
            {isPast ? "Who played" : "Who's going"}
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {teeTime.rsvps.map((rsvp, i) => {
              const cfg = statusConfig[rsvp.status];
              const isLast = i === teeTime.rsvps.length - 1 && acceptedGuests.length === 0;
              return (
                <div key={rsvp.id} className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}>
                      {rsvp.profile?.display_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className="text-sm font-medium text-white">
                      {rsvp.profile?.display_name ?? "Unknown"}
                      {rsvp.user_id === user.id && <span className="text-xs ml-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>you</span>}
                    </span>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
              );
            })}

            {acceptedGuests.map((guest, i) => {
              const isLast = i === acceptedGuests.length - 1;
              return (
                <div key={guest.id} className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: "rgba(48,209,88,0.15)", color: "#30D158" }}>
                      {guest.accepted_name?.[0]?.toUpperCase() ?? "G"}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white">{guest.accepted_name ?? "Guest"}</span>
                      <span className="text-xs ml-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>guest</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(48,209,88,0.15)", color: "#30D158" }}>Going</span>
                </div>
              );
            })}

            {teeTime.rsvps.length === 0 && acceptedGuests.length === 0 && (
              <div className="px-4 py-4 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No responses yet</div>
            )}
          </div>

          {pendingGuests.length > 0 && (
            <p className="text-xs mt-2 px-1" style={{ color: "rgba(255,255,255,0.3)" }}>
              {pendingGuests.length} invite link{pendingGuests.length !== 1 ? "s" : ""} pending
            </p>
          )}
        </div>

        {/* Invite guest */}
        {!isPast && openSpots > 0 && (
          <InviteGuestButton teeTimeId={teeTime.id} openSpots={openSpots} />
        )}

        {/* Delete — creator only */}
        {teeTime.created_by === user.id && (
          <div className="pt-2">
            <DeleteTeeTimeButton teeTimeId={teeTime.id} />
          </div>
        )}
      </div>
    </div>
  );
}
