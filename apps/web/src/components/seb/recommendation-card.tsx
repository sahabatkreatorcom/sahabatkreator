// Panel rekomendasi SEB — kartu workflow (new → in_progress → done/dismissed) + impact check
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical, Loader2, PlayCircle, TrendingUp, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  PRIORITY_STYLES,
  RECOMMENDATION_STATUS_LABELS,
  type SebRecommendation,
} from "./types";

function platformLabel(platform: string | null) {
  if (!platform) return null;
  return PLATFORMS[platform as keyof typeof PLATFORMS]?.label ?? platform;
}

function formatImpactValue(metrics: Record<string, unknown>, key: string): string | null {
  const value = metrics[key];
  if (typeof value !== "number") return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function RecommendationCard({ recommendation }: { recommendation: SebRecommendation }) {
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      api.patch<{ recommendation: SebRecommendation }>(
        `/seb/recommendations/${recommendation.id}`,
        { status },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seb-overview"] });
      queryClient.invalidateQueries({ queryKey: ["seb-recommendations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const impactCheck = useMutation({
    mutationFn: () =>
      api.post<{ recommendation: SebRecommendation }>(
        `/seb/recommendations/${recommendation.id}/impact-check`,
      ),
    onSuccess: (res) => {
      const delta = res.recommendation.impactResult;
      if (delta && Object.keys(delta).length > 0) {
        toast.success("Impact check selesai — hasil tersimpan di kartu");
      } else {
        toast.info("Belum cukup data untuk mengukur dampak");
      }
      queryClient.invalidateQueries({ queryKey: ["seb-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const r = recommendation;
  const platform = platformLabel(r.platform);
  const impact = r.impactResult;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-semibold text-[11px] uppercase",
            PRIORITY_STYLES[r.priority] ?? PRIORITY_STYLES.low,
          )}
        >
          {r.priority}
        </span>
        <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 font-medium text-[11px] text-[var(--text-secondary)]">
          {CATEGORY_LABELS[r.category] ?? r.category}
        </span>
        {platform && (
          <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 font-medium text-[11px] text-[var(--text-secondary)]">
            {platform}
          </span>
        )}
        <span className="ml-auto text-[11px] text-[var(--text-muted)]">
          {RECOMMENDATION_STATUS_LABELS[r.status] ?? r.status}
        </span>
      </div>

      <div>
        <p className="font-semibold leading-snug">{r.title}</p>
        {r.advice && (
          <p className="mt-1 whitespace-pre-wrap text-[var(--text-secondary)] text-sm">
            {r.advice}
          </p>
        )}
        {r.rationale && (
          <p className="mt-2 text-[var(--text-muted)] text-xs">Alasan: {r.rationale}</p>
        )}
      </div>

      {impact && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-tertiary)] p-3">
          <p className="flex items-center gap-1 font-semibold text-xs">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
            Hasil impact check (30 hari sebelum/sesudah)
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(
              [
                ["Engagement rate", "engagementRateDeltaPct"],
                ["Impressions", "impressionsDeltaPct"],
                ["Reach", "reachDeltaPct"],
              ] as const
            ).map(([label, key]) => {
              const formatted = formatImpactValue(impact, key);
              if (formatted == null) return null;
              const positive = !formatted.startsWith("-");
              return (
                <span
                  key={key}
                  className={cn(
                    positive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {label}: {formatted}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {r.status !== "done" && r.status !== "in_progress" && (
          <button
            type="button"
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate("in_progress")}
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 font-medium text-xs transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] disabled:opacity-50"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Kerjakan
          </button>
        )}
        {r.status !== "done" && (
          <button
            type="button"
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate("done")}
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-emerald-300 px-2.5 py-1.5 font-medium text-emerald-700 text-xs transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Selesai
          </button>
        )}
        {r.status !== "dismissed" && r.status !== "done" && (
          <button
            type="button"
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate("dismissed")}
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 font-medium text-[var(--text-secondary)] text-xs transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Abaikan
          </button>
        )}
        {r.status === "done" && (
          <button
            type="button"
            disabled={impactCheck.isPending}
            onClick={() => impactCheck.mutate()}
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 font-medium text-xs transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] disabled:opacity-50"
          >
            {impactCheck.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            Impact check
          </button>
        )}
        {updateStatus.isPending && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />
        )}
      </div>
    </div>
  );
}
