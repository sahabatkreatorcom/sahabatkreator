// Pengaturan: Riwayat Pemakaian AI — log generate AI (caption, hashtag, SEB) org aktif
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

type AiUsageLogItem = {
  id: string;
  userName: string | null;
  action: string;
  platform: string | null;
  model: string | null;
  credits: number;
  createdAt: string;
};

const ACTIONS = [
  { value: "", label: "Semua" },
  { value: "seb_chat", label: "Chat SEB" },
  { value: "seb_report", label: "Report SEB" },
  { value: "caption", label: "Caption" },
  { value: "hashtag", label: "Hashtag" },
  { value: "rewrite", label: "Rewrite" },
  { value: "reply", label: "Reply" },
  { value: "alt_text", label: "Alt Text" },
];

const PER_PAGE = 50;

export function AiUsageHistory() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-usage-history", action, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
      if (action) params.set("action", action);
      return api.get<{ logs: AiUsageLogItem[]; total: number }>(
        `/ai/usage/history?${params.toString()}`,
      );
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PER_PAGE), 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-xl">Riwayat Pemakaian AI</h2>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Semua generate AI di organisasi ini — caption, hashtag, rewrite, saran reply, dan SEB.
          Satu entri = satu kredit.
        </p>
      </div>

      {/* Filter aksi */}
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => {
              setAction(a.value);
              setPage(1);
            }}
            className={`rounded-full border px-4 py-2 text-sm ${
              action === a.value
                ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                : "border-[var(--border)] text-[var(--text-secondary)]"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="card divide-y divide-[var(--border-light)] p-0">
          {logs.length === 0 ? (
            <p className="flex flex-col items-center gap-2 p-8 text-center text-[var(--text-muted)] text-sm">
              <Bot className="h-6 w-6 opacity-50" />
              Belum ada pemakaian AI{action ? ` untuk aksi "${action}"` : ""}.
            </p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-center gap-3 p-4">
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                  {log.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{log.userName ?? "—"}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[var(--text-muted)] text-xs">
                    {log.model ?? "—"}
                    {log.platform ? ` · ${log.platform}` : ""} · {log.credits} kredit
                  </p>
                </div>
                <span className="text-[var(--text-muted)] text-xs">
                  {formatRelativeTime(log.createdAt)}
                </span>
              </div>
            ))
          )}
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
