import type { SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (import("serwist").PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & typeof globalThis & {
  registration: { showNotification(title: string, options?: object): Promise<void> };
  clients: {
    matchAll(opts?: object): Promise<{ url: string; focus(): void; navigate(url: string): void; postMessage(msg: unknown): void }[]>;
    openWindow(url: string): void;
  };
  location: { origin: string };
  addEventListener(type: string, handler: (event: unknown) => void): void;
};

// Handle incoming push notifications
self.addEventListener("push", (evt) => {
  const event = evt as unknown as { data: { json(): unknown; text(): string } | null; waitUntil(p: Promise<unknown>): void };

  let title = "GolfPack";
  let body = "You have a new update";
  let notifData: { teeTimeId?: string } = {};

  if (event.data) {
    try {
      const parsed = event.data.json() as { title?: string; body?: string; data?: { teeTimeId?: string } };
      if (parsed.title) title = parsed.title;
      if (parsed.body) body = parsed.body;
      if (parsed.data) notifData = parsed.data;
    } catch {
      try { body = event.data.text(); } catch { /* ignore */ }
    }
  }

  const work = (async () => {
    // Ping server so we can confirm in Cloudflare logs that the SW received the push
    try {
      await fetch("/api/push/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ received: true, title, ts: Date.now() }),
      });
    } catch { /* ignore */ }

    // Broadcast to open app windows (shows in-app debug banner)
    try {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        client.postMessage({ type: "PUSH_RECEIVED", title, body });
      }
    } catch { /* ignore */ }

    // Show notification — bare minimum options for iOS
    try {
      await self.registration.showNotification(title, { body, data: notifData });
    } catch {
      try { await self.registration.showNotification("GolfPack", { body }); } catch { /* ignore */ }
    }
  })();

  event.waitUntil(work);
});

// Handle notification tap
self.addEventListener("notificationclick", (evt) => {
  const event = evt as unknown as { notification: { close(): void; data: { teeTimeId?: string } }; waitUntil(p: Promise<unknown>): void };
  event.notification.close();
  const teeTimeId = event.notification.data?.teeTimeId;
  const url = teeTimeId ? `/tee-times/${teeTimeId}` : "/upcoming";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const match = clients.find((c) => c.url.includes(self.location.origin));
      if (match) { match.focus(); match.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});

// Reference __SW_MANIFEST to satisfy @serwist/next webpack plugin,
// but pass empty array so install completes instantly (no asset fetching).
// The stuck-in-installing bug was caused by 50+ precache fetches timing out on iOS.
void self.__SW_MANIFEST;

const serwist = new Serwist({
  precacheEntries: [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
});

serwist.addEventListeners();
