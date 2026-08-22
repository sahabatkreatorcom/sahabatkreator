"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Register service worker
      navigator.serviceWorker
        .register("/sw.js", { scope: "/sw.js" })
        .then((registration) => {
          console.log("[PWA] SW registered:", registration.scope);
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