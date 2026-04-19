import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/onesignal";

export async function POST(request: NextRequest) {
  const { token, name } = await request.json();

  if (!token || !name?.trim()) {
    return NextResponse.json({ error: "token and name required" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Call the atomic Postgres function
  const { data, error } = await svc.rpc("accept_guest_invite", {
    p_token: token,
    p_name: name.trim(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as { error?: string; ok?: boolean; teeTimeId?: string; courseName?: string; teeDate?: string };

  if (result.error) {
    const statusMap: Record<string, number> = {
      not_found: 404,
      already_claimed: 409,
      no_spots: 409,
    };
    return NextResponse.json(
      { error: result.error },
      { status: statusMap[result.error] ?? 400 }
    );
  }

  // Push notify all group members
  const teeTimeId = result.teeTimeId;
  if (teeTimeId) {
    const { data: teeTime } = await svc
      .from("tee_times")
      .select("group_id, course_name, tee_datetime")
      .eq("id", teeTimeId)
      .single();

    if (teeTime) {
      // Only notify members who are actually going to this tee time
      const { data: acceptedRsvps } = await svc
        .from("rsvps")
        .select("user_id")
        .eq("tee_time_id", teeTimeId)
        .eq("status", "accepted");

      const memberIds = (acceptedRsvps ?? []).map((r: { user_id: string }) => r.user_id);

      const { data: profiles } = await svc
        .from("profiles")
        .select("push_subscription")
        .in("id", memberIds)
        .not("push_subscription", "is", null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscriptions = (profiles ?? []).map((p: any) => p.push_subscription).filter(Boolean);

      if (subscriptions.length > 0) {
        await sendPush({
          subscriptions: subscriptions as import("@/lib/web-push-server").PushSubscription[],
          title: `${(teeTime as { course_name: string }).course_name}`,
          body: `${name.trim()} filled the open spot! 🏌️`,
          data: { teeTimeId },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, teeTimeId, courseName: result.courseName, teeDate: result.teeDate });
}
