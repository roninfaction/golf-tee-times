import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ step: "auth", error: "No token" }, { status: 401 });

  const svc = createServiceClient();
  const { data: { user }, error: authError } = await svc.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ step: "auth", error: authError?.message ?? "No user" }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ step: "validation", error: "name required" }, { status: 400 });

  // Check if user is already in a group
  const { data: existing } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ step: "already_member", error: "You are already in a group", group_id: existing.group_id }, { status: 400 });
  }

  // Ensure profile exists (required for group_members FK)
  const { data: existingProfile, error: profileSelectError } = await svc
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profileInsertError } = await svc.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      display_name: (user.email ?? "").split("@")[0],
    });
    if (profileInsertError) {
      return NextResponse.json({ step: "profile_insert", error: profileInsertError.message }, { status: 500 });
    }
  }

  // Create the group
  const { data: group, error: groupError } = await svc
    .from("groups")
    .insert({ name: name.trim() })
    .select()
    .single();

  if (groupError) return NextResponse.json({ step: "group_insert", error: groupError.message }, { status: 500 });

  // Add creator as admin
  const { error: memberError } = await svc
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id, role: "admin" });

  if (memberError) return NextResponse.json({ step: "member_insert", error: memberError.message, group_id: group.id, user_id: user.id }, { status: 500 });

  return NextResponse.json({ step: "done", ...group }, { status: 201 });
}
