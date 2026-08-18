"use client";

import { useEffect } from "react";
import { usePWAInstall } from "@/hooks/use-pwa-install";

export function PWABanner() {
  const { isInstallAvailable, promptInstall, dismissInstall } = usePWAInstall();

  useEffect(() => {
    // Auto-hide after 5s if not interacted
    const timer = setTimeout(() => {
      if (isInstallAvailable) dismissInstall();
    }, 5000);
    return () => clearTimeout(timer);
  }, [isInstallAvailable, dismissInstall]);

  if (!isInstallAvailable) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Install App</p>
          <p className="text-xs text-muted-foreground">
            Pasang di layar utama untuk akses cepat
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={promptInstall}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
          >
            Install
          </button>
          <button
            onClick={dismissInstall}
            className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}