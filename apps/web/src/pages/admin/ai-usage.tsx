// Admin: Pemakaian AI — tabel log semua generate AI lintas organisasi
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

type AiUsageLogItem = {
  id: string;
  organizationId: string;
  organizationName: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  platform: string | null;
  model: string | null;
  credits: number;
  createdAt: string;
};

const ACTIONS = [
  { value: "", label: "Semua Aksi" },
  { value: "seb_chat", label: "Chat SEB" },
  { value: "seb_report", label: "Report SEB" },
  { value: "caption", label: "Caption" },
  { value: "hashtag", label: "Hashtag" },
  { value: "rewrite", label: "Rewrite" },
  { value: "reply", label: "Reply" },
  { value: "alt_text", label: "Alt Text" },
];

const PLATFORMS = [
  { value: "", label: "Semua Platform" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "pinterest", label: "Pinterest" },
  { value: "threads", label: "Threads" },
  { value: "x", label: "X" },
];

const PER_PAGE = 50;

/** Label ramah untuk kode aksi AI */
const ACTION_LABELS: Record<string, string> = Object.fromEntries(
  ACTIONS.filter((a) => a.value).map((a) => [a.value, a.label]),
);

export function AdminAiUsagePage() {
  const [action, setAction] = useState("");
  const [platform, setPlatform] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ai-usage", action, platform, organizationId, from, to, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
      if (action) params.set("action", action);
      if (platform) params.set("platform", platform);
      if (organizationId) params.set("organizationId", organizationId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return api.get<{
        logs: AiUsageLogItem[];
        total: number;
        summary: { credits: number };
      }>(`/admin/ai-usage?${params.toString()}`);
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PER_PAGE), 1);
  const hasFilter = !!(action || platform || organizationId || from || to);

  function resetFilter() {
    setAction("");
    setPlatform("");
    setOrganizationId("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">Pemakaian AI</h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Log semua generate AI (caption, hashtag, rewrite, SEB) lintas organisasi
        </p>
      </div>

      {/* Filter */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--text-muted)]" />
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="input h-9 w-auto text-sm"
            aria-label="Filter aksi"
          >
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value);
              setPage(1);
            }}
            className="input h-9 w-auto text-sm"
            aria-label="Filter platform"
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={organizationId}
            onChange={(e) => {
              setOrganizationId(e.target.value.trim());
              setPage(1);
            }}
            placeholder="Organization ID…"
            className="input h-9 w-auto font-mono text-sm"
            aria-label="Filter organization ID"
          />
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={resetFilter}>
              Reset
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            Dari
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="input h-9 w-auto text-sm"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            Sampai
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="input h-9 w-auto text-sm"
            />
          </label>
        </div>
      </div>

      {/* Tabel pemakaian */}
      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-[var(--border-light)] border-b text-[var(--text-muted)] text-xs uppercase">
                <th className="px-4 py-3 font-medium">Aksi</th>
                <th className="px-4 py-3 font-medium">Organisasi</th>
                <th className="px-4 py-3 font-medium">Pengguna</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Platform</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Model</th>
                <th className="px-4 py-3 text-right font-medium">Kredit</th>
                <th className="px-4 py-3 text-right font-medium">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    <span className="flex flex-col items-center gap-2">
                      <Bot className="h-6 w-6 opacity-50" />
                      Belum ada pemakaian AI
                      {hasFilter ? " untuk filter ini" : ""}.
                    </span>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--bg-secondary)]">
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{log.organizationName ?? "—"}</p>
                      <p className="font-mono text-[10px] text-[var(--text-muted)]">
                        {log.organizationId}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{log.userName ?? "—"}</p>
                      {log.userEmail && (
                        <p className="text-[10px] text-[var(--text-muted)]">{log.userEmail}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-[var(--text-secondary)] sm:table-cell">
                      {log.platform ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-[var(--text-muted)] text-xs lg:table-cell">
                      {log.model ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{log.credits}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--text-muted)] text-xs">
                      {formatRelativeTime(log.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {logs.length > 0 && (
              <tfoot>
                <tr className="border-[var(--border-light)] border-t">
                  <td className="px-4 py-2.5 text-[var(--text-muted)] text-xs" colSpan={5}>
                    {total} entri
                    {hasFilter && ` · ${data?.summary.credits ?? 0} kredit sesuai filter`}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-xs" colSpan={2}>
                    {data?.summary.credits ?? 0} kredit
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Paginasi */}
      {total > PER_PAGE && (
        <div className="flex items-center justify-between">
          <p className="text-[var(--text-muted)] text-sm">
            Halaman {page} dari {totalPages} · {total} entri
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
