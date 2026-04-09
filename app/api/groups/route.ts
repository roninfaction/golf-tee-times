import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: { user }, error: authError } = await svc.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Check if user is already in a group
  const { data: existing } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You are already in a group" }, { status: 400 });
  }

  // Create the group
  const { data: group, error: groupError } = await svc
    .from("groups")
    .insert({ name: name.trim() })
    .select()
    .single();

  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });

  // Add creator as admin
  const { error: memberError } = await svc
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id, role: "admin" });

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json(group, { status: 201 });
}
