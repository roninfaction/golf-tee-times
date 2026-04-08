import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/onesignal";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("tee_times")
    .select("*, rsvps(*), guest_invites(*)")
    .eq("group_id", membership.group_id)
    .gte("tee_datetime", new Date().toISOString())
    .order("tee_datetime", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { course_name, tee_datetime, holes, max_players, notes, confirmation_number, source } = body;

  if (!course_name || !tee_datetime) {
    return NextResponse.json({ error: "course_name and tee_datetime are required" }, { status: 400 });
  }

  // Get user's group
  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "You are not in a group" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Insert the tee time
  const { data: teeTime, error } = await svc
    .from("tee_times")
    .insert({
      created_by: user.id,
      group_id: membership.group_id,
      course_name,
      tee_datetime,
      holes: holes ?? 18,
      max_players: max_players ?? 4,
      notes: notes ?? null,
      confirmation_number: confirmation_number ?? null,
      source: source ?? "manual",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get all group members
  const { data: members } = await svc
    .from("group_members")
    .select("user_id")
    .eq("group_id", membership.group_id);

  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);

  // Auto-create RSVPs: creator = accepted, everyone else = pending
  const rsvpInserts = memberIds.map((uid: string) => ({
    tee_time_id: teeTime.id,
    user_id: uid,
    status: uid === user.id ? "accepted" : "pending",
  }));

  await svc.from("rsvps").insert(rsvpInserts);

  // Send push notifications to all group members except creator
  const otherMemberIds = memberIds.filter((id: string) => id !== user.id);
  if (otherMemberIds.length > 0) {
    const { data: profiles } = await svc
      .from("profiles")
      .select("onesignal_player_id")
      .in("id", otherMemberIds)
      .not("onesignal_player_id", "is", null);

    const playerIds = (profiles ?? [])
      .map((p: { onesignal_player_id: string }) => p.onesignal_player_id)
      .filter(Boolean);

    if (playerIds.length > 0) {
      const teeDate = new Date(tee_datetime);
      const dateStr = teeDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const timeStr = teeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

      await sendPush({
        playerIds,
        title: "New tee time! ⛳",
        body: `${course_name} · ${dateStr} at ${timeStr}`,
        data: { teeTimeId: teeTime.id },
      });
    }
  }

  return NextResponse.json(teeTime, { status: 201 });
}
