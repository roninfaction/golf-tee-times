import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

export async function GET(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "20", 10)));
  const offset = Math.max(0, parseInt(params.get("offset") ?? "0", 10));
  const groupId = params.get("group_id");

  const svc = createServiceClient();

  let query = svc
    .from("tee_times")
    .select("*, rsvps(*), guest_invites(*)")
    .gte("tee_datetime", new Date().toISOString())
    .order("tee_datetime", { ascending: true })
    .range(offset, offset + limit - 1);

  if (groupId) {
    // Verify membership before filtering
    const { data: membership } = await svc
      .from("group_members")
      .select("group_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return NextResponse.json([]);
    query = query.eq("group_id", groupId);
  } else {
    // No group_id specified — return tee times across all the user's groups
    // The existing RLS (tee_times_own_or_invited) already filters by RSVP presence
    const { data: myRsvps } = await svc
      .from("rsvps")
      .select("tee_time_id")
      .eq("user_id", user.id);
    const ids = (myRsvps ?? []).map((r: { tee_time_id: string }) => r.tee_time_id);
    if (!ids.length) return NextResponse.json([]);
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { course_name, course_place_id, course_details, tee_datetime, holes, max_players, notes, confirmation_number, source, group_id, parent_tee_time_id, slot_order } = body;

  if (!course_name || !tee_datetime) {
    return NextResponse.json({ error: "course_name and tee_datetime are required" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Verify membership in the specified group (or fall back to active group)
  let resolvedGroupId = group_id;
  if (!resolvedGroupId) {
    const { data: profile } = await svc
      .from("profiles")
      .select("active_group_id")
      .eq("id", user.id)
      .maybeSingle();
    resolvedGroupId = profile?.active_group_id;
  }

  if (!resolvedGroupId) {
    return NextResponse.json({ error: "group_id required — user has no active group" }, { status: 400 });
  }

  const { data: membership } = await svc
    .from("group_members")
    .select("group_id")
    .eq("group_id", resolvedGroupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of that group" }, { status: 403 });
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
      group_id: resolvedGroupId,
      course_name,
      course_place_id: course_place_id ?? null,
      tee_datetime,
      holes: holes ?? 18,
      max_players: max_players ?? 4,
      notes: notes ?? null,
      confirmation_number: confirmation_number ?? null,
      source: source ?? "manual",
      parent_tee_time_id: parent_tee_time_id ?? null,
      slot_order: slot_order ?? null,
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
