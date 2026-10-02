import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

// PATCH /api/profile/venmo — save (or clear) the Venmo username friends use to pay a side bet tab
export async function PATCH(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ venmo_username?: string | null }>(request);
  if (badRequest) return badRequest;

  const raw = (body.venmo_username ?? "").trim().replace(/^@/, "");
  if (raw && !/^[A-Za-z0-9_-]{5,30}$/.test(raw)) {
    return NextResponse.json({ error: "That doesn't look like a Venmo username. It's 5 to 30 letters, numbers, dashes or underscores." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from("profiles").update({ venmo_username: raw || null }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, venmo_username: raw || null });
}
