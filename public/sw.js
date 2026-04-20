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

  event.waitUntil(
    fetch("/api/push/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: true, title, ts: Date.now() }),
    }).catch(() => {})
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((c) => c.postMessage({ type: "PUSH_RECEIVED", title, body }));
      })
      .catch(() => {})
      .then(() => self.registration.showNotification(title, { body, data }))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const teeTimeId = event.notification.data && event.notification.data.teeTimeId;
  const url = teeTimeId ? "/tee-times/" + teeTimeId : "/upcoming";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const match = clients.find((c) => c.url.indexOf(self.location.origin) !== -1);
      if (match) { match.focus(); match.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});
