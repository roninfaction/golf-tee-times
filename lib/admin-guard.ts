// Shared guard for all /api/admin/* routes.
// Returns the user if super_admin, otherwise null.

import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { NextRequest, NextResponse } from "next/server";

export async function requireSuperAdmin(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_super_admin) {
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, error: null };
}
