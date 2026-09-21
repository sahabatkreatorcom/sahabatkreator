// Admin: Log — audit log & webhook log
import { useQuery } from "@tanstack/react-query";
import { Activity, Webhook } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatCurrencyIdr, formatRelativeTime } from "@/lib/format";

type AuditLog = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
};

type WebhookLogItem = {
  id: string;
  provider: string;
  eventType: string;
  orderId: string | null;
  status: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export function AdminLogsPage() {
  const [tab, setTab] = useState<"audit" | "webhook">("audit");
  const [actionFilter, setActionFilter] = useState("");

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["admin-logs", actionFilter],
    queryFn: () =>
      api.get<{ logs: AuditLog[] }>(
        `/admin/logs${actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : ""}`,
      ),
    enabled: tab === "audit",
  });
  const { data: webhookData, isLoading: webhookLoading } = useQuery({
    queryKey: ["admin-webhook-logs"],
    queryFn: () => api.get<{ logs: WebhookLogItem[] }>("/admin/webhook-logs"),
    enabled: tab === "webhook",
  });

  const isLoading = tab === "audit" ? auditLoading : webhookLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Log & Audit</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Jejak aktivitas admin dan webhook pembayaran
        </p>
      </div>

      {/* Tab */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("audit")}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
            tab === "audit"
              ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
              : "border-[var(--border)] text-[var(--text-secondary)]"
          }`}
        >
          <Activity className="h-4 w-4" />
          Audit Log
        </button>
        <button
          type="button"
          onClick={() => setTab("webhook")}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
            tab === "webhook"
              ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
              : "border-[var(--border)] text-[var(--text-secondary)]"
          }`}
        >
          <Webhook className="h-4 w-4" />
          Webhook Log
        </button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : tab === "audit" ? (
        <div className="space-y-4">
          {/* Filter action */}
          <div className="flex items-center gap-2">
            <input
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              placeholder="Filter aksi (mis. user.ban, plan.upsert)"
              className="w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            {actionFilter && (
              <button
                type="button"
                onClick={() => setActionFilter("")}
                className="text-[var(--text-secondary)] text-xs hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <div className="card divide-y divide-[var(--border-light)] p-0">
            {(auditData?.logs ?? []).length === 0 ? (
              <p className="p-8 text-center text-[var(--text-muted)] text-sm">
                Belum ada aktivitas{actionFilter ? ` untuk aksi "${actionFilter}"` : ""}.
              </p>
            ) : (
              (auditData?.logs ?? []).map((log) => (
                <div key={log.id} className="flex flex-wrap items-start gap-3 p-4">
                  <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                    {log.action}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{log.userName ?? "Sistem"}</span>
                      {log.entityType && (
                        <span className="text-[var(--text-muted)]">
                          {" "}
                          → {log.entityType}{" "}
                          <span className="font-mono text-xs">{log.entityId}</span>
                        </span>
                      )}
                    </p>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <p className="truncate font-mono text-[var(--text-muted)] text-xs">
                        {JSON.stringify(log.metadata)}
                      </p>
                    )}
                    {log.ipAddress && (
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                        IP: {log.ipAddress}
                      </p>
                    )}
                  </div>
                  <span className="text-[var(--text-muted)] text-xs">
                    {formatRelativeTime(log.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="card divide-y divide-[var(--border-light)] p-0">
          {(webhookData?.logs ?? []).length === 0 ? (
            <p className="p-8 text-center text-[var(--text-muted)] text-sm">
              Belum ada webhook masuk.
            </p>
          ) : (
            (webhookData?.logs ?? []).map((log) => (
              <div key={log.id} className="flex flex-wrap items-center gap-3 p-4">
                <Badge
                  variant={
                    log.status === "processed"
                      ? "success"
                      : log.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {log.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-mono text-xs">{log.eventType}</span>
                    {log.orderId && (
                      <span className="ml-2 font-mono text-[var(--text-muted)] text-xs">
                        {log.orderId}
                      </span>
                    )}
                  </p>
                  {log.payload?.amount != null && (
                    <p className="text-[var(--text-muted)] text-xs">
                      {formatCurrencyIdr(Number(log.payload.amount))}
                    </p>
                  )}
                </div>
                <span className="text-[var(--text-muted)] text-xs">
                  {formatRelativeTime(log.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
