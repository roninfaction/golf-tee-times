import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";
import { canManageGame } from "@/lib/game-access";

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

// POST /api/tee-times/[id]/scores — upsert a score for the authenticated user, or for anyone
// on the round (member or guest) when the caller can run the round's game.
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { body, badRequest } = await parseBody<any>(request);
  if (badRequest) return badRequest;
  const { handicap_used, scorecard_image_url, source, notes, guest_invite_id, hole_scores } = body;
  let { gross_score } = body;

  // hole_scores is an object keyed by hole number, e.g. {"1": 4, "2": 5} — matches the OCR
  // output and every consumer (share page, GameSection, DigitalScorecard) which read it as such.
  if (hole_scores !== undefined && hole_scores !== null) {
    if (typeof hole_scores !== "object" || Array.isArray(hole_scores)) {
      return NextResponse.json({ error: "hole_scores must be an object keyed by hole number" }, { status: 400 });
    }
    const entries = Object.entries(hole_scores as Record<string, unknown>);
    if (entries.length > 18) {
      return NextResponse.json({ error: "hole_scores can have at most 18 holes" }, { status: 400 });
    }
    for (const [hole, strokes] of entries) {
      const h = Number(hole);
      if (!Number.isInteger(h) || h < 1 || h > 18) {
        return NextResponse.json({ error: "hole_scores keys must be hole numbers 1-18" }, { status: 400 });
      }
      if (!Number.isInteger(strokes) || (strokes as number) < 1 || (strokes as number) > 20) {
        return NextResponse.json({ error: "Each hole score must be a whole number between 1 and 20" }, { status: 400 });
      }
    }
    // Hole-by-hole entry sends no total; the total is the holes added up.
    if (!gross_score && entries.length > 0) {
      gross_score = entries.reduce((sum, [, strokes]) => sum + (strokes as number), 0);
    }
  }

  // 18 covers a 9-hole round; the old 50 floor rejected real 9-hole totals.
  if (!gross_score || gross_score < 18 || gross_score > 180) {
    return NextResponse.json({ error: "gross_score must be between 18 and 180" }, { status: 400 });
  }

  const svc = createServiceClient();

  if (guest_invite_id) {
    // Someone running the game posts a guest's score
    const { tt, allowed } = await canManageGame(svc, teeTimeId, user.id);
    if (!tt) return NextResponse.json({ error: "Tee time not found" }, { status: 404 });
    if (!allowed) {
      return NextResponse.json({ error: "Only players in this round can post scores for guests" }, { status: 403 });
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

  // Someone running the game posting/editing a score on behalf of another member
  if (target_user_id && target_user_id !== user.id) {
    const [{ tt, allowed }, { data: rsvp }] = await Promise.all([
      canManageGame(svc, teeTimeId, user.id),
      svc.from("rsvps").select("id").eq("tee_time_id", teeTimeId).eq("user_id", target_user_id).maybeSingle(),
    ]);
    if (!tt) return NextResponse.json({ error: "Tee time not found" }, { status: 404 });
    if (!allowed) {
      return NextResponse.json({ error: "Only players in this round can post scores for other members" }, { status: 403 });
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

// DELETE /api/tee-times/[id]/scores — remove a score entered by mistake (someone who didn't play)
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const { body, badRequest } = await parseBody<{ score_id: string }>(request);
  if (badRequest) return badRequest;
  if (!body.score_id) return NextResponse.json({ error: "score_id required" }, { status: 400 });

  const svc = createServiceClient();
  const { tt, allowed } = await canManageGame(svc, teeTimeId, user.id);
  if (!tt) return NextResponse.json({ error: "Tee time not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Only players in this round can remove scores" }, { status: 403 });

  const { error } = await svc.from("round_scores").delete().eq("id", body.score_id).eq("tee_time_id", teeTimeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
