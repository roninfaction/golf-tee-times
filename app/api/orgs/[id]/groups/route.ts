import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

type Params = { params: Promise<{ id: string }> };

// POST /api/orgs/[id]/groups — create a new group within an org (admin only)
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  const { body, badRequest } = await parseBody<{ name: string; timezone?: string }>(request);
  if (badRequest) return badRequest;
  const { name, timezone } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

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

  const { data: group, error: groupError } = await svc
    .from("groups")
    .insert({ name: name.trim(), org_id: orgId, timezone: timezone ?? "America/Los_Angeles" })
    .select()
    .single();

  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });

  // Add creator as group admin too
  await svc.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "admin",
  });

  return NextResponse.json(group, { status: 201 });
}
