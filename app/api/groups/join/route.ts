import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ groupId: string }>(request);
  if (badRequest) return badRequest;
  const { groupId } = body;
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  const svc = createServiceClient();

  const { data: group } = await svc
    .from("groups")
    .select("id, org_id")
    .eq("id", groupId)
    .single();

  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Ensure profile exists
  await svc.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    display_name: (user.email ?? "").split("@")[0],
  }, { onConflict: "id", ignoreDuplicates: true });

  // Join the group — DB unique constraint handles already-a-member gracefully
  const { error } = await svc
    .from("group_members")
    .insert({ group_id: groupId, user_id: user.id, role: "member" });

  if (error && !error.message.includes("duplicate")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If the group belongs to an org, also join the org as a member
  if (group.org_id) {
    await svc.from("org_members").upsert({
      org_id: group.org_id,
      user_id: user.id,
      role: "member",
    }, { onConflict: "org_id,user_id", ignoreDuplicates: true });
  }

  // Set as active group if user has none
  await svc
    .from("profiles")
    .update({ active_group_id: groupId })
    .eq("id", user.id)
    .is("active_group_id", null);

  return NextResponse.json({ ok: true, group_id: groupId });
}
