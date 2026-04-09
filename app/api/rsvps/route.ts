import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { sendPush } from "@/lib/onesignal";

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
    .select("created_by, course_name, tee_datetime")
    .eq("id", teeTimeId)
    .single();

  if (teeTime && teeTime.created_by && teeTime.created_by !== user.id) {
    const { data: creator } = await svc
      .from("profiles")
      .select("onesignal_player_id")
      .eq("id", teeTime.created_by)
      .single();

    const { data: responder } = await svc
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    if (creator?.onesignal_player_id) {
      const statusLabel = status === "accepted" ? "is going ✅" : status === "declined" ? "can't make it ❌" : "is maybe going 🤔";
      await sendPush({
        playerIds: [creator.onesignal_player_id],
        title: `${teeTime.course_name}`,
        body: `${responder?.display_name ?? "Someone"} ${statusLabel}`,
        data: { teeTimeId },
      });
    }
  }

  return NextResponse.json(data);
}
