import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { formatTeeDateLong, formatTeeTime } from "@/lib/format";
import { RsvpButtons } from "@/components/RsvpButtons";
import { InviteGuestButton } from "@/components/InviteGuestButton";
import { ChevronLeft, MapPin, Clock, Flag, Users, Hash, Mail } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import type { TeeTime, Rsvp, GuestInvite, Profile } from "@/lib/types";

const statusColors = {
  accepted: "bg-green-900/60 text-green-400",
  declined: "bg-red-900/40 text-red-400",
  pending: "bg-slate-800 text-slate-400",
};
const statusLabels = { accepted: "Going", declined: "Can't go", pending: "Pending" };

type PageProps = { params: Promise<{ id: string }> };

export default async function TeeTimeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: tt } = await svc
    .from("tee_times")
    .select(`
      *,
      rsvps(*, profile:profiles(id, display_name)),
      guest_invites(*)
    `)
    .eq("id", id)
    .single();

  if (!tt) notFound();

  const teeTime = tt as TeeTime & { rsvps: (Rsvp & { profile: Profile })[]; guest_invites: GuestInvite[] };

  const myRsvp = teeTime.rsvps.find((r) => r.user_id === user.id);
  const acceptedGroup = teeTime.rsvps.filter((r) => r.status === "accepted");
  const acceptedGuests = teeTime.guest_invites.filter((g) => g.status === "accepted");
  const pendingGuests = teeTime.guest_invites.filter((g) => g.status === "pending");
  const totalAccepted = acceptedGroup.length + acceptedGuests.length;
  const openSpots = Math.max(0, teeTime.max_players - totalAccepted);

  const isPast = new Date(teeTime.tee_datetime) < new Date();

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/upcoming" className="text-slate-400 hover:text-white p-1 -ml-1">
          <ChevronLeft size={24} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{teeTime.course_name}</h1>
          {teeTime.source === "email_parse" && (
            <span className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
              <Mail size={11} /> Added from email
            </span>
          )}
        </div>
      </div>

      {/* Details card */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3 mb-5">
        <div className="flex items-center gap-3 text-slate-300">
          <Clock size={16} className="text-slate-500 shrink-0" />
          <span className="font-medium">{formatTeeDateLong(teeTime.tee_datetime)} at {formatTeeTime(teeTime.tee_datetime)}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-300">
          <Flag size={16} className="text-slate-500 shrink-0" />
          <span>{teeTime.holes} holes</span>
        </div>
        <div className="flex items-center gap-3 text-slate-300">
          <Users size={16} className="text-slate-500 shrink-0" />
          <span>
            {totalAccepted}/{teeTime.max_players} confirmed
            {openSpots > 0 && (
              <span className="text-slate-500"> · {openSpots} open spot{openSpots !== 1 ? "s" : ""}</span>
            )}
          </span>
        </div>
        {teeTime.confirmation_number && (
          <div className="flex items-center gap-3 text-slate-300">
            <Hash size={16} className="text-slate-500 shrink-0" />
            <span>{teeTime.confirmation_number}</span>
          </div>
        )}
        {teeTime.notes && (
          <div className="flex items-start gap-3 text-slate-300">
            <MapPin size={16} className="text-slate-500 shrink-0 mt-0.5" />
            <span className="text-sm leading-relaxed">{teeTime.notes}</span>
          </div>
        )}
      </div>

      {/* My RSVP */}
      {!isPast && myRsvp && (
        <div className="mb-5">
          <p className="text-sm text-slate-500 mb-2">Are you going?</p>
          <RsvpButtons
            teeTimeId={teeTime.id}
            currentStatus={myRsvp.status}
          />
        </div>
      )}

      {/* Attendees */}
      <div className="mb-5">
        <p className="text-sm font-semibold text-slate-400 mb-3">Who&apos;s going</p>
        <div className="space-y-2">
          {teeTime.rsvps.map((rsvp) => (
            <div key={rsvp.id} className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3 border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-sm font-medium text-slate-300">
                  {rsvp.profile?.display_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="text-white text-sm font-medium">
                  {rsvp.profile?.display_name ?? "Unknown"}
                  {rsvp.user_id === user.id && <span className="text-slate-500 text-xs ml-1">(you)</span>}
                </span>
              </div>
              <span className={clsx("text-xs font-medium px-2.5 py-1 rounded-full", statusColors[rsvp.status])}>
                {statusLabels[rsvp.status]}
              </span>
            </div>
          ))}

          {/* Accepted guests */}
          {acceptedGuests.map((guest) => (
            <div key={guest.id} className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3 border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-900/60 rounded-full flex items-center justify-center text-sm font-medium text-green-400">
                  {guest.accepted_name?.[0]?.toUpperCase() ?? "G"}
                </div>
                <div>
                  <span className="text-white text-sm font-medium">{guest.accepted_name ?? "Guest"}</span>
                  <span className="text-slate-500 text-xs ml-2">Guest</span>
                </div>
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-900/60 text-green-400">Going</span>
            </div>
          ))}

          {/* Pending guest invites summary */}
          {pendingGuests.length > 0 && (
            <div className="text-xs text-slate-500 px-1 pt-1">
              {pendingGuests.length} invite link{pendingGuests.length !== 1 ? "s" : ""} pending…
            </div>
          )}
        </div>
      </div>

      {/* Invite guest */}
      {!isPast && openSpots > 0 && (
        <InviteGuestButton teeTimeId={teeTime.id} openSpots={openSpots} />
      )}
    </div>
  );
}
