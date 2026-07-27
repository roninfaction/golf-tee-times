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

  // Resolve active group: cookie → oldest membership
  const cookieStore = await cookies();
  const cookieGroupId = cookieStore.get("golfpack_active_group")?.value;

  // Fetch all memberships and RSVP list in parallel
  const [{ data: allMemberships }, { data: myRsvpRows }] = await Promise.all([
    svc
      .from("group_members")
      .select("group_id, group:groups(id, name, timezone)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true }),
    svc.from("rsvps").select("tee_time_id").eq("user_id", user.id),
  ]);

  // Pick cookie-matched group; fall back to oldest when cookie is stale or absent
  const membership = cookieGroupId
    ? ((allMemberships ?? []).find(m => m.group_id === cookieGroupId) ?? allMemberships?.[0] ?? null)
    : (allMemberships?.[0] ?? null);

  const groupId = membership?.group_id;
  const invitedIds = (myRsvpRows ?? []).map((r: { tee_time_id: string }) => r.tee_time_id);

  // A user with no group and no accepted tee times must create a group first
  // (forced onboarding). /group/setup is the one app page exempt from this.
  if (!groupId && invitedIds.length === 0) {
    redirect("/group/setup");
  }

  const today = new Date();
  const in60 = new Date(today);
  in60.setDate(today.getDate() + 60);

  const fetchTeeTimes = unstable_cache(
    async (gId: string | null, uId: string, ids: string[], from: string, to: string) => {
      const svcInner = createServiceClient();
      let q = svcInner
        .from("tee_times")
        .select("*, rsvps(user_id, status), guest_invites(status), course:courses(photo_uri)")
        .gte("tee_datetime", from)
        .lte("tee_datetime", to)
        .order("tee_datetime", { ascending: true })
        .limit(50);
      if (ids.length > 0) {
        // Show all tee times the user has RSVPs for, regardless of group.
        // Covers guest-invite acceptances converted to RSVPs and cross-group scenarios.
        q = q.in("id", ids);
      } else if (gId) {
        // No RSVPs yet — show tee times they created in their active group as a fallback.
        q = q.eq("group_id", gId).eq("created_by", uId);
      } else {
        return [];
      }
      const { data } = await q;
      return data ?? [];
    },
    ["upcoming-tee-times"],
    { revalidate: 30, tags: groupId ? [`tee-times-${groupId}`] : ["upcoming-tee-times"] }
  );

  const teeTimes = await fetchTeeTimes(groupId ?? null, user.id, invitedIds, today.toISOString(), in60.toISOString());

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
          {groupId && (
            <GroupSwitcher
              activeGroupId={groupId}
              groupName={(membership?.group as unknown as { name: string })?.name ?? "Your Group"}
            />
          )}
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
