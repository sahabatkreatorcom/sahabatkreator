// Sahabat Kreator Service Worker
const CACHE_NAME = "sahabat-kreator-v1";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/dashboard/calendar",
  "/dashboard/compose",
  "/dashboard/posts",
  "/dashboard/analytics",
  "/dashboard/inbox",
  "/dashboard/media",
  "/dashboard/content-tools",
  "/dashboard/pillars",
  "/dashboard/connections",
  "/dashboard/billing",
  "/dashboard/team",
  "/dashboard/activity",
  "/dashboard/settings",
  "/dashboard/settings/profile",
  "/dashboard/settings/security",
  "/dashboard/settings/teams",
  "/dashboard/settings/sessions",
  "/dashboard/settings/members",
  "/dashboard/seb",
  "/dashboard/competitors",
  "/dashboard/listening",
  "/dashboard/trends",
  "/dashboard/engagement",
  "/dashboard/status",
  "/dashboard/inbox-automation",
  "/dashboard/content-tools",
  "/dashboard/seo-audit",
  "/api/posts",
  "/api/media",
  "/api/caption-templates",
  "/api/pillars",
  "/api/hashtag-collections",
  "/favicon/favicon.ico",
  "/favicon/favicon.png",
  "/favicon/favicon-192x192.png",
  "/favicon/favicon-512x512.png",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip API calls and third-party URLs
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || !url.pathname.startsWith("/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        // If network fails, try offline fallback for key pages
        if (event.request.destination === "document") {
          return caches.match("/dashboard");
        }
      });
    })
  );
});

// Handle push notifications
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Sahabat Kreator";
  const options = {
    body: data.body || "Ada pembaruan baru",
    icon: "/favicon/favicon-192x192.png",
    badge: "/favicon/favicon-192x192.png",
    data: data.url || "/dashboard",
    actions: [
      { action: "open", title: "Buka" },
      { action: "close", title: "Tutup" },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "close") return;
  const urlToOpen = event.notification.data || "/dashboard";
  event.waitUntil(
    clients.openWindow(urlToOpen)
  );
});

self.addEventListener("notificationclose", (event) => {
  console.log("Notification closed:", event.notification.title);
});
