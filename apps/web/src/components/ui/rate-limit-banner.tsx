// Banner global rate-limit (429) — muncul saat api.ts mendeteksi throttle
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getLastRateLimitedAt } from "@/lib/api";

/** Durasi tampil banner setelah 429 terakhir (ms) */
const BANNER_DURATION_MS = 10_000;

export function RateLimitBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Tampilkan banner setiap kali event sk-ratelimited di-dispatch dari api.ts
    function showBanner() {
      setVisible(true);
    }

    window.addEventListener("sk-ratelimited", showBanner);

    // Auto-hide 10 detik setelah 429 terakhir (polling getLastRateLimitedAt)
    const interval = setInterval(() => {
      const last = getLastRateLimitedAt();
      if (last === null || Date.now() - last >= BANNER_DURATION_MS) {
        setVisible(false);
      }
    }, 1000);

    return () => {
      window.removeEventListener("sk-ratelimited", showBanner);
      clearInterval(interval);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-light)] px-4 py-3 shadow-lg"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--warning)]" />
      <p className="flex-1 text-[var(--text-primary)] text-sm">
        Terlalu banyak permintaan — jeda sebentar
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        aria-label="Tutup peringatan"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
