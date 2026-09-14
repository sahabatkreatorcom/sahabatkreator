// Halaman Coach — ringkasan performa 30 hari + saran aksi AI mingguan
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Loader2,
  Minus,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type PlatformPerformance = {
  platform: string;
  followersDelta: number | null;
  followersLatest: number | null;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  totalViews: number;
  engagementRate: number | null;
  publishedCount: number;
};

type CoachSummary = {
  followersTotal: number | null;
  followersDelta: number | null;
  publishedCount: number;
  postsPerWeek: number;
  topPost: {
    platform: string;
    content: string;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    publishedAt: string | null;
  } | null;
  perPlatform: PlatformPerformance[];
  hasData: boolean;
};

type CoachAdvice = {
  insight: string;
  actions: { title: string; detail: string; impact: "low" | "medium" | "high" }[];
  weeklyGoal: string;
};

type Focus = "growth" | "engagement" | "konsistensi";

const FOCUS_OPTIONS: { value: Focus; label: string; desc: string }[] = [
  { value: "growth", label: "Pertumbuhan", desc: "Fokus menambah followers" },
  { value: "engagement", label: "Engagement", desc: "Fokus interaksi audiens" },
  { value: "konsistensi", label: "Konsistensi", desc: "Fokus rutinitas posting" },
];

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID").format(n);
}

