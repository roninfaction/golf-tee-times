import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

// GET /api/groups — all groups the authenticated user belongs to
export async function GET(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("group_members")
    .select("role, group:groups(id, name, invite_code, timezone, photo_url, max_members, default_tee_interval, org_id)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/groups — create a new group (users can now belong to many groups)
export async function POST(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

  const svc = createServiceClient();
  const { data: { user }, error: authError } = await svc.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: authError?.message ?? "No user" }, { status: 401 });

  const { name, org_id } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Ensure profile exists (required for group_members FK)
  await svc.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    display_name: (user.email ?? "").split("@")[0],
  }, { onConflict: "id", ignoreDuplicates: true });

  const { data: group, error: groupError } = await svc
    .from("groups")
    .insert({ name: name.trim(), org_id: org_id ?? null })
    .select()
    .single();

  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });

  const { error: memberError } = await svc
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id, role: "admin" });

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  // Set as active group if user has no active group yet
  await svc
    .from("profiles")
    .update({ active_group_id: group.id })
    .eq("id", user.id)
    .is("active_group_id", null);

  return NextResponse.json(group, { status: 201 });
}
