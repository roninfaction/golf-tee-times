import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { playerId } = await request.json();
  if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({ onesignal_player_id: playerId })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
