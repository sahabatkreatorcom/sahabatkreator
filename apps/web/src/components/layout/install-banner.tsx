// Install banner PWA — muncul bila bisa diinstall & belum standalone, dismiss 7 hari
import { Download, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function InstallBanner() {
  const { canShowBanner, promptInstall, dismissBanner, standalone } = usePwaInstall();
  const [visible, setVisible] = useState(true);

  // Cek lazy agar localStorage dibaca setelah mount (SSR-safe pattern)
  if (!visible || standalone || !canShowBanner()) return null;

  return (
    <div className="fixed bottom-16 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 lg:bottom-4 lg:left-4 lg:translate-x-0">
      <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3 shadow-xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Install aplikasi Sahabat Kreator</p>
          <p className="text-[var(--text-secondary)] text-xs">
            Akses lebih cepat & notifikasi realtime di homescreen
          </p>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            await promptInstall();
            setVisible(false);
          }}
        >
          Install
        </Button>
        <button
          type="button"
          onClick={() => {
            dismissBanner();
            setVisible(false);
          }}
          className="shrink-0 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
