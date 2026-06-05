import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

// PATCH /api/profile/handicap — save handicap index (and optional GHIN number) manually
export async function PATCH(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ handicap_index?: number | null; ghin_number?: string }>(request);
  if (badRequest) return badRequest;
  const { handicap_index, ghin_number } = body;

  // handicap_index can be null (to clear it) or a number 0–54
  if (handicap_index !== null && handicap_index !== undefined) {
    if (isNaN(handicap_index) || handicap_index < 0 || handicap_index > 54) {
      return NextResponse.json({ error: "Handicap must be between 0 and 54" }, { status: 400 });
    }
  }

  const svc = createServiceClient();
  const updates: Record<string, unknown> = {};

  if (handicap_index !== undefined) updates.ghin_handicap_index = handicap_index ?? null;
  if (ghin_number !== undefined) updates.ghin_number = ghin_number || null;

  const { error } = await svc.from("profiles").update(updates).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, handicap_index: updates.ghin_handicap_index });
}