function platformLabel(platform: string): string {
  return PLATFORMS[platform as keyof typeof PLATFORMS]?.label ?? platform;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <Badge variant="secondary">—</Badge>;
  if (delta > 0) {
    return (
      <Badge className="gap-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <ArrowUpRight className="h-3 w-3" />+{formatNumber(delta)}
      </Badge>
    );
  }
  if (delta < 0) {
    return (
      <Badge className="gap-0.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <ArrowDownRight className="h-3 w-3" />
        {formatNumber(delta)}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-0.5">
      <Minus className="h-3 w-3" />0
    </Badge>
  );
}

const IMPACT_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function CoachPage() {
  const [focus, setFocus] = useState<Focus | "">("");
  const [advice, setAdvice] = useState<CoachAdvice | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["coach"],
    queryFn: () => api.get<CoachSummary>("/coach"),
    staleTime: 5 * 60 * 1000,
  });

  const askAdvice = useMutation({
    mutationFn: (f: Focus | undefined) =>
      api.post<{ advice: CoachAdvice }>("/coach/advice", f ? { focus: f } : {}),
    onSuccess: (res) => {
      setAdvice(res.advice);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-[var(--bg-tertiary)]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-[var(--radius-lg)] bg-[var(--bg-tertiary)]"
            />
          ))}
        </div>
      </div>
    );
  }

  const summary = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Sparkles className="h-6 w-6 text-[var(--accent-gold)]" />
            Coach
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Analisis performa 30 hari terakhir + saran aksi mingguan yang dipersonalisasi
          </p>
        </div>
      </div>

      {!summary?.hasData ? (
        <div className="card p-8 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
          <p className="mt-3 font-medium">Belum ada data performa</p>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Hubungkan akun sosmed di menu Akun Sosmed, lalu tunggu analytics terisi (maksimal 1 jam)
            agar Coach bisa menganalisis performa Anda.
          </p>
        </div>
      ) : (
        <>
          {/* Kartu ringkasan */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-5">
              <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                Total Followers
              </p>
              <div className="mt-2 flex items-center gap-2">
                <p className="font-bold text-2xl">{formatNumber(summary.followersTotal)}</p>
                <DeltaBadge delta={summary.followersDelta} />
              </div>
              <p className="mt-1 text-[var(--text-muted)] text-xs">perubahan 30 hari</p>
            </div>
            <div className="card p-5">
              <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                Post Tayang
              </p>
              <p className="mt-2 font-bold text-2xl">{formatNumber(summary.publishedCount)}</p>
              <p className="mt-1 text-[var(--text-muted)] text-xs">30 hari terakhir</p>
            </div>
            <div className="card p-5">
              <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                Konsistensi
              </p>
              <p className="mt-2 font-bold text-2xl">
                {summary.postsPerWeek}
                <span className="font-normal text-[var(--text-muted)] text-sm"> post/minggu</span>
              </p>
              <p className="mt-1 text-[var(--text-muted)] text-xs">
                {summary.postsPerWeek >= 4
                  ? "Konsistensi bagus — pertahankan!"
                  : summary.postsPerWeek >= 2
                    ? "Coba tingkatkan ke 3-5x/minggu"
                    : "Terlalu jarang posting — mulai rutin"}
              </p>
            </div>
            <div className="card p-5">
              <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                Post Terbaik
              </p>
              {summary.topPost ? (
                <>
                  <p className="mt-2 line-clamp-2 font-medium text-sm">{summary.topPost.content}</p>
                  <p className="mt-1 text-[var(--text-muted)] text-xs">
                    {platformLabel(summary.topPost.platform)} ·{" "}
                    {formatNumber(summary.topPost.likes)} likes ·{" "}
                    {formatNumber(summary.topPost.comments)} komentar
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[var(--text-muted)] text-sm">Belum ada data engagement</p>
              )}
            </div>
          </div>

          {/* Performa per platform */}
          {summary.perPlatform.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-[var(--border-light)] border-b p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Trophy className="h-4 w-4 text-[var(--accent-gold)]" />
                  Performa per Platform
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-[var(--border-light)] border-b text-left text-[var(--text-muted)] text-xs uppercase tracking-wide">
                      <th className="px-5 py-3">Platform</th>
                      <th className="px-5 py-3">Post</th>
                      <th className="px-5 py-3">Likes</th>
                      <th className="px-5 py-3">Komentar</th>
                      <th className="px-5 py-3">Views</th>
                      <th className="px-5 py-3">Eng. Rate</th>
                      <th className="px-5 py-3">Followers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.perPlatform.map((p) => (
                      <tr
                        key={p.platform}
                        className="border-[var(--border-light)] border-b last:border-0"
                      >
                        <td className="px-5 py-3 font-medium">{platformLabel(p.platform)}</td>
                        <td className="px-5 py-3">{p.publishedCount}</td>
                        <td className="px-5 py-3">{formatNumber(p.totalLikes)}</td>
                        <td className="px-5 py-3">{formatNumber(p.totalComments)}</td>
                        <td className="px-5 py-3">{formatNumber(p.totalViews)}</td>
                        <td className="px-5 py-3">
                          {p.engagementRate != null ? (
                            <span
                              className={cn(
                                "font-semibold",
                                p.engagementRate >= 3
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : p.engagementRate >= 1
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-red-500",
                              )}
                            >
                              {p.engagementRate}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {formatNumber(p.followersLatest)}
                            <DeltaBadge delta={p.followersDelta} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Saran AI */}
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Target className="h-4 w-4 text-[var(--accent-gold)]" />
                  Saran Minggu Ini
                </h2>
                <p className="mt-1 text-[var(--text-secondary)] text-sm">
                  AI menganalisis data performa Anda dan menyusun rencana aksi konkret
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={focus}
                  onChange={(e) => setFocus(e.target.value as Focus | "")}
                  className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 text-sm"
                  aria-label="Fokus saran"
                >
                  <option value="">Fokus: bebas</option>
                  {FOCUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.desc}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={askAdvice.isPending}
                  onClick={() => askAdvice.mutate(focus || undefined)}
                >
                  {askAdvice.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Minta Saran AI
                </Button>
              </div>
            </div>

            {askAdvice.isPending && (
              <div className="mt-5 space-y-3">
                <div className="h-16 animate-pulse rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]" />
                <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]" />
              </div>
            )}

            {advice && !askAdvice.isPending && (
              <div className="mt-5 space-y-4">
                {/* Insight */}
                <div className="rounded-[var(--radius-md)] bg-gradient p-4 text-white">
                  <p className="text-sm leading-relaxed">{advice.insight}</p>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  {advice.actions?.map((action, i) => (
                    <div
                      key={`${action.title}-${i}`}
                      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-gold-light)] font-bold text-[var(--accent-gold)] text-xs">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{action.title}</p>
                          <Badge
                            className={cn("text-[10px] uppercase", IMPACT_STYLES[action.impact])}
                          >
                            dampak {action.impact}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-[var(--text-secondary)] text-sm">
                          {action.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Weekly goal */}
                {advice.weeklyGoal && (
                  <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-gold)]/40 bg-[var(--accent-gold-light)]/50 p-4">
                    <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-gold)]" />
                    <div>
                      <p className="font-semibold text-[var(--accent-gold)] text-xs uppercase tracking-wide">
                        Target Minggu Depan
                      </p>
                      <p className="mt-0.5 text-sm">{advice.weeklyGoal}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!advice && !askAdvice.isPending && (
              <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] border-dashed p-6 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                <p className="mt-2 text-[var(--text-secondary)] text-sm">
                  Klik "Minta Saran AI" untuk mendapatkan insight dan rencana aksi mingguan
                  berdasarkan data performa Anda
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
