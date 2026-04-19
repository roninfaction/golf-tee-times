import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { sendWebPush, sendEmptyPush } from "@/lib/web-push-server";

export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?empty=1 sends an unencrypted push — fires push event with event.data=null on device.
  // Use this to test delivery independently of encryption.
  const empty = new URL(request.url).searchParams.get("empty") === "1";

  const svc = createServiceClient();
  const { data: profile, error: dbError } = await svc
    .from("profiles")
    .select("push_subscription")
    .eq("id", user.id)
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = (profile as any)?.push_subscription;
  if (!sub) {
    return NextResponse.json({ error: "no_subscription", message: "No push subscription found — tap Re-enable on this device first." }, { status: 400 });
  }

  const endpoint: string = sub.endpoint ?? "";
  const pushService = new URL(endpoint).hostname;

  const result = empty
    ? await sendEmptyPush(sub)
    : await sendWebPush(sub, { title: "Test notification ⛳", body: "Push notifications are working!" });

  if (!result.ok) {
    return NextResponse.json({
      error: "push_failed",
      status: result.status,
      pushService,
      body: result.body,
      message: `Push service (${pushService}) returned HTTP ${result.status}: ${result.body ?? "no body"}`,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: empty ? "Empty push sent!" : "Notification sent!", pushService, status: result.status });
}
