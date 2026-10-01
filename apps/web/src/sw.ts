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

// ---------------------------------------------------------------------------
// Pembaruan service worker
// ---------------------------------------------------------------------------
// Mode injectManifest TIDAK menambahkan skipWaiting/clientsClaim sendiri —
// berbeda dari generateSW dengan `skipWaiting: true`. Tanpa keduanya, service
// worker baru hanya terpasang lalu MENUNGGU tanpa batas: ia baru mengambil alih
// setelah SEMUA tab aplikasi ditutup. Akibatnya perbaikan apa pun di file ini
// (termasuk denylist navigasi di bawah) tidak pernah sampai ke pengguna yang
// membiarkan satu tab terbuka.
//
// registerType "autoUpdate" di vite.config.ts mengasumsikan keduanya ada.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// SPA navigation fallback — shell tetap render saat offline.
//
// ⚠️ Denylist ini WAJIB memuat semua path yang dilayani SERVER, bukan SPA.
// Tanpa itu service worker menyajikan index.html untuk navigasi ke path
// tersebut, React Router tidak menemukan route-nya, dan pengguna melihat
// halaman 404 padahal servernya sehat.
//
//   • /api/*            — link verifikasi email better-auth
//                         (/api/auth/verify-email?token=…&callbackURL=…)
//   • /v1/*             — Public API v1, termasuk /v1/docs (Scalar) dan
//                         /v1/openapi.json
//   • /docs             — Scalar API reference internal
//   • /openapi.json     — spesifikasi OpenAPI internal
//   • /health           — health check
//   • /mcp              — MCP remote (POST, tapi GET/DELETE punya respons sendiri)
//   • /sitemap-blog.xml — sitemap blog yang dirender server
//
// Daftar yang sama dipakai proxy dev di vite.config.ts, dan
// components/docs/mdx-components.tsx memakainya untuk memilih <a> vs <Link>.
const SERVER_OWNED =
  /^\/(api\/|v1(\/|$)|docs(\/|$)|openapi\.json$|health$|mcp($|\/)|sitemap-blog\.xml$)/;
const spaNavigation = new NavigationRoute(createHandlerBoundToURL("index.html"), {
  denylist: [SERVER_OWNED],
});
registerRoute(spaNavigation);

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
