import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/parse-body";
import { sendWebPush, type PushSubscription } from "@/lib/web-push-server";
import { clearExpiredPushSubscriptions } from "@/lib/push-cleanup";

// Admin broadcast: push a custom message to everyone, or to a picked list of users.
// Counts come back per outcome so the admin screen can say exactly who got it.
export async function POST(request: NextRequest) {
  const { error } = await requireSuperAdmin(request);
  if (error) return error;

  const { body, badRequest } = await parseBody<{ title?: string; body?: string; all?: boolean; user_ids?: string[] }>(request);
  if (badRequest) return badRequest;

  const title = (body.title ?? "").trim() || "GolfPack";
  const message = (body.body ?? "").trim();
  if (!message) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (title.length > 60 || message.length > 240) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }

  // "Everyone" must be asked for explicitly, so an empty pick list never turns into a broadcast.
  const all = body.all === true;
  const userIds = Array.isArray(body.user_ids) ? body.user_ids : [];
  if (!all && userIds.length === 0) {
    return NextResponse.json({ error: "Pick at least one person" }, { status: 400 });
  }

  const svc = createServiceClient();
  let query = svc.from("profiles").select("id, display_name, email, push_subscription");
  if (!all) query = query.in("id", userIds);
  const { data: profiles, error: dbErr } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  const nameOf = (p: { display_name: string | null; email: string | null }) =>
    p.display_name?.trim() || p.email?.split("@")[0] || "Unknown";

  const reachable = (profiles ?? []).filter((p) => p.push_subscription);
  const noPush = (profiles ?? []).filter((p) => !p.push_subscription).map(nameOf);

  const results = await Promise.allSettled(
    reachable.map((p) => sendWebPush(p.push_subscription as PushSubscription, { title, body: message }))
  );

  const sent: string[] = [];
  const failed: string[] = [];
  const expiredEndpoints: string[] = [];
  results.forEach((r, i) => {
    const p = reachable[i];
    if (r.status === "fulfilled" && r.value.ok) {
      sent.push(nameOf(p));
      return;
    }
    failed.push(nameOf(p));
    if (r.status === "fulfilled") {
      console.error(`[admin-push] ${p.id} failed: status=${r.value.status} body=${r.value.body}`);
      if (r.value.expired) expiredEndpoints.push((p.push_subscription as PushSubscription).endpoint);
    } else {
      console.error(`[admin-push] ${p.id} threw:`, r.reason);
    }
  });
  await clearExpiredPushSubscriptions(expiredEndpoints);

  return NextResponse.json({ sent, failed, no_push: noPush });
}
