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
  clients: { matchAll(opts?: object): Promise<{ url: string; focus(): void; navigate(url: string): void }[]>; openWindow(url: string): void };
  location: { origin: string };
  addEventListener(type: string, handler: (event: unknown) => void): void;
};

// Handle incoming push notifications
self.addEventListener("push", (evt) => {
  const event = evt as unknown as { data: { json(): unknown; text(): string } | null; waitUntil(p: Promise<unknown>): void };

  let title = "GolfPack";
  let body = "";
  let notifData: { teeTimeId?: string } = {};

  if (!event.data) {
    // Push arrived but payload could not be decrypted — show a generic nudge
    // so the user knows the delivery chain is working even if encryption failed.
    body = "Tap to open GolfPack";
  } else {
    let data: { title?: string; body?: string; data?: { teeTimeId?: string } } = {};
    try { data = event.data.json() as typeof data; } catch { data = { title: "GolfPack", body: event.data.text() }; }
    title = data.title ?? "GolfPack";
    body = data.body ?? "";
    notifData = data.data ?? {};
  }

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: notifData,
  }));
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
