import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { sendWebPush } from "@/lib/web-push-server";

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

  const endpoint: string = sub?.endpoint ?? "";
  const p256dh: string = sub?.p256dh ?? "";
  const auth: string = sub?.auth ?? "";

  let p256dhBytes = 0;
  let authBytes = 0;
  try {
    p256dhBytes = atob(p256dh.replace(/-/g, "+").replace(/_/g, "/")).length;
    authBytes = atob(auth.replace(/-/g, "+").replace(/_/g, "/")).length;
  } catch { /* ignore */ }

  let endpointHost = "";
  try { endpointHost = new URL(endpoint).hostname; } catch { /* ignore */ }

  // Check VAPID key availability (values redacted, just show presence/length)
  const vapidPublic = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? "";

  // Optionally attempt a live push if ?send=1
  let pushResult: { attempted: boolean; ok?: boolean; status?: number; body?: string } = { attempted: false };
  if (new URL(request.url).searchParams.get("send") === "1" && sub) {
    const result = await sendWebPush(sub, { title: "Debug push", body: "VAPID test from /api/push/debug" });
    pushResult = { attempted: true, ...result };
  }

  return NextResponse.json({
    has_subscription: !!sub,
    endpoint_host: endpointHost,
    p256dh_chars: p256dh.length,
    p256dh_bytes: p256dhBytes,  // expected: 65 (uncompressed P-256)
    auth_chars: auth.length,
    auth_bytes: authBytes,      // expected: 16
    vapid_public_key_present: vapidPublic.length > 0,
    vapid_public_key_chars: vapidPublic.length,
    vapid_private_key_present: vapidPrivate.length > 0,
    vapid_private_key_chars: vapidPrivate.length,
    push_result: pushResult,
  });
}
