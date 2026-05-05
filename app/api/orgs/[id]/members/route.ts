import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

type Params = { params: Promise<{ id: string }> };

// GET /api/orgs/[id]/members — all members across all groups in the org (admin only)
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
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

  const params2 = request.nextUrl.searchParams;
  const limit = Math.min(100, parseInt(params2.get("limit") ?? "50", 10));
  const offset = Math.max(0, parseInt(params2.get("offset") ?? "0", 10));
  const search = params2.get("search") ?? "";

  let query = svc
    .from("org_members")
    .select("id, role, joined_at, profile:profiles(id, display_name, email, avatar_url)")
    .eq("org_id", orgId)
    .order("joined_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`, { referencedTable: "profiles" });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// PATCH /api/orgs/[id]/members/[userId] handled in [userId] sub-route
