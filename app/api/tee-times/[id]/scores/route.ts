import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

type Params = { params: Promise<{ id: string }> };

// GET /api/tee-times/[id]/scores — all scores for a tee time (group members only)
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const svc = createServiceClient();

  const { data, error } = await svc
    .from("round_scores")
    .select("*, profile:profiles(id, display_name, avatar_url, ghin_handicap_index), guest_invite:guest_invites(id, accepted_name, team_id)")
    .eq("tee_time_id", teeTimeId)
    .order("gross_score", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/tee-times/[id]/scores — upsert a score for the authenticated user (or a guest, creator only)
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { body, badRequest } = await parseBody<any>(request);
  if (badRequest) return badRequest;
  const { gross_score, handicap_used, scorecard_image_url, source, notes, guest_invite_id, hole_scores } = body;

  if (!gross_score || gross_score < 50 || gross_score > 180) {
    return NextResponse.json({ error: "gross_score must be between 50 and 180" }, { status: 400 });
  }

  if (hole_scores !== undefined && hole_scores !== null) {
    if (!Array.isArray(hole_scores) || hole_scores.length > 18) {
      return NextResponse.json({ error: "hole_scores must be an array of up to 18 values" }, { status: 400 });
    }
    for (const s of hole_scores) {
      if (!Number.isInteger(s) || s < 1 || s > 20) {
        return NextResponse.json({ error: "Each hole score must be a whole number between 1 and 20" }, { status: 400 });
      }
    }
  }

  const svc = createServiceClient();

  if (guest_invite_id) {
    // Creator or group admin: post score on behalf of a guest
    const { data: tt } = await svc.from("tee_times").select("created_by, group_id").eq("id", teeTimeId).single();
    if (!tt) return NextResponse.json({ error: "Tee time not found" }, { status: 404 });
    const isCreator = tt.created_by === user.id;
    let isGroupAdmin = false;
    if (!isCreator) {
      const { data: gm } = await svc.from("group_members").select("role").eq("group_id", tt.group_id).eq("user_id", user.id).maybeSingle();
      isGroupAdmin = gm?.role === "admin";
    }
    if (!isCreator && !isGroupAdmin) {
      return NextResponse.json({ error: "Only the creator or a group admin can post scores for guests" }, { status: 403 });
    }

    const { data: invite } = await svc
      .from("guest_invites")
      .select("id")
      .eq("id", guest_invite_id)
      .eq("tee_time_id", teeTimeId)
      .maybeSingle();
    if (!invite) return NextResponse.json({ error: "Guest not found on this tee time" }, { status: 404 });

    const { data, error } = await svc
      .from("round_scores")
      .upsert({
        tee_time_id: teeTimeId,
        user_id: null,
        guest_invite_id,
        gross_score: parseInt(gross_score),
        handicap_used: handicap_used ?? null,
        scorecard_image_url: scorecard_image_url ?? null,
        source: source ?? "manual",
        notes: notes ?? null,
        hole_scores: hole_scores ?? null,
      }, { onConflict: "tee_time_id,guest_invite_id" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  const { target_user_id } = body;

  // Creator or group admin posting/editing a score on behalf of another member
  if (target_user_id && target_user_id !== user.id) {
    const { data: tt } = await svc.from("tee_times").select("created_by, group_id").eq("id", teeTimeId).single();
    if (!tt) return NextResponse.json({ error: "Tee time not found" }, { status: 404 });

    const isCreator = tt.created_by === user.id;
    const [{ data: rsvp }, { data: gm }] = await Promise.all([
      svc.from("rsvps").select("id").eq("tee_time_id", teeTimeId).eq("user_id", target_user_id).maybeSingle(),
      isCreator
        ? Promise.resolve({ data: null })
        : svc.from("group_members").select("role").eq("group_id", tt.group_id).eq("user_id", user.id).maybeSingle(),
    ]);
    const isGroupAdmin = gm?.role === "admin";
    if (!isCreator && !isGroupAdmin) {
      return NextResponse.json({ error: "Only the creator or a group admin can post scores for other members" }, { status: 403 });
    }
    if (!rsvp) {
      return NextResponse.json({ error: "Member is not on this tee time" }, { status: 404 });
    }
    const { data, error } = await svc
      .from("round_scores")
      .upsert({
        tee_time_id: teeTimeId,
        user_id: target_user_id,
        gross_score: parseInt(gross_score),
        handicap_used: handicap_used ?? null,
        scorecard_image_url: scorecard_image_url ?? null,
        source: source ?? "manual",
        notes: notes ?? null,
        hole_scores: hole_scores ?? null,
      }, { onConflict: "tee_time_id,user_id" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  // Standard: post own score — verify RSVP or creator status
  const [{ data: rsvp }, { data: tt }] = await Promise.all([
    svc.from("rsvps").select("id").eq("tee_time_id", teeTimeId).eq("user_id", user.id).maybeSingle(),
    svc.from("tee_times").select("created_by").eq("id", teeTimeId).single(),
  ]);

  if (!rsvp && tt?.created_by !== user.id) {
    return NextResponse.json({ error: "You are not on this tee time" }, { status: 403 });
  }

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
      hole_scores: hole_scores ?? null,
    }, { onConflict: "tee_time_id,user_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
