import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatTeeDate, formatTeeTime } from "@/lib/format";
import type { TeeTime, Rsvp, GuestInvite } from "@/lib/types";

export default async function PastPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="px-4 pt-6 text-center py-16">
        <p className="text-slate-500">No group yet.</p>
      </div>
    );
  }

  const { data: teeTimes } = await supabase
    .from("tee_times")
    .select("*, rsvps(user_id, status), guest_invites(status)")
    .eq("group_id", membership.group_id)
    .lt("tee_datetime", new Date().toISOString())
    .order("tee_datetime", { ascending: false })
    .limit(30);

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-white mb-6">Past tee times</h1>

      {!teeTimes?.length ? (
        <p className="text-slate-500 text-center py-16">No past tee times yet.</p>
      ) : (
        <div className="space-y-2">
          {teeTimes.map((tt: TeeTime & { rsvps: Rsvp[]; guest_invites: GuestInvite[] }) => {
            const myRsvp = tt.rsvps.find((r: Rsvp) => r.user_id === user.id);
            const acceptedCount =
              tt.rsvps.filter((r: Rsvp) => r.status === "accepted").length +
              tt.guest_invites.filter((g: GuestInvite) => g.status === "accepted").length;

            return (
              <Link
                key={tt.id}
                href={`/tee-times/${tt.id}`}
                className="block bg-slate-900 border border-slate-800 rounded-2xl p-4 opacity-70 hover:opacity-90 transition-opacity"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-300">{tt.course_name}</p>
                    <p className="text-slate-500 text-sm mt-0.5">
                      {formatTeeDate(tt.tee_datetime)} · {formatTeeTime(tt.tee_datetime)} · {tt.holes}H
                    </p>
                    <p className="text-slate-600 text-xs mt-1">{acceptedCount} attended</p>
                  </div>
                  {myRsvp && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      myRsvp.status === "accepted" ? "bg-green-900/40 text-green-500" :
                      myRsvp.status === "declined" ? "bg-red-900/30 text-red-500" :
                      "bg-slate-800 text-slate-500"
                    }`}>
                      {myRsvp.status === "accepted" ? "Played" : myRsvp.status === "declined" ? "Skipped" : "—"}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
