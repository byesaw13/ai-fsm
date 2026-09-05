// Minimal service worker for Dovetails FSM.
//
// Scope: installability only. Chromium gates the install prompt on the presence
// of a service worker with a fetch handler; this provides exactly that and
// nothing more. There is deliberately NO caching / offline strategy yet — every
// request goes straight to the network (see TASK-020 / EPIC-005). Add a cache
// here only when a real offline requirement exists.

self.addEventListener("install", () => {
  // Activate this worker immediately on first install.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of open clients without requiring a reload.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through: network only. Present so the app is installable.
  event.respondWith(fetch(event.request));
});

// --- Web Push (TASK-118) -----------------------------------------------------
// The web tier sends a JSON body shaped by lib/push/payload.ts:
//   { title, body, tag, data: { url } }

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { title: "Dovetails", body: event.data ? event.data.text() : "" };
  }
  const title = msg.title || "Dovetails";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: msg.body || "",
      tag: msg.tag || undefined,
      data: { url: (msg.data && msg.data.url) || "/" },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab on the same origin and navigate it; else open one.
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
