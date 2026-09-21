// Admin: Inbox Kontak — pesan dari form kontak halaman marketing
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Inbox, MailOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

type Submission = {
  id: string;
  name: string;
  email: string;
  message: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
};

type InboxResponse = {
  submissions: Submission[];
  total: number;
  openCount: number;
  page: number;
  perPage: number;
};

export function AdminContactPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-contact", page, filter],
    queryFn: () =>
      api.get<InboxResponse>(`/contact?page=${page}${filter !== "all" ? `&status=${filter}` : ""}`),
  });

  const resolveMutation = useMutation({
    mutationFn: (input: { id: string; status: "open" | "resolved" }) =>
      api.patch(`/contact/${input.id}`, { status: input.status }),
    onSuccess: () => {
      toast.success("Status pesan diperbarui");
      queryClient.invalidateQueries({ queryKey: ["admin-contact"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const totalPages = Math.max(Math.ceil((data?.total ?? 0) / (data?.perPage ?? 20)), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Inbox className="h-6 w-6" />
            Inbox Kontak
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Pesan dari form kontak halaman marketing
            {data ? ` — ${data.openCount} belum ditangani` : ""}
          </p>
        </div>
        {/* Filter */}
        <div className="flex gap-2">
          {(["all", "open", "resolved"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className={`rounded-full border px-4 py-1.5 text-sm ${
                filter === f
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                  : "border-[var(--border)] text-[var(--text-secondary)]"
              }`}
            >
              {f === "all" ? "Semua" : f === "open" ? "Belum Ditangani" : "Selesai"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (data?.submissions ?? []).length === 0 ? (
        <div className="card p-12 text-center text-[var(--text-muted)] text-sm">
          Belum ada pesan.
        </div>
      ) : (
        <div className="card divide-y divide-[var(--border-light)] p-0">
          {data!.submissions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-start gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-gold-light)] font-semibold text-[var(--accent-gold)] text-sm">
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <a
                    href={`mailto:${s.email}`}
                    className="text-[var(--text-muted)] text-xs hover:text-[var(--accent-gold)] hover:underline"
                  >
                    {s.email}
                  </a>
                  <Badge variant={s.status === "open" ? "secondary" : "success"}>
                    {s.status === "open" ? "Belum Ditangani" : "Selesai"}
                  </Badge>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[var(--text-secondary)] text-sm">
                  {s.message}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="text-[var(--text-muted)] text-xs">
                  {formatRelativeTime(s.createdAt)}
                </span>
                {s.status === "open" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate({ id: s.id, status: "resolved" })}
                  >
                    <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                    Tandai Selesai
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate({ id: s.id, status: "open" })}
                  >
                    <MailOpen className="mr-1.5 h-3.5 w-3.5" />
                    Buka Kembali
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Sebelumnya
          </Button>
          <span className="text-[var(--text-secondary)] text-sm">
            Halaman {page} dari {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
      )}
    </div>
  );
}
