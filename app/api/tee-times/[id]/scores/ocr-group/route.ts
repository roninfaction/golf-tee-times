import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { extractGroupScores } from "@/lib/score-ocr";

type Params = { params: Promise<{ id: string }> };

// POST /api/tee-times/[id]/scores/ocr-group
// Creator-only. Scans one scorecard photo and returns gross scores matched to all players.
// Also returns each player's handicap_index from their profile so the UI can pre-fill net scores.
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const { storage_path } = await request.json();
  if (!storage_path) return NextResponse.json({ error: "storage_path required" }, { status: 400 });

  const svc = createServiceClient();

  // Creator only
  const { data: tt } = await svc.from("tee_times").select("created_by").eq("id", teeTimeId).single();
  if (!tt || tt.created_by !== user.id) return NextResponse.json({ error: "Creator only" }, { status: 403 });

  // Fetch all accepted players: rsvps + guests
  const [{ data: rsvps }, { data: guests }] = await Promise.all([
    svc
      .from("rsvps")
      .select("id, user_id, profile:profiles(display_name, ghin_handicap_index)")
      .eq("tee_time_id", teeTimeId)
      .eq("status", "accepted"),
    svc
      .from("guest_invites")
      .select("id, accepted_name, invitee_name")
      .eq("tee_time_id", teeTimeId)
      .eq("status", "accepted"),
  ]);

  type PlayerEntry = {
    user_id: string | null;
    guest_invite_id: string | null;
    display_name: string;
    handicap_index: number | null;
  };

  const allPlayers: PlayerEntry[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(rsvps ?? []).map((r: any) => ({
      user_id: r.user_id as string,
      guest_invite_id: null,
      display_name: (r.profile?.display_name as string) ?? "Unknown",
      handicap_index: (r.profile?.ghin_handicap_index as number | null) ?? null,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(guests ?? []).map((g: any) => ({
      user_id: null,
      guest_invite_id: g.id as string,
      display_name: (g.accepted_name ?? g.invitee_name ?? "Guest") as string,
      handicap_index: null,
    })),
  ];

  // Generate signed URL for GPT-4o
  const { data: signed, error: signErr } = await svc.storage
    .from("scorecards")
    .createSignedUrl(storage_path, 120);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not create signed URL" }, { status: 500 });
  }

  const playerNames = allPlayers.map(p => p.display_name);
  const ocrResults = await extractGroupScores(signed.signedUrl, playerNames);
  if (!ocrResults) return NextResponse.json({ error: "Could not read scorecard" }, { status: 422 });

  // Merge OCR results with full player list:
  // detected players get their score; undetected players appear with gross_score=null
  const merged = allPlayers.map(player => {
    const match = ocrResults.find(r => r.player_name === player.display_name);
    return {
      display_name: player.display_name,
      user_id: player.user_id,
      guest_invite_id: player.guest_invite_id,
      handicap_index: player.handicap_index,
      gross_score: match?.gross_score ?? null,
      confidence: match?.confidence ?? null,
      hole_scores: match?.hole_scores ?? null,
    };
  });

  return NextResponse.json({ players: merged });
}
