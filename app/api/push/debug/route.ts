import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";

export async function GET(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: profile, error: dbError } = await svc
    .from("profiles")
    .select("push_subscription")
    .eq("id", user.id)
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = (profile as any)?.push_subscription;
  if (!sub) return NextResponse.json({ has_subscription: false });

  const endpoint: string = sub.endpoint ?? "";
  const p256dh: string = sub.p256dh ?? "";
  const auth: string = sub.auth ?? "";

  let p256dhBytes = 0;
  let authBytes = 0;
  try {
    p256dhBytes = atob(p256dh.replace(/-/g, "+").replace(/_/g, "/")).length;
    authBytes = atob(auth.replace(/-/g, "+").replace(/_/g, "/")).length;
  } catch { /* ignore */ }

  let endpointHost = "";
  try { endpointHost = new URL(endpoint).hostname; } catch { /* ignore */ }

  return NextResponse.json({
    has_subscription: true,
    endpoint_host: endpointHost,
    p256dh_chars: p256dh.length,
    p256dh_bytes: p256dhBytes,  // expected: 65 (uncompressed P-256)
    auth_chars: auth.length,
    auth_bytes: authBytes,      // expected: 16
  });
}
