import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/onesignal";
import { clearExpiredPushSubscriptions } from "@/lib/push-cleanup";
import type { PushSubscription } from "@/lib/web-push-server";

// Push the same message to a set of members (whoever has push turned on).
export async function pushToUsers(
  svc: SupabaseClient,
  userIds: string[],
  message: { title: string; body: string; data?: Record<string, string> },
) {
  if (!userIds.length) return;
  const { data: profiles } = await svc
    .from("profiles")
    .select("push_subscription")
    .in("id", userIds)
    .not("push_subscription", "is", null);
  const subscriptions = (profiles ?? []).map(p => p.push_subscription as PushSubscription).filter(Boolean);
  if (!subscriptions.length) return;
  const { expiredEndpoints } = await sendPush({ subscriptions, ...message });
  await clearExpiredPushSubscriptions(expiredEndpoints);
}
