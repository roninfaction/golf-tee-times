import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatTeeDate, formatTeeTime, formatDaysUntil } from "@/lib/format";
import { clsx } from "clsx";
import type { TeeTime, Rsvp, GuestInvite, Profile } from "@/lib/types";
import { Plus, Calendar } from "lucide-react";

type TeeTimeRow = TeeTime & {
  my_rsvp: Pick<Rsvp, "status"> | null;
  accepted_count: number;
  guest_accepted_count: number;
};

const statusColors: Record<string, string> = {
  accepted: "bg-green-900/60 text-green-400 border border-green-800",
  declined: "bg-red-900/40 text-red-400 border border-red-900",
  pending: "bg-slate-800 text-slate-400 border border-slate-700",
};

const statusLabels: Record<string, string> = {
  accepted: "Going",
  declined: "Can't go",
  pending: "Pending",
};

export default async function UpcomingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  // Get user's group
  const { data: membership } = await svc
    .from("group_members")
    .select("group_id, group:groups(id, name)")
    .eq("user_id", user.id)
    .maybeSingle();

  const groupId = membership?.group_id;

  if (!groupId) {
    // No group yet — prompt setup
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">⛳</div>
        <h2 className="text-xl font-bold text-white mb-2">You&apos;re not in a group yet</h2>
        <p className="text-slate-400 text-sm mb-6 max-w-xs">
          Create a group for your golf crew or join an existing one with an invite link.
        </p>
        <Link
          href="/group/setup"
          className="bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Get started
        </Link>
      </div>
    );
  }

  // Fetch upcoming tee times
  const { data: teeTimes } = await svc
    .from("tee_times")
    .select(`
      *,
      rsvps!inner(user_id, status),
      guest_invites(status)
    `)
    .eq("group_id", groupId)
    .gte("tee_datetime", new Date().toISOString())
    .order("tee_datetime", { ascending: true })
    .limit(20);

  // Process into display format
  const rows: TeeTimeRow[] = (teeTimes ?? []).map((tt: TeeTime & { rsvps: Rsvp[]; guest_invites: GuestInvite[] }) => {
    const myRsvp = tt.rsvps.find((r: Rsvp) => r.user_id === user.id) ?? null;
    const acceptedCount = tt.rsvps.filter((r: Rsvp) => r.status === "accepted").length;
    const guestAcceptedCount = tt.guest_invites.filter((g: GuestInvite) => g.status === "accepted").length;
    return {
      ...tt,
      my_rsvp: myRsvp,
      accepted_count: acceptedCount,
      guest_accepted_count: guestAcceptedCount,
    };
  });

  return (
    <div className="px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Upcoming</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {(membership?.group as unknown as { name: string })?.name ?? "Your Group"}
          </p>
        </div>
        <Link
          href="/tee-times/new"
          className="bg-green-600 hover:bg-green-500 text-white p-2.5 rounded-xl transition-colors"
        >
          <Plus size={20} />
        </Link>
      </div>

      {/* Tee time list */}
      {rows.length === 0 ? (
        <div className="text-center py-16">
          <Calendar size={40} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No upcoming tee times</p>
          <p className="text-slate-600 text-sm mt-1 mb-5">
            Add one manually or forward a confirmation email
          </p>
          <Link
            href="/tee-times/new"
            className="bg-green-600 hover:bg-green-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            Add tee time
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((tt) => {
            const totalAccepted = tt.accepted_count + tt.guest_accepted_count;
            const openSpots = tt.max_players - totalAccepted;
            const myStatus = tt.my_rsvp?.status ?? "pending";

            return (
              <Link
                key={tt.id}
                href={`/tee-times/${tt.id}`}
                className="block bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{tt.course_name}</p>
                    <p className="text-slate-400 text-sm mt-0.5">
                      {formatDaysUntil(tt.tee_datetime)} · {formatTeeTime(tt.tee_datetime)} · {tt.holes}H
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-slate-500 text-xs">
                        {totalAccepted}/{tt.max_players} going
                      </span>
                      {openSpots > 0 && (
                        <span className="text-xs bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full">
                          {openSpots} spot{openSpots !== 1 ? "s" : ""} open
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={clsx("text-xs font-medium px-2.5 py-1 rounded-full shrink-0 mt-0.5", statusColors[myStatus])}>
                    {statusLabels[myStatus]}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
