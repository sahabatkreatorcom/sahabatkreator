// Halaman Social Listening — pantau pembicaraan keyword brand/kompetitor/niche
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  BellOff,
  CheckCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Monitor = {
  id: string;
  name: string;
  keywords: string[];
  excludedTerms: string[];
  platforms: string[];
  isActive: boolean;
  lastSyncedAt: string | null;
};

type ListeningItem = {
  id: string;
  monitorId: string;
  sourceType: string;
  platform: string;
  externalUrl: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  content: string | null;
  sentiment: string;
  matchedKeywords: string[];
  isRead: boolean;
  occurredAt: string;
};

type Source = {
  id: string;
  name: string;
  url: string;
  sourceType: string;
  isActive: boolean;
  lastCrawledAt: string | null;
  lastError: string | null;
  lastPageCount: number;
};

type ListeningData = {
  summary: {
    activeMonitors: number;
    totalItems: number;
    unread: number;
    sentiment: Record<string, number>;
  };
  monitors: Monitor[];
  items: ListeningItem[];
};

const SENTIMENT_BADGE: Record<string, { label: string; className: string }> = {
  positive: {
    label: "Positif",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  neutral: {
    label: "Netral",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  negative: {
    label: "Negatif",
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
  question: {
    label: "Pertanyaan",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
};

function highlightKeywords(content: string, keywords: string[]) {
  if (keywords.length === 0) return content;
  // escape regex special chars lalu join
  const pattern = keywords
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length)
    .join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  return content.split(regex).map((part, i) =>
    regex.test(part) && keywords.some((k) => k.toLowerCase() === part.toLowerCase()) ? (
      <mark key={i} className="rounded bg-[var(--accent-gold)]/30 px-0.5 text-[var(--accent-gold)]">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function CreateMonitorForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [excluded, setExcluded] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.post<{ newItems: number }>("/listening/monitors", {
        name: name.trim(),
        keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        excludedTerms: excluded
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        platforms: [],
      }),
    onSuccess: (res) => {
      toast.success(`Monitor dibuat — ${res.newItems} pembicaraan ditemukan`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card space-y-3 p-5">
      <h3 className="font-semibold">Monitor Baru</h3>
      <Input
        placeholder="Nama monitor (mis. Brand Kami)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="Keyword, pisah koma (mis. sahabat kreator, @sahabatkreator)"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />
      <Input
        placeholder="Kecualikan term, pisah koma (opsional)"
        value={excluded}
        onChange={(e) => setExcluded(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          onClick={() => create.mutate()}
          disabled={!name.trim() || !keywords.trim() || create.isPending}
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Buat Monitor
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Batal
        </Button>
      </div>
    </div>
  );
}

function AddSourceForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.post("/listening/sources", { name: name.trim(), url: url.trim(), sourceType: "auto" }),
    onSuccess: () => {
      toast.success("Sumber web ditambahkan");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="card space-y-3 p-5">
      <h3 className="font-semibold">Sumber Web Baru</h3>
      <p className="text-[var(--text-muted)] text-xs">
        Blog/kompetitor — sistem otomatis deteksi RSS dan crawl halamannya
      </p>
      <Input
        placeholder="Nama (mis. Blog Kompetitor A)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="https://contoh.com/blog"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          onClick={() => create.mutate()}
          disabled={!name.trim() || !url.trim() || create.isPending}
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Tambah Sumber
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Batal
        </Button>
      </div>
    </div>
  );
}

export function ListeningPage() {
  const queryClient = useQueryClient();
  const [monitorFilter, setMonitorFilter] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["listening", monitorFilter],
    queryFn: () =>
      api.get<ListeningData>(`/listening${monitorFilter ? `?monitorId=${monitorFilter}` : ""}`),
  });

  const { data: sourcesData } = useQuery({
    queryKey: ["listening-sources"],
    queryFn: () => api.get<{ sources: Source[] }>("/listening/sources"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["listening"] });

  const sync = useMutation({
    mutationFn: () => api.post<{ newItems: number }>("/listening/sync"),
    onSuccess: (res) => {
      invalidate();
      toast.success(`Sinkronisasi selesai — ${res.newItems} pembicaraan baru`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post("/listening/items/read-all"),
    onSuccess: () => {
      invalidate();
      toast.success("Semua ditandai dibaca");
    },
  });

  const toggleMonitor = useMutation({
    mutationFn: (m: Monitor) => api.patch(`/listening/monitors/${m.id}`, { isActive: !m.isActive }),
    onSuccess: invalidate,
  });

  const deleteMonitor = useMutation({
    mutationFn: (id: string) => api.delete(`/listening/monitors/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Monitor dihapus");
    },
  });

  const deleteSource = useMutation({
    mutationFn: (id: string) => api.delete(`/listening/sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listening-sources"] });
      toast.success("Sumber dihapus");
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/listening/items/${id}/read`),
    onSuccess: invalidate,
  });

  const summary = data?.summary;
  const items = data?.items ?? [];
  const monitors = data?.monitors ?? [];
  const sources = sourcesData?.sources ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Radar className="h-6 w-6 text-[var(--accent-gold)]" />
            Social Listening
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Pantau pembicaraan tentang brand, kompetitor, dan topik niche Anda
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSource(!showSource)}>
            <Globe className="h-4 w-4" />
            Sumber Web
          </Button>
          <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sinkronkan
          </Button>
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4" />
            Monitor Baru
          </Button>
        </div>
      </div>

      {showCreate && <CreateMonitorForm onDone={() => setShowCreate(false)} />}
      {showSource && <AddSourceForm onDone={() => setShowSource(false)} />}

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
            <Activity className="h-3.5 w-3.5" /> Monitor Aktif
          </div>
          <p className="mt-2 font-bold text-2xl">{summary?.activeMonitors ?? 0}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
            <Search className="h-3.5 w-3.5" /> Hasil Listening
          </div>
          <p className="mt-2 font-bold text-2xl">{summary?.totalItems ?? 0}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
            <EyeOff className="h-3.5 w-3.5" /> Belum Dibaca
          </div>
          <p className="mt-2 font-bold text-2xl text-[var(--accent-gold)]">
            {summary?.unread ?? 0}
          </p>
        </div>
        <div className="card p-5">
          <div className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
            Sentiment
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(summary?.sentiment ?? {}).map(([key, count]) =>
              count > 0 ? (
                <Badge
                  key={key}
                  variant="secondary"
                  className={cn("text-[10px]", SENTIMENT_BADGE[key]?.className)}
                >
                  {SENTIMENT_BADGE[key]?.label}: {count}
                </Badge>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* Daftar monitor */}
      {monitors.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold">Monitor</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMonitorFilter(undefined)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
                monitorFilter === undefined
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                  : "border-[var(--border)] text-[var(--text-secondary)]",
              )}
            >
              Semua
            </button>
            {monitors.map((m) => (
              <span
                key={m.id}
                className={cn(
                  "group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
                  monitorFilter === m.id
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium text-[var(--accent-gold)]"
                    : "border-[var(--border)] text-[var(--text-secondary)]",
                  !m.isActive && "opacity-50",
                )}
              >
                <button type="button" onClick={() => setMonitorFilter(m.id)}>
                  {m.name}
                </button>
                <button
                  type="button"
                  onClick={() => toggleMonitor.mutate(m)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  title={m.isActive ? "Nonaktifkan" : "Aktifkan"}
                >
                  {m.isActive ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => deleteMonitor.mutate(m.id)}
                  className="text-[var(--text-muted)] hover:text-red-500"
                  title="Hapus monitor"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          {/* Sumber web */}
          {sources.length > 0 && (
            <div className="mt-4 border-[var(--border-light)] border-t pt-4">
              <p className="font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide">
                Sumber Web
              </p>
              <div className="mt-2 space-y-1.5">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <Globe className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                    <span className="font-medium">{s.name}</span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-[var(--text-muted)] hover:text-[var(--accent-gold)] hover:underline"
                    >
                      {s.url}
                    </a>
                    {s.lastCrawledAt && (
                      <span className="shrink-0 text-[var(--text-muted)]">
                        ({s.lastPageCount} halaman)
                      </span>
                    )}
                    {s.lastError && (
                      <Badge variant="secondary" className="shrink-0 text-[10px] text-red-500">
                        error
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteSource.mutate(s.id)}
                      className="ml-auto shrink-0 text-[var(--text-muted)] hover:text-red-500"
                      title="Hapus sumber"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feed hasil */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Radar className="h-6 w-6" />}
          title="Belum ada hasil listening"
          description={
            monitors.length === 0
              ? "Buat monitor pertama Anda — masukkan nama brand atau kompetitor, sistem akan mencari pembicaraannya di komentar, mention, review, dan web."
              : "Belum ada pembicaraan yang cocok. Klik Sinkronkan untuk mencari ulang."
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[var(--text-secondary)] text-sm">
              {items.length} pembicaraan terbaru
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending || (summary?.unread ?? 0) === 0}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tandai semua dibaca
            </Button>
          </div>
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "card p-4",
                  !item.isRead && "border-l-4 border-l-[var(--accent-gold)]",
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    name={item.authorName ?? "?"}
                    src={item.authorAvatarUrl ?? undefined}
                    className="h-8 w-8 text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{item.authorName ?? "Anonim"}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {item.platform}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px]", SENTIMENT_BADGE[item.sentiment]?.className)}
                      >
                        {SENTIMENT_BADGE[item.sentiment]?.label}
                      </Badge>
                      <span className="text-[var(--text-muted)] text-xs">
                        {formatRelativeTime(item.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-sm">
                      {highlightKeywords(item.content ?? "", item.matchedKeywords)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[var(--text-muted)] text-xs">
                      {item.externalUrl && (
                        <a
                          href={item.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-[var(--accent-gold)] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Lihat sumber
                        </a>
                      )}
                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={() => markRead.mutate(item.id)}
                          className="flex items-center gap-1 hover:text-[var(--text-primary)]"
                        >
                          <Eye className="h-3 w-3" />
                          Tandai dibaca
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
