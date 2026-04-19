import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatTeeDate, formatTeeTime } from "@/lib/format";
import type { TeeTime, Rsvp, GuestInvite } from "@/lib/types";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

export default async function PastPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: membership } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No group yet.</p>
      </div>
    );
  }

  const { data: teeTimes } = await svc
    .from("tee_times")
    .select("*, rsvps(user_id, status), guest_invites(status)")
    .eq("group_id", membership.group_id)
    .lt("tee_datetime", new Date().toISOString())
    .order("tee_datetime", { ascending: false })
    .limit(30);

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-6" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <h1 className="text-[28px] font-bold text-white tracking-tight">History</h1>
      </div>

      <div className="px-4 pt-5">
        {!teeTimes?.length ? (
          <div className="text-center py-24">
            <p className="font-medium text-white mb-1">No history yet</p>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>Past tee times will appear here</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {teeTimes.map((tt: TeeTime & { rsvps: Rsvp[]; guest_invites: GuestInvite[] }, i) => {
              const myRsvp = tt.rsvps.find((r: Rsvp) => r.user_id === user.id);
              const acceptedCount =
                tt.rsvps.filter((r: Rsvp) => r.status === "accepted").length +
                tt.guest_invites.filter((g: GuestInvite) => g.status === "accepted").length;
              const isLast = i === teeTimes.length - 1;

              const badgeStyle = myRsvp?.status === "accepted"
                ? { background: "rgba(48,209,88,0.12)", color: "#30D158" }
                : myRsvp?.status === "declined"
                ? { background: "rgba(255,69,58,0.1)", color: "#FF453A" }
                : { background: "rgba(201,168,76,0.12)", color: GOLD };

              return (
                <Link
                  key={tt.id}
                  href={`/tee-times/${tt.id}`}
                  className="flex items-center justify-between px-4 py-3.5 active:opacity-60 transition-opacity"
                  style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{tt.course_name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {formatTeeDate(tt.tee_datetime)} · {formatTeeTime(tt.tee_datetime)} · {tt.holes}H · {acceptedCount} played
                    </p>
                  </div>
                  {myRsvp && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full ml-3 shrink-0" style={badgeStyle}>
                      {myRsvp.status === "accepted" ? "Played" : myRsvp.status === "declined" ? "Skipped" : "—"}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
