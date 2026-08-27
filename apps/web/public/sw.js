// Sahabat Kreator Service Worker
const CACHE_NAME = "sahabat-kreator-v1";
const OFFLINE_PAGE = "/offline.html";

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
  "/dashboard/inbox-automation",
  "/faq",
  "/fitur",
  "/harga",
  "/tentang",
  "/kebijakan-privasi",
  "/penghapusan-data",
  "/syarat-ketentuan",
  "/manifest.json",
  "/offline.html",
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
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip API calls and third-party URLs
  if (url.pathname.startsWith("/api/") || !url.pathname.startsWith("/")) return;

  // Network first, then cache for API-like responses
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(async () => {
        // Network failed - try cache
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // For document requests, show offline page
        if (event.request.destination === "document") {
          return caches.match(OFFLINE_PAGE);
        }

        return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
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
    data: { url: data.url || "/dashboard" },
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
  const urlToOpen = event.notification.data?.url || "/dashboard";
  event.waitUntil(clients.openWindow(urlToOpen));
});
