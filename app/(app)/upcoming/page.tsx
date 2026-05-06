import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import type { TeeTime, Rsvp, GuestInvite } from "@/lib/types";
import { Plus } from "lucide-react";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { ScheduleView } from "@/components/ScheduleView";
import type { ScheduleRow } from "@/components/ScheduleView";


export default async function UpcomingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  // Resolve active group: cookie → profile.active_group_id → oldest membership
  const cookieStore = await cookies();
  const cookieGroupId = cookieStore.get("golfpack_active_group")?.value;

  let membershipQuery = svc
    .from("group_members")
    .select("group_id, group:groups(id, name, timezone)")
    .eq("user_id", user.id);

  if (cookieGroupId) {
    membershipQuery = membershipQuery.eq("group_id", cookieGroupId);
  } else {
    membershipQuery = membershipQuery.order("joined_at", { ascending: true });
  }

  // Run membership lookup and RSVP fetch in parallel — both only need user.id.
  const [{ data: membership }, { data: myRsvpRows }] = await Promise.all([
    membershipQuery.maybeSingle(),
    svc.from("rsvps").select("tee_time_id").eq("user_id", user.id),
  ]);

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

  const invitedIds = (myRsvpRows ?? []).map((r: { tee_time_id: string }) => r.tee_time_id);

  const fetchTeeTimes = unstable_cache(
    async (gId: string, uId: string, ids: string[], from: string, to: string) => {
      const svcInner = createServiceClient();
      let q = svcInner
        .from("tee_times")
        .select("*, rsvps(user_id, status), guest_invites(status), course:courses(photo_uri)")
        .eq("group_id", gId)
        .gte("tee_datetime", from)
        .lte("tee_datetime", to)
        .order("tee_datetime", { ascending: true })
        .limit(50);
      if (ids.length > 0) {
        q = q.or(`created_by.eq.${uId},id.in.(${ids.join(",")})`);
      } else {
        q = q.eq("created_by", uId);
      }
      const { data } = await q;
      return data ?? [];
    },
    ["upcoming-tee-times"],
    { revalidate: 30, tags: [`tee-times-${groupId}`] }
  );

  const teeTimes = await fetchTeeTimes(groupId, user.id, invitedIds, today.toISOString(), in60.toISOString());

  const groupTz = (membership?.group as unknown as { timezone?: string })?.timezone ?? "America/Los_Angeles";

  const scheduleRows: ScheduleRow[] = (teeTimes ?? []).map((tt: TeeTime & { rsvps: Rsvp[]; guest_invites: GuestInvite[] }) => {
    const myRsvp = tt.rsvps.find((r: Rsvp) => r.user_id === user.id) ?? null;
    const acceptedCount = tt.rsvps.filter((r: Rsvp) => r.status === "accepted").length;
    const guestAcceptedCount = tt.guest_invites.filter((g: GuestInvite) => g.status === "accepted").length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coursePhoto = (tt as any).course?.photo_uri as string | null ?? null;
    return {
      id: tt.id,
      course_name: tt.course_name,
      tee_datetime: tt.tee_datetime,
      holes: tt.holes,
      max_players: tt.max_players,
      accepted_count: acceptedCount + guestAcceptedCount,
      my_rsvp: myRsvp ? { status: myRsvp.status } : null,
      course_photo: coursePhoto,
    };
  });

  return (
    <div className="px-4 pt-12 pb-52">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Schedule</h1>
          <GroupSwitcher
            activeGroupId={groupId}
            groupName={(membership?.group as unknown as { name: string })?.name ?? "Your Group"}
          />
        </div>
        <Link
          href="/tee-times/new"
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: "#30D158" }}
        >
          <Plus size={20} strokeWidth={2.5} className="text-black" />
        </Link>
      </div>

      <ScheduleView rows={scheduleRows} groupTz={groupTz} />
    </div>
  );
}
