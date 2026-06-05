import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

// POST /api/orgs — create an org; creator becomes owner
export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ name: string; slug?: string }>(request);
  if (badRequest) return badRequest;
  const { name, slug } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const svc = createServiceClient();

  // Ensure profile exists
  await svc.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    display_name: (user.email ?? "").split("@")[0],
  }, { onConflict: "id", ignoreDuplicates: true });

  const { data: org, error: orgError } = await svc
    .from("organizations")
    .insert({ name: name.trim(), slug: slug?.trim() || null })
    .select()
    .single();

  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });

  const { error: memberError } = await svc
    .from("org_members")
    .insert({ org_id: org.id, user_id: user.id, role: "owner" });

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json(org, { status: 201 });
}
