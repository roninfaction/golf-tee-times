const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * Subscribe to native Web Push and save the subscription to the server.
 * Assumes Notification.permission is already "granted" (caller must request permission
 * from a user gesture before calling this if permission is not yet granted).
 * Safe to call idempotently — reuses existing push subscription if one exists.
 */
export async function registerPush(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "Not in browser" };
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "Push not supported on this device" };
  }
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "VAPID key not configured" };

  try {
    const swReg = await navigator.serviceWorker.ready;
    const keyBytes = Uint8Array.from(
      atob(VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );

    // Reuse existing subscription if present — avoids unnecessary re-keying
    let sub = await swReg.pushManager.getSubscription();
    if (!sub) {
      sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
    }

    const json = sub.toJSON();
    const subscription = {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    };

    const { createClient } = await import("@/lib/supabase/browser");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, reason: "Not authenticated" };

    const res = await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ subscription }),
    });

    return res.ok ? { ok: true } : { ok: false, reason: "Server error saving subscription" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
