// Halaman Auto-Clip — potong video panung jadi klip pendek (RFC auto-clip).
//
// Alur: pilih source (upload yang sudah ada di media library ATAU paste URL
// T1/T2) → atur jumlah/durasi/orientasi + arah bebas → job analisis (Modal
// clipper transkrip + OpenRouter pilih momen) → daftar kandidat dengan
// viral_score → centang yang dirender → fan-out ke job render biasa.
//
// T3 (platform scraping / YouTube) TIDAK ADA — §2 ditahan total. Hanya
// direct-media URL (T1) atau Google Drive sendiri (T2).
//
// Konvensi UI sama dengan video.tsx: kartu .card, EmptyState, polling 2s
// saat ada job aktif (POST 202 + fire-and-forget, frontend polling).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Film,
  Link2,
  Loader2,
  Scissors,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type MediaItem = {
  id: string;
  name: string | null;
  url: string;
  type: "image" | "video" | "audio";
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
};

type ClipSettings = {
  targetClipCount: number;
  minDurationSec: number;
  maxDurationSec: number;
  orientation: "portrait" | "landscape" | "square";
  outputLanguage: string;
  userDirection?: string | null;
  captionEnabled: boolean;
};

type AutoClipJobRow = {
  id: string;
  status: "queued" | "rendering" | "uploading" | "done" | "failed" | "canceled";
  progress: number;
  clipSettings: ClipSettings | null;
  urlSource: string | null;
  urlSourceTier: "t1" | "t2" | null;
  errorCode: string | null;
  errorMessage: string | null;
  candidateCount?: number;
  baseVideoName: string | null;
  baseVideoThumbnailUrl: string | null;
  baseVideoDuration: number | null;
  createdAt: string;
  updatedAt: string;
};

type SegmentRow = {
  id: string;
  order: number;
  startSec: number;
  endSec: number;
  title: string;
  viralScore: number;
  hookText: string | null;
  explicitRange: boolean | null;
  status: "pending" | "selected" | "rendering" | "rendered" | "skipped";
  renderVideoJobId: string | null;
  renderStatus: string | null;
  renderProgress: number | null;
  outputMediaId: string | null;
};

