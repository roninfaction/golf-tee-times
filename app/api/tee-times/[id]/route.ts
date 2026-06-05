import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("tee_times")
    .select("*, group:groups(timezone), rsvps(*, profile:profiles(id, display_name)), guest_invites(*)")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Access guard: must be creator or have an RSVP
  const hasAccess =
    data.created_by === user.id ||
    (data.rsvps as { user_id: string }[]).some((r) => r.user_id === user.id);
  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  // Only the creator can edit
  const { data: existing } = await svc.from("tee_times").select("created_by, group_id").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.created_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { body, badRequest } = await parseBody<any>(request);
  if (badRequest) return badRequest;
  const { course_name, course_place_id, course_details, tee_datetime, holes, max_players, notes, confirmation_number, is_shareable } = body;

  // Upsert course record if details provided
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

  const updates: Record<string, unknown> = {};
  if (course_name !== undefined) updates.course_name = course_name;
  if (course_place_id !== undefined) updates.course_place_id = course_place_id;
  if (tee_datetime !== undefined) updates.tee_datetime = tee_datetime;
  if (holes !== undefined) updates.holes = holes;
  if (max_players !== undefined) updates.max_players = max_players;
  if (notes !== undefined) updates.notes = notes;
  if (confirmation_number !== undefined) updates.confirmation_number = confirmation_number;
  if (is_shareable !== undefined) updates.is_shareable = Boolean(is_shareable);

  const { data, error } = await svc
    .from("tee_times")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(`tee-times-${existing.group_id}`, "default");
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  // Only the creator can delete
  const { data: existing } = await svc.from("tee_times").select("created_by, group_id").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.created_by !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await svc.from("tee_times").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(`tee-times-${existing.group_id}`, "default");
  return NextResponse.json({ ok: true });
}
