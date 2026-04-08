import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
