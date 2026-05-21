import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/onesignal";
import { clearExpiredPushSubscriptions } from "@/lib/push-cleanup";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const svc = createServiceClient();

  // Atomically mark invite as expired (not "accepted") so it can't be reused,
  // without contributing to the guest accepted-spot count.
  // The member's spot is tracked via the rsvps table instead.
  const { data: claimed } = await svc
    .from("guest_invites")
    .update({ status: "expired" })
    .eq("token", token)
    .eq("status", "pending")
    .select("id, tee_time_id");

  if (!claimed || claimed.length === 0) {
    const { data: existing } = await svc
      .from("guest_invites")
      .select("status")
      .eq("token", token)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  const teeTimeId = claimed[0].tee_time_id as string;

  const { data: teeTime } = await svc
    .from("tee_times")
    .select("group_id, course_name, tee_datetime, max_players")
    .eq("id", teeTimeId)
    .single();

  if (!teeTime) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Verify there's still an open spot (rsvps + accepted guests, excluding the just-expired invite)
  const { count: acceptedRsvps } = await svc
    .from("rsvps")
    .select("*", { count: "exact", head: true })
    .eq("tee_time_id", teeTimeId)
    .eq("status", "accepted");

  const { count: acceptedGuests } = await svc
    .from("guest_invites")
    .select("*", { count: "exact", head: true })
    .eq("tee_time_id", teeTimeId)
    .eq("status", "accepted");

  const totalAccepted = (acceptedRsvps ?? 0) + (acceptedGuests ?? 0);
  if (totalAccepted >= (teeTime as { max_players: number }).max_players) {
    await svc.from("guest_invites").update({ status: "pending" }).eq("id", claimed[0].id);
    return NextResponse.json({ error: "no_spots" }, { status: 409 });
  }

  // Create the RSVP for the authenticated member
  await svc
    .from("rsvps")
    .upsert(
      { tee_time_id: teeTimeId, user_id: user.id, status: "accepted" },
      { onConflict: "tee_time_id,user_id" }
    );

  revalidateTag(`tee-times-${(teeTime as { group_id: string }).group_id}`, "default");

  // Push notify other accepted members
  const { data: acceptedRsvpRows } = await svc
    .from("rsvps")
    .select("user_id")
    .eq("tee_time_id", teeTimeId)
    .eq("status", "accepted")
    .neq("user_id", user.id);

  const memberIds = (acceptedRsvpRows ?? []).map((r: { user_id: string }) => r.user_id);

  if (memberIds.length > 0) {
    const { data: responder } = await svc
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const { data: targetProfiles } = await svc
      .from("profiles")
      .select("push_subscription")
      .in("id", memberIds)
      .not("push_subscription", "is", null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscriptions = (targetProfiles ?? []).map((p: any) => p.push_subscription).filter(Boolean);

    if (subscriptions.length > 0) {
      const { expiredEndpoints } = await sendPush({
        subscriptions: subscriptions as import("@/lib/web-push-server").PushSubscription[],
        title: (teeTime as { course_name: string }).course_name,
        body: `${(responder as { display_name: string } | null)?.display_name ?? "Someone"} joined the tee time! 🏌️`,
        data: { teeTimeId },
      });
      await clearExpiredPushSubscriptions(expiredEndpoints);
    }
  }

  return NextResponse.json({
    ok: true,
    teeTimeId,
    courseName: (teeTime as { course_name: string }).course_name,
    teeDate: (teeTime as { tee_datetime: string }).tee_datetime,
  });
}
