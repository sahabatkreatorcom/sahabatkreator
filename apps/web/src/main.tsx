import { env } from "@sahabatkreator/env/web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHead, UnheadProvider } from "@unhead/react/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { OfflineIndicator } from "./components/ui/offline-indicator";
import { initializeGoogleAnalytics } from "./lib/google-analytics";
import { useTheme } from "./lib/theme";
import { router } from "./router";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Init theme sebelum render (hindari FOUC — script inline juga ada di index.html)
useTheme.getState().init();

// Service worker: sw.ts memakai skipWaiting + clientsClaim, jadi versi baru
// mengambil alih segera setelah terpasang. Kalau itu terjadi di tengah sesi,
// halaman yang sedang jalan memegang JS lama sementara precache sudah diganti
// build baru — chunk yang di-lazy-load berikutnya bisa gagal. Muat ulang sekali
// saat kendali berpindah supaya JS dan cache selalu seversi.
//
// `hadController` menjaga kunjungan pertama: saat itu belum ada controller,
// jadi tidak perlu reload.
if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

// GA4 hanya jika Measurement ID diset (produksi) — staging/dev biarkan kosong
if (env.VITE_GA_MEASUREMENT_ID) {
  initializeGoogleAnalytics(env.VITE_GA_MEASUREMENT_ID);
}

const head = createHead();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Elemen #root tidak ditemukan — index.html tidak memuat root mount.");
}

createRoot(rootElement).render(
  <StrictMode>
    <UnheadProvider value={head}>
      <QueryClientProvider client={queryClient}>
        <OfflineIndicator />
        <RouterProvider router={router} />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            },
          }}
        />
      </QueryClientProvider>
    </UnheadProvider>
  </StrictMode>,
);
