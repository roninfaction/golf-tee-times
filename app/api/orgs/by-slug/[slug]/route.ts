import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ slug: string }> };

// GET /api/orgs/by-slug/[slug] — public endpoint for the org join landing page
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const svc = createServiceClient();

  const { data, error } = await svc
    .from("organizations")
    .select("id, name, slug, logo_url")
    .eq("slug", slug)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
