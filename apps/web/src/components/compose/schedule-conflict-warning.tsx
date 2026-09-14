// Deteksi konflik jadwal di compose — cek client-side post terjadwal lain
// yang menempel di rentang ±15 menit pada akun yang sama, lalu tampilkan
// warning inline kuning (tidak memblokir publish).
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatTimeId } from "@/components/calendar/shared";
import { api } from "@/lib/api";

/** Rentang deteksi konflik (menit) di kiri-kanan jadwal yang dipilih */
const CONFLICT_WINDOW_MINUTES = 15;
/** Delay sebelum cek konflik dijalankan setelah user selesai mengubah jadwal */
const CHECK_DEBOUNCE_MS = 600;

type ScheduledGroup = {
  id: string;
  content: string;
  scheduledAt: string | null;
  posts: {
    id: string;
    socialAccountId: string;
    username: string | null;
    platform: string;
  }[];
};

type ConflictEntry = {
  /** Judul singkat post yang berbentrokan */
  title: string;
  /** Selisih menit terhadap jadwal yang sedang disusun */
  deltaMinutes: number;
  /** Username akun yang berbentrokan */
  username: string | null;
};

/** Ringkas konten jadi judul pendek untuk daftar konflik */
function shortTitle(content: string): string {
  const firstLine = content.trim().split("\n")[0] ?? "";
  if (firstLine.length <= 40) return firstLine || "(tanpa caption)";
  return `${firstLine.slice(0, 40)}…`;
}

/**
 * Cari post terjadwal lain yang berada dalam rentang ±15 menit dari
 * `scheduledAt` pada salah satu `accountIds` terpilih.
 */
export function findScheduleConflicts(
  groups: ScheduledGroup[],
  scheduledAt: string,
  accountIds: string[],
): ConflictEntry[] {
  const target = new Date(scheduledAt).getTime();
  if (Number.isNaN(target) || accountIds.length === 0) return [];

  const accountSet = new Set(accountIds);
  const conflicts: ConflictEntry[] = [];

  for (const group of groups) {
    if (!group.scheduledAt) continue;
    const time = new Date(group.scheduledAt).getTime();
    if (Number.isNaN(time)) continue;

    const deltaMinutes = Math.round((time - target) / 60000);
    if (Math.abs(deltaMinutes) > CONFLICT_WINDOW_MINUTES) continue;

    // Cukup satu post group yang menempel di akun terpilih → anggap konflik
    const hit = group.posts.find((p) => accountSet.has(p.socialAccountId));
    if (!hit) continue;

    conflicts.push({
      title: shortTitle(group.content),
      deltaMinutes,
      username: hit.username,
    });
  }

  // Urutkan berdasarkan kedekatan waktu
  return conflicts.sort((a, b) => Math.abs(a.deltaMinutes) - Math.abs(b.deltaMinutes));
}

/**
 * Warning inline kuning di bawah input jadwal compose.
 * Query post terjadwal di-cache react-query (staleTime 5 menit) dan cek
 * konflik dijalankan dengan debounce agar tidak flicker saat mengetik.
 */
export function ScheduleConflictWarning({
  scheduledAt,
  accountIds,
}: {
  /** Nilai datetime-local dari input jadwal compose */
  scheduledAt: string;
  /** Id akun yang dipilih di compose */
  accountIds: string[];
}) {
  // Debounce nilai jadwal — tunggu user selesai mengubah sebelum mengecek
  const [debouncedAt, setDebouncedAt] = useState(scheduledAt);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedAt(scheduledAt), CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [scheduledAt]);

  const { data } = useQuery({
    queryKey: ["scheduled-posts"],
    queryFn: () => api.get<{ groups: ScheduledGroup[] }>("/posts?status=scheduled"),
    staleTime: 5 * 60 * 1000,
    enabled: debouncedAt !== "",
  });

  const conflicts = useMemo(
    () => (debouncedAt ? findScheduleConflicts(data?.groups ?? [], debouncedAt, accountIds) : []),
    [data?.groups, debouncedAt, accountIds],
  );

  if (conflicts.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-yellow-500/50 bg-yellow-500/10 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-yellow-700 dark:text-yellow-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Ada {conflicts.length} post lain di waktu hampir sama (±15 mnt) — pertimbangkan renggangkan
        jadwal
      </p>
      <ul className="mt-2 space-y-1">
        {conflicts.slice(0, 5).map((c, i) => (
          <li key={i} className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span className="font-medium text-yellow-700 dark:text-yellow-400">
              {c.deltaMinutes === 0
                ? "bersamaan"
                : `${c.deltaMinutes > 0 ? "+" : ""}${c.deltaMinutes} mnt`}
            </span>
            <span className="truncate">
              {c.title}
              {c.username ? ` · @${c.username}` : ""}
            </span>
          </li>
        ))}
        {conflicts.length > 5 && (
          <li className="text-[var(--text-muted)]">+{conflicts.length - 5} post lainnya</li>
        )}
      </ul>
      <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
        Perkiraan waktu: {formatTimeId(debouncedAt)} — hanya peringatan, tetap bisa dijadwalkan.
      </p>
    </div>
  );
}
