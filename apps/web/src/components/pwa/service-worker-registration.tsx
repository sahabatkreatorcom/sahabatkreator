"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Register service worker dengan scope default (/) untuk push notification
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          console.log("[PWA] SW registered:", registration.scope);
          // Simpan registration untuk digunakan oleh hook push notification
          (window as unknown as Record<string, ServiceWorkerRegistration>).swRegistration = registration;
        })
        .catch((error) => {
          console.error("[PWA] SW registration failed:", error);
        });
    } else {
      console.warn("[PWA] Service Worker not supported in this browser");
    }
  }, []);

  return null;
}