import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { formatTeeDateLong, formatTeeTime } from "@/lib/format";
import { RsvpButtons } from "@/components/RsvpButtons";
import { InviteGuestButton } from "@/components/InviteGuestButton";
import { InviteGroupButton } from "@/components/InviteGroupButton";
import { DeleteTeeTimeButton } from "@/components/DeleteTeeTimeButton";
import { ChevronLeft, Clock, Flag, Users, Hash, FileText, Phone, Globe, MapPin } from "lucide-react";
import Link from "next/link";
import type { TeeTime, Rsvp, GuestInvite, Profile, Course } from "@/lib/types";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

const statusConfig = {
  accepted: { bg: "rgba(48,209,88,0.15)", color: "#30D158", label: "Going" },
  declined: { bg: "rgba(255,69,58,0.12)", color: "#FF453A", label: "Can't go" },
  pending:  { bg: "rgba(201,168,76,0.15)", color: GOLD, label: "Pending" },
};

function Avatar({ name, avatarUrl, size = 8 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const initials = name?.[0]?.toUpperCase() ?? "?";
  const dim = `${size * 4}px`;
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: dim, height: dim }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
      style={{ width: dim, height: dim, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
    >
      {initials}
    </div>
  );
}

type PageProps = { params: Promise<{ id: string }> };

export default async function TeeTimeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: tt } = await svc
    .from("tee_times")
    .select(`*, rsvps(*, profile:profiles(id, display_name, avatar_url)), guest_invites(*)`)
    .eq("id", id)
    .single();

  if (!tt) notFound();

  const teeTime = tt as TeeTime & { rsvps: (Rsvp & { profile: Profile })[]; guest_invites: GuestInvite[] };

  // Access guard: user must be creator or have an RSVP
  const hasAccess =
    teeTime.created_by === user.id ||
    teeTime.rsvps.some((r) => r.user_id === user.id);
  if (!hasAccess) notFound();

  // Fetch linked course if available
  let course: Course | null = null;
  if (teeTime.course_place_id) {
    const { data: courseData } = await svc
      .from("courses")
      .select("*")
      .eq("place_id", teeTime.course_place_id)
      .maybeSingle();
    course = courseData as Course | null;
  }

  const isPast = new Date(teeTime.tee_datetime) < new Date();
  const myRsvp = teeTime.rsvps.find((r) => r.user_id === user.id);

  const acceptedGroup = teeTime.rsvps.filter((r) => r.status === "accepted");
  const acceptedGuests = teeTime.guest_invites.filter((g) => g.status === "accepted");
  const pendingGuests = teeTime.guest_invites.filter((g) => g.status === "pending");
  const totalAccepted = acceptedGroup.length + acceptedGuests.length;
  const openSpots = Math.max(0, teeTime.max_players - totalAccepted);

  const backHref = isPast ? "/past" : "/upcoming";

  return (
    <div className="min-h-screen pb-52">
      {/* Hero header */}
      <div className="relative pb-6" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        {course?.photo_uri ? (
          <>
            <div className="relative h-56 w-full">
              <img src={course.photo_uri} alt={teeTime.course_name} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.82) 100%)" }} />
            </div>
            <div className="absolute top-0 left-0 right-0 px-4 pt-12">
              <div className="flex items-center justify-between mb-4">
                <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
                  <ChevronLeft size={18} strokeWidth={2} />
                  {isPast ? "History" : "Schedule"}
                </Link>
                {!isPast && teeTime.created_by === user.id && (
                  <Link href={`/tee-times/${teeTime.id}/edit`} className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
                    Edit
                  </Link>
                )}
              </div>
            </div>
            <div className="px-4 pt-3">
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
          </>
        ) : (
          <div className="px-4 pt-12">
            <div className="flex items-center justify-between mb-4">
              <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: "#30D158" }}>
                <ChevronLeft size={18} strokeWidth={2} />
                {isPast ? "History" : "Schedule"}
              </Link>
              {!isPast && teeTime.created_by === user.id && (
                <Link href={`/tee-times/${teeTime.id}/edit`} className="text-sm font-medium" style={{ color: GOLD }}>
                  Edit
                </Link>
              )}
            </div>
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

        {/* Course info card */}
        {course && (course.phone || course.website || course.maps_url) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Course info</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {course.phone && (
                <a
                  href={`tel:${course.phone}`}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderBottom: (course.website || course.maps_url) ? `0.5px solid ${DIVIDER}` : "none" }}
                >
                  <Phone size={15} style={{ color: GOLD, flexShrink: 0 }} />
                  <span className="text-sm text-white">{course.phone}</span>
                </a>
              )}
              {course.website && (
                <a
                  href={course.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderBottom: course.maps_url ? `0.5px solid ${DIVIDER}` : "none" }}
                >
                  <Globe size={15} style={{ color: GOLD, flexShrink: 0 }} />
                  <span className="text-sm text-white truncate">{course.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                </a>
              )}
              {course.maps_url && (
                <a
                  href={course.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <MapPin size={15} style={{ color: GOLD, flexShrink: 0 }} />
                  <span className="text-sm text-white">Get directions</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* RSVP — only for future tee times where user has an RSVP row */}
        {!isPast && myRsvp && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Your response</p>
            <RsvpButtons
              teeTimeId={teeTime.id}
              currentStatus={myRsvp.status}
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
                    <Avatar
                      name={rsvp.profile?.display_name ?? "?"}
                      avatarUrl={(rsvp.profile as Profile & { avatar_url?: string | null })?.avatar_url}
                    />
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
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "rgba(48,209,88,0.15)", color: "#30D158" }}>
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

        {/* Invite Group — creator only, future tee times */}
        {!isPast && teeTime.created_by === user.id && (
          <InviteGroupButton teeTimeId={teeTime.id} />
        )}

        {/* Invite guest — open spots only */}
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
