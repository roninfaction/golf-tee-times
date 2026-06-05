import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

// GET /api/groups/me — returns all groups with role, used by client forms for timezone + context
export async function GET(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  const { data: profile } = await svc
    .from("profiles")
    .select("active_group_id, forwarding_group_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data, error } = await svc
    .from("group_members")
    .select("role, group:groups(id, name, timezone, photo_url, default_tee_interval, org_id)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = (data ?? []).map((m) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(m.group as any),
    role: m.role,
  }));

  return NextResponse.json({
    groups,
    active_group_id: profile?.active_group_id ?? groups[0]?.id ?? null,
    forwarding_group_id: profile?.forwarding_group_id ?? groups[0]?.id ?? null,
  });
}

// PATCH /api/groups/me — set active_group_id or forwarding_group_id on profile
export async function PATCH(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<Record<string, unknown>>(request);
  if (badRequest) return badRequest;
  const allowed = ["active_group_id", "forwarding_group_id"];
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  if (!Object.keys(updates).length) return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const svc = createServiceClient();
  const { error } = await svc.from("profiles").update(updates).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
