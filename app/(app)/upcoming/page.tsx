import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatTeeTime } from "@/lib/format";
import { clsx } from "clsx";
import type { TeeTime, Rsvp, GuestInvite } from "@/lib/types";
import { Plus, Calendar } from "lucide-react";

const statusColors: Record<string, string> = {
  accepted: "bg-green-600",
  declined: "bg-red-700",
  pending: "bg-slate-600",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDays(referenceDate: Date): Date[] {
  // Get Monday of the current week
  const day = referenceDate.getDay(); // 0=Sun,1=Mon,...6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export default async function UpcomingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: membership } = await svc
    .from("group_members")
    .select("group_id, group:groups(id, name)")
    .eq("user_id", user.id)
    .maybeSingle();

  const groupId = membership?.group_id;

  if (!groupId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">⛳</div>
        <h2 className="text-xl font-bold text-white mb-2">You&apos;re not in a group yet</h2>
        <p className="text-slate-400 text-sm mb-6 max-w-xs">
          Create a group for your golf crew or join an existing one with an invite link.
        </p>
        <Link href="/group/setup" className="bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
          Get started
        </Link>
      </div>
    );
  }

  // Fetch tee times for next 60 days
  const today = new Date();
  const in60 = new Date(today);
  in60.setDate(today.getDate() + 60);

  const { data: teeTimes } = await svc
    .from("tee_times")
    .select("*, rsvps(user_id, status), guest_invites(status)")
    .eq("group_id", groupId)
    .gte("tee_datetime", today.toISOString().split("T")[0])
    .lte("tee_datetime", in60.toISOString().split("T")[0])
    .order("tee_datetime", { ascending: true });

  const rows = (teeTimes ?? []).map((tt: TeeTime & { rsvps: Rsvp[]; guest_invites: GuestInvite[] }) => {
    const myRsvp = tt.rsvps.find((r: Rsvp) => r.user_id === user.id) ?? null;
    const acceptedCount = tt.rsvps.filter((r: Rsvp) => r.status === "accepted").length;
    const guestAcceptedCount = tt.guest_invites.filter((g: GuestInvite) => g.status === "accepted").length;
    return { ...tt, my_rsvp: myRsvp, accepted_count: acceptedCount + guestAcceptedCount };
  });

  const weekDays = getWeekDays(today);
  const monthLabel = weekDays[0].toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Schedule</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {(membership?.group as unknown as { name: string })?.name ?? "Your Group"}
          </p>
        </div>
        <Link href="/tee-times/new" className="bg-green-600 hover:bg-green-500 text-white p-2.5 rounded-xl transition-colors">
          <Plus size={20} />
        </Link>
      </div>

      {/* Week strip */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-3 mb-6">
        <p className="text-xs text-slate-500 font-medium mb-3 px-1">{monthLabel}</p>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today);
            const dayTimes = rows.filter(tt => isSameDay(new Date(tt.tee_datetime), day));
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500 font-medium">{DAY_LABELS[i]}</span>
                <div className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
                  isToday ? "bg-green-600 text-white" : "text-slate-300"
                )}>
                  {day.getDate()}
                </div>
                {/* Dot indicator for tee times */}
                <div className="flex gap-0.5 flex-wrap justify-center min-h-[6px]">
                  {dayTimes.map((tt) => (
                    <div
                      key={tt.id}
                      className={clsx("w-1.5 h-1.5 rounded-full", statusColors[tt.my_rsvp?.status ?? "pending"])}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tee time list */}
      {rows.length === 0 ? (
        <div className="text-center py-16">
          <Calendar size={40} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No upcoming tee times</p>
          <p className="text-slate-600 text-sm mt-1 mb-5">Add one manually or forward a confirmation email</p>
          <Link href="/tee-times/new" className="bg-green-600 hover:bg-green-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
            Add tee time
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((tt) => {
            const myStatus = tt.my_rsvp?.status ?? "pending";
            const teeDate = new Date(tt.tee_datetime);
            const dateLabel = teeDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

            return (
              <Link key={tt.id} href={`/tee-times/${tt.id}`}
                className="block bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Date badge */}
                    <p className="text-xs text-slate-500 font-medium mb-1">{dateLabel}</p>
                    <p className="font-semibold text-white truncate">{tt.course_name}</p>
                    <p className="text-slate-400 text-sm mt-0.5">
                      {formatTeeTime(tt.tee_datetime)} · {tt.holes}H · {tt.accepted_count}/{tt.max_players} going
                    </p>
                  </div>
                  <span className={clsx(
                    "text-xs font-medium px-2.5 py-1 rounded-full shrink-0 mt-1",
                    myStatus === "accepted" ? "bg-green-900/60 text-green-400 border border-green-800" :
                    myStatus === "declined" ? "bg-red-900/40 text-red-400 border border-red-900" :
                    "bg-slate-800 text-slate-400 border border-slate-700"
                  )}>
                    {myStatus === "accepted" ? "Going" : myStatus === "declined" ? "Can't go" : "Pending"}
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
