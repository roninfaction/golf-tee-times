import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { sendPush } from "@/lib/onesignal";
import { clearExpiredPushSubscriptions } from "@/lib/push-cleanup";
import { parseBody } from "@/lib/parse-body";
import { pushToUsers } from "@/lib/notify";

// When a confirmed player drops out of an upcoming round, tell the people invited to it who
// haven't answered yet. Invites are what make a round visible, so the alert stays inside the
// invite list rather than going to the whole group.
async function alertSpotOpened(svc: ReturnType<typeof createServiceClient>, teeTimeId: string, droppedUserId: string) {
  const { data: tt } = await svc
    .from("tee_times")
    .select("course_name, tee_datetime, max_players, group:groups(timezone), rsvps(user_id, status), guest_invites(status)")
    .eq("id", teeTimeId)
    .single();
  if (!tt || new Date(tt.tee_datetime) <= new Date()) return;

  const confirmed = tt.rsvps.filter((r: { status: string }) => r.status === "accepted").length
    + tt.guest_invites.filter((g: { status: string }) => g.status === "accepted").length;
  if (confirmed >= tt.max_players) return;

  const undecided = tt.rsvps
    .filter((r: { user_id: string; status: string }) => r.status === "pending" && r.user_id !== droppedUserId)
    .map((r: { user_id: string }) => r.user_id);
  if (!undecided.length) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tz = (tt as any).group?.timezone ?? "America/Los_Angeles";
  const d = new Date(tt.tee_datetime);
  const when = `${d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`;
  await pushToUsers(svc, undecided, {
    title: "A spot just opened ⛳",
    body: `${tt.course_name} · ${when}. Tap to grab it.`,
    data: { teeTimeId },
  });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body: postBody, badRequest: postBad } = await parseBody<{ teeTimeId: string; status: string }>(request);
  if (postBad) return postBad;
  const { teeTimeId, status } = postBody;
  if (!teeTimeId || !status) {
    return NextResponse.json({ error: "teeTimeId and status required" }, { status: 400 });
  }

  if (!["pending", "accepted", "declined"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: before } = await svc
    .from("rsvps")
    .select("status")
    .eq("tee_time_id", teeTimeId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data, error } = await svc
    .from("rsvps")
    .upsert({ tee_time_id: teeTimeId, user_id: user.id, status }, { onConflict: "tee_time_id,user_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (before?.status === "accepted" && status !== "accepted") {
    await alertSpotOpened(svc, teeTimeId, user.id);
  }

  const { data: teeTime } = await svc
    .from("tee_times")
    .select("created_by, group_id, course_name, tee_datetime")
    .eq("id", teeTimeId)
    .single();

  if (teeTime?.group_id) revalidateTag(`tee-times-${teeTime.group_id}`, "default");

  if (teeTime && teeTime.created_by && teeTime.created_by !== user.id) {
    const { data: creator } = await svc
      .from("profiles")
      .select("push_subscription")
      .eq("id", teeTime.created_by)
      .single();

    const { data: responder } = await svc
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    if (creator?.push_subscription) {
      const statusLabel = status === "accepted" ? "is going ✅" : status === "declined" ? "can't make it ❌" : "is maybe going 🤔";
      const { expiredEndpoints } = await sendPush({
        subscriptions: [creator.push_subscription as import("@/lib/web-push-server").PushSubscription],
        title: `${teeTime.course_name}`,
        body: `${responder?.display_name ?? "Someone"} ${statusLabel}`,
        data: { teeTimeId },
      });
      await clearExpiredPushSubscriptions(expiredEndpoints);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body: delBody, badRequest: delBad } = await parseBody<{ rsvpId: string }>(request);
  if (delBad) return delBad;
  const { rsvpId } = delBody;
  if (!rsvpId) return NextResponse.json({ error: "rsvpId required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: rsvp } = await svc.from("rsvps").select("tee_time_id, user_id, status").eq("id", rsvpId).single();
  if (!rsvp) return NextResponse.json({ error: "RSVP not found" }, { status: 404 });

  const { data: teeTime } = await svc.from("tee_times").select("created_by, group_id").eq("id", rsvp.tee_time_id).single();
  // Allow: caller owns the RSVP (removing themselves) OR caller created the tee time
  if (!teeTime || (rsvp.user_id !== user.id && teeTime.created_by !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await svc.from("rsvps").delete().eq("id", rsvpId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Only when a player takes themselves off; the organizer removing someone already knows.
  if (rsvp.user_id === user.id && rsvp.status === "accepted") {
    await alertSpotOpened(svc, rsvp.tee_time_id, user.id);
  }

  if (teeTime.group_id) revalidateTag(`tee-times-${teeTime.group_id}`, "default");

  return NextResponse.json({ ok: true });
}
