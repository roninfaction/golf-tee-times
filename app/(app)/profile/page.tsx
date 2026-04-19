"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Copy, Check, LogOut, ChevronRight, Bell, BellOff } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

const EMAIL_FORWARD_DOMAIN = process.env.NEXT_PUBLIC_EMAIL_FORWARD_DOMAIN ?? "golfpack.app";

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [forwarderToken, setForwarderToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // notifState: "unknown" = loading, "registered" = push_subscription saved on server,
  // "needs_enable" = permission not granted yet, "denied" = OS blocked
  const [notifState, setNotifState] = useState<"unknown" | "registered" | "needs_enable" | "denied">("unknown");
  const [notifEnabling, setNotifEnabling] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [notifDiag, setNotifDiag] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [isStandalone, setIsStandalone] = useState(true);

  const forwardingEmail = forwarderToken ? `tee-${forwarderToken}@${EMAIL_FORWARD_DOMAIN}` : "";

  useEffect(() => {
    // On iOS, push subscriptions only work when the app is running as a home-screen PWA
    // (standalone mode). Detect this so we can warn the user if they're in Safari browser.
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setLoading(false); return; }
      fetch("/api/profile", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.json())
        .then((data) => {
          setDisplayName(data.display_name ?? "");
          setForwarderToken(data.forwarder_token ?? "");
          setEmail(data.email ?? "");
          setLoading(false);

          if (data.push_subscription) {
            setNotifState("registered");
            // Verify the browser actually has an active subscription matching the DB record.
            // If not, the stored subscription is stale (e.g. from a different context) and
            // needs to be refreshed before pushes will arrive on this device.
            if ("serviceWorker" in navigator && "PushManager" in window) {
              navigator.serviceWorker.ready.then((reg) =>
                reg.pushManager.getSubscription().then((existing) => {
                  if (!existing) {
                    setNotifDiag("Subscription mismatch — tap Re-enable on this device");
                  }
                })
              ).catch(() => {});
            }
          } else if (!("Notification" in window)) {
            setNotifState("needs_enable");
          } else if (Notification.permission === "denied") {
            setNotifState("denied");
          } else {
            setNotifState("needs_enable");
          }
        })
        .catch(() => setLoading(false));
    });
  }, []);

  async function sendTestNotification() {
    setTestSending(true);
    setTestResult("");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    const json = await res.json();
    setTestResult(res.ok ? "Notification sent! Check your device." : (json.message ?? json.error ?? "Failed"));
    setTestSending(false);
  }

  async function enableNotifications() {
    // iOS: subscriptions created in Safari browser context don't deliver to the home screen PWA.
    // The user MUST be in standalone mode (opened from home screen icon).
    if (!isStandalone) {
      setNotifError("Open GolfPack from your home screen icon (not Safari) then tap Enable again.");
      return;
    }
    setNotifEnabling(true);
    setNotifError("");
    setNotifDiag("Requesting permission…");
    try {
      // Must be first — iOS requires this to be the first async call from a tap gesture
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotifState("denied");
        setNotifError("Notification permission was not granted.");
        return;
      }

      setNotifDiag("Permission granted | Subscribing…");

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      const keyBytes = Uint8Array.from(
        atob(vapidKey.replace(/-/g, "+").replace(/_/g, "/")),
        c => c.charCodeAt(0)
      );

      let sub: PushSubscription | null = null;
      let subError = "";
      try {
        const swReg = await navigator.serviceWorker.ready;
        // Unsubscribe any stale subscription first
        const existing = await swReg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();

        sub = await Promise.race([
          swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
        ]);
      } catch (e) {
        subError = e instanceof Error ? e.message : String(e);
      }

      if (!sub) {
        setNotifError(`Failed to subscribe: ${subError}`);
        return;
      }

      setNotifDiag("Subscribed! Saving…");

      const json = sub.toJSON();
      const subscription = {
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      };

      const supabase = (await import("@/lib/supabase/browser")).createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const res = await fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ subscription }),
        });
        if (!res.ok) {
          setNotifError("Subscribed but failed to save — please try again.");
          return;
        }
      }

      setNotifState("registered");
      setNotifDiag("");
      setNotifError("");
    } catch (e) {
      setNotifError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setNotifEnabling(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ display_name: displayName }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordSaved(false);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSaved(true);
      setNewPassword("");
      setTimeout(() => setPasswordSaved(false), 2000);
    }
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(forwardingEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const initials = displayName ? displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?";

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-6" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <h1 className="text-[28px] font-bold text-white tracking-tight">Profile</h1>
      </div>

      <div className="px-4 pt-6 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center py-2">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mb-3" style={{ background: "rgba(201,168,76,0.18)", color: GOLD }}>
            {loading ? "…" : initials}
          </div>
          <p className="text-white font-semibold text-lg">{loading ? "" : (displayName || "Set your name")}</p>
          <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{email}</p>
        </div>

        {/* Display name */}
        <form onSubmit={saveProfile}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Display name</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20"
              style={{ borderBottom: `0.5px solid ${DIVIDER}` }}
            />
            <button type="submit" disabled={saving} className="w-full px-4 py-3.5 text-sm font-semibold text-left flex items-center justify-between" style={{ color: "#30D158" }}>
              <span>{saved ? "Saved!" : saving ? "Saving…" : "Save name"}</span>
              {!saving && !saved && <ChevronRight size={16} style={{ color: "rgba(255,255,255,0.2)" }} />}
              {saved && <Check size={16} style={{ color: "#30D158" }} />}
            </button>
          </div>
        </form>

        {/* Change password */}
        <form onSubmit={savePassword}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Change password</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              minLength={6}
              required
              autoComplete="new-password"
              className="w-full px-4 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20"
              style={{ borderBottom: `0.5px solid ${DIVIDER}` }}
            />
            {passwordError && (
              <p className="px-4 py-2 text-xs" style={{ color: "#FF453A", borderBottom: `0.5px solid ${DIVIDER}` }}>{passwordError}</p>
            )}
            <button type="submit" disabled={passwordSaving} className="w-full px-4 py-3.5 text-sm font-semibold text-left flex items-center justify-between" style={{ color: "#30D158" }}>
              <span>{passwordSaved ? "Updated!" : passwordSaving ? "Updating…" : "Update password"}</span>
              {!passwordSaving && !passwordSaved && <ChevronRight size={16} style={{ color: "rgba(255,255,255,0.2)" }} />}
              {passwordSaved && <Check size={16} style={{ color: "#30D158" }} />}
            </button>
          </div>
        </form>

        {/* Email forwarding */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Email forwarding</p>
          <div className="rounded-2xl p-4 space-y-3" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
              Forward any golf booking confirmation email to this address and GolfPack creates the tee time automatically.
            </p>
            {loading ? (
              <div className="h-9 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.07)" }} />
            ) : forwardingEmail ? (
              <>
                <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(201,168,76,0.12)", border: "0.5px solid rgba(201,168,76,0.25)" }}>
                  <p className="font-mono text-xs break-all" style={{ color: GOLD }}>{forwardingEmail}</p>
                </div>
                <button onClick={copyEmail} className="flex items-center gap-2 text-sm font-semibold" style={{ color: copied ? "#30D158" : "rgba(255,255,255,0.7)" }}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Copied!" : "Copy address"}
                </button>
              </>
            ) : (
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No address available.</p>
            )}
          </div>
        </div>

        {/* Notifications */}
        {notifState !== "unknown" && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Notifications</p>
            <div className="rounded-2xl px-4 py-3.5 space-y-2" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {notifState === "registered" ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <Bell size={16} style={{ color: "#30D158", flexShrink: 0 }} />
                    <span className="text-sm text-white">Notifications enabled</span>
                  </div>
                  {!isStandalone && (
                    <p className="text-xs leading-relaxed" style={{ color: "#FF9F0A" }}>
                      Open from your home screen icon to re-enable or test notifications.
                    </p>
                  )}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={sendTestNotification}
                      disabled={testSending}
                      className="text-xs font-semibold"
                      style={{ color: "#30D158" }}
                    >
                      {testSending ? "Sending…" : "Send test"}
                    </button>
                    <button
                      onClick={enableNotifications}
                      disabled={notifEnabling}
                      className="text-xs font-semibold"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      {notifEnabling ? "Re-enabling…" : "Re-enable on this device"}
                    </button>
                  </div>
                  {testResult && (
                    <p className="text-xs" style={{ color: testResult.includes("sent") ? "#30D158" : "#FF453A" }}>{testResult}</p>
                  )}
                </div>
              ) : notifState === "denied" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <BellOff size={16} style={{ color: "#FF453A", flexShrink: 0 }} />
                    <span className="text-sm text-white">Notifications blocked by iOS</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Go to <strong className="text-white/60">Settings → Notifications → Safari</strong> and allow notifications, then return here and tap Enable.
                  </p>
                  <button
                    onClick={enableNotifications}
                    disabled={notifEnabling}
                    className="flex items-center gap-2 text-sm font-semibold pt-1"
                    style={{ color: GOLD }}
                  >
                    <Bell size={14} />
                    {notifEnabling ? "Trying…" : "Try again"}
                  </button>
                </div>
              ) : (
                /* needs_enable */
                <button
                  onClick={enableNotifications}
                  disabled={notifEnabling}
                  className="flex items-center justify-between w-full"
                >
                  <div className="flex items-center gap-3">
                    {notifEnabling
                      ? <div className="w-4 h-4 border-2 rounded-full shrink-0" style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: GOLD, animation: "spin 0.8s linear infinite" }} />
                      : <Bell size={16} style={{ color: GOLD, flexShrink: 0 }} />
                    }
                    <span className="text-sm text-white">{notifEnabling ? "Enabling…" : "Enable notifications"}</span>
                  </div>
                  {!notifEnabling && <ChevronRight size={16} style={{ color: "rgba(255,255,255,0.2)" }} />}
                </button>
              )}
              {notifDiag && (
                <p className="text-xs font-mono break-all" style={{ color: "rgba(255,255,255,0.3)" }}>{notifDiag}</p>
              )}
              {notifError && (
                <p className="text-xs leading-relaxed" style={{ color: "#FF453A" }}>{notifError}</p>
              )}
            </div>
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={signOut}
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-medium"
          style={{ background: "rgba(255,69,58,0.1)", border: "0.5px solid rgba(255,69,58,0.2)", color: "#FF453A" }}
        >
          <span className="flex items-center gap-2">
            <LogOut size={16} />
            Sign out
          </span>
        </button>
      </div>
    </div>
  );
}
