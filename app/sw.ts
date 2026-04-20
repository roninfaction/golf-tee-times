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
  let body = "You have a new update";
  let notifData: { teeTimeId?: string } = {};

  if (event.data) {
    try {
      const parsed = event.data.json() as { title?: string; body?: string; data?: { teeTimeId?: string } };
      if (parsed.title) title = parsed.title;
      if (parsed.body) body = parsed.body;
      if (parsed.data) notifData = parsed.data;
    } catch {
      // If JSON parse fails, try raw text as body
      try { body = event.data.text(); } catch { /* ignore */ }
    }
  }

  const showPromise = self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    data: notifData,
  }).catch((err: unknown) => {
    // If first attempt fails, retry with minimal options (iOS compatibility)
    console.error("[sw] showNotification failed, retrying minimal:", err);
    return self.registration.showNotification("GolfPack", { body });
  });

  event.waitUntil(showPromise);
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
