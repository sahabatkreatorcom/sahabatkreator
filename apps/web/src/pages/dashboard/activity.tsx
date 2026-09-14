// Activity Feed — riwayat aktivitas tim di organisasi aktif (timeline)
import { useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  Package,
  Search,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/format";

type ActivityItem = {
  id: string;
  userId: string | null;
  userName: string | null;
  userImage: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type ActivityResponse = {
  activities: ActivityItem[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
};

const FILTERS = [
  { id: "", label: "Semua" },
  { id: "post", label: "Post" },
  { id: "media", label: "Media" },
  { id: "account", label: "Akun" },
  { id: "automation", label: "Automation" },
  { id: "team", label: "Tim" },
  { id: "billing", label: "Billing" },
] as const;

/** Ikon per kategori (dari prefix action) */
const TYPE_ICONS: Record<string, typeof FileText> = {
  post: FileText,
  media: ImageIcon,
  account: Link2,
  automation: Zap,
  team: Users,
  billing: Wallet,
};

/** Label ramah + varian badge per aksi */
function actionStyle(action: string): {
  label: string;
  variant: Parameters<typeof Badge>[0]["variant"];
} {
  if (action.startsWith("post.")) {
    return {
      label: labelFor(action, {
        "post.created": "membuat post",
        "post.scheduled": "menjadwalkan post",
        "post.published": "mem-publish post",
        "post.failed": "gagal publish",
        "post.reminder_set": "mengatur pengingat",
      }),
      variant: "info",
    };
  }
  if (action.startsWith("account.")) {
    return {
      label: labelFor(action, {
        "account.connected": "menghubungkan akun",
        "account.disconnected": "memutus akun",
        "account.reconnected": "menghubungkan ulang akun",
      }),
      variant: "success",
    };
  }
  if (action.startsWith("media.")) {
    return {
      label: labelFor(action, {
        "media.uploaded": "mengunggah media",
        "media.deleted": "menghapus media",
      }),
      variant: "secondary",
    };
  }
  if (action.startsWith("automation.")) {
    return {
      label: labelFor(action, {
        "automation.created": "membuat automation",
        "automation.updated": "mengubah automation",
        "automation.deleted": "menghapus automation",
        "automation.triggered": "automation terpicu",
      }),
      variant: "warning",
    };
  }
  if (action.startsWith("member.") || action.startsWith("invitation.")) {
    return {
      label: labelFor(action, {
        "member.joined": "bergabung ke tim",
        "member.removed": "dikeluarkan dari tim",
        "invitation.sent": "mengundang anggota",
      }),
      variant: "primary",
    };
  }
  if (action.startsWith("plan.") || action.startsWith("payment.")) {
    return {
      label: labelFor(action, {
        "plan.changed": "mengubah paket",
        "payment.completed": "pembayaran selesai",
        "payment.failed": "pembayaran gagal",
      }),
      variant: "primary",
    };
  }
  return { label: action, variant: "secondary" };
}

function labelFor(action: string, map: Record<string, string>): string {
  return map[action] ?? action;
}

/** Ringkasan metadata utk baris detail */
function metadataSummary(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined || value === "") continue;
    parts.push(`${key}: ${Array.isArray(value) ? value.join("+") : String(value)}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Ekspor aktivitas yang sudah dimuat sebagai CSV */
function exportCsv(activities: ActivityItem[]) {
  const headers = ["Waktu", "Pengguna", "Aksi", "Target", "Detail"];
  const rows = activities.map((a) => [
    formatDate(a.createdAt),
    a.userName ?? "Sistem",
    a.action,
    a.targetType ? `${a.targetType}:${a.targetId}` : "",
    metadataSummary(a.metadata) ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aktivitas-${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ActivityPage() {
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["activity", filter, query, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (filter) params.set("type", filter);
      if (query) params.set("q", query);
      return api.get<ActivityResponse>(`/activity?${params.toString()}`);
    },
  });

  const activities = data?.activities ?? [];
  const total = data?.total ?? 0;
  const perPage = data?.perPage ?? 30;
  const totalPages = Math.max(Math.ceil(total / perPage), 1);

  function applyFilter(value: string) {
    setFilter(value);
    setPage(1);
  }

  function applySearch() {
    setQuery(search.trim());
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="hidden h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] bg-gradient md:flex">
            <ActivityIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-2xl">Aktivitas</h1>
            <p className="mt-1 text-[var(--text-secondary)] text-sm">
              Riwayat aktivitas tim di organisasi ini — {total} entri
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Cari pengguna / aksi…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              className="w-48 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-primary)] py-2 pr-3 pl-9 text-sm outline-none focus:border-[var(--accent-gold)] md:w-64"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(activities)}
            disabled={activities.length === 0}
          >
            <Download className="h-4 w-4" />
            <span className="hidden md:inline">Ekspor CSV</span>
          </Button>
        </div>
      </div>

      {/* Filter kategori */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => applyFilter(f.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium text-sm transition-colors ${
              filter === f.id
                ? "bg-[var(--accent-gold)] text-white"
                : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:opacity-80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {isLoading ? (
        <PageLoader />
      ) : activities.length === 0 ? (
        <div className="card p-12 text-center">
          <ActivityIcon className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
          <h3 className="mt-4 font-medium text-lg">Belum ada aktivitas</h3>
          <p className="text-[var(--text-muted)] text-sm">
            Aktivitas akan muncul di sini saat kamu dan tim mulai menggunakan Sahabat Kreator.
          </p>
        </div>
      ) : (
        <div className="relative mx-auto max-w-3xl">
          {/* Garis timeline */}
          <div className="absolute top-2 bottom-2 left-6 w-px bg-[var(--border)]" />

          <div className="space-y-5">
            {activities.map((activity) => {
              const style = actionStyle(activity.action);
              const Icon = TYPE_ICONS[activity.action.split(".")[0] ?? ""] ?? MessageCircle;
              const meta = metadataSummary(activity.metadata);
              return (
                <div key={activity.id} className="relative flex gap-4">
                  {/* Ikon timeline */}
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--bg-secondary)]">
                    <Icon className="h-5 w-5 text-[var(--text-muted)]" />
                  </div>

                  {/* Konten */}
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Avatar
                        name={activity.userName ?? "?"}
                        src={activity.userImage ?? undefined}
                        className="h-5 w-5 text-[9px]"
                      />
                      <span className="font-medium text-sm">{activity.userName ?? "Sistem"}</span>
                      <Badge variant={style.variant} className="text-xs">
                        {style.label}
                      </Badge>
                      {activity.targetType && (
                        <span className="text-[var(--text-muted)] text-xs">
                          {activity.targetType}
                        </span>
                      )}
                    </div>
                    {meta && (
                      <p
                        className="mt-1 truncate font-mono text-[var(--text-muted)] text-xs"
                        title={meta}
                      >
                        {meta}
                      </p>
                    )}
                    <p
                      className="mt-1.5 text-[var(--text-muted)] text-xs"
                      title={formatDate(activity.createdAt)}
                    >
                      {formatRelativeTime(activity.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Paginasi */}
      {totalPages > 1 && !isLoading && (
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
