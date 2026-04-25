import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

export async function GET(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: membership } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return NextResponse.json([]);

  const { data, error } = await svc
    .from("tee_times")
    .select("*, rsvps(*), guest_invites(*)")
    .eq("group_id", membership.group_id)
    .gte("tee_datetime", new Date().toISOString())
    .order("tee_datetime", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { course_name, course_place_id, course_details, tee_datetime, holes, max_players, notes, confirmation_number, source } = body;

  if (!course_name || !tee_datetime) {
    return NextResponse.json({ error: "course_name and tee_datetime are required" }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: membership } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "You are not in a group" }, { status: 400 });
  }

  // Upsert course record if we have Place details
  if (course_place_id && course_details) {
    await svc.from("courses").upsert({
      place_id: course_details.place_id,
      name: course_details.name,
      address: course_details.address,
      phone: course_details.phone,
      website: course_details.website,
      maps_url: course_details.maps_url,
      lat: course_details.lat,
      lng: course_details.lng,
      photo_uri: course_details.photo_uri ?? null,
    }, { onConflict: "place_id" });
  }

  const { data: teeTime, error } = await svc
    .from("tee_times")
    .insert({
      created_by: user.id,
      group_id: membership.group_id,
      course_name,
      course_place_id: course_place_id ?? null,
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

  // Only create an RSVP for the creator. Group members are invited explicitly via
  // POST /api/tee-times/[id]/invite-group, which makes the tee time visible to them.
  await svc.from("rsvps").insert({
    tee_time_id: teeTime.id,
    user_id: user.id,
    status: "accepted",
  });

  return NextResponse.json(teeTime, { status: 201 });
}
