// Status — kesehatan platform sosmed + infra (auto-refresh 30 detik)
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  CircleDashed,
  Database,
  HelpCircle,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

type PlatformStatus = {
  platform: string;
  label: string;
  status: "operational" | "degraded" | "outage" | "unknown";
  message: string | null;
  latencyMs: number | null;
  checkedAt: string | null;
  connectedAccounts: number;
};

type StatusResponse = {
  overall: "operational" | "degraded" | "outage" | "unknown";
  platforms: PlatformStatus[];
  database: {
    status: "operational" | "outage";
    latencyMs: number;
    message: string | null;
  };
  timestamp: string;
};

const STATUS_META: Record<
  PlatformStatus["status"],
  { label: string; icon: typeof CheckCircle; tone: string }
> = {
  operational: {
    label: "Normal",
    icon: CheckCircle,
    tone: "text-green-600 dark:text-green-400",
  },
  degraded: {
    label: "Gangguan sebagian",
    icon: AlertTriangle,
    tone: "text-yellow-600 dark:text-yellow-400",
  },
  outage: {
    label: "Terputus",
    icon: XCircle,
    tone: "text-red-600 dark:text-red-400",
  },
  unknown: {
    label: "Belum dicek",
    icon: HelpCircle,
    tone: "text-[var(--text-muted)]",
  },
};

const OVERALL_LABEL: Record<PlatformStatus["status"], string> = {
  operational: "Semua sistem normal",
  degraded: "Gangguan sebagian",
  outage: "Ada platform terputus",
  unknown: "Menunggu pemeriksaan",
};

function StatusIcon({ status }: { status: PlatformStatus["status"] }) {
  const meta = STATUS_META[status];
  const Icon = status === "unknown" ? CircleDashed : meta.icon;
  return <Icon className={`h-5 w-5 ${meta.tone}`} />;
}

export default function StatusPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["status"],
    queryFn: () => api.get<StatusResponse>("/status"),
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] bg-gradient md:flex">
            <Server className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-2xl">Status Sistem</h1>
            <p className="mt-1 text-[var(--text-secondary)] text-sm">
              Kesehatan platform sosial media & infrastruktur
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-gold)]"
            />
            Auto-refresh
          </label>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden md:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !data ? null : (
        <>
          {/* Banner status keseluruhan */}
          <div
            className={`flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border-2 p-6 ${
              data.overall === "operational"
                ? "border-green-600/40 bg-green-600/10"
                : data.overall === "degraded"
                  ? "border-yellow-600/40 bg-yellow-600/10"
                  : data.overall === "outage"
                    ? "border-red-600/40 bg-red-600/10"
                    : "border-[var(--border)] bg-[var(--bg-secondary)]"
            }`}
          >
            <div className="flex items-center gap-4">
              <StatusIcon status={data.overall} />
              <div>
                <h2 className="font-bold text-lg capitalize">{OVERALL_LABEL[data.overall]}</h2>
                <p className="text-[var(--text-muted)] text-sm">
                  Dicek otomatis tiap 5 menit oleh worker
                </p>
              </div>
            </div>
            <div className="text-right text-[var(--text-muted)] text-xs">
              <p>Server time: {formatDate(data.timestamp)}</p>
            </div>
          </div>

          {/* DB */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div
              className={`rounded-[var(--radius-lg)] border p-4 ${
                data.database.status === "operational"
                  ? "border-green-700/40 bg-green-700/10"
                  : "border-red-700/40 bg-red-700/10"
              }`}
            >
              <div className="mb-3 flex items-center gap-3">
                <Database
                  className={
                    data.database.status === "operational"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }
                />
                <div>
                  <h3 className="font-medium">Database</h3>
                  <p className="text-[var(--text-muted)] text-xs">PostgreSQL</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`font-medium text-sm ${
                    data.database.status === "operational"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {data.database.status === "operational" ? "Normal" : "Terputus"}
                </span>
                <span className="text-[var(--text-muted)] text-xs">
                  {data.database.latencyMs}ms
                </span>
              </div>
              {data.database.message && (
                <p
                  className="mt-2 truncate text-[var(--text-muted)] text-xs"
                  title={data.database.message}
                >
                  {data.database.message}
                </p>
              )}
            </div>

            {/* Ringkasan */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
              <h3 className="mb-3 font-medium">Ringkasan Platform</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="font-bold text-2xl text-green-600 dark:text-green-400">
                    {data.platforms.filter((p) => p.status === "operational").length}
                  </p>
                  <p className="text-[var(--text-muted)] text-xs">Normal</p>
                </div>
                <div>
                  <p className="font-bold text-2xl text-yellow-600 dark:text-yellow-400">
                    {data.platforms.filter((p) => p.status === "degraded").length}
                  </p>
                  <p className="text-[var(--text-muted)] text-xs">Gangguan</p>
                </div>
                <div>
                  <p className="font-bold text-2xl text-red-600 dark:text-red-400">
                    {data.platforms.filter((p) => p.status === "outage").length}
                  </p>
                  <p className="text-[var(--text-muted)] text-xs">Terputus</p>
                </div>
              </div>
            </div>
          </div>

          {/* Grid platform */}
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Platform Terhubung</h3>
              <a href="/accounts" className="text-[var(--accent-gold)] text-sm hover:underline">
                Kelola akun →
              </a>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {data.platforms.map((p) => {
                const meta = STATUS_META[p.status];
                return (
                  <div
                    key={p.platform}
                    className={`rounded-[var(--radius-md)] border p-4 ${
                      p.status === "operational"
                        ? "border-green-700/40 bg-green-700/10"
                        : p.status === "degraded"
                          ? "border-yellow-700/40 bg-yellow-700/10"
                          : p.status === "outage"
                            ? "border-red-700/40 bg-red-700/10"
                            : "border-[var(--border)] bg-[var(--bg-tertiary)]"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-medium text-sm">{p.label}</p>
                      <StatusIcon status={p.status} />
                    </div>
                    <div className="space-y-1 text-[var(--text-muted)] text-xs">
                      <p className={meta.tone}>{meta.label}</p>
                      <p>
                        {p.connectedAccounts > 0
                          ? `${p.connectedAccounts} akun terhubung`
                          : "Belum ada akun"}
                      </p>
                      {p.checkedAt && (
                        <p title={formatDate(p.checkedAt)}>
                          Dicek {new Date(p.checkedAt).toLocaleTimeString("id-ID")}
                        </p>
                      )}
                    </div>
                    {p.message && p.status !== "operational" && (
                      <p
                        className="mt-2 truncate text-[var(--text-muted)] text-xs"
                        title={p.message}
                      >
                        {p.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
