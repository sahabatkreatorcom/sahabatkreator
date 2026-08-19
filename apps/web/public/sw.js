/**
 * Service Worker for Sahabat Kreator
 * Handles caching, offline support, and push notifications
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `sahabat-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  "/manifest.json",
  "/offline.html",
  "/favicon/icon-192.png",
  "/favicon/icon-512.png",
  "/favicon/icon-maskable-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(PRECACHE_ASSETS);
        if (navigator.storage && navigator.storage.persist) {
          const isPersisted = await navigator.storage.persisted();
          if (!isPersisted) {
            await navigator.storage.persist();
          }
        }
      } catch (error) {
        console.error("[SW] Install failed:", error);
        throw error;
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("sahabat-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => {
        client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
      });
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;
  if (event.request.url.includes("/api/")) return;

  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === "navigate";
  const isRscRequest =
    event.request.headers.get("RSC") === "1" ||
    url.searchParams.has("_rsc");

  if (isNavigation) {
    event.respondWith(navigationNetworkFirst(event.request));
    return;
  }
  if (isRscRequest) return;

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/);
  if (isStaticAsset) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  const isImmutableAsset =
    url.pathname.startsWith("/favicon/") ||
    url.pathname.startsWith("/splash/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico)$/);
  if (isImmutableAsset) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});

async function navigationNetworkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const offlinePage = await caches.match(OFFLINE_URL);
    return offlinePage || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (e) {
    if (request.mode === "navigate") {
      return caches.match(OFFLINE_URL);
    }
    throw e;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (e) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    if (request.mode === "navigate") {
      const offlinePage = await caches.match(OFFLINE_URL);
      if (offlinePage) return offlinePage;
    }
    return new Response("Offline", { status: 503 });
  }
}

self.addEventListener("push", (event) => {
  let data = {
    title: "Sahabat Kreator",
    body: "Notifikasi baru",
    icon: "/favicon/icon-192.png",
    badge: "/favicon/icon-72.png",
    tag: "default",
    data: { url: "/dashboard" },
  };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  const options = {
    body: data.body,
    icon: data.icon || "/favicon/icon-192.png",
    badge: data.badge || "/favicon/icon-72.png",
    tag: data.tag || "default",
    data: data.data || { url: "/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
