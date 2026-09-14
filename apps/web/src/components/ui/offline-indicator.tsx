// Offline indicator — banner saat koneksi hilang + auto-refresh data saat online
// (audit HIGH E1). Pakai navigator.onLine + event listener online/offline.
import { useQueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Banner fixed top-center saat offline. Saat kembali online:
 * toast sukses singkat + invalidateQueries() agar data yang stale
 * selama offline di-refresh react-query.
 */
export function OfflineIndicator() {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    function handleOffline() {
      setOnline(false);
    }

    async function handleOnline() {
      setOnline(true);
      toast.success("Kembali online", { duration: 2500 });
      // Data kemungkinan stale saat offline — refresh semua query aktif
      await queryClient.invalidateQueries();
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [queryClient]);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 rounded-b-[var(--radius-lg)] border border-[var(--border-light)] border-t-0 bg-[var(--bg-secondary)] px-4 py-2.5 shadow-lg"
    >
      <div className="flex items-center gap-2.5">
        <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-[var(--text-primary)] text-sm">
          Anda sedang offline — perubahan akan tersinkron saat kembali
        </p>
      </div>
    </div>
  );
}
