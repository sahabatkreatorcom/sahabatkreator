// Kartu Fokus Hari Ini (M11) — post terjadwal hari ini + CTA buat konten
// + insight singkat waktu posting terbaik (dari /analytics/optimal-times;
// hanya tampil bila ada slot berbasis data riil, bukan heuristik).
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Clock, ListChecks, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/spinner";
import { api } from "@/lib/api";

type PostGroups = {
  groups: {
    id: string;
    content: string;
    scheduledAt: string | null;
  }[];
};

type OptimalTimes = {
  slots: {
    platform: string;
    dayOfWeek: number;
    hour: number;
    label: string;
    score: number;
    heuristic: boolean;
  }[];
};

const TODAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Jam "HH:MM" dari ISO string (zona waktu lokal user) */
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function TodayFocusCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["posts-today-focus"],
    queryFn: () =>
      api.get<PostGroups>(`/posts?from=${encodeURIComponent(new Date().toISOString())}`),
  });

  // Insight best-time — hanya tampil bila ada slot non-heuristik (data riil)
  const { data: optimal } = useQuery({
    queryKey: ["analytics-optimal-times-focus"],
    queryFn: () => api.get<OptimalTimes>("/analytics/optimal-times?limit=3"),
    staleTime: 10 * 60 * 1000,
  });
  const bestSlots = (optimal?.slots ?? []).filter((s) => !s.heuristic).slice(0, 2);

  // Post group terjadwal hari ini (00:00 – 23:59)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(startOfDay.getDate() + 1);

  const todayGroups = (data?.groups ?? [])
    .filter((g) => g.scheduledAt)
    .map((g) => ({ ...g, at: new Date(g.scheduledAt!) }))
    .filter((g) => g.at >= startOfDay && g.at < endOfDay)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (isLoading) {
    return (
      <div className="card p-6">
        <Skeleton className="h-20 rounded-[var(--radius-md)]" />
      </div>
    );
  }

  const todayLabel = TODAY_LABELS[new Date().getDay()]!;

  return (
    <div className="card p-6">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <CalendarCheck className="h-4 w-4 text-[var(--accent-gold)]" />
        Fokus Hari Ini · {todayLabel}
      </h2>

      {todayGroups.length > 0 ? (
        <>
          <p className="text-[var(--text-secondary)] text-sm">
            <span className="font-bold text-[var(--text-primary)]">{todayGroups.length} post</span>{" "}
            terjadwal, berikutnya jam{" "}
            <span className="font-semibold text-[var(--accent-gold)]">
              {formatTime(todayGroups[0]!.scheduledAt!)}
            </span>
          </p>
          <ul className="mt-3 space-y-1.5">
            {todayGroups.slice(0, 3).map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-sm">
                <span className="shrink-0 font-semibold text-[var(--accent-gold)] text-xs">
                  {formatTime(g.scheduledAt!)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                  {g.content || "(tanpa caption)"}
                </span>
              </li>
            ))}
            {todayGroups.length > 3 && (
              <li className="text-[var(--text-muted)] text-xs">
                +{todayGroups.length - 3} lainnya
              </li>
            )}
          </ul>
          <Link to="/queue" className="mt-4 block">
            <Button size="sm" variant="outline" className="w-full">
              <ListChecks className="h-4 w-4" />
              Lihat Antrian Post
            </Button>
          </Link>
        </>
      ) : (
        <>
          <p className="text-[var(--text-secondary)] text-sm">
            Tidak ada jadwal post hari ini — buat post agar tetap konsisten.
          </p>
          <Link to="/compose" className="mt-4 block">
            <Button size="sm" className="w-full">
              <Zap className="h-4 w-4" />
              Buat Post Sekarang
            </Button>
          </Link>
        </>
      )}

      {/* Insight: waktu posting terbaik dari data historis (disembunyikan bila hanya heuristik) */}
      {bestSlots.length > 0 && (
        <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] p-3">
          <p className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)] text-xs">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
            Waktu posting terbaik Anda
          </p>
          <ul className="mt-1.5 space-y-1">
            {bestSlots.map((s) => (
              <li
                key={`${s.platform}-${s.label}`}
                className="flex items-center gap-2 text-[var(--text-muted)] text-xs"
              >
                <Clock className="h-3 w-3" />
                <span>
                  {s.label} WIB <span className="text-[var(--text-secondary)]">({s.platform})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
