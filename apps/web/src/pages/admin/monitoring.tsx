// Admin: Monitoring — platform health, connected accounts, webhooks, posts
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Eye,
  MessageSquare,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";

type PlatformByPlatform = {
  platform: string;
  total: number;
  needsReconnect: number;
  tokenExpiringSoon: number;
  tokenExpired: number;
};

type Credential = {
  platform: string;
  isActive: boolean;
  hasClientSecret: boolean;
  hasExtraConfig: boolean;
};

type FailedPost = {
  id: string;
  platform: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  orgId: string;
};

type Health = {
  platform: string;
  status: string;
  message: string | null;
  checkedAt: string;
};

type EngagementByPlatform = {
  platform: string;
  type: string;
  unread: number;
  total: number;
};

type MonitoringData = {
  connectedAccounts: {
    total: number;
    needsReconnect: number;
    tokenExpiringSoon: number;
    byPlatform: PlatformByPlatform[];
  };
  platformCredentials: Credential[];
  recentPosts: {
    last24h: Record<string, number>;
    failedPosts: FailedPost[];
  };
  webhookLogs: {
    last24h: Record<string, number>;
  };
  platformHealth: Health[];
  engagement: {
    totalUnread: number;
    byPlatform: EngagementByPlatform[];
  };
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  instagram_standalone: "IG Standalone",
  facebook: "Facebook",
  threads: "Threads",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  linkedin_org: "LinkedIn Org",
  bluesky: "Bluesky",
  google_business: "Google Business",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "operational") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Operational
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" />
        Degraded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
      <XCircle className="h-3 w-3" />
      {status}
    </span>
  );
}

