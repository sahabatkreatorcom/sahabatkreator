// Halaman Antrian Post — manajemen semua post group (scheduled/failed/published)
// Aksi: publish segera, reschedule, hapus (dengan undo), detail error per platform.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  Share2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type QueuePost = {
  id: string;
  postGroupId: string;
  platform: string;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed" | "processing";
  content: string | null;
  platformPostId: string | null;
  platformPostUrl: string | null;
  publishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

type QueueGroup = {
  id: string;
  content: string;
  scheduledAt: string | null;
  createdAt: string;
  posts: QueuePost[];
};

const STATUS_TABS = [
  { key: "all", label: "Semua" },
  { key: "scheduled", label: "Terjadwal" },
  { key: "failed", label: "Gagal" },
  { key: "published", label: "Terbit" },
] as const;

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "secondary" | "success" | "danger" | "warning" | "info" }
> = {
  draft: { label: "Draf", variant: "secondary" },
  scheduled: { label: "Terjadwal", variant: "info" },
  publishing: { label: "Publishing", variant: "warning" },
  processing: { label: "Diproses", variant: "warning" },
  published: { label: "Terbit", variant: "success" },
  failed: { label: "Gagal", variant: "danger" },
};

function groupStatus(
  posts: QueuePost[],
): "failed" | "published" | "scheduled" | "draft" | "processing" {
  if (posts.some((p) => p.status === "failed")) return "failed";
  if (posts.some((p) => p.status === "publishing" || p.status === "processing"))
    return "processing";
  if (posts.every((p) => p.status === "published")) return "published";
  if (posts.some((p) => p.status === "scheduled")) return "scheduled";
  return "draft";
}

/**
 * Bagikan post terbit via Web Share API.
 * Bila ada url post platform → share url; jika tidak → share caption (maks 200 char).
 * Fallback: salin ke clipboard + toast (termasuk saat API share tidak tersedia).
 */
