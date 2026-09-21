// Badge prediksi skor engagement di Compose — rule-based via API (gratis, tanpa kredit AI)
import { useQuery } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type ScoreFactor = {
  label: string;
  impact: string;
  detail: string;
};

export type PredictScore = {
  score: number;
  grade: "Sangat Baik" | "Baik" | "Cukup" | "Perlu Perbaikan";
  factors: ScoreFactor[];
};

const GRADE_COLOR: Record<PredictScore["grade"], string> = {
  "Sangat Baik": "text-emerald-600 dark:text-emerald-400",
  Baik: "text-[var(--accent-gold)]",
  Cukup: "text-amber-600 dark:text-amber-400",
  "Perlu Perbaikan": "text-[var(--error)]",
};

export function PredictScoreBadge({
  content,
  hashtags,
  platforms,
  hasMedia,
  scheduledHour,
}: {
  content: string;
  hashtags: string;
  platforms: string[];
  hasMedia: boolean;
  /** Jam publish WIB (0-23) */
  scheduledHour: number | null;
}) {
  // Debounce input 800ms — skor tidak perlu live per ketikan, cukup setelah
  // user berhenti mengetik (hindari spam request / rate limit 429).
  const [debounced, setDebounced] = useState(content);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(content), 800);
    return () => window.clearTimeout(timer);
  }, [content]);

  // Skor dihitung server (rule-based, gratis) — refetch setelah debounce
  const { data } = useQuery({
    queryKey: ["predict-score", debounced, hashtags, platforms.join(","), hasMedia, scheduledHour],
    queryFn: () =>
      api.post<PredictScore>("/ai/predict-score", {
        content: hashtags.trim()
          ? `${debounced}\n\n${hashtags
              .split(/[,\s]+/)
              .map((t) => (t.startsWith("#") ? t : `#${t.replace(/^#/, "")}`))
              .filter((t) => t.length > 1)
              .join(" ")}`
          : debounced,
        platforms,
        hasMedia,
        scheduledHour: scheduledHour ?? 12,
      }),
    staleTime: 60_000,
  });

  if (!data) return null;

  return (
    <div className="group relative">
      <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs">
        <Gauge className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <span className="font-bold">{data.score}</span>
        <span className={GRADE_COLOR[data.grade]}>· {data.grade}</span>
      </div>
      {/* Tooltip detail faktor skor — muncul saat hover */}
      <div className="pointer-events-none absolute top-full right-0 z-30 mt-1 hidden w-72 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--popover)] p-3 text-left shadow-lg group-hover:block">
        <p className="mb-2 font-semibold text-xs">
          Prediksi engagement: {data.score}/100 ({data.grade})
        </p>
        <ul className="space-y-1.5">
          {data.factors.map((f) => (
            <li key={f.label} className="text-[11px] leading-snug">
              <span className="font-medium">{f.label}</span>{" "}
              <span
                className={
                  f.impact === "+0"
                    ? "text-[var(--text-muted)]"
                    : "text-emerald-600 dark:text-emerald-400"
                }
              >
                {f.impact}
              </span>
              <span className="text-[var(--text-secondary)]"> — {f.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-[var(--border-light)] border-t pt-2 text-[10px] text-[var(--text-muted)]">
          Estimasi rule-based berbasis praktik terbaik konten sosmed Indonesia.
        </p>
      </div>
    </div>
  );
}
