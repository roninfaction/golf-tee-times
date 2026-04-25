import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatTeeTime } from "@/lib/format";
import { clsx } from "clsx";
import type { TeeTime, Rsvp, GuestInvite } from "@/lib/types";
import { Plus } from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";

const TZ = "America/Los_Angeles";

function getPacificDateStr(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getWeekDayStrs(referenceDate: Date): string[] {
  const todayStr = getPacificDateStr(referenceDate);
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(referenceDate);
  const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayOfWeek);
  const diff = dayIdx === 0 ? -6 : 1 - dayIdx;
  return Array.from({ length: 7 }, (_, i) => {
    const base = new Date(todayStr + "T12:00:00Z");
    base.setUTCDate(base.getUTCDate() + diff + i);
    return getPacificDateStr(base);
  });
}

function daysUntil(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const todayStr = getPacificDateStr(now);
  const teeStr = getPacificDateStr(d);
  const diff = Math.round(
    (new Date(teeStr).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return `In ${diff} days`;
  return d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
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
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "rgba(201,168,76,0.15)" }}>
          <span className="text-3xl">⛳</span>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">No group yet</h2>
        <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.45)" }}>
          Create a group for your crew or join one with an invite link.
        </p>
        <Link href="/group/setup" className="font-semibold px-6 py-3 rounded-xl text-sm text-black" style={{ background: "#30D158" }}>
          Get started
        </Link>
      </div>
    );
  }

  const today = new Date();
  const in60 = new Date(today);
  in60.setDate(today.getDate() + 60);

  // Fetch tee time IDs the user has been invited to (has an RSVP row).
  const { data: myRsvpRows } = await svc
    .from("rsvps")
    .select("tee_time_id")
    .eq("user_id", user.id);

  const invitedIds = (myRsvpRows ?? []).map((r: { tee_time_id: string }) => r.tee_time_id);

  let teeTimesQuery = svc
    .from("tee_times")
    .select("*, rsvps(user_id, status), guest_invites(status), course:courses(photo_uri)")
    .gte("tee_datetime", today.toISOString())
    .lte("tee_datetime", in60.toISOString())
    .order("tee_datetime", { ascending: true });

  if (invitedIds.length > 0) {
    teeTimesQuery = teeTimesQuery.or(`created_by.eq.${user.id},id.in.(${invitedIds.join(",")})`);
  } else {
    teeTimesQuery = teeTimesQuery.eq("created_by", user.id);
  }

  const { data: teeTimes } = await teeTimesQuery;

  const rows = (teeTimes ?? []).map((tt: TeeTime & { rsvps: Rsvp[]; guest_invites: GuestInvite[] }) => {
    const myRsvp = tt.rsvps.find((r: Rsvp) => r.user_id === user.id) ?? null;
    const acceptedCount = tt.rsvps.filter((r: Rsvp) => r.status === "accepted").length;
    const guestAcceptedCount = tt.guest_invites.filter((g: GuestInvite) => g.status === "accepted").length;
    return { ...tt, my_rsvp: myRsvp, accepted_count: acceptedCount + guestAcceptedCount };
  });

  const weekDayStrs = getWeekDayStrs(today);
  const todayPacificStr = getPacificDateStr(today);
  const monthLabel = new Date(weekDayStrs[0] + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: TZ, month: "long", year: "numeric",
  });

  return (
    <div className="px-4 pt-12 pb-52">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Schedule</h1>
          <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            {(membership?.group as unknown as { name: string })?.name ?? "Your Group"}
          </p>
        </div>
        <Link
          href="/tee-times/new"
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "#30D158" }}
        >
          <Plus size={20} strokeWidth={2.5} className="text-black" />
        </Link>
      </div>

      {/* Week strip */}
      <div className="rounded-2xl p-4 mb-6" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
        <p className="text-xs font-semibold mb-3 px-0.5 uppercase tracking-wide" style={{ color: GOLD }}>{monthLabel}</p>
        <div className="grid grid-cols-7 gap-1">
          {weekDayStrs.map((dayStr, i) => {
            const isToday = dayStr === todayPacificStr;
            const dayNum = parseInt(dayStr.slice(8), 10);
            const dayTimes = rows.filter(tt => getPacificDateStr(new Date(tt.tee_datetime)) === dayStr);
            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>{DAY_LABELS[i]}</span>
                <div className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold",
                )} style={{
                  background: isToday ? "#30D158" : "transparent",
                  color: isToday ? "#000" : "rgba(255,255,255,0.8)",
                }}>
                  {dayNum}
                </div>
                <div className="flex gap-0.5 justify-center min-h-[5px]">
                  {dayTimes.map((tt) => {
                    const s = tt.my_rsvp?.status ?? "pending";
                    const dotColor = s === "accepted" ? "#30D158" : s === "declined" ? "#FF453A" : GOLD;
                    return <div key={tt.id} className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tee time list */}
      {rows.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-medium text-white mb-1">No upcoming tee times</p>
          <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.4)" }}>Add one manually or forward a confirmation email</p>
          <Link href="/tee-times/new" className="font-semibold px-5 py-2.5 rounded-xl text-sm text-black" style={{ background: "#30D158" }}>
            Add tee time
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((tt) => {
            const myStatus = tt.my_rsvp?.status ?? "pending";
            const badgeStyle = myStatus === "accepted"
              ? { background: "rgba(48,209,88,0.15)", color: "#30D158" }
              : myStatus === "declined"
              ? { background: "rgba(255,69,58,0.12)", color: "#FF453A" }
              : { background: "rgba(201,168,76,0.15)", color: GOLD };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const photoUri = (tt as any).course?.photo_uri as string | null | undefined;

            return (
              <Link
                key={tt.id}
                href={`/tee-times/${tt.id}`}
                className="block rounded-2xl overflow-hidden transition-opacity active:opacity-70"
                style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}
              >
                {photoUri && (
                  <div className="relative h-28 w-full">
                    <img src={photoUri} alt={tt.course_name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.65))" }} />
                    <p className="absolute bottom-2.5 left-4 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.7)" }}>
                      {daysUntil(tt.tee_datetime)}
                    </p>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    {!photoUri && (
                      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: GOLD }}>
                        {daysUntil(tt.tee_datetime)}
                      </p>
                    )}
                    <p className="font-semibold text-white text-[16px] truncate tracking-tight">{tt.course_name}</p>
                    <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {formatTeeTime(tt.tee_datetime)} &middot; {tt.holes}H &middot; {tt.accepted_count}/{tt.max_players} going
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 mt-0.5" style={badgeStyle}>
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
