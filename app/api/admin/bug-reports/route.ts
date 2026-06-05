import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin-guard";

export async function GET(request: NextRequest) {
  const { user, error } = await requireSuperAdmin(request);
  if (!user) return error!;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "25", 10), 100);

  const svc = createServiceClient();

  let query = svc
    .from("bug_reports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && ["open", "in_progress", "resolved", "dismissed"].includes(status)) {
    query = query.eq("status", status);
  }

  const { data: reports, count, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Generate signed URLs for screenshots
  const reportsWithUrls = await Promise.all(
    (reports ?? []).map(async (report) => {
      if (!report.screenshot_path) return report;
      const { data: signed } = await svc.storage
        .from("bug-report-screenshots")
        .createSignedUrl(report.screenshot_path, 600); // 10 min TTL
      return { ...report, screenshot_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ reports: reportsWithUrls, total: count ?? 0 });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireSuperAdmin(request);
  if (!user) return error!;

  let body: { id?: string; status?: string; admin_notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id, status, admin_notes } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined) {
    if (!["open", "in_progress", "resolved", "dismissed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = status;
  }
  if (admin_notes !== undefined) updates.admin_notes = admin_notes;

  const svc = createServiceClient();
  const { error: dbError } = await svc.from("bug_reports").update(updates).eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
