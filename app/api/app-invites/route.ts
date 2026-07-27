import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfpack.app";

// POST /api/app-invites — mint a reusable "join the app" link for the caller.
// One link can be texted to anyone; each acceptor signs up and gets their own group.
export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { inviteeName?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional — a nameless reusable link is fine.
  }

  const trimmedName = body.inviteeName?.trim().slice(0, 100) || null;

  const svc = createServiceClient();

  // Ensure the inviter has a profile row (FK target for inviter_id).
  await svc.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    display_name: (user.email ?? "").split("@")[0],
  }, { onConflict: "id", ignoreDuplicates: true });

  const { data: invite, error } = await svc
    .from("app_invites")
    .insert({ inviter_id: user.id, invitee_name: trimmedName })
    .select("token")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = `${APP_URL}/join/${invite.token}`;
  return NextResponse.json({ ok: true, token: invite.token, url }, { status: 201 });
}