export function AdminMonitoringPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-monitoring"],
    queryFn: () => api.get<MonitoringData>("/admin/monitoring/overview"),
    refetchInterval: 30_000,
  });

  if (isLoading) return <PageLoader />;

  const accounts = data?.connectedAccounts;
  const credentials = data?.platformCredentials ?? [];
  const posts = data?.recentPosts;
  const webhooks = data?.webhookLogs;
  const health = data?.platformHealth ?? [];
  const engagement = data?.engagement;

  // Aggregate engagement by platform
  const engagementByPlatform = new Map<string, number>();
  for (const e of engagement?.byPlatform ?? []) {
    engagementByPlatform.set(e.platform, (engagementByPlatform.get(e.platform) ?? 0) + e.unread);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-2xl">Monitoring</h1>
          <p className="mt-1 max-w-2xl text-[var(--text-secondary)] text-sm">
            Status platform, koneksi akun, webhook, dan post terbaru. Auto-refresh setiap 30 detik.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
            <CreditCard className="h-4 w-4" />
            Akun Terhubung
          </div>
          <div className="mt-1 font-bold text-2xl">{accounts?.total ?? 0}</div>
          {(accounts?.needsReconnect ?? 0) > 0 && (
            <div className="mt-1 text-xs text-red-500">
              {accounts?.needsReconnect} perlu reconnect
            </div>
          )}
          {(accounts?.tokenExpiringSoon ?? 0) > 0 && (
            <div className="mt-1 text-xs text-amber-500">
              {accounts?.tokenExpiringSoon} token expiring soon
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
            <MessageSquare className="h-4 w-4" />
            Unread Engagement
          </div>
          <div className="mt-1 font-bold text-2xl">{engagement?.totalUnread ?? 0}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {Array.from(engagementByPlatform.entries()).map(([platform, unread]) => (
              <span
                key={platform}
                className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs"
              >
                {PLATFORM_LABELS[platform] ?? platform}: {unread}
              </span>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
            <Eye className="h-4 w-4" />
            Post 24 Jam
          </div>
          <div className="mt-1 font-bold text-2xl">
            {Object.values(posts?.last24h ?? {}).reduce((a, b) => a + b, 0)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(posts?.last24h ?? {}).map(([status, count]) => (
              <span
                key={status}
                className={`rounded px-1.5 py-0.5 text-xs ${
                  status === "failed"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : status === "published"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-[var(--bg-tertiary)]"
                }`}
              >
                {status}: {count}
              </span>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
            <Activity className="h-4 w-4" />
            Webhook 24 Jam
          </div>
          <div className="mt-1 font-bold text-2xl">
            {Object.values(webhooks?.last24h ?? {}).reduce((a, b) => a + b, 0)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(webhooks?.last24h ?? {}).map(([result, count]) => (
              <span
                key={result}
                className={`rounded px-1.5 py-0.5 text-xs ${
                  result === "invalid_signature" || result === "invalid_token"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-[var(--bg-tertiary)]"
                }`}
              >
                {result}: {count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Platform Health */}
      {health.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 font-semibold text-lg">Platform Health</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {health.map((h) => (
              <div key={h.platform} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium text-sm">{PLATFORM_LABELS[h.platform] ?? h.platform}</div>
                  {h.message && (
                    <div className="mt-0.5 text-[var(--text-secondary)] text-xs">{h.message}</div>
                  )}
                </div>
                <StatusBadge status={h.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected Accounts by Platform */}
      <div className="card p-4">
        <h2 className="mb-3 font-semibold text-lg">Akun Terhubung per Platform</h2>
        {(accounts?.byPlatform ?? []).length === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">Belum ada akun terhubung.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[var(--text-secondary)]">
                  <th className="pb-2 pr-4 font-medium">Platform</th>
                  <th className="pb-2 pr-4 text-right font-medium">Total</th>
                  <th className="pb-2 pr-4 text-right font-medium">Reconnect</th>
                  <th className="pb-2 pr-4 text-right font-medium">Expiring</th>
                  <th className="pb-2 text-right font-medium">Expired</th>
                </tr>
              </thead>
              <tbody>
                {accounts?.byPlatform.map((p) => (
                  <tr key={p.platform} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {PLATFORM_LABELS[p.platform] ?? p.platform}
                    </td>
                    <td className="py-2 pr-4 text-right">{p.total}</td>
                    <td className="py-2 pr-4 text-right">
                      {p.needsReconnect > 0 ? (
                        <span className="text-red-500">{p.needsReconnect}</span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">0</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {p.tokenExpiringSoon > 0 ? (
                        <span className="text-amber-500">{p.tokenExpiringSoon}</span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">0</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {p.tokenExpired > 0 ? (
                        <span className="text-red-500">{p.tokenExpired}</span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Platform Credentials */}
      <div className="card p-4">
        <h2 className="mb-3 font-semibold text-lg">Kredensial Platform</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {credentials.map((c) => (
            <div key={c.platform} className="rounded-lg border p-3">
              <div className="font-medium text-sm">{PLATFORM_LABELS[c.platform] ?? c.platform}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    c.isActive
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                  }`}
                >
                  {c.isActive ? "Active" : "Inactive"}
                </span>
                {c.hasClientSecret && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    Secret
                  </span>
                )}
                {c.hasExtraConfig && (
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    Extra
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Failed Posts */}
      {(posts?.failedPosts?.length ?? 0) > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 font-semibold text-lg">Post Gagal (24 Jam)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[var(--text-secondary)]">
                  <th className="pb-2 pr-4 font-medium">Platform</th>
                  <th className="pb-2 pr-4 font-medium">Error Code</th>
                  <th className="pb-2 pr-4 font-medium">Error Message</th>
                  <th className="pb-2 font-medium">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {posts?.failedPosts.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {PLATFORM_LABELS[p.platform] ?? p.platform}
                    </td>
                    <td className="py-2 pr-4">
                      <code className="rounded bg-red-100 px-1 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        {p.errorCode ?? "-"}
                      </code>
                    </td>
                    <td className="max-w-xs truncate py-2 pr-4 text-[var(--text-secondary)]">
                      {p.errorMessage ?? "-"}
                    </td>
                    <td className="py-2 text-[var(--text-secondary)]">
                      {new Date(p.createdAt).toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
