import { createServiceClient } from "@/lib/supabase/server";

/**
 * Nullifies push_subscription for any profiles whose endpoint returned 410/404
 * (subscription expired or unregistered). Next app open will prompt re-registration.
 */
export async function clearExpiredPushSubscriptions(endpoints: string[]): Promise<void> {
  if (!endpoints.length) return;
  const svc = createServiceClient();
  await Promise.all(
    endpoints.map((endpoint) =>
      svc
        .from("profiles")
        .update({ push_subscription: null })
        .filter("push_subscription->>endpoint", "eq", endpoint)
    )
  );
}
