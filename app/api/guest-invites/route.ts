import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfpack.app";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: invite } = await svc
    .from("guest_invites")
    .select("*, tee_time:tee_times(course_name, tee_datetime, holes, max_players, group_id), inviter:profiles!invited_by(display_name)")
    .eq("token", token)
    .single();

  if (!invite) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Count open spots
  const teeTime = invite.tee_time as { course_name: string; tee_datetime: string; holes: number; max_players: number; group_id: string };
  const { count: acceptedGroup } = await svc
    .from("rsvps")
    .select("*", { count: "exact", head: true })
    .eq("tee_time_id", invite.tee_time_id)
    .eq("status", "accepted");

  const { count: acceptedGuests } = await svc
    .from("guest_invites")
    .select("*", { count: "exact", head: true })
    .eq("tee_time_id", invite.tee_time_id)
    .eq("status", "accepted");

  const openSpots = teeTime.max_players - (acceptedGroup ?? 0) - (acceptedGuests ?? 0);

  // Get group name
  const { data: group } = await svc
    .from("groups")
    .select("name")
    .eq("id", teeTime.group_id)
    .single();

  return NextResponse.json({
    invite: {
      status: invite.status,
      inviter_name: (invite.inviter as { display_name: string })?.display_name,
    },
    teeTime: {
      course_name: teeTime.course_name,
      tee_datetime: teeTime.tee_datetime,
      holes: teeTime.holes,
      max_players: teeTime.max_players,
    },
    group_name: (group as { name: string })?.name,
    open_spots: openSpots,
  });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { teeTimeId?: string; inviteeName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { teeTimeId, inviteeName } = body;
  if (!teeTimeId) return NextResponse.json({ error: "teeTimeId required" }, { status: 400 });

  const trimmedName = inviteeName?.trim().slice(0, 100) ?? null;
  if (inviteeName !== undefined && !trimmedName) {
    return NextResponse.json({ error: "inviteeName cannot be empty" }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: teeTime } = await svc
    .from("tee_times")
    .select("id, group_id, course_name")
    .eq("id", teeTimeId)
    .single();

  if (!teeTime) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify the user is a member of this specific tee time's group
  const { data: membership } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .eq("group_id", teeTime.group_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Atomically check spots and insert invite in a single DB transaction
  const { data: rows, error } = await svc.rpc("check_and_create_guest_invite", {
    p_tee_time_id: teeTimeId,
    p_invited_by: user.id,
    p_invitee_name: trimmedName,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = rows?.[0];
  if (result?.err === "no_spots") return NextResponse.json({ error: "No open spots" }, { status: 400 });
  if (result?.err === "not_found" || !result?.invite_token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = `${APP_URL}/fill/${result.invite_token}`;
  return NextResponse.json({ ok: true, token: result.invite_token, url }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body: deleteBody, badRequest: deleteBad } = await parseBody<{ guestInviteId: string }>(request);
  if (deleteBad) return deleteBad;
  const { guestInviteId } = deleteBody;
  if (!guestInviteId) return NextResponse.json({ error: "guestInviteId required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: invite } = await svc.from("guest_invites").select("tee_time_id").eq("id", guestInviteId).single();
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: teeTime } = await svc.from("tee_times").select("created_by").eq("id", invite.tee_time_id).single();
  if (!teeTime || teeTime.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await svc.from("guest_invites").delete().eq("id", guestInviteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
