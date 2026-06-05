import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/groups/[id] — update group settings (admin only)
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;
  const { body, badRequest } = await parseBody<Record<string, unknown>>(request);
  if (badRequest) return badRequest;
  const svc = createServiceClient();

  // Verify admin
  const { data: membership } = await svc
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });
  if (membership.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const allowed = ["name", "timezone", "photo_url", "default_tee_interval", "max_members"];
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  if (!Object.keys(updates).length) return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const { error } = await svc.from("groups").update(updates).eq("id", groupId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/groups/[id]/leave — handled separately (see leave/route.ts)
