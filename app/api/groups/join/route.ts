import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await request.json();
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: existing } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You are already in a group" }, { status: 400 });
  }

  const { data: group } = await svc
    .from("groups")
    .select("id")
    .eq("id", groupId)
    .single();

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Ensure profile exists before inserting group_member (FK requirement)
  await svc.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    display_name: (user.email ?? "").split("@")[0],
  }, { onConflict: "id", ignoreDuplicates: true });

  const { error } = await svc
    .from("group_members")
    .insert({ group_id: groupId, user_id: user.id, role: "member" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
