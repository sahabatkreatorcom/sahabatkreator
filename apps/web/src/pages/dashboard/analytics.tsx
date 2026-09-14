// Halaman Analitik — chart timeseries + top posts + breakdown per akun
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AudienceDemographicsPanel } from "@/components/analytics/audience-demographics-panel";
import { HashtagPerformancePanel } from "@/components/analytics/hashtag-performance-panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageLoader, Skeleton } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCompact, formatNumber } from "@/lib/format";
import { PLATFORMS } from "@/lib/platforms";

type OverviewTotals = {
  followers: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  impressions: number;
};

type Overview = {
  totals: OverviewTotals;
  accounts: {
    id: string;
    platform: string;
    username: string;
    followers: number | null;
  }[];
  /** Hanya ada saat mode custom date range (from/to) */
  comparison?: {
    previous: OverviewTotals;
    deltas: {
      followers: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      views: number | null;
      impressions: number | null;
    };
  };
};

type Timeseries = {
  series: {
    date: string;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    impressions: number;
  }[];
};

type TopPosts = {
  posts: {
    postId: string;
    platform: string;
    content: string;
    platformPostUrl: string | null;
    publishedAt: string | null;
    username: string | null;
    likes: number;
    comments: number;
    shares: number;
    views: number;
  }[];
};

type OptimalTimes = {
  slots: {
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
  }[];
  allHeuristic: boolean;
};

const STAT_CARDS = [
  { key: "followers", label: "Followers", icon: Users },
  { key: "views", label: "Views", icon: Eye },
  { key: "likes", label: "Likes", icon: Heart },
  { key: "comments", label: "Komentar", icon: MessageCircle },
  { key: "shares", label: "Shares", icon: Share2 },
  { key: "impressions", label: "Impressions", icon: Eye },
] as const;

type StatKey = (typeof STAT_CARDS)[number]["key"];

/** Preset rentang: 7/30/90 hari & bulan berjalan */
type Preset = { id: string; label: string };

