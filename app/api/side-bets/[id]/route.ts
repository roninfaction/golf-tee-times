import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/side-bets/[id]: either person on a bet can take it back (logged by mistake).
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const svc = createServiceClient();
  const { data: bet } = await svc.from("side_bets").select("winner_id, loser_id").eq("id", id).maybeSingle();
  if (!bet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (bet.winner_id !== user.id && bet.loser_id !== user.id) {
    return NextResponse.json({ error: "That bet isn't yours." }, { status: 403 });
  }

  const { error } = await svc.from("side_bets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
