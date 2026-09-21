/// <reference lib="webworker" />
// Custom service worker — Workbox precache (di-inject build) + web push handler.
// Mode injectManifest: precache manifest digenerate vite-plugin-pwa saat build,
// event push/notificationclick tetap milik file ini.
// NOTE: dicek terpisah via tsconfig.sw.json (lib WebWorker, tanpa DOM).

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  type PrecacheEntry,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope & {
  // Di-inject oleh vite-plugin-pwa saat build
  __WB_MANIFEST: (string | PrecacheEntry)[];
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback — shell tetap render saat offline.
// ⚠️ Deny navigasi ke /api/* (mis. link verifikasi email better-auth
// /api/auth/verify-email?token=...&callbackURL=...) — biarkan sampai ke
// server. Tanpa ini SW mencegat link dari email → SPA render 404 page.
const denyNavigationApi = new NavigationRoute(createHandlerBoundToURL("index.html"), {
  denylist: [/^\/api\//],
});
registerRoute(denyNavigationApi);

// ---------------------------------------------------------------------------
// Web Push — tampilkan notifikasi dari payload server
// ---------------------------------------------------------------------------
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  let payload: {
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    icon?: string;
    badge?: string;
  };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Sahabat Kreator", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Sahabat Kreator", {
      body: payload.body ?? "",
      icon: payload.icon ?? "/pwa-192.png",
      badge: payload.badge ?? "/favicon-32.png",
      tag: payload.tag,
      data: { url: payload.url ?? "/dashboard" },
    }),
  );
});

// Klik notifikasi → fokus window existing + navigate, atau buka window baru
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && client.url !== self.location.origin + url) {
            client.navigate(url);
          }
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