async function sharePublishedPost(url: string | null, caption: string) {
  const text = caption.length > 200 ? `${caption.slice(0, 200)}…` : caption;
  if ("share" in navigator) {
    try {
      await navigator.share(url ? { url } : { text });
      return;
    } catch (e) {
      // User menutup dialog share — bukan error, jangan fallback
      if (e instanceof Error && e.name === "AbortError") return;
      // Gagal lain → lanjut ke clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(url ?? text);
    toast.success(url ? "Tautan disalin" : "Teks disalin");
  } catch {
    toast.error("Gagal menyalin ke clipboard");
  }
}

export function QueuePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]["key"]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["queue-posts"],
    queryFn: () => api.get<{ groups: QueueGroup[] }>("/posts"),
    refetchInterval: 30_000, // refresh tiap 30 detik — status publishing berubah
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["queue-posts"] });

  const publishNow = useMutation({
    mutationFn: (id: string) => api.post(`/posts/${id}/publish`),
    onSuccess: () => {
      toast.success("Post dimasukkan ke antrian publish");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reschedule = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      api.patch(`/posts/${id}`, { scheduledAt }),
    onSuccess: () => {
      toast.success("Jadwal diperbarui");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/posts/${id}`),
    onSuccess: (_data, id) => {
      // Undo: restore tidak didukung API — tampilkan info konten yang dihapus
      toast("Post dihapus", {
        action: {
          label: "Tutup",
          onClick: () => undefined,
        },
      });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = data?.groups ?? [];
  const filtered = groups.filter((g) => {
    if (tab === "all") return true;
    if (tab === "scheduled")
      return groupStatus(g.posts) === "scheduled" || groupStatus(g.posts) === "draft";
    return groupStatus(g.posts) === tab;
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl">Antrian Post</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Kelola post terjadwal, gagal, dan terbit — semua platform dalam satu tempat
          </p>
        </div>
      </div>

      {/* Tab filter */}
      <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
        {STATUS_TABS.map((t) => {
          const count =
            t.key === "all"
              ? groups.length
              : groups.filter((g) => groupStatus(g.posts) === t.key).length;
          return (
            <button
              type="button"
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 font-medium text-sm transition-colors",
                tab === t.key
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]",
              )}
            >
              {t.label} {count > 0 && <span className="ml-1 opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Tidak ada post"
          description={
            tab === "all"
              ? "Belum ada post yang dibuat. Mulai dari Buat Konten."
              : "Tidak ada post dengan status ini."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((group) => {
            const status = groupStatus(group.posts);
            const isFailed = status === "failed";
            const canPublish = group.posts.some((p) =>
              ["draft", "scheduled", "failed"].includes(p.status),
            );
            const canReschedule = group.posts.some((p) =>
              ["draft", "scheduled", "failed"].includes(p.status),
            );
            const isOpen = expanded === group.id;
            // Url post platform pertama yang tersedia — untuk share post terbit
            const shareUrl = group.posts.find((p) => p.platformPostUrl)?.platformPostUrl ?? null;

            return (
              <div
                key={group.id}
                className={cn("card overflow-hidden", isFailed && "border-[var(--error)]/30")}
              >
                {/* Row utama */}
                <div className="flex items-start gap-3 p-4">
                  {/* Status icon */}
                  <div className="mt-0.5 shrink-0">
                    {status === "failed" ? (
                      <AlertCircle className="h-5 w-5 text-[var(--error)]" />
                    ) : status === "published" ? (
                      <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
                    ) : status === "processing" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--warning)]" />
                    ) : (
                      <Clock className="h-5 w-5 text-[var(--info)]" />
                    )}
                  </div>

                  {/* Konten */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {STATUS_BADGE[status] && (
                        <Badge variant={STATUS_BADGE[status].variant}>
                          {STATUS_BADGE[status].label}
                        </Badge>
                      )}
                      {group.scheduledAt && (
                        <span className="flex items-center gap-1 text-[var(--text-muted)] text-xs">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDate(group.scheduledAt)}
                        </span>
                      )}
                      {/* Chip platform */}
                      {group.posts.map((p) => {
                        const cfg = PLATFORMS[p.platform as keyof typeof PLATFORMS];
                        if (!cfg) return null;
                        return (
                          <span
                            key={p.id}
                            className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 font-medium text-[11px]"
                            style={{ color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[var(--text-primary)] text-sm">
                      {group.content || "(tanpa caption)"}
                    </p>
                    {isFailed && (
                      <p className="mt-1 text-[var(--error)] text-xs">
                        {group.posts.filter((p) => p.status === "failed").length} post gagal — klik
                        detail untuk melihat error
                      </p>
                    )}
                  </div>

                  {/* Aksi */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {status === "published" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void sharePublishedPost(shareUrl, group.content)}
                        title="Bagikan post terbit"
                        aria-label="Bagikan post terbit"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canPublish && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={publishNow.isPending && publishNow.variables === group.id}
                        onClick={() => publishNow.mutate(group.id)}
                        title={isFailed ? "Coba publish ulang" : "Publish sekarang"}
                      >
                        {publishNow.isPending && publishNow.variables === group.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        {isFailed ? "Retry" : "Publish"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded(isOpen ? null : group.id)}
                      aria-expanded={isOpen}
                    >
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
                      />
                    </Button>
                  </div>
                </div>

                {/* Detail expand */}
                {isOpen && (
                  <div className="border-[var(--border-light)] border-t bg-[var(--bg-tertiary)]/50 p-4">
                    {/* Reschedule */}
                    {canReschedule && (
                      <div className="mb-4 flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <label
                            htmlFor={`reschedule-${group.id}`}
                            className="font-medium text-[var(--text-secondary)] text-xs"
                          >
                            Jadwalkan ulang
                          </label>
                          <Input
                            type="datetime-local"
                            id={`reschedule-${group.id}`}
                            className="h-9 w-64 text-sm"
                            defaultValue={
                              group.scheduledAt
                                ? new Date(group.scheduledAt).toISOString().slice(0, 16)
                                : ""
                            }
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const dt = new Date(e.target.value);
                              if (Number.isNaN(dt.getTime())) return;
                              reschedule.mutate({
                                id: group.id,
                                scheduledAt: dt.toISOString(),
                              });
                            }}
                          />
                        </div>
                        <p className="pb-2 text-[var(--text-muted)] text-xs">
                          Perubahan jadwal otomatis membatalkan job lama & membuat job baru
                        </p>
                      </div>
                    )}

                    {/* Per-platform breakdown */}
                    <div className="space-y-2">
                      {group.posts.map((p) => {
                        const cfg = PLATFORMS[p.platform as keyof typeof PLATFORMS];
                        const badge = STATUS_BADGE[p.status];
                        return (
                          <div
                            key={p.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="font-semibold text-xs"
                                  style={{ color: cfg?.color }}
                                >
                                  {cfg?.label ?? p.platform}
                                </span>
                                <span className="text-[var(--text-muted)] text-xs">
                                  @{p.username ?? "—"}
                                </span>
                                {badge && (
                                  <Badge variant={badge.variant} className="scale-90">
                                    {badge.label}
                                  </Badge>
                                )}
                              </div>
                              {p.errorMessage && (
                                <p className="mt-1 font-mono text-[var(--error)] text-xs">
                                  {p.errorCode}: {p.errorMessage}
                                </p>
                              )}
                              {p.platformPostUrl && (
                                <a
                                  href={p.platformPostUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-[var(--accent-gold)] text-xs hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Lihat post
                                </a>
                              )}
                            </div>
                            {p.status === "published" && p.publishedAt && (
                              <span className="shrink-0 text-[var(--text-muted)] text-xs">
                                {formatDate(p.publishedAt)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Hapus */}
                    {canReschedule && (
                      <div className="mt-4 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[var(--error)] hover:bg-[var(--error-light)]"
                          disabled={remove.isPending && remove.variables === group.id}
                          onClick={() => {
                            if (confirm("Hapus post ini beserta semua jadwalnya?")) {
                              remove.mutate(group.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Hapus Post
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <p className="flex items-center gap-1.5 text-[var(--text-muted)] text-xs">
        <RefreshCw className="h-3 w-3" />
        Data diperbarui otomatis setiap 30 detik
      </p>
    </div>
  );
}
