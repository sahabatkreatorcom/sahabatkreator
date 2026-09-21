import { CheckCircle2, Clock3, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type InboxHeaderProps = {
  unreadMessages: number;
  isSyncing: boolean;
  isRefreshing: boolean;
  lastManualSyncAt: Date | null;
  onSync: () => void;
};

export function InboxHeader({
  unreadMessages,
  isSyncing,
  isRefreshing,
  lastManualSyncAt,
  onSync,
}: InboxHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-bold text-2xl">Inbox DM</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 text-xs dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Balasan langsung
          </span>
        </div>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Percakapan Instagram &amp; Facebook. Pesan baru disinkronkan otomatis setiap 15 menit.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--text-muted)] text-xs">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            Refresh tampilan otomatis setiap 30 detik
          </span>
          {lastManualSyncAt && <span>Sync manual: {lastManualSyncAt.toLocaleTimeString("id-ID")}</span>}
          {isRefreshing && <span className="text-[var(--accent-gold)]">Memperbarui daftar...</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {unreadMessages > 0 && (
          <span className="rounded-full bg-[var(--accent-gold-light)] px-3 py-1.5 font-semibold text-[var(--accent-gold)] text-sm">
            {unreadMessages} belum dibaca
          </span>
        )}
        <Button size="sm" variant="outline" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {isSyncing ? "Menyinkronkan..." : "Sinkronkan sekarang"}
        </Button>
      </div>
    </div>
  );
}
