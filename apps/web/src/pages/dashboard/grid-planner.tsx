// Halaman Grid Planner — preview feed Instagram 3 kolom.
// Susun urutan visual postingan IG sebelum tayang supaya feed estetik.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CalendarClock, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

const InstagramBrandIcon = PLATFORMS.instagram.icon;
const IG_COLOR = PLATFORMS.instagram.color;

type GridItem = {
  postId: string;
  groupId: string;
  status: string;
  content: string;
  scheduledAt: string | null;
  platformPostUrl: string | null;
  username: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaThumb: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  published: "bg-emerald-500",
  scheduled: "bg-[var(--accent-gold)]",
  draft: "bg-slate-400",
  publishing: "bg-blue-400",
};

const STATUS_LABEL: Record<string, string> = {
  published: "Tayang",
  scheduled: "Terjadwal",
  draft: "Draft",
  publishing: "Memproses",
};

export function GridPlannerPage() {
  const queryClient = useQueryClient();
  // Urutan lokal (array postId) — hasil pindah naik/turun user
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["grid-items"],
    queryFn: () => api.get<{ items: GridItem[] }>("/posts/grid"),
  });

  // Reschedule: naik/turunkan slot jadwal IG (tukar tanggal dengan tetangga)
  const reschedule = useMutation({
    mutationFn: ({ groupId, scheduledAt }: { groupId: string; scheduledAt: string | null }) =>
      api.patch(`/posts/${groupId}`, {
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grid-items"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
      toast.success("Jadwal postingan ditukar");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const serverItems = data?.items ?? [];
  const items: GridItem[] = orderOverride
    ? (() => {
        const byId = new Map(serverItems.map((i) => [i.postId, i]));
        const ordered = orderOverride
          .map((id) => byId.get(id))
          .filter((i): i is GridItem => Boolean(i));
        // Tambah item baru (belum ada di override)
        for (const item of serverItems) {
          if (!orderOverride.includes(item.postId)) ordered.push(item);
        }
        return ordered;
      })()
    : serverItems;

  /** Tukar posisi idx dengan idx+delta di urutan lokal */
  function moveItem(idx: number, delta: number) {
    const next = [...items];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setOrderOverride(next.map((i) => i.postId));

    // Bila kedua post terjadwal → tukar jadwalnya di server
    const a = next[idx]!;
    const b = next[target]!;
    if (a.scheduledAt && b.scheduledAt) {
      reschedule.mutate({ groupId: a.groupId, scheduledAt: b.scheduledAt });
      reschedule.mutate({ groupId: b.groupId, scheduledAt: a.scheduledAt });
    }
  }

  function resetOrder() {
    setOrderOverride(null);
    queryClient.invalidateQueries({ queryKey: ["grid-items"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <InstagramBrandIcon className="h-6 w-6" style={{ color: IG_COLOR }} />
            Grid Planner
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Preview tampilan feed Instagram 3 kolom. Susun urutan visual supaya feed estetik.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {orderOverride && (
            <Button variant="outline" size="sm" onClick={resetOrder}>
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Urutan
            </Button>
          )}
          <Link to="/compose">
            <Button size="sm">Buat Konten</Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
        </div>
      ) : items.length === 0 ? (
        <div className="card p-12 text-center">
          <InstagramBrandIcon className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
          <h2 className="mt-3 font-semibold">Belum ada postingan Instagram</h2>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Buat konten dengan akun Instagram terpilih untuk mulai menyusun grid.
          </p>
          <Link to="/compose" className="mt-4 inline-block">
            <Button size="sm">Buat Konten Pertama</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="mx-auto max-w-2xl">
            {/* Header profile mini */}
            <div className="mb-4 flex items-center gap-3 px-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient">
                <InstagramBrandIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-semibold">
                  {items[0]?.username ? `@${items[0].username}` : "Akun Instagram Anda"}
                </p>
                <p className="text-[var(--text-muted)] text-xs">
                  {items.length} postingan · urutan terbaru → terlama
                </p>
              </div>
            </div>

            {/* Grid 3 kolom */}
            <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-primary)] p-1 md:gap-1.5 md:p-2">
              {items.map((item, idx) => (
                <div
                  key={item.postId}
                  className="group relative aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)]"
                >
                  {item.mediaUrl || item.mediaThumb ? (
                    <img
                      src={item.mediaThumb ?? item.mediaUrl ?? ""}
                      alt={item.content.slice(0, 60) || "Postingan"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center">
                      <CalendarClock className="mb-1 h-4 w-4 text-[var(--text-muted)]" />
                      <p className="line-clamp-4 text-[10px] text-[var(--text-secondary)] leading-snug">
                        {item.content.slice(0, 120) || "(tanpa caption)"}
                      </p>
                    </div>
                  )}

                  {/* Overlay hover: aksi naik/turun + caption */}
                  <div className="absolute inset-0 flex flex-col justify-between bg-black/60 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        className="rounded bg-white/20 p-1 text-white backdrop-blur hover:bg-white/40 disabled:opacity-30"
                        aria-label="Naikkan"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === items.length - 1}
                        className="rounded bg-white/20 p-1 text-white backdrop-blur hover:bg-white/40 disabled:opacity-30"
                        aria-label="Turunkan"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="line-clamp-3 text-[10px] text-white leading-snug">
                      {item.content || "(tanpa caption)"}
                    </p>
                  </div>

                  {/* Badge status */}
                  <span
                    className={cn(
                      "absolute top-1.5 left-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white/80",
                      STATUS_STYLE[item.status] ?? "bg-slate-400",
                    )}
                    title={STATUS_LABEL[item.status] ?? item.status}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[var(--text-muted)] text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Tayang
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-gold)]" /> Terjadwal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Draft
            </span>
            <Badge variant="secondary" className="text-[10px]">
              Tukar urutan pada post terjadwal otomatis menukar jadwal tayangnya
            </Badge>
          </div>
        </>
      )}
    </div>
  );
}