const STATUS_META: Record<AutoClipJobRow["status"], { label: string; className: string }> = {
  queued: { label: "Antri", className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" },
  rendering: { label: "Menganalisis", className: "bg-blue-100 text-blue-700" },
  uploading: { label: "Mengunggah", className: "bg-blue-100 text-blue-700" },
  done: { label: "Selesai", className: "bg-green-100 text-green-700" },
  failed: { label: "Gagal", className: "bg-red-100 text-red-700" },
  canceled: {
    label: "Dibatalkan",
    className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
  },
};

/** Warna badge viral_score — merah = tinggi (konvensi pasar ID: merah = bagus) */
function scoreBadgeClass(score: number): string {
  if (score >= 90) return "bg-red-100 text-red-700"; // sangat viral
  if (score >= 80) return "bg-orange-100 text-orange-700";
  if (score >= 70) return "bg-yellow-100 text-yellow-700";
  return "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]";
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AutoClipPage() {
  const queryClient = useQueryClient();

  // --- form state ---
  const [inputMode, setInputMode] = useState<"library" | "url">("library");
  const [baseVideoId, setBaseVideoId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTier, setSourceTier] = useState<"t1" | "t2">("t1");
  const [targetClipCount, setTargetClipCount] = useState(8);
  const [minDuration, setMinDuration] = useState(58);
  const [maxDuration, setMaxDuration] = useState(120);
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | "square">("portrait");
  const [outputLanguage, setOutputLanguage] = useState("id");
  const [userDirection, setUserDirection] = useState("");
  const [captionEnabled, setCaptionEnabled] = useState(true);

  // job yang sedang dilihat kandidatnya (null = tampilan form + riwayat)
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: mediaData } = useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<{ items: MediaItem[] }>("/media"),
  });
  const videos = (mediaData?.items ?? []).filter((m) => m.type === "video");

  const {
    data: jobsData,
    isLoading: jobsLoading,
    error: jobsError,
  } = useQuery({
    queryKey: ["auto-clip-jobs"],
    queryFn: () => api.get<{ jobs: AutoClipJobRow[]; clipperEnabled: boolean }>("/auto-clip"),
    // polling 2s saat ada job aktif (pola threads: POST 202 + frontend polling)
    refetchInterval: activeJobId ? 2000 : false,
  });

  const jobs = jobsData?.jobs ?? [];
  const clipperEnabled = jobsData?.clipperEnabled ?? false;

  // detail job aktif + kandidat (polling 2s bersama list)
  const { data: detailData } = useQuery({
    queryKey: ["auto-clip", activeJobId],
    queryFn: () =>
      api.get<{ job: AutoClipJobRow; segments: SegmentRow[] }>(`/auto-clip/${activeJobId}`),
    enabled: Boolean(activeJobId),
    refetchInterval: activeJobId ? 2000 : false,
  });

  const activeJob = detailData?.job ?? null;
  const segments = detailData?.segments ?? [];

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ job: AutoClipRow; detectedRanges: { start: number; end: number }[] }>(
        "/auto-clip",
        {
          sourceUrl: inputMode === "url" ? sourceUrl.trim() || undefined : undefined,
          sourceTier,
          baseVideoMediaId: inputMode === "library" ? (baseVideoId ?? undefined) : undefined,
          clipSettings: {
            targetClipCount,
            minDurationSec: minDuration,
            maxDurationSec: maxDuration,
            orientation,
            outputLanguage,
            userDirection: userDirection.trim() || undefined,
            captionEnabled,
          },
        },
      ),
    onSuccess: (data) => {
      toast.success("Job analisis dibuat — sedang mencari momen terbaik");
      if (data.detectedRanges.length) {
        toast.info(
          `Rentang eksplisit terdeteksi: ${data.detectedRanges
            .map((r) => `${fmtDuration(r.start)}-${fmtDuration(r.end)}`)
            .join(", ")} (dikecualikan dari filter durasi)`,
        );
      }
      setActiveJobId(data.job.id);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["auto-clip-jobs"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Gagal membuat job analisis");
    },
  });

  const selectMutation = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ ok: boolean; enqueuedCount: number }>(`/auto-clip/${activeJobId}/select`, {
        segmentIds: ids,
      }),
    onSuccess: (data) => {
      toast.success(`${data.enqueuedCount} klip terpilih mulai dirender`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["auto-clip", activeJobId] });
      queryClient.invalidateQueries({ queryKey: ["auto-clip-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["video-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Gagal memilih kandidat");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auto-clip/${id}`),
    onSuccess: () => {
      toast.success("Job dihapus");
      if (activeJobId) setActiveJobId(null);
      queryClient.invalidateQueries({ queryKey: ["auto-clip-jobs"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Gagal menghapus job");
    },
  });

  // --- 503: fitur belum dikonfigurasi ---
  if (!clipperEnabled && !jobsLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-xl">
            <Scissors className="h-5 w-5" /> Auto-Clip
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Potong video panjang (podcast, talk, vlog) jadi beberapa klip pendek yang berpotensi
            viral — AI pilih momen terbaiknya.
          </p>
        </div>
        <EmptyState
          icon={<Wand2 className="h-5 w-5" />}
          title="Fitur belum dikonfigurasi"
          description="Admin perlu mengatur MODAL_CLIPPER_URL dan MODAL_CLIPPER_TOKEN di server untuk mengaktifkan auto-clip. Lihat docs/rfc-auto-clip.md."
        />
      </div>
    );
  }

  // --- tampilan detail: daftar kandidat ---
  if (activeJob && detailData) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <button
            type="button"
            onClick={() => setActiveJobId(null)}
            className="text-[var(--text-secondary)] text-sm underline-offset-2 hover:underline"
          >
            ← Kembali ke semua job
          </button>
          <h1 className="mt-2 flex items-center gap-2 font-semibold text-xl">
            <Scissors className="h-5 w-5" /> Kandidat Klip
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Source: {activeJob.baseVideoName ?? "video"}
            {activeJob.baseVideoDuration ? ` · ${fmtDuration(activeJob.baseVideoDuration)}` : ""}
          </p>
        </div>

        {activeJob.status === "rendering" || activeJob.status === "queued" ? (
          <div className="card space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {activeJob.status === "queued"
                  ? "Menunggu giliran..."
                  : `Menganalisis transkrip... ${activeJob.progress}%`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
              <div
                className="h-full bg-[var(--accent-gold)] transition-all"
                style={{ width: `${Math.max(2, activeJob.progress)}%` }}
              />
            </div>
            <p className="text-[var(--text-secondary)] text-xs">
              Download + transkripsi video (Modal) lalu pemilihan momen oleh AI — biasanya 2-8 menit
              tergantung durasi source.
            </p>
          </div>
        ) : activeJob.status === "failed" ? (
          <div className="card space-y-2 border-red-200 p-5">
            <div className="flex items-center gap-2 font-medium text-red-700 text-sm">
              <Trash2 className="h-4 w-4" /> Analisis gagal
            </div>
            <p className="text-[var(--text-secondary)] text-sm">
              {activeJob.errorCode ? `[${activeJob.errorCode}] ` : ""}
              {activeJob.errorMessage ?? "Kesalahan tidak diketahui"}
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  api
                    .post<{ job: AutoClipRow }>(`/auto-clip/${activeJob.id}/retry`)
                    .then((res) => {
                      setActiveJobId(res.job.id);
                      queryClient.invalidateQueries({ queryKey: ["auto-clip-jobs"] });
                      toast.success("Job analisis diulang");
                    })
                    .catch(() => toast.error("Gagal mengulang job"))
                }
              >
                Coba lagi
              </Button>
            </div>
          </div>
        ) : segments.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Tidak ada kandidat"
            description="AI tidak menemukan momen yang cocok di video ini. Coba durasi minimum lebih pendek atau arah yang lebih spesifik."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[var(--text-secondary)] text-sm">
                {segments.length} kandidat · {segments.filter((s) => s.explicitRange).length}{" "}
                rentang eksplisit kamu
              </p>
              <Button
                disabled={selectedIds.size === 0 || selectMutation.isPending}
                onClick={() => selectMutation.mutate([...selectedIds])}
              >
                {selectMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Render {selectedIds.size > 0 ? `${selectedIds.size} klip terpilih` : "klip"}
              </Button>
            </div>

            <div className="space-y-3">
              {segments.map((seg) => {
                const selected = selectedIds.has(seg.id);
                const dur = seg.endSec - seg.startSec;
                const rendered = seg.status === "rendered" && seg.outputMediaId;
                return (
                  <div
                    key={seg.id}
                    className={cn(
                      "card flex items-start gap-4 p-4 transition",
                      selected && "border-[var(--accent-gold)] ring-1 ring-[var(--accent-gold)]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(seg.id);
                          else next.delete(seg.id);
                          return next;
                        });
                      }}
                      className="mt-1 h-4 w-4 accent-[var(--accent-gold)]"
                    />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{seg.title}</span>
                        {seg.explicitRange && (
                          <Badge className="bg-purple-100 text-purple-700">Arahan kamu</Badge>
                        )}
                        <Badge className={scoreBadgeClass(seg.viralScore)}>
                          {seg.viralScore} viral
                        </Badge>
                        <Badge className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                          <Clock className="mr-1 h-3 w-3" />
                          {fmtDuration(seg.startSec)}–{fmtDuration(seg.endSec)} · {fmtDuration(dur)}
                        </Badge>
                      </div>
                      {seg.hookText && (
                        <p className="text-[var(--text-secondary)] text-sm">
                          <span className="italic">“{seg.hookText}”</span>
                        </p>
                      )}
                      {seg.status !== "pending" && (
                        <div className="flex items-center gap-2 text-[var(--text-secondary)] text-xs">
                          {seg.status === "rendering" && (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" /> Merender...{" "}
                              {seg.renderProgress ?? 0}%
                            </>
                          )}
                          {rendered && (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-green-600" /> Selesai dirender —
                              ada di media library
                            </>
                          )}
                          {seg.status === "selected" && <span>Antri render...</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // --- tampilan utama: form + riwayat ---
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-semibold text-xl">
          <Scissors className="h-5 w-5" /> Auto-Clip
        </h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Potong video panjang (podcast, talk, vlog) jadi beberapa klip pendek yang berpotensi viral
          — AI pilih momen terbaiknya.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        {/* Kolom kiri — daftar job */}
        <div className="space-y-3">
          <h2 className="font-medium text-[var(--text-secondary)] text-sm">Riwayat analisis</h2>
          {jobsError ? (
            <EmptyState
              icon={<Film className="h-5 w-5" />}
              title="Gagal memuat"
              description="Coba muat ulang halaman."
            />
          ) : jobsLoading ? (
            <div className="card space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-[var(--radius-md)] bg-[var(--bg-tertiary)]"
                />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={<Scissors className="h-5 w-5" />}
              title="Belum ada analisis"
              description="Pilih video panjang di kanan dan mulai analisis untuk menemukan klip terbaik."
            />
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                className="card flex w-full items-center gap-4 p-4 transition hover:border-[var(--border-secondary)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveJobId(job.id);
                    setSelectedIds(new Set());
                  }}
                  className="flex flex-1 items-center gap-4 text-left"
                >
                  {job.baseVideoThumbnailUrl ? (
                    <img
                      src={job.baseVideoThumbnailUrl}
                      alt={job.baseVideoName ?? "video"}
                      className="h-16 w-28 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-28 items-center justify-center rounded bg-[var(--bg-tertiary)]">
                      <Film className="h-5 w-5 text-[var(--text-muted)]" />
                    </div>
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {job.baseVideoName ?? "Source URL"}
                      </span>
                      <Badge className={STATUS_META[job.status].className}>
                        {STATUS_META[job.status].label}
                      </Badge>
                    </div>
                    <p className="text-[var(--text-secondary)] text-xs">
                      {job.urlSource ? (
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="h-3 w-3" /> URL tier {job.urlSourceTier?.toUpperCase()}
                        </span>
                      ) : (
                        "Media library"
                      )}
                      {" · "}
                      {job.candidateCount ?? 0} kandidat
                      {" · "}
                      {formatRelativeTime(job.createdAt)}
                    </p>
                    {job.status === "rendering" && (
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                        <div
                          className="h-full bg-[var(--accent-gold)] transition-all"
                          style={{ width: `${Math.max(2, job.progress)}%` }}
                        />
                      </div>
                    )}
                    {job.status === "failed" && job.errorMessage && (
                      <p className="text-red-600 text-xs">{job.errorMessage.slice(0, 120)}</p>
                    )}
                  </div>
                  {job.status === "done" && (
                    <Badge className="bg-green-100 text-green-700">
                      {job.candidateCount ?? 0} klip
                    </Badge>
                  )}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-[var(--text-secondary)] hover:text-red-600"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(job.id)}
                  aria-label="Hapus job"
                  title="Hapus job"
                >
                  {deleteMutation.isPending && deleteMutation.variables === job.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Kolom kanan — form analisis */}
        <div className="card space-y-5 p-5">
          <h2 className="flex items-center gap-2 font-medium text-sm">
            <Sparkles className="h-4 w-4" /> Mulai analisis
          </h2>

          {/* Source picker */}
          <div className="space-y-2">
            <Label>Sumber video panjang</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInputMode("library")}
                className={cn(
                  "flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-xs transition",
                  inputMode === "library"
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                    : "border-[var(--border)] hover:border-[var(--border-secondary)]",
                )}
              >
                Media library
              </button>
              <button
                type="button"
                onClick={() => setInputMode("url")}
                className={cn(
                  "flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-xs transition",
                  inputMode === "url"
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                    : "border-[var(--border)] hover:border-[var(--border-secondary)]",
                )}
              >
                URL langsung (T1/T2)
              </button>
            </div>

            {inputMode === "url" ? (
              <div className="space-y-2">
                <Input
                  type="url"
                  placeholder="https://... (direct media / Drive sendiri)"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
                <Select
                  value={sourceTier}
                  onChange={(e) => setSourceTier(e.target.value as "t1" | "t2")}
                >
                  <option value="t1">T1 — direct media / CDN / R2</option>
                  <option value="t2">T2 — Google Drive sendiri</option>
                </Select>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Video diunduh dan disimpan ke library kamu. Link platform (YouTube/TikTok/IG)
                  belum didukung.
                </p>
              </div>
            ) : videos.length === 0 ? (
              <EmptyState
                icon={<Film className="h-5 w-5" />}
                title="Belum ada video"
                description="Upload video panjang di halaman Media, atau gunakan URL langsung."
              />
            ) : (
              <Select
                value={baseVideoId ?? ""}
                onChange={(e) => setBaseVideoId(e.target.value || null)}
              >
                <option value="">— Pilih video —</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.durationSeconds ? ` (${fmtDuration(v.durationSeconds)})` : ""}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {/* Konfigurasi */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Jumlah klip</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={targetClipCount}
                onChange={(e) => setTargetClipCount(Number(e.target.value) || 8)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Orientasi output</Label>
              <Select
                value={orientation}
                onChange={(e) =>
                  setOrientation(e.target.value as "portrait" | "landscape" | "square")
                }
              >
                <option value="portrait">Portrait 9:16</option>
                <option value="landscape">Landscape 16:9</option>
                <option value="square">Square 1:1</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durasi min (dtk)</Label>
              <Input
                type="number"
                min={5}
                value={minDuration}
                onChange={(e) => setMinDuration(Number(e.target.value) || 58)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durasi max (dtk)</Label>
              <Input
                type="number"
                min={10}
                value={maxDuration}
                onChange={(e) => setMaxDuration(Number(e.target.value) || 120)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Bahasa output title/hook</Label>
            <Select value={outputLanguage} onChange={(e) => setOutputLanguage(e.target.value)}>
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Arah bebas (opsional)</Label>
            <Textarea
              rows={3}
              placeholder="Contoh: cari bahasan harga, skip intro, atau tulis rentang langsung seperti 2:00-2:50 (dikecualikan dari filter durasi)"
              value={userDirection}
              onChange={(e) => setUserDirection(e.target.value)}
            />
            <p className="text-[11px] text-[var(--text-secondary)]">
              Rentang eksplisit (2:00-2:50) dijamin masuk daftar kandidat apa adanya.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={captionEnabled}
              onChange={(e) => setCaptionEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent-gold)]"
            />
            Auto-caption karaoke di klip hasil
          </label>

          <Button
            className="w-full"
            disabled={
              createMutation.isPending ||
              (inputMode === "library" ? !baseVideoId : !sourceUrl.trim())
            }
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Analisis video
          </Button>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Analisis = transkripsi penuh + pemilihan momen AI. Render hanya untuk klip yang kamu
            pilih.
          </p>
        </div>
      </div>
    </div>
  );
}

type AutoClipRow = {
  id: string;
  status: AutoClipJobRow["status"];
  progress: number;
  createdAt: string;
};
