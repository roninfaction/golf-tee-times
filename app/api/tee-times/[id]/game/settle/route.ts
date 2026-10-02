import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { canManageGame, loadGamePlayers } from "@/lib/game-access";
import { computeResult, settle, money, FORMAT_LABELS } from "@/lib/game";
import { pushToUsers } from "@/lib/notify";

type Params = { params: Promise<{ id: string }> };

// POST /api/tee-times/[id]/game/settle: post the game's stake to everyone's tabs.
// The result is recomputed here from the saved scores, never taken from the client.
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const svc = createServiceClient();
  const { allowed, tt } = await canManageGame(svc, teeTimeId, user.id);
  if (!tt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Only players in this round can settle its bet." }, { status: 403 });
  if (!tt.stake_cents) return NextResponse.json({ error: "There's no money on this game." }, { status: 400 });

  const { players, teams, scores } = await loadGamePlayers(svc, teeTimeId);
  const result = computeResult(tt.format, teams, players, scores);
  const entries = settle(result, players, tt.stake_cents);
  if (!entries.length) {
    return NextResponse.json({ error: result.state === "tie" ? "It's a tie, so nobody owes anything." : "There's no winner yet." }, { status: 400 });
  }

  const note = `${FORMAT_LABELS[tt.format ?? ""] ?? "Game"} at ${tt.course_name}`.slice(0, 120);
  const { error } = await svc.from("side_bets").insert(entries.map(e => ({
    created_by: user.id, winner_id: e.winnerId, loser_id: e.loserId, amount_cents: e.cents,
    note, kind: "game", tee_time_id: teeTimeId,
  })));
  if (error) {
    // 23505 = the unique index on (round, winner, loser): someone already settled it.
    if (error.code === "23505") return NextResponse.json({ error: "This bet is already settled." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // One push per person with their own net for the game.
  const net = new Map<string, number>();
  for (const e of entries) {
    net.set(e.winnerId, (net.get(e.winnerId) ?? 0) + e.cents);
    net.set(e.loserId, (net.get(e.loserId) ?? 0) - e.cents);
  }
  await Promise.all([...net.entries()].filter(([uid]) => uid !== user.id).map(([uid, cents]) =>
    pushToUsers(svc, [uid], {
      title: result.headline,
      body: cents > 0 ? `You won ${money(cents)}. It's on your tab.` : `You owe ${money(cents)}. It's on your tab.`,
      data: { url: "/tabs" },
    })
  ));

  return NextResponse.json({ ok: true, entries });
}

// DELETE /api/tee-times/[id]/game/settle: undo a settled game (wrong score, wrong teams).
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const svc = createServiceClient();
  const { allowed, tt } = await canManageGame(svc, teeTimeId, user.id);
  if (!tt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Only players in this round can undo its bet." }, { status: 403 });

  const { error } = await svc.from("side_bets").delete().eq("tee_time_id", teeTimeId).eq("kind", "game");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
