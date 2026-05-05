import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin-guard";

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const limit = Math.min(100, parseInt(params.get("limit") ?? "50", 10));
  const offset = Math.max(0, parseInt(params.get("offset") ?? "0", 10));

  const svc = createServiceClient();
  const { data, error: dbErr } = await svc
    .from("organizations")
    .select("id, name, slug, billing_status, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // Attach group count per org
  const orgIds = (data ?? []).map((o: { id: string }) => o.id);
  const groupCounts: Record<string, number> = {};
  if (orgIds.length > 0) {
    const { data: groups } = await svc
      .from("groups")
      .select("org_id")
      .in("org_id", orgIds);
    for (const g of groups ?? []) {
      if (g.org_id) groupCounts[g.org_id] = (groupCounts[g.org_id] ?? 0) + 1;
    }
  }

  return NextResponse.json((data ?? []).map((o: { id: string }) => ({ ...o, group_count: groupCounts[o.id] ?? 0 })));
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  const { org_id, billing_status } = await request.json();
  if (!org_id || !billing_status) return NextResponse.json({ error: "org_id and billing_status required" }, { status: 400 });

  const svc = createServiceClient();
  const { error: dbErr } = await svc
    .from("organizations")
    .update({ billing_status })
    .eq("id", org_id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
