import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin-guard";

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  const svc = createServiceClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalUsers },
    { count: totalOrgs },
    { count: totalGroups },
    { count: totalTeeTimes },
    { count: recentUsers },
    { count: recentTeeTimes },
  ] = await Promise.all([
    svc.from("profiles").select("id", { count: "exact", head: true }),
    svc.from("organizations").select("id", { count: "exact", head: true }),
    svc.from("groups").select("id", { count: "exact", head: true }),
    svc.from("tee_times").select("id", { count: "exact", head: true }),
    svc.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    svc.from("tee_times").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
  ]);

  return NextResponse.json({
    total_users: totalUsers ?? 0,
    total_orgs: totalOrgs ?? 0,
    total_groups: totalGroups ?? 0,
    total_tee_times: totalTeeTimes ?? 0,
    recent_users_30d: recentUsers ?? 0,
    recent_tee_times_30d: recentTeeTimes ?? 0,
  });
}
