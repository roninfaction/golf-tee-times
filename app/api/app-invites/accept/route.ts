import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

// POST /api/app-invites/accept — called after a signed-in user lands on /welcome/[token].
// Stamps referral attribution (once, never overwritten) and reports whether the
// user already belongs to a group, so the client can force group creation if not.
export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ token: string }>(request);
  if (badRequest) return badRequest;
  const { token } = body;
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: invite } = await svc
    .from("app_invites")
    .select("inviter_id")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Ensure profile exists, then stamp invited_by exactly once (never self, never overwrite).
  await svc.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    display_name: (user.email ?? "").split("@")[0],
  }, { onConflict: "id", ignoreDuplicates: true });

  if (invite.inviter_id && invite.inviter_id !== user.id) {
    await svc
      .from("profiles")
      .update({ invited_by: invite.inviter_id })
      .eq("id", user.id)
      .is("invited_by", null);
  }

  const { count } = await svc
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true, hasGroup: (count ?? 0) > 0 });
}
