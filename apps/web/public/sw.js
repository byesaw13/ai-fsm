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
