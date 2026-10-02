import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";
import { balanceWith, loadBetsBetween } from "@/lib/side-bets";
import { money } from "@/lib/game";
import { pushToUsers } from "@/lib/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/side-bets/settle: square up a tab. Writes an offsetting row so history stays.
export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ other_user_id: string }>(request);
  if (badRequest) return badRequest;
  const other = body.other_user_id;
  if (!other || !UUID.test(other) || other === user.id) {
    return NextResponse.json({ error: "Pick whose tab to settle." }, { status: 400 });
  }

  const svc = createServiceClient();
  const bets = await loadBetsBetween(svc, user.id, other);
  const owedToMe = balanceWith(bets, user.id, other);
  if (owedToMe === 0) return NextResponse.json({ error: "You're already square." }, { status: 400 });

  // If they owe me, the offset says I owe them the same amount, and vice versa.
  const { error } = await svc.from("side_bets").insert({
    created_by: user.id,
    winner_id: owedToMe > 0 ? other : user.id,
    loser_id: owedToMe > 0 ? user.id : other,
    amount_cents: Math.abs(owedToMe),
    note: "Settled up",
    kind: "settle",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: me } = await svc.from("profiles").select("display_name").eq("id", user.id).single();
  await pushToUsers(svc, [other], {
    title: "Tab settled",
    body: `${me?.display_name ?? "Someone"} marked your ${money(owedToMe)} tab as settled. You're square.`,
    data: { url: "/tabs" },
  });

  return NextResponse.json({ ok: true });
}
