import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

type Params = { params: Promise<{ id: string }> };

// GET /api/tee-times/[id]/teams — get all teams + assignments for a tee time
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const svc = createServiceClient();

  const { data: teams, error } = await svc
    .from("tee_time_teams")
    .select("*")
    .eq("tee_time_id", teeTimeId)
    .order("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(teams ?? []);
}

// POST /api/tee-times/[id]/teams — create teams + set format (creator only)
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const body = await request.json();
  const { teams, format } = body as {
    teams: { name: string; color?: string }[];
    format: string;
  };

  if (!teams?.length || !format) return NextResponse.json({ error: "teams and format required" }, { status: 400 });

  const validFormats = ["stroke", "scramble", "best_ball", "stableford", "match_play"];
  if (!validFormats.includes(format)) return NextResponse.json({ error: "Invalid format" }, { status: 400 });

  const svc = createServiceClient();

  // Verify creator
  const { data: tt } = await svc.from("tee_times").select("created_by").eq("id", teeTimeId).single();
  if (!tt || tt.created_by !== user.id) return NextResponse.json({ error: "Creator only" }, { status: 403 });

  // Delete existing teams for a clean slate
  await svc.from("tee_time_teams").delete().eq("tee_time_id", teeTimeId);

  // Insert new teams
  const { data: created, error: insertErr } = await svc
    .from("tee_time_teams")
    .insert(teams.map(t => ({ tee_time_id: teeTimeId, name: t.name, color: t.color ?? null })))
    .select();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Set format on the tee time
  await svc.from("tee_times").update({ format }).eq("id", teeTimeId);

  return NextResponse.json(created, { status: 201 });
}

// PATCH /api/tee-times/[id]/teams — update team assignments on rsvps
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const { assignments } = await request.json() as {
    assignments: { rsvp_id: string; team_id: string | null }[];
  };

  if (!assignments?.length) return NextResponse.json({ error: "assignments required" }, { status: 400 });

  const svc = createServiceClient();

  // Verify creator or group admin
  const { data: tt } = await svc.from("tee_times").select("created_by, group_id").eq("id", teeTimeId).single();
  if (!tt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (tt.created_by !== user.id) {
    const { data: membership } = await svc
      .from("group_members")
      .select("role")
      .eq("group_id", tt.group_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.role !== "admin") return NextResponse.json({ error: "Creator or admin only" }, { status: 403 });
  }

  // Apply each assignment
  await Promise.all(
    assignments.map(a =>
      svc.from("rsvps").update({ team_id: a.team_id }).eq("id", a.rsvp_id)
    )
  );

  return NextResponse.json({ ok: true });
}