const MAX_RANGE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tanggal awal bulan berjalan (YYYY-MM-DD, lokal) */
function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Tanggal hari ini (YYYY-MM-DD, lokal) */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Badge delta vs periode sebelumnya — naik hijau, turun merah, netral abu */
function DeltaBadge({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined) return null;
  const pct = Math.abs(delta) >= 1000 ? "+∞" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold text-[10px] ${
        flat
          ? "bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
          : up
            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
            : "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
      }`}
      title="Perubahan vs periode sebelumnya"
    >
      {!flat &&
        (up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
      {pct}
    </span>
  );
}

export function AnalyticsPage() {
  // Filter: preset days ATAU custom range (from/to)
  const [preset, setPreset] = useState<string>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  // Rentang terpasang (null = mode preset days)
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);

  // Rentang aktif (mode from/to): custom range ATAU preset "Bulan ini"
  // (awal bulan → hari ini). Preset 7/30/90 tetap mode days (kompatibel).
  const monthRange = preset === "month" ? { from: startOfMonthISO(), to: todayISO() } : null;
  const activeRange = appliedRange ?? monthRange;

  // Rentang efektif: panjang custom range, atau preset (bulan ini = 1 s/d hari ini)
  const effectiveDays = activeRange
    ? Math.max(
        1,
        Math.round(
          (new Date(activeRange.to).getTime() - new Date(activeRange.from).getTime()) / MS_PER_DAY,
        ) + 1,
      )
    : Number(preset);

  const overviewQuery = activeRange
    ? `/analytics/overview?from=${activeRange.from}&to=${activeRange.to}`
    : `/analytics/overview?days=${effectiveDays}`;

  const { data: overview } = useQuery({
    queryKey: ["analytics-overview", overviewQuery],
    queryFn: () => api.get<Overview>(overviewQuery),
  });
  const { data: timeseries } = useQuery({
    queryKey: ["analytics-timeseries"],
    queryFn: () => api.get<Timeseries>("/analytics/timeseries"),
  });
  const { data: topPosts, isLoading: topLoading } = useQuery({
    queryKey: ["analytics-top-posts"],
    queryFn: () => api.get<TopPosts>("/analytics/top-posts?limit=10"),
  });
  const { data: optimalTimes } = useQuery({
    queryKey: ["analytics-optimal-times"],
    queryFn: () => api.get<OptimalTimes>("/analytics/optimal-times?limit=12"),
    staleTime: 10 * 60 * 1000,
  });

  /** Terapkan preset — matikan custom range */
  function applyPreset(id: string) {
    setPreset(id);
    setAppliedRange(null);
    setRangeError(null);
    setCustomFrom("");
    setCustomTo("");
  }

  /** Terapkan custom range dengan validasi: from ≤ to & maks 365 hari */
  function applyCustomRange() {
    if (!customFrom || !customTo) {
      setRangeError("Isi kedua tanggal mulai dan selesai");
      return;
    }
    const from = new Date(`${customFrom}T00:00:00`);
    const to = new Date(`${customTo}T23:59:59`);
    if (from > to) {
      setRangeError("Tanggal mulai harus ≤ tanggal selesai");
      return;
    }
    const spanDays = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      setRangeError(`Rentang maksimal ${MAX_RANGE_DAYS} hari`);
      return;
    }
    setRangeError(null);
    setAppliedRange({ from: customFrom, to: customTo });
  }

  const presets: Preset[] = [
    { id: "7", label: "7 hari" },
    { id: "30", label: "30 hari" },
    { id: "90", label: "90 hari" },
    { id: "month", label: "Bulan ini" },
  ];

  const isPresetActive = (id: string) => !appliedRange && preset === id;

  const chartData = (timeseries?.series ?? []).map((s) => ({
    ...s,
    label: new Date(s.date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    }),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Analitik</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Performa konten lintas platform
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Preset chip: 7/30/90 hari + Bulan ini */}
          <div className="flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-[var(--border)] p-1">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`rounded px-3 py-1 text-sm ${
                  isPresetActive(p.id)
                    ? "bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="Tanggal mulai"
                value={customFrom}
                max={customTo || todayISO()}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-[9.5rem] text-xs"
              />
              <span className="text-[var(--text-muted)] text-xs">–</span>
              <Input
                type="date"
                aria-label="Tanggal selesai"
                value={customTo}
                min={customFrom || undefined}
                max={todayISO()}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-[9.5rem] text-xs"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant={appliedRange ? "secondary" : "primary"}
              onClick={applyCustomRange}
              disabled={!customFrom || !customTo}
            >
              <CalendarRange className="h-3.5 w-3.5" />
              Terapkan
            </Button>
          </div>
          {rangeError && <p className="text-red-600 text-xs dark:text-red-400">{rangeError}</p>}
          {appliedRange && (
            <p className="text-[var(--text-muted)] text-xs">
              Rentang kustom: {appliedRange.from} s/d {appliedRange.to}
            </p>
          )}
        </div>
      </div>

      {/* Stat cards — dengan badge vs periode sebelumnya (mode rentang kustom / bulan ini) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {!overview
          ? [...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
            ))
          : STAT_CARDS.map((card) => {
              const value = overview.totals[card.key];
              const delta =
                overview.comparison?.deltas[card.key as keyof typeof overview.comparison.deltas];
              return (
                <div key={card.key} className="card p-5">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    <card.icon className="h-4 w-4" />
                    <span className="text-xs">{card.label}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="font-bold text-2xl">{formatCompact(value)}</p>
                    {overview.comparison && <DeltaBadge delta={delta} />}
                  </div>
                </div>
              );
            })}
      </div>

      {/* Kartu ringkasan vs periode sebelumnya (mode rentang kustom / bulan ini) */}
      {overview?.comparison && (
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-[var(--accent-gold)]" />
            <h2 className="font-semibold">vs Periode Sebelumnya</h2>
          </div>
          <p className="mb-4 text-[var(--text-secondary)] text-xs">
            Perbandingan metrik rentang terpilih dengan periode yang sama panjang sebelum tanggal
            mulai.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {STAT_CARDS.map((card) => {
              const prev = overview.comparison?.previous[card.key as StatKey] ?? 0;
              const delta =
                overview.comparison?.deltas[card.key as keyof typeof overview.comparison.deltas];
              return (
                <div
                  key={card.key}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border-light)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[var(--text-muted)] text-xs">{card.label}</p>
                    <p className="font-semibold text-sm">
                      {formatCompact(prev)}
                      <span className="ml-1 font-normal text-[10px] text-[var(--text-muted)]">
                        sebelumnya
                      </span>
                    </p>
                  </div>
                  <DeltaBadge delta={delta} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Tren Engagement</h2>
        {chartData.length === 0 ? (
          <EmptyState
            title="Belum ada data"
            description="Data akan muncul setelah konten Anda tayang dan terkumpul statistik."
          />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#08A5FC" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#08A5FC" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradLikes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FD9501" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#FD9501" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-light)"
                  vertical={false}
                />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="var(--text-muted)"
                  tickFormatter={(v) => formatCompact(Number(v))}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    formatNumber(Number(value)),
                    name === "views" ? "Views" : "Likes",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  stroke="#08A5FC"
                  strokeWidth={2}
                  fill="url(#gradViews)"
                />
                <Area
                  type="monotone"
                  dataKey="likes"
                  stroke="#FD9501"
                  strokeWidth={2}
                  fill="url(#gradLikes)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top posts */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold">Konten Terbaik</h2>
          {topLoading ? (
            <PageLoader />
          ) : (topPosts?.posts ?? []).length === 0 ? (
            <EmptyState title="Belum ada konten tayang" />
          ) : (
            <ul className="divide-y divide-[var(--border-light)]">
              {(topPosts?.posts ?? []).map((p) => {
                const cfg = PLATFORMS[p.platform as keyof typeof PLATFORMS];
                const Icon = cfg?.icon;
                return (
                  <li key={p.postId} className="flex items-start gap-3 py-3">
                    {Icon && (
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                        <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm">{p.content || "(media saja)"}</p>
                      <p className="mt-1 text-[var(--text-muted)] text-xs">
                        @{p.username} · {formatCompact(p.views)} views · {formatCompact(p.likes)}{" "}
                        likes
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Waktu terbaik posting */}
        <div className="card p-6">
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />
            <h2 className="font-semibold">Waktu Terbaik Posting</h2>
          </div>
          <p className="mb-4 text-[var(--text-secondary)] text-xs">
            {optimalTimes?.allHeuristic
              ? "Saran berbasis pola aktif pengguna sosmed Indonesia (WIB) — akan membaik seiring data historis Anda."
              : "Slot dengan engagement tertinggi dari data historis Anda (WIB)."}
          </p>
          {(optimalTimes?.slots ?? []).length === 0 ? (
            <EmptyState title="Belum ada saran" />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(optimalTimes?.slots ?? []).map((s) => {
                const cfg = PLATFORMS[s.platform as keyof typeof PLATFORMS];
                const Icon = cfg?.icon;
                return (
                  <div
                    key={`${s.platform}-${s.dayOfWeek}-${s.hour}`}
                    className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{s.label}</span>
                      <span
                        className={
                          s.score >= 80
                            ? "font-bold text-emerald-600 text-xs dark:text-emerald-400"
                            : s.score >= 60
                              ? "font-bold text-amber-600 text-xs dark:text-amber-400"
                              : "font-bold text-[var(--text-muted)] text-xs"
                        }
                      >
                        {s.score}
                      </span>
                    </div>
                    {Icon && (
                      <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                        <Icon className="h-3 w-3" style={{ color: cfg.color }} />
                        {cfg.label}
                        {s.heuristic ? " · estimasi" : ` · ${s.sampleCount} post`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Followers per akun */}
        <div className="card p-6">
          <h2 className="mb-4 font-semibold">Followers per Akun</h2>
          {(overview?.accounts ?? []).length === 0 ? (
            <EmptyState title="Belum ada akun terhubung" />
          ) : (
            <ul className="space-y-3">
              {(overview?.accounts ?? []).map((a) => {
                const cfg = PLATFORMS[a.platform as keyof typeof PLATFORMS];
                const Icon = cfg?.icon;
                return (
                  <li key={a.id} className="flex items-center gap-3">
                    {Icon && (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                        <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">@{a.username}</p>
                      <p className="text-[var(--text-muted)] text-xs">{cfg?.label}</p>
                    </div>
                    <span className="font-semibold">
                      {a.followers != null ? formatNumber(a.followers) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Demografi audiens (IG) — gender × usia */}
      <AudienceDemographicsPanel
        accounts={(overview?.accounts ?? []).map((a) => ({
          id: a.id,
          platform: a.platform,
          username: a.username,
        }))}
      />

      {/* Performa hashtag — top hashtag berdasarkan engagement */}
      <HashtagPerformancePanel days={effectiveDays} />
    </div>
  );
}
