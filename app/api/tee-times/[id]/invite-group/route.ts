import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { sendPush } from "@/lib/onesignal";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const svc = createServiceClient();

  const { data: tt } = await svc
    .from("tee_times")
    .select("id, created_by, group_id, course_name, tee_datetime")
    .eq("id", teeTimeId)
    .single();

  if (!tt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tt.created_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: members } = await svc
    .from("group_members")
    .select("user_id")
    .eq("group_id", tt.group_id);

  const otherMemberIds = (members ?? [])
    .map((m: { user_id: string }) => m.user_id)
    .filter((uid: string) => uid !== user.id);

  if (otherMemberIds.length === 0) {
    return NextResponse.json({ invited_count: 0 });
  }

  // Upsert pending RSVPs — this is what makes the tee time visible to each member.
  // onConflict means re-inviting is idempotent; existing accepted/declined RSVPs are untouched.
  await svc.from("rsvps").upsert(
    otherMemberIds.map((uid: string) => ({
      tee_time_id: teeTimeId,
      user_id: uid,
      status: "pending",
    })),
    { onConflict: "tee_time_id,user_id", ignoreDuplicates: true }
  );

  const { data: profiles } = await svc
    .from("profiles")
    .select("push_subscription")
    .in("id", otherMemberIds)
    .not("push_subscription", "is", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptions = (profiles ?? []).map((p: any) => p.push_subscription).filter(Boolean);

  if (subscriptions.length > 0) {
    const teeDate = new Date(tt.tee_datetime);
    const dateStr = teeDate.toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric",
    });
    const timeStr = teeDate.toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", hour12: true,
    });
    await sendPush({
      subscriptions: subscriptions as import("@/lib/web-push-server").PushSubscription[],
      title: "You're invited! ⛳",
      body: `${tt.course_name} · ${dateStr} at ${timeStr} — tap to RSVP`,
      data: { teeTimeId },
    });
  }

  return NextResponse.json({ invited_count: otherMemberIds.length });
}
