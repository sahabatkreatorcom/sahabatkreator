// Admin: Log Aktivitas — aktivitas org (post, akun sosmed, billing, admin) (M14)
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/format";

type ActivityLogItem = {
  id: string;
  organizationId: string;
  organizationName: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type OrgItem = {
  id: string;
  name: string;
  slug: string;
};

/** Label ramah + varian badge per kategori aksi */
function actionStyle(action: string): {
  label: string;
  variant: Parameters<typeof Badge>[0]["variant"];
} {
  if (action.startsWith("post.")) {
    return {
      label: labelFor(action, {
        "post.created": "Post dibuat",
        "post.scheduled": "Post dijadwalkan",
      }),
      variant: "info",
    };
  }
  if (action.startsWith("account.")) {
    return {
      label: labelFor(action, {
        "account.connected": "Akun terhubung",
        "account.disconnected": "Akun diputus",
        "account.reconnected": "Akun dihubungkan ulang",
      }),
      variant: "success",
    };
  }
  if (action.startsWith("plan.")) {
    return { label: labelFor(action, { "plan.changed": "Paket berubah" }), variant: "primary" };
  }
  if (action.startsWith("payment.")) {
    return {
      label: labelFor(action, { "payment.failed": "Pembayaran gagal" }),
      variant: "destructive",
    };
  }
  if (action.startsWith("admin.")) {
    return {
      label: labelFor(action, { "admin.impersonation_started": "Impersonasi dimulai" }),
      variant: "warning",
    };
  }
  return { label: action, variant: "secondary" };
}

function labelFor(action: string, map: Record<string, string>): string {
  return map[action] ?? action;
}

/** Ringkasan singkat metadata utk kolom terakhir (dipotong bila panjang) */
function metadataSummary(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    parts.push(`${key}: ${Array.isArray(value) ? value.join("+") : String(value)}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function AdminOrgActivityPage() {
  // Filter org via query param URL agar bisa dibagikan/di-link dari halaman org
  const [orgId, setOrgId] = useState(
    () => new URLSearchParams(window.location.search).get("orgId") ?? "",
  );
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-org-activity", orgId, page],
    queryFn: () =>
      api.get<{ logs: ActivityLogItem[]; total: number; page: number; perPage: number }>(
        `/admin/org-activity?page=${page}${orgId ? `&orgId=${encodeURIComponent(orgId)}` : ""}`,
      ),
  });

  const { data: orgsData } = useQuery({
    queryKey: ["admin-org-activity-orgs"],
    queryFn: () => api.get<{ organizations: OrgItem[] }>("/admin/org-activity/orgs"),
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 50;
  const totalPages = Math.max(Math.ceil(total / perPage), 1);

  function selectOrg(value: string) {
    setOrgId(value);
    setPage(1);
    // Sinkronkan ke URL (replace, tanpa menambah riwayat)
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("orgId", value);
    else url.searchParams.delete("orgId");
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Log Aktivitas</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Aktivitas organisasi: post, akun sosmed, billing, dan aksi admin — {total} entri
        </p>
      </div>

      {/* Filter org */}
      <div className="flex items-center gap-2">
        <select
          value={orgId}
          onChange={(e) => selectOrg(e.target.value)}
          className="w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
          aria-label="Filter organisasi"
        >
          <option value="">Semua organisasi</option>
          {(orgsData?.organizations ?? []).map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        {isLoading ? (
          <PageLoader />
        ) : logs.length === 0 ? (
          <p className="p-8 text-center text-[var(--text-muted)] text-sm">
            Belum ada aktivitas{orgId ? " untuk organisasi ini" : ""}.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-[var(--border-light)] border-b text-left text-[var(--text-muted)] text-xs">
                <th className="px-5 py-3 font-medium">Waktu</th>
                <th className="px-5 py-3 font-medium">Pengguna</th>
                <th className="px-5 py-3 font-medium">Aksi</th>
                <th className="px-5 py-3 font-medium">Target</th>
                <th className="px-5 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {logs.map((log) => {
                const style = actionStyle(log.action);
                const meta = metadataSummary(log.metadata);
                return (
                  <tr key={log.id} className="hover:bg-[var(--bg-secondary)]">
                    <td className="whitespace-nowrap px-5 py-3">
                      <span title={formatDate(log.createdAt)}>
                        {formatRelativeTime(log.createdAt)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{log.userName ?? "Sistem"}</p>
                      {(log.userEmail || log.organizationName) && (
                        <p className="text-[var(--text-muted)] text-xs">
                          {log.userEmail ?? ""}
                          {log.organizationName
                            ? `${log.userEmail ? " · " : ""}${log.organizationName}`
                            : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={style.variant} className="whitespace-nowrap">
                        {style.label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      {log.targetType ? (
                        <span className="text-xs">
                          <span className="text-[var(--text-muted)]">{log.targetType}</span>{" "}
                          <span className="font-mono text-[var(--text-secondary)]">
                            {log.targetId}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs">—</span>
                      )}
                    </td>
                    <td className="max-w-xs px-5 py-3">
                      {meta ? (
                        <span
                          className="block truncate font-mono text-[var(--text-muted)] text-xs"
                          title={meta}
                        >
                          {meta}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginasi */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Sebelumnya
          </Button>
          <span className="text-[var(--text-muted)] text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page >= totalPages}
          >
            Berikutnya
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
