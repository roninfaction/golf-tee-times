import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
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
    // Broadcast to any open app windows — this lets us confirm the SW received the push
    // even if showNotification is being blocked by iOS
    try {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        client.postMessage({ type: "PUSH_RECEIVED", title, body });
      }
    } catch { /* ignore */ }

    // Try showing the notification — stripped to bare minimum for iOS compatibility
    try {
      await self.registration.showNotification(title, { body, data: notifData });
    } catch (err) {
      // Last resort: plain title+body only
      try { await self.registration.showNotification("GolfPack", { body }); } catch { /* ignore */ }
      void err;
    }
  })();

  event.waitUntil(work);
});

// Open the relevant page when a notification is tapped
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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
