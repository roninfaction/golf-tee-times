import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { sendPush } from "@/lib/onesignal";
import { clearExpiredPushSubscriptions } from "@/lib/push-cleanup";
import { parseBody } from "@/lib/parse-body";

export async function POST(request: NextRequest) {
  // Try cookie auth first; fall back to Bearer token (handles iOS PWA where cookies
  // aren't shared with Safari but the client-side session supplies the token)
  const supabase = await createClient();
  const { data: { user: cookieUser } } = await supabase.auth.getUser();
  const user = cookieUser ?? await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ token: string }>(request);
  if (badRequest) return badRequest;
  const { token } = body;
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const svc = createServiceClient();

  // The token points at a durable "share link" template that stays pending for
  // the life of the tee time — we do NOT consume it here. A member's spot is
  // tracked via the rsvps table, and the link keeps working for the next person.
  const { data: invite } = await svc
    .from("guest_invites")
    .select("tee_time_id")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const teeTimeId = invite.tee_time_id as string;

  const { data: teeTime } = await svc
    .from("tee_times")
    .select("group_id, course_name, tee_datetime, max_players")
    .eq("id", teeTimeId)
    .single();

  if (!teeTime) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // If this member already RSVP'd, this is idempotent (the upsert below dedupes),
  // so only enforce the spot cap for members who aren't already going.
  const { data: existingRsvp } = await svc
    .from("rsvps")
    .select("status")
    .eq("tee_time_id", teeTimeId)
    .eq("user_id", user.id)
    .maybeSingle();
  const alreadyGoing = existingRsvp?.status === "accepted";

  // Verify there's still an open spot (accepted rsvps + accepted guests).
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
  if (!alreadyGoing && totalAccepted >= (teeTime as { max_players: number }).max_players) {
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
