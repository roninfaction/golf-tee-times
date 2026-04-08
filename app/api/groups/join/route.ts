import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { groupId } = await request.json();
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  // Check if user is already in any group
  const { data: existing } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You are already in a group" }, { status: 400 });
  }

  // Verify the group exists
  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("id", groupId)
    .single();

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("group_members")
    .insert({ group_id: groupId, user_id: user.id, role: "member" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
