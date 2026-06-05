import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

type Params = { params: Promise<{ id: string; userId: string }> };

// PATCH /api/orgs/[id]/members/[userId] — change role (admin only)
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId, userId } = await params;
  const { body, badRequest } = await parseBody<{ role: string }>(request);
  if (badRequest) return badRequest;
  const { role } = body;

  if (!["admin", "member"].includes(role)) {
    return NextResponse.json({ error: "role must be admin or member" }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: myMembership } = await svc
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myMembership || !["owner", "admin"].includes(myMembership.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { error } = await svc
    .from("org_members")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/orgs/[id]/members/[userId] — remove member (admin only)
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId, userId } = await params;
  const svc = createServiceClient();

  const { data: myMembership } = await svc
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myMembership || !["owner", "admin"].includes(myMembership.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { error } = await svc
    .from("org_members")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
