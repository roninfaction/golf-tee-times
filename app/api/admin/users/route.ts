import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/parse-body";

export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const limit = Math.min(100, parseInt(params.get("limit") ?? "50", 10));
  const offset = Math.max(0, parseInt(params.get("offset") ?? "0", 10));
  const search = params.get("search") ?? "";

  const svc = createServiceClient();
  let query = svc
    .from("profiles")
    .select("id, display_name, email, is_super_admin, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const [{ data, error: dbErr }, { data: activity, error: actErr }] = await Promise.all([
    query,
    svc.rpc("admin_user_activity"),
  ]);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map((activity ?? []).map((a: any) => [a.user_id, a]));
  return NextResponse.json((data ?? []).map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a: any = byId.get(p.id) ?? {};
    return {
      ...p,
      last_seen: a.last_seen ?? null,
      tee_times_created: Number(a.tee_times_created ?? 0),
      rsvps_answered: Number(a.rsvps_answered ?? 0),
      rounds_scored: Number(a.rounds_scored ?? 0),
      group_names: a.group_names ?? null,
      push_on: Boolean(a.push_on),
    };
  }));
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireSuperAdmin(request);
  if (error) return error;

  const { body, badRequest } = await parseBody<{ user_id: string; is_super_admin: boolean }>(request);
  if (badRequest) return badRequest;
  const { user_id, is_super_admin } = body;
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  // Prevent self-demotion
  if (user_id === user!.id && is_super_admin === false) {
    return NextResponse.json({ error: "Cannot remove your own super admin status" }, { status: 400 });
  }

  const svc = createServiceClient();
  const updates: Record<string, unknown> = {};
  if (is_super_admin !== undefined) updates.is_super_admin = Boolean(is_super_admin);

  const { error: dbErr } = await svc.from("profiles").update(updates).eq("id", user_id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
