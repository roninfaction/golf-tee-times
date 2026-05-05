import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

type Params = { params: Promise<{ id: string }> };

// GET /api/tee-times/[id]/scores — all scores for a tee time (group members only)
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const svc = createServiceClient();

  const { data, error } = await svc
    .from("round_scores")
    .select("*, profile:profiles(id, display_name, avatar_url, ghin_handicap_index)")
    .eq("tee_time_id", teeTimeId)
    .order("gross_score", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/tee-times/[id]/scores — upsert a score for the authenticated user
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const body = await request.json();
  const { gross_score, handicap_used, scorecard_image_url, source, notes } = body;

  if (!gross_score || gross_score < 50 || gross_score > 180) {
    return NextResponse.json({ error: "gross_score must be between 50 and 180" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Verify user has an RSVP to this tee time
  const { data: rsvp } = await svc
    .from("rsvps")
    .select("id")
    .eq("tee_time_id", teeTimeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!rsvp) return NextResponse.json({ error: "You are not on this tee time" }, { status: 403 });

  const { data, error } = await svc
    .from("round_scores")
    .upsert({
      tee_time_id: teeTimeId,
      user_id: user.id,
      gross_score: parseInt(gross_score),
      handicap_used: handicap_used ?? null,
      scorecard_image_url: scorecard_image_url ?? null,
      source: source ?? "manual",
      notes: notes ?? null,
    }, { onConflict: "tee_time_id,user_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
