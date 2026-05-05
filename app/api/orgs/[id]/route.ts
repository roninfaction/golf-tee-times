import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

type Params = { params: Promise<{ id: string }> };

// GET /api/orgs/[id] — org details + groups + member count (org members only)
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  const svc = createServiceClient();

  const { data: org, error } = await svc
    .from("organizations")
    .select("*, groups(id, name, invite_code, timezone, photo_url, default_tee_interval)")
    .eq("id", orgId)
    .single();

  if (error || !org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { count } = await svc
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  return NextResponse.json({ ...org, member_count: count ?? 0 });
}

// PATCH /api/orgs/[id] — update org (admin/owner only)
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  const body = await request.json();
  const svc = createServiceClient();

  const { data: membership } = await svc
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const allowed = ["name", "slug", "logo_url", "billing_status"];
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  if (!Object.keys(updates).length) return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const { error } = await svc.from("organizations").update(updates).eq("id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
