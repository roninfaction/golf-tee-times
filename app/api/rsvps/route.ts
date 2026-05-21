import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { sendPush } from "@/lib/onesignal";
import { clearExpiredPushSubscriptions } from "@/lib/push-cleanup";

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teeTimeId, status } = await request.json();
  if (!teeTimeId || !status) {
    return NextResponse.json({ error: "teeTimeId and status required" }, { status: 400 });
  }

  if (!["pending", "accepted", "declined"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data, error } = await svc
    .from("rsvps")
    .upsert({ tee_time_id: teeTimeId, user_id: user.id, status }, { onConflict: "tee_time_id,user_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

  const { rsvpId } = await request.json();
  if (!rsvpId) return NextResponse.json({ error: "rsvpId required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: rsvp } = await svc.from("rsvps").select("tee_time_id").eq("id", rsvpId).single();
  if (!rsvp) return NextResponse.json({ error: "RSVP not found" }, { status: 404 });

  const { data: teeTime } = await svc.from("tee_times").select("created_by, group_id").eq("id", rsvp.tee_time_id).single();
  if (!teeTime || teeTime.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await svc.from("rsvps").delete().eq("id", rsvpId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (teeTime.group_id) revalidateTag(`tee-times-${teeTime.group_id}`, "default");

  return NextResponse.json({ ok: true });
}
