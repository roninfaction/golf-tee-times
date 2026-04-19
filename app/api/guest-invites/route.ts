import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golf-tee-times.pages.dev";

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teeTimeId, inviteeName } = await request.json();
  if (!teeTimeId) return NextResponse.json({ error: "teeTimeId required" }, { status: 400 });

  const svc = createServiceClient();

  // Verify the tee time belongs to user's group
  const { data: membership } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: teeTime } = await svc
    .from("tee_times")
    .select("id, group_id, max_players, course_name")
    .eq("id", teeTimeId)
    .single();

  if (!teeTime || !membership || teeTime.group_id !== membership.group_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check open spots
  const { count: acceptedGroup } = await svc
    .from("rsvps")
    .select("*", { count: "exact", head: true })
    .eq("tee_time_id", teeTimeId)
    .eq("status", "accepted");

  const { count: acceptedGuests } = await svc
    .from("guest_invites")
    .select("*", { count: "exact", head: true })
    .eq("tee_time_id", teeTimeId)
    .eq("status", "accepted");

  const openSpots = teeTime.max_players - (acceptedGroup ?? 0) - (acceptedGuests ?? 0);
  if (openSpots <= 0) {
    return NextResponse.json({ error: "No open spots" }, { status: 400 });
  }

  // Create the invite
  const { data: invite, error } = await svc
    .from("guest_invites")
    .insert({
      tee_time_id: teeTimeId,
      invited_by: user.id,
      invitee_name: inviteeName ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = `${APP_URL}/fill/${invite.token}`;
  return NextResponse.json({ ok: true, token: invite.token, url }, { status: 201 });
}
