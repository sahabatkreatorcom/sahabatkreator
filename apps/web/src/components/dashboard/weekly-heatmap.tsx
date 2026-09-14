// Heatmap aktivitas mingguan (M11) — grid 7 kolom (Sen–Min) × baris slot jam ringkas.
// Tiap sel = jumlah post pada kombinasi (hari, slot jam); opacity sesuai jumlah.
// Data riil dari /posts (publishedAt utk post tayang, scheduledAt utk terjadwal),
// di-aggregate client-side per hari + slot jam. Murni CSS/Tailwind.
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { api } from "@/lib/api";

type PostsResponse = {
  groups: {
    id: string;
    scheduledAt: string | null;
    posts: { id: string; status: string; publishedAt: string | null }[];
  }[];
};

// Label hari kolom — Senin di kiri, Minggu di kanan
const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAY_FULL = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

/** Slot jam ringkas (jam lokal user) — urutan baris dari pagi ke malam */
const HOUR_SLOTS = [
  { label: "Pagi 05–11", from: 5, to: 11 },
  { label: "Siang 11–15", from: 11, to: 15 },
  { label: "Sore 15–19", from: 15, to: 19 },
  { label: "Malam 19–05", from: 19, to: 5 },
] as const;

/** Konversi Date → index kolom Senin-0 … Minggu-6 */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Konversi jam → index slot (malam melintasi tengah hari: 19–05) */
function slotIndex(hour: number): number {
  for (let i = 0; i < HOUR_SLOTS.length; i++) {
    const s = HOUR_SLOTS[i]!;
    if (s.from < s.to) {
      if (hour >= s.from && hour < s.to) return i;
    } else {
      // Slot malam: 19–23 atau 0–4
      if (hour >= s.from || hour < s.to) return i;
    }
  }
  return HOUR_SLOTS.length - 1;
}

/** Warna sel: 0 = netral, makin banyak post makin pekat (opacity gold) */
function cellBackground(count: number, max: number): React.CSSProperties {
  if (count === 0) return { backgroundColor: "var(--bg-tertiary)" };
  // Skala opacity 30%–90% relatif terhadap sel terpadat
  const pct = Math.round(30 + (Math.min(count, max) / Math.max(max, 1)) * 60);
  return {
    backgroundColor: `color-mix(in srgb, var(--accent-gold) ${pct}%, transparent)`,
  };
}

export function WeeklyHeatmap() {
  // Ambil post 60 hari terakhir — cukup untuk pola mingguan yang stabil
  const since = new Date();
  since.setDate(since.getDate() - 60);
  since.setHours(0, 0, 0, 0);

  const { data, isLoading } = useQuery({
    queryKey: ["posts-heatmap", since.toISOString().slice(0, 10)],
    queryFn: () => api.get<PostsResponse>(`/posts?from=${encodeURIComponent(since.toISOString())}`),
  });

  // Aggregate: count[slot 0..3][dow Sen-0..Min-6]
  const counts: number[][] = HOUR_SLOTS.map(() => DAY_LABELS.map(() => 0));
  for (const group of data?.groups ?? []) {
    for (const post of group.posts) {
      // Post tayang pakai publishedAt; belum tayang pakai scheduledAt grup
      const src =
        post.status === "published" && post.publishedAt ? post.publishedAt : group.scheduledAt;
      if (!src) continue;
      const d = new Date(src);
      counts[slotIndex(d.getHours())]![mondayIndex(d)]! += 1;
    }
  }

  const max = Math.max(...counts.flat(), 1);
  const totalPosts = counts.flat().reduce((a, b) => a + b, 0);
  const todayCol = mondayIndex(new Date());

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Flame className="h-4 w-4 text-[var(--accent-gold)]" />
            Aktivitas Mingguan
          </h2>
          <p className="mt-1 text-[var(--text-muted)] text-xs">
            {isLoading
              ? "Memuat data postingan…"
              : `${totalPosts} post dalam 60 hari terakhir · per hari & slot jam`}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-1.5">
          <thead>
            <tr>
              <th className="w-24" />
              {DAY_LABELS.map((d, i) => (
                <th
                  key={d}
                  className={`text-center font-medium text-[10px] ${
                    i === todayCol ? "text-[var(--accent-gold)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOUR_SLOTS.map((slot, si) => (
              <tr key={slot.label}>
                <td className="pr-2 text-right text-[10px] text-[var(--text-muted)]">
                  {slot.label}
                </td>
                {DAY_LABELS.map((_, di) => {
                  const count = counts[si]![di]!;
                  return (
                    <td key={di}>
                      <div
                        title={`${DAY_FULL[di]} ${slot.label}: ${count} post`}
                        className={`flex aspect-square items-center justify-center rounded-[var(--radius-md)] font-semibold text-xs ${
                          count > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                        } ${di === todayCol ? "ring-2 ring-[var(--accent-gold)] ring-offset-1 ring-offset-[var(--bg-primary)]" : ""}`}
                        style={cellBackground(count, max)}
                      >
                        {count > 0 ? count : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-3 text-[var(--text-muted)] text-xs">
        <span>Sedikit</span>
        <div className="flex items-center gap-1">
          <span className="h-3.5 w-3.5 rounded-[4px]" style={cellBackground(0, max)} />
          <span className="h-3.5 w-3.5 rounded-[4px]" style={cellBackground(1, max)} />
          <span className="h-3.5 w-3.5 rounded-[4px]" style={cellBackground(max, max)} />
        </div>
        <span>Banyak</span>
        <span className="ml-auto hidden sm:inline">Kolom hari ini di-highlight</span>
      </div>
    </div>
  );
}
