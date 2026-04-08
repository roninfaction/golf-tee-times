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
      const { data: members } = await svc
        .from("group_members")
        .select("user_id")
        .eq("group_id", (teeTime as { group_id: string }).group_id);

      const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);

      const { data: profiles } = await svc
        .from("profiles")
        .select("onesignal_player_id")
        .in("id", memberIds)
        .not("onesignal_player_id", "is", null);

      const playerIds = (profiles ?? [])
        .map((p: { onesignal_player_id: string }) => p.onesignal_player_id)
        .filter(Boolean);

      if (playerIds.length > 0) {
        await sendPush({
          playerIds,
          title: `${(teeTime as { course_name: string }).course_name}`,
          body: `${name.trim()} filled the open spot! 🏌️`,
          data: { teeTimeId },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, teeTimeId, courseName: result.courseName, teeDate: result.teeDate });
}
