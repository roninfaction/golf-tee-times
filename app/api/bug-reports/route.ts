import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { title?: string; description?: string; screenshot_path?: string; page_url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { title, description, screenshot_path, page_url } = body;
  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: profile } = await svc
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const { data, error } = await svc.from("bug_reports").insert({
    user_id: user.id,
    user_name: profile?.display_name ?? null,
    user_email: profile?.email ?? user.email ?? null,
    title: title.trim().slice(0, 120),
    description: description?.trim().slice(0, 2000) ?? null,
    screenshot_path: screenshot_path ?? null,
    page_url: page_url ?? null,
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}
