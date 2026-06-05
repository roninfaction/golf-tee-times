import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { parseBody } from "@/lib/parse-body";

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ subscription: { endpoint: string; p256dh: string; auth: string } }>(request);
  if (badRequest) return badRequest;
  const { subscription } = body;
  if (!subscription?.endpoint || !subscription?.p256dh || !subscription?.auth) {
    return NextResponse.json({ error: "subscription with endpoint, p256dh, auth required" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .upsert({
      id: user.id,
      email: user.email ?? "",
      push_subscription: subscription,
    }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
