// Panel saran waktu posting terbaik — data dari /analytics/optimal-times (riil, bukan mock)
import { useQuery } from "@tanstack/react-query";
import { Clock, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type OptimalSlot = {
  platform: string;
  dayOfWeek: number;
  hour: number;
  label: string;
  score: number;
  avgEngagement: number;
  sampleCount: number;
  confidence: "low" | "medium" | "high";
  heuristic: boolean;
  nextDate: string;
};

type OptimalTimesResponse = {
  slots: OptimalSlot[];
  allHeuristic: boolean;
};

/** Konversi ISO UTC → value datetime-local (WIB) */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}T${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}`;
}

export function OptimalTimesPanel({
  platform,
  onSelect,
}: {
  platform: string;
  onSelect: (localDateTime: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["optimal-times", platform],
    queryFn: () =>
      api.get<OptimalTimesResponse>(`/analytics/optimal-times?platform=${platform}&limit=6`),
    staleTime: 10 * 60 * 1000, // saran tidak berubah cepat
  });

  const slots = data?.slots ?? [];
  const cfg = PLATFORMS[platform as keyof typeof PLATFORMS];

  return (
    <div className="card space-y-3 p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />
        <h2 className="font-semibold">Waktu Terbaik</h2>
      </div>
      <p className="text-[var(--text-secondary)] text-xs">
        {data?.allHeuristic ? (
          <>
            Belum ada data historis {cfg?.label ?? platform} — saran berdasarkan pola aktif pengguna
            sosmed Indonesia.
          </>
        ) : (
          <>Berdasarkan engagement riil post {cfg?.label ?? platform} Anda (WIB).</>
        )}
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]"
            />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <p className="text-[var(--text-muted)] text-xs">Belum ada saran untuk platform ini.</p>
      ) : (
        <div className="space-y-2">
          {slots.map((slot) => (
            <button
              key={`${slot.platform}-${slot.dayOfWeek}-${slot.hour}`}
              type="button"
              onClick={() => onSelect(isoToLocalInput(slot.nextDate))}
              className="group flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold-light)]"
            >
              <span className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent-gold)]" />
                {slot.label}
              </span>
              <span className="flex items-center gap-2">
                {!slot.heuristic && slot.avgEngagement > 0 && (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    ~{Math.round(slot.avgEngagement)} eng
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-medium text-[10px]",
                    slot.score >= 80
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : slot.score >= 60
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-muted)]",
                  )}
                >
                  {slot.score}
                </span>
              </span>
            </button>
          ))}
          <p className="pt-1 text-[10px] text-[var(--text-muted)]">
            Klik slot untuk terapkan ke jadwal
          </p>
        </div>
      )}
    </div>
  );
}
