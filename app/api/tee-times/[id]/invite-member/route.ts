import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { sendPush } from "@/lib/onesignal";
import { clearExpiredPushSubscriptions } from "@/lib/push-cleanup";
import { parseBody } from "@/lib/parse-body";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const { body, badRequest } = await parseBody<{ memberId: string }>(request);
  if (badRequest) return badRequest;
  const { memberId } = body;
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: tt } = await svc
    .from("tee_times")
    .select("id, created_by, group_id, course_name, tee_datetime, group:groups(timezone)")
    .eq("id", teeTimeId)
    .single();

  if (!tt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tt.created_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Verify the target is actually a group member
  const { data: membership } = await svc
    .from("group_members")
    .select("user_id")
    .eq("group_id", tt.group_id)
    .eq("user_id", memberId)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "Not a group member" }, { status: 400 });

  // Upsert a pending RSVP — idempotent, won't overwrite accepted/declined
  await svc.from("rsvps").upsert(
    { tee_time_id: teeTimeId, user_id: memberId, status: "pending" },
    { onConflict: "tee_time_id,user_id", ignoreDuplicates: true }
  );

  // Push notify the specific member
  const { data: profile } = await svc
    .from("profiles")
    .select("push_subscription")
    .eq("id", memberId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = (profile as any)?.push_subscription;
  if (subscription) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tz = (tt as any).group?.timezone ?? "America/Los_Angeles";
    const teeDate = new Date(tt.tee_datetime);
    const dateStr = teeDate.toLocaleDateString("en-US", {
      timeZone: tz, weekday: "short", month: "short", day: "numeric",
    });
    const timeStr = teeDate.toLocaleTimeString("en-US", {
      timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
    });
    const { expiredEndpoints } = await sendPush({
      subscriptions: [subscription as import("@/lib/web-push-server").PushSubscription],
      title: "You're invited! ⛳",
      body: `${tt.course_name} · ${dateStr} at ${timeStr} — tap to RSVP`,
      data: { teeTimeId },
    });
    await clearExpiredPushSubscriptions(expiredEndpoints);
  }

  return NextResponse.json({ ok: true });
}
