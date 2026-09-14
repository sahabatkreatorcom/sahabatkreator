// NotificationBell — pusat notifikasi in-app di topbar (badge unread, panel dropdown)
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

const TYPE_ICON: Record<string, string> = {
  post_published: "🚀",
  post_failed: "❌",
  engagement: "💬",
  billing: "💳",
  team: "👥",
  system: "🔔",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api.get<{ notifications: Notification[]; unreadCount: number }>("/notifications?limit=20"),
    refetchInterval: 60_000, // polling ringan tiap menit
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Tutup panel saat klik luar
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = data?.unreadCount ?? 0;
  const items = data?.notifications ?? [];

  // App badge PWA — sinkronkan jumlah unread ke ikon aplikasi di launcher OS.
  // Guard: API belum didukung semua browser, kegagalan diabaikan (best-effort).
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    try {
      if (unread > 0) {
        void navigator.setAppBadge(unread).catch(() => undefined);
      } else {
        void navigator.clearAppBadge().catch(() => undefined);
      }
    } catch {
      // Abaikan — badge hanya fitur pelengkap
    }
    // Cleanup: bersihkan badge saat komponen unmount / unread berubah
    return () => {
      try {
        void navigator.clearAppBadge().catch(() => undefined);
      } catch {
        // Abaikan — pembersihan best-effort
      }
    };
  }, [unread]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        aria-label={`Notifikasi (${unread} belum dibaca)`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-bold text-[10px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-[var(--border-light)] border-b px-4 py-3">
            <p className="font-semibold text-sm">Notifikasi</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="flex items-center gap-1 text-[var(--accent-gold)] text-xs hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Tandai semua dibaca
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[var(--text-muted)] text-xs">
                Tidak ada notifikasi
              </p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "group flex items-start gap-3 border-[var(--border-light)] border-b px-4 py-3 last:border-0",
                    !n.isRead && "bg-[var(--accent-gold-light)]/50",
                  )}
                >
                  <span className="text-base leading-none">{TYPE_ICON[n.type] ?? "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={n.linkUrl ?? "#"}
                      onClick={() => !n.isRead && markRead.mutate(n.id)}
                      className="block"
                    >
                      <p className="font-medium text-sm leading-snug">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-[var(--text-secondary)] text-xs">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                        {timeAgo(n.createdAt)}
                      </p>
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss.mutate(n.id)}
                    className="opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    aria-label="Sembunyikan notifikasi"
                  >
                    <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
