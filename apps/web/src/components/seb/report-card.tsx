// Kartu report SEB terbaru — skor, summary, breakdown
import { Gauge, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, type SebReport } from "./types";

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreRing(score: number): string {
  if (score >= 75) return "border-emerald-500";
  if (score >= 50) return "border-amber-500";
  return "border-red-500";
}

export function ReportCard({
  report,
  onRegenerate,
  regenerating,
}: {
  report: SebReport | null;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  if (!report) {
    return (
      <div className="card p-6">
        <p className="font-semibold">Belum ada report</p>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          SEB menyusun report analisis otomatis setiap hari (bila diaktifkan admin platform), atau
          generate manual sekarang.
        </p>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-gold)] px-3 py-1.5 font-medium text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", regenerating && "animate-spin")} />
            Generate report
          </button>
        )}
      </div>
    );
  }

  const breakdown = Object.entries(report.scoreBreakdown ?? {});

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold">
            <Gauge className="h-5 w-5 text-[var(--accent-gold)]" />
            {report.title ?? "Report SEB"}
          </p>
          <p className="mt-0.5 text-[var(--text-muted)] text-xs">
            {formatDateTime(report.createdAt)} • model {report.model ?? "—"}
          </p>
        </div>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 font-medium text-xs transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", regenerating && "animate-spin")} />
            Generate ulang
          </button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 bg-[var(--bg-tertiary)]",
            report.overallScore != null ? scoreRing(report.overallScore) : "border-[var(--border)]",
          )}
        >
          <span
            className={cn(
              "font-bold text-lg",
              report.overallScore != null ? scoreColor(report.overallScore) : "",
            )}
          >
            {report.overallScore ?? "—"}
          </span>
        </div>
        <p className="text-[var(--text-secondary)] text-sm">
          {report.summary ?? "Ringkasan belum tersedia."}
        </p>
      </div>

      {breakdown.length > 0 && (
        <div className="space-y-1.5">
          {breakdown.map(([key, value]) => (
            <div key={key} className="flex items-center gap-3 text-xs">
              <span className="w-32 shrink-0 text-[var(--text-secondary)] capitalize">
                {key.replace(/([A-Z])/g, " $1").toLowerCase()}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                <div
                  className="h-full rounded-full bg-[var(--accent-gold)]"
                  style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-medium">{Math.round(value)}</span>
            </div>
          ))}
        </div>
      )}

      {report.confidence != null && (
        <p className="text-[var(--text-muted)] text-xs">
          Tingkat keyakinan SEB: {Math.round(report.confidence * 100)}%
        </p>
      )}
    </div>
  );
}
