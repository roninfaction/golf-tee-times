// Vanilla service worker — no frameworks, no precaching, instant install.
"use strict";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let title = "GolfPack";
  let body = "You have a new update";
  let data = {};

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed.title) title = parsed.title;
      if (parsed.body) body = parsed.body;
      if (parsed.data) data = parsed.data;
    } catch {
      try { body = event.data.text(); } catch { /* ignore */ }
    }
  }

  event.waitUntil(self.registration.showNotification(title, { body, data }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const teeTimeId = event.notification.data && event.notification.data.teeTimeId;
  const url = teeTimeId ? "/tee-times/" + teeTimeId : "/upcoming";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const match = clients.find((c) => c.url.indexOf(self.location.origin) !== -1);
      // Reuse the open window via a SOFT navigation (postMessage -> router.push
      // in SwNavigationHandler), NOT client.navigate(). On iOS standalone,
      // client.navigate() is a full document reload of a backgrounded window;
      // fixed bottom:0 elements then resolve against a stale viewport height and
      // the BottomNav paints mid-page. postMessage keeps it the same client-side
      // route change as an in-app tap, so the layout stays correct.
      if (match) { match.focus(); match.postMessage({ type: "SW_NAVIGATE", url }); }
      else self.clients.openWindow(url);
    })
  );
});
