// Halaman SEB — AI coach proaktif: report, rekomendasi, experiment, brand knowledge
// (chat SEB ada di tombol floating kanan bawah di semua halaman)
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BrandKnowledgePanel } from "@/components/seb/brand-knowledge-panel";
import { ExperimentPanel } from "@/components/seb/experiment-panel";
import { RecommendationCard } from "@/components/seb/recommendation-card";
import { ReportCard } from "@/components/seb/report-card";
import type {
  SebBrandKnowledge,
  SebExperiment,
  SebRecommendation,
  SebReport,
} from "@/components/seb/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type SebOverview = {
  latestReport: SebReport | null;
  recommendations: SebRecommendation[];
  experiments: SebExperiment[];
  brandKnowledge: SebBrandKnowledge | null;
  counts: {
    openRecommendations: number;
    highPriority: number;
    activeExperiments: number;
  };
};

const TABS = [
  { key: "recommendations", label: "Rekomendasi" },
  { key: "experiments", label: "Experiment" },
  { key: "brand", label: "Brand Knowledge" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function SebPage() {
  const [tab, setTab] = useState<TabKey>("recommendations");

  const overviewQuery = useQuery({
    queryKey: ["seb-overview"],
    queryFn: () => api.get<SebOverview>("/seb/overview"),
  });

  const generateReport = useMutation({
    mutationFn: () => api.post<{ report: SebReport }>("/seb/reports"),
    onSuccess: () => {
      toast.success("Report SEB selesai dibuat");
      overviewQuery.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (overviewQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded bg-[var(--bg-tertiary)]" />
        <div className="h-48 animate-pulse rounded-[var(--radius-lg)] bg-[var(--bg-tertiary)]" />
        <div className="h-32 animate-pulse rounded-[var(--radius-lg)] bg-[var(--bg-tertiary)]" />
      </div>
    );
  }

  if (overviewQuery.isError) {
    const message =
      overviewQuery.error instanceof Error ? overviewQuery.error.message : "Gagal memuat SEB";
    return (
      <div className="card p-8 text-center">
        <Bot className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
        <p className="mt-3 font-medium">SEB belum aktif</p>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">{message}</p>
      </div>
    );
  }

  const data = overviewQuery.data;
  if (!data) return null;

  const isAdmin = true; // admin org bisa kelola brand knowledge (server memvalidasi role)
  const recommendations = data.recommendations.filter((r) => r.status !== "dismissed");
  const pendingCount = data.counts.openRecommendations;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Sparkles className="h-6 w-6 text-[var(--accent-gold)]" />
            SEB
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            AI coach proaktif — menganalisis konten & performa Anda dan memberi rekomendasi harian.
            Butuh ngobrol? Klik tombol SEB di kanan bawah kapan saja.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-[var(--bg-tertiary)] px-3 py-1 font-medium text-[var(--text-secondary)] text-xs">
            {pendingCount} rekomendasi terbuka
          </span>
          {data.counts.highPriority > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700 text-xs dark:bg-red-900/40 dark:text-red-300">
              {data.counts.highPriority} prioritas tinggi
            </span>
          )}
        </div>
      </div>

      {/* Report terbaru (chat SEB ada di floating button kanan bawah) */}
      <div>
        {generateReport.isPending ? (
          <div className="card flex items-center justify-center gap-2 p-6 text-[var(--text-secondary)] text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-gold)]" />
            SEB sedang menganalisis data 90 hari terakhir…
          </div>
        ) : (
          <ReportCard
            report={data.latestReport}
            onRegenerate={() => generateReport.mutate()}
            regenerating={generateReport.isPending}
          />
        )}
      </div>

      {/* Tab konten */}
      <div className="flex gap-1.5 border-[var(--border-light)] border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 font-medium text-sm transition-colors",
              tab === t.key
                ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {t.label}
            {t.key === "recommendations" && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--accent-gold)] px-1.5 py-0.5 text-[10px] text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "recommendations" && (
        <div className="space-y-3">
          {recommendations.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="font-medium">Belum ada rekomendasi</p>
              <p className="mt-1 text-[var(--text-secondary)] text-sm">
                Generate report untuk mendapat rekomendasi hasil analisis SEB.
              </p>
            </div>
          ) : (
            recommendations.map((r) => <RecommendationCard key={r.id} recommendation={r} />)
          )}
        </div>
      )}

      {tab === "experiments" && <ExperimentPanel experiments={data.experiments} />}

      {tab === "brand" && (
        <BrandKnowledgePanel brandKnowledge={data.brandKnowledge} canManage={isAdmin} />
      )}
    </div>
  );
}
