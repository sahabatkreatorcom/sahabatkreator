import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";

type MonitoringData = {
  generatedAt: string;
  db: { status: "ok" | "error"; latencyMs: number };
  counts: Array<{ label: string; value: number | string }>;
  recentActivity: {
    postsLast24h: number;
    postsLast7d: number;
    newUsersLast7d: number;
    newSubscriptionsLast7d: number;
    failedPaymentsLast24h: number;
    engagementItemsLast24h: number;
  };
  platformAccounts: Array<{ platform: string; count: number }>;
  auth: { activeSessions: number; totalUsers: number };
  recentErrors: Array<{ timestamp: string; type: string; message: string }>;
};

function formatTime(iso: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function platformColor(p: string) {
  const colors: Record<string, string> = {
    instagram: "bg-gradient-to-r from-purple-500 to-pink-500",
    facebook: "bg-blue-600",
    threads: "bg-black",
    tiktok: "bg-black",
    youtube: "bg-red-600",
    pinterest: "bg-red-500",
    linkedin: "bg-blue-700",
    bluesky: "bg-sky-500",
    google_business: "bg-green-600",
  };
  return colors[p] ?? "bg-gray-500";
}

export function AdminMonitoringPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-monitoring"],
    queryFn: () => api.get<MonitoringData>("/admin/monitoring"),
    refetchInterval: 30_000,
  });

  if (isLoading) return <PageLoader label="Memuat monitoring..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl">Monitoring</h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Status database dan aktivitas sistem secara real-time
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)] text-xs">
            {data?.generatedAt ? formatTime(data.generatedAt) : "-"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* DB Health + Auth */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Database</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={data?.db.status === "ok" ? "success" : "danger"}>
              {data?.db.status === "ok" ? "Connected" : "Error"}
            </Badge>
            <span className="text-[var(--text-secondary)] text-sm">
              {data?.db.latencyMs ?? "-"}ms
            </span>
          </div>
        </div>
        <div className="card p-5">
          <p className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Active Sessions</p>
          <p className="mt-2 font-bold text-2xl">{data?.auth.activeSessions ?? "-"}</p>
          <p className="text-[var(--text-muted)] text-xs">
            dari {data?.auth.totalUsers ?? "-"} users
          </p>
        </div>
        <div className="card p-5">
          <p className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Gagal Bayar (24h)</p>
          <p className="mt-2 font-bold text-2xl">
            {data?.recentActivity.failedPaymentsLast24h ?? 0}
          </p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card p-5">
        <h2 className="mb-4 font-semibold text-lg">Aktivitas Terbaru</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg bg-[var(--bg-tertiary)] p-4 text-center">
            <p className="text-[var(--text-muted)] text-xs">Post 24h</p>
            <p className="mt-1 font-bold text-xl">{data?.recentActivity.postsLast24h ?? 0}</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-tertiary)] p-4 text-center">
            <p className="text-[var(--text-muted)] text-xs">Post 7d</p>
            <p className="mt-1 font-bold text-xl">{data?.recentActivity.postsLast7d ?? 0}</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-tertiary)] p-4 text-center">
            <p className="text-[var(--text-muted)] text-xs">User Baru 7d</p>
            <p className="mt-1 font-bold text-xl">{data?.recentActivity.newUsersLast7d ?? 0}</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-tertiary)] p-4 text-center">
            <p className="text-[var(--text-muted)] text-xs">Subscription 7d</p>
            <p className="mt-1 font-bold text-xl">
              {data?.recentActivity.newSubscriptionsLast7d ?? 0}
            </p>
          </div>
          <div className="rounded-lg bg-[var(--bg-tertiary)] p-4 text-center">
            <p className="text-[var(--text-muted)] text-xs">Engagement 24h</p>
            <p className="mt-1 font-bold text-xl">
              {data?.recentActivity.engagementItemsLast24h ?? 0}
            </p>
          </div>
          <div className="rounded-lg bg-[var(--bg-tertiary)] p-4 text-center">
            <p className="text-[var(--text-muted)] text-xs">Errors 24h</p>
            <p className="mt-1 font-bold text-xl">
              {data?.recentActivity.failedPaymentsLast24h ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Platform Accounts */}
      <div className="card p-5">
        <h2 className="mb-4 font-semibold text-lg">Akun Platform</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {data?.platformAccounts.map((pa) => (
            <div
              key={pa.platform}
              className="flex items-center gap-3 rounded-lg border border-[var(--border-light)] p-3"
            >
              <div className={`h-3 w-3 rounded-full ${platformColor(pa.platform)}`} />
              <div>
                <p className="font-medium text-sm capitalize">{pa.platform.replace("_", " ")}</p>
                <p className="text-[var(--text-muted)] text-xs">{pa.count} akun</p>
              </div>
            </div>
          ))}
          {(!data?.platformAccounts || data.platformAccounts.length === 0) && (
            <p className="col-span-full text-[var(--text-muted)] text-sm">Belum ada akun terhubung</p>
          )}
        </div>
      </div>

      {/* Table Counts */}
      <div className="card p-5">
        <h2 className="mb-4 font-semibold text-lg">Jumlah Data</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-4 py-2 text-left font-medium text-[var(--text-secondary)]">
                  Tabel
                </th>
                <th className="px-4 py-2 text-right font-medium text-[var(--text-secondary)]">
                  Jumlah
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {data?.counts.map((row) => (
                <tr key={row.label} className="hover:bg-[var(--bg-tertiary)]">
                  <td className="px-4 py-2">{row.label}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {typeof row.value === "number" ? row.value.toLocaleString("id-ID") : row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Errors */}
      {data?.recentErrors && data.recentErrors.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-lg">Error Terbaru</h2>
          <div className="space-y-2">
            {data.recentErrors.map((err, i) => (
              <div
                key={`${err.timestamp}-${i}`}
                className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30"
              >
                <Badge variant="destructive" className="shrink-0">
                  {err.type}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[var(--text-primary)]">{err.message}</p>
                  <p className="text-[var(--text-muted)] text-xs">{formatTime(err.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
