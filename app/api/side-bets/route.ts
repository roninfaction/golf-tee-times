import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";
import { groupmates } from "@/lib/side-bets";
import { money } from "@/lib/game";
import { pushToUsers } from "@/lib/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/side-bets: log a bet between me and a groupmate.
export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ other_user_id: string; amount_cents: number; note?: string; i_won: boolean; tee_time_id?: string | null }>(request);
  if (badRequest) return badRequest;
  const { other_user_id, i_won } = body;
  const amount = Math.round(Number(body.amount_cents));
  const note = body.note?.trim().slice(0, 120) || null;

  if (!other_user_id || !UUID.test(other_user_id) || other_user_id === user.id) {
    return NextResponse.json({ error: "Pick who the bet is with." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    return NextResponse.json({ error: "Enter an amount between $0.01 and $10,000." }, { status: 400 });
  }
  if (body.tee_time_id && !UUID.test(body.tee_time_id)) {
    return NextResponse.json({ error: "Invalid round" }, { status: 400 });
  }

  const svc = createServiceClient();
  const mates = await groupmates(svc, user.id);
  if (!mates.some(m => m.id === other_user_id)) {
    return NextResponse.json({ error: "You can only bet with people in your groups." }, { status: 403 });
  }

  const { data, error } = await svc.from("side_bets").insert({
    created_by: user.id,
    winner_id: i_won ? user.id : other_user_id,
    loser_id: i_won ? other_user_id : user.id,
    amount_cents: amount,
    note,
    kind: "bet",
    tee_time_id: body.tee_time_id ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: me } = await svc.from("profiles").select("display_name").eq("id", user.id).single();
  const who = me?.display_name ?? "Someone";
  await pushToUsers(svc, [other_user_id], {
    title: "Side bet logged",
    body: `${who}: ${i_won ? `you owe ${money(amount)}` : `you won ${money(amount)}`}${note ? ` · ${note}` : ""}`,
    data: { url: "/tabs" },
  });

  return NextResponse.json(data, { status: 201 });
}
