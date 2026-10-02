import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";
import { canManageGame } from "@/lib/game-access";
import { formatInfo } from "@/lib/game";

type Params = { params: Promise<{ id: string }> };

type GameBody = {
  format: string;
  stake_cents: number | null;
  teams: { name: string; color: string | null; members: string[] }[];
};

async function isSettled(svc: ReturnType<typeof createServiceClient>, teeTimeId: string) {
  const { count } = await svc.from("side_bets").select("id", { count: "exact", head: true })
    .eq("tee_time_id", teeTimeId).eq("kind", "game");
  return (count ?? 0) > 0;
}

// PUT /api/tee-times/[id]/game: set the game in one go (format, stake, teams + who's on them).
export async function PUT(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const { body, badRequest } = await parseBody<GameBody>(request);
  if (badRequest) return badRequest;

  const info = formatInfo(body.format);
  if (!info) return NextResponse.json({ error: "Pick a game first." }, { status: 400 });

  const stake = body.stake_cents == null ? null : Math.round(Number(body.stake_cents));
  if (stake != null && (!Number.isFinite(stake) || stake <= 0 || stake > 100000)) {
    return NextResponse.json({ error: "The stake has to be between $0.01 and $1,000." }, { status: 400 });
  }

  const teams = info.team ? (body.teams ?? []).filter(t => t.name?.trim()) : [];
  if (info.team && teams.length < 2) {
    return NextResponse.json({ error: "Team games need at least two teams." }, { status: 400 });
  }
  if (teams.length > 4) return NextResponse.json({ error: "Four teams max." }, { status: 400 });

  const svc = createServiceClient();
  const { allowed, tt } = await canManageGame(svc, teeTimeId, user.id);
  if (!tt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Only players in this round can set up its game." }, { status: 403 });
  if (await isSettled(svc, teeTimeId)) {
    return NextResponse.json({ error: "This game's bet is already settled. Undo it before changing the game." }, { status: 409 });
  }

  const { error: ttErr } = await svc.from("tee_times").update({ format: info.value, stake_cents: stake }).eq("id", teeTimeId);
  if (ttErr) return NextResponse.json({ error: ttErr.message }, { status: 500 });

  // Clean slate for teams. Deleting them nulls team_id on rsvps and guest_invites (ON DELETE SET NULL).
  const { error: delErr } = await svc.from("tee_time_teams").delete().eq("tee_time_id", teeTimeId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  if (!teams.length) return NextResponse.json({ ok: true });

  // Ids are minted here so members can be assigned without guessing the insert order.
  const rows = teams.map(t => ({ id: crypto.randomUUID(), tee_time_id: teeTimeId, name: t.name.trim().slice(0, 30), color: t.color }));
  const { error: insErr } = await svc.from("tee_time_teams").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const updates = teams.flatMap((t, i) => (t.members ?? []).map(key => {
    const [type, id] = key.split(":");
    return type === "u"
      ? svc.from("rsvps").update({ team_id: rows[i].id }).eq("tee_time_id", teeTimeId).eq("user_id", id)
      : svc.from("guest_invites").update({ team_id: rows[i].id }).eq("tee_time_id", teeTimeId).eq("id", id);
  }));
  const results = await Promise.all(updates);
  const failed = results.find(r => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/tee-times/[id]/game: no game on this round after all. Scores stay put.
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: teeTimeId } = await params;
  const svc = createServiceClient();
  const { allowed, tt } = await canManageGame(svc, teeTimeId, user.id);
  if (!tt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Only players in this round can change its game." }, { status: 403 });
  if (await isSettled(svc, teeTimeId)) {
    return NextResponse.json({ error: "This game's bet is already settled. Undo it before removing the game." }, { status: 409 });
  }

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    svc.from("tee_time_teams").delete().eq("tee_time_id", teeTimeId),
    svc.from("tee_times").update({ format: null, stake_cents: null }).eq("id", teeTimeId),
  ]);
  const err = e1 ?? e2;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
