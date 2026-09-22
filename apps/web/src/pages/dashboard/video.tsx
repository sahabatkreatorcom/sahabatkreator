// Halaman Render Video — batch templating + auto-caption via Modal
//
// Pilih base video + voiceover dari media library, atur caption, submit job.
// Worker proses async (Modal render) → polling status 2s → output masuk
// media library.
//
// Fitur ini sengaja tidak mengandung modul anti-detection MassVEPro
// (metadata spoof, visual jitter, SEI removal) — ketiganya evasion dan
// bisa revoke API app SahabatKreator. Lihat docs/rfc-video-render.md §2.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Captions,
  Clapperboard,
  Film,
  Loader2,
  Music2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type MediaItem = {
  id: string;
  name: string | null;
  url: string;
  type: "image" | "video" | "audio";
  thumbnailUrl?: string | null;
};

type VideoJobRow = {
  id: string;
  status: "queued" | "rendering" | "uploading" | "done" | "failed" | "canceled";
  progress: number;
  settings: {
    orientation: string;
    resolution: string;
    caption: { enabled: boolean; language: string };
  };
  errorCode: string | null;
  errorMessage: string | null;
  baseVideoName: string | null;
  baseVideoUrl: string | null;
  baseVideoThumbnailUrl: string | null;
  outputMediaId: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_META: Record<
  VideoJobRow["status"],
  { label: string; className: string }
> = {
  queued: { label: "Antri", className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" },
  rendering: { label: "Merender", className: "bg-blue-100 text-blue-700" },
  uploading: { label: "Mengunggah", className: "bg-blue-100 text-blue-700" },
  done: { label: "Selesai", className: "bg-green-100 text-green-700" },
  failed: { label: "Gagal", className: "bg-red-100 text-red-700" },
  canceled: { label: "Dibatalkan", className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" },
};

export function VideoRenderPage() {
  const queryClient = useQueryClient();
  const [baseVideoId, setBaseVideoId] = useState<string | null>(null);
  const [voiceoverId, setVoiceoverId] = useState<string | null>(null);
  const [captionEnabled, setCaptionEnabled] = useState(true);
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | "square">("portrait");
  const [pollingId, setPollingId] = useState<string | null>(null);

  // List media untuk picker (filter video / audio saja)
  const { data: mediaData, isLoading: mediaLoading } = useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<{ items: MediaItem[] }>("/media"),
  });

  const videos = (mediaData?.items ?? []).filter((m) => m.type === "video");
  const audios = (mediaData?.items ?? []).filter((m) => m.type === "audio");

  const selectedBase = videos.find((v) => v.id === baseVideoId) ?? null;
  const selectedVoice = audios.find((a) => a.id === voiceoverId) ?? null;

  // List job render
  const {
    data: jobsData,
    isLoading: jobsLoading,
    error: jobsError,
  } = useQuery({
    queryKey: ["video-jobs"],
    queryFn: () => api.get<{ jobs: VideoJobRow[]; renderEnabled: boolean }>("/video"),
    refetchInterval: pollingId ? 2000 : false, // polling 2s saat ada job aktif
  });

  const jobs = jobsData?.jobs ?? [];
  const renderEnabled = jobsData?.renderEnabled ?? false;

  // Polling satu job aktif sampai selesai
  const { data: activeJob } = useQuery({
    queryKey: ["video-job", pollingId],
    queryFn: () => api.get<{ job: VideoJobRow }>(`/video/${pollingId}`),
    enabled: !!pollingId,
    refetchInterval: (q) => {
      const st = q.state.data?.job?.status;
      return st === "done" || st === "failed" || st === "canceled" ? false : 2000;
    },
  });

  // Berhenti polling + refresh list ketika job selesai
  useEffect(() => {
    if (!activeJob) return;
    const st = activeJob.job.status;
    if (st === "done" || st === "failed" || st === "canceled") {
      if (st === "done") toast.success("Render video selesai — output ada di pustaka media");
      if (st === "failed") toast.error(`Render gagal: ${activeJob.job.errorMessage ?? "error tidak diketahui"}`);
      setPollingId(null);
      queryClient.invalidateQueries({ queryKey: ["video-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["media"] });
    }
  }, [activeJob, queryClient]);

  const createJob = useMutation({
    mutationFn: () =>
      api.post<{ job: VideoJobRow }>("/video", {
        baseVideoMediaId: baseVideoId,
        voiceoverMediaId: voiceoverId,
        settings: {
          orientation,
          resolution: "1080p",
          removeOriginalAudio: true,
          voiceVolume: 1.0,
          bgmVolume: 0.3,
          caption: {
            enabled: captionEnabled,
            language: "id",
            model: "base",
            fontSize: 24,
            fontColor: "white",
            position: "bottom",
            wordHighlight: true,
          },
        },
      }),
    onSuccess: (res) => {
      toast.success("Job render dibuat — sedang diproses");
      setPollingId(res.job.id);
      queryClient.invalidateQueries({ queryKey: ["video-jobs"] });
      setBaseVideoId(null);
      setVoiceoverId(null);
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : "Gagal membuat job render";
      toast.error(msg);
    },
  });

  if (jobsLoading || mediaLoading) return <PageLoader />;

  if (!renderEnabled) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Clapperboard className="h-5 w-5" /> Render Video
          </h1>
          <p className="mt-1 text-[var(--text-secondary)] text-sm">
            Buat video vertikal dari footage + voiceover, dengan subtitle otomatis.
          </p>
        </div>
        <EmptyState
          icon={<Wand2 className="h-5 w-5" />}
          title="Fitur belum dikonfigurasi"
          description="Admin perlu mengatur MODAL_TOKEN dan MODAL_RENDER_URL di server untuk mengaktifkan render video. Lihat docs/rfc-video-render.md."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Clapperboard className="h-5 w-5" /> Render Video
        </h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Buat video vertikal dari footage + voiceover, dengan subtitle otomatis.
        </p>
      </div>

      {/* Form compose */}
      <div className="card space-y-5 p-5">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Film className="h-4 w-4" /> Base video
          </Label>
          {selectedBase ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
              {selectedBase.thumbnailUrl ? (
                <img
                  src={selectedBase.thumbnailUrl}
                  alt={selectedBase.name ?? "video"}
                  className="h-14 w-14 rounded object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded bg-[var(--bg-tertiary)]">
                  <Film className="h-5 w-5 text-[var(--text-muted)]" />
                </div>
              )}
              <span className="flex-1 truncate text-sm">{selectedBase.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setBaseVideoId(null)}>
                Ganti
              </Button>
            </div>
          ) : videos.length === 0 ? (
            <EmptyState
              icon={<Film className="h-5 w-5" />}
              title="Belum ada video"
              description="Upload video footage terlebih dahulu di halaman Media."
            />
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {videos.slice(0, 8).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setBaseVideoId(v.id)}
                  className={cn(
                    "group relative aspect-video overflow-hidden rounded-[var(--radius-md)] border bg-[var(--bg-tertiary)] transition",
                    baseVideoId === v.id
                      ? "border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold)]"
                      : "border-[var(--border)] hover:border-[var(--border-secondary)]",
                  )}
                >
                  {v.thumbnailUrl ? (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.name ?? "video"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Film className="h-5 w-5 text-[var(--text-muted)]" />
                    </div>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-[10px] text-white">
                    {v.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Music2 className="h-4 w-4" /> Voiceover (opsional)
          </Label>
          {selectedVoice ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
              <Music2 className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="flex-1 truncate text-sm">{selectedVoice.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setVoiceoverId(null)}>
                Hapus
              </Button>
            </div>
          ) : (
            <select
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
              value=""
              onChange={(e) => e.target.value && setVoiceoverId(e.target.value)}
            >
              <option value="">Pilih file audio…</option>
              {audios.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Orientasi output</Label>
            <div className="flex gap-2">
              {(["portrait", "landscape", "square"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrientation(o)}
                  className={cn(
                    "flex-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-xs transition",
                    orientation === o
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                      : "border-[var(--border)] text-[var(--text-secondary)]",
                  )}
                >
                  {o === "portrait" ? "9:16" : o === "landscape" ? "16:9" : "1:1"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Captions className="h-4 w-4" /> Auto-caption (Whisper)
            </Label>
            <button
              type="button"
              onClick={() => setCaptionEnabled((v) => !v)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition",
                captionEnabled
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
                  : "border-[var(--border)] text-[var(--text-secondary)]",
              )}
            >
              <span
                className={cn(
                  "h-4 w-7 rounded-full p-0.5 transition",
                  captionEnabled ? "bg-[var(--accent-gold)]" : "bg-[var(--bg-tertiary)]",
                )}
              >
                <span
                  className={cn(
                    "block h-3 w-3 rounded-full bg-white transition",
                    captionEnabled ? "translate-x-3" : "translate-x-0",
                  )}
                />
              </span>
              {captionEnabled ? "Subtitle aktif (Bahasa Indonesia)" : "Subtitle nonaktif"}
            </button>
          </div>
        </div>

        <Button
          onClick={() => createJob.mutate()}
          disabled={!baseVideoId || createJob.isPending}
          className="w-full"
        >
          {createJob.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Render video
        </Button>
      </div>

      {/* Riwayat job */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
          Riwayat render
        </h2>
        {jobs.length === 0 ? (
          <EmptyState
            icon={<Clapperboard className="h-5 w-5" />}
            title="Belum ada job render"
            description="Pilih base video di atas dan mulai render pertama Anda."
          />
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const meta = STATUS_META[job.status];
              const isBusy = job.status === "rendering" || job.status === "uploading";
              return (
                <div
                  key={job.id}
                  className="card flex items-center gap-3 p-3"
                >
                  {job.baseVideoThumbnailUrl ? (
                    <img
                      src={job.baseVideoThumbnailUrl}
                      alt={job.baseVideoName ?? "video"}
                      className="h-12 w-12 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-[var(--bg-tertiary)]">
                      <Film className="h-4 w-4 text-[var(--text-muted)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {job.baseVideoName ?? "video"}
                      </span>
                      <Badge className={cn("shrink-0", meta.className)}>{meta.label}</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>{formatRelativeTime(job.createdAt)}</span>
                      <span>·</span>
                      <span>
                        {job.settings.orientation} · {job.settings.resolution}
                      </span>
                      {job.settings.caption.enabled && (
                        <>
                          <span>·</span>
                          <span>caption {job.settings.caption.language}</span>
                        </>
                      )}
                    </div>
                    {isBusy && (
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                        <div
                          className="h-full bg-[var(--accent-gold)] transition-all"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    )}
                    {job.status === "failed" && job.errorMessage && (
                      <p className="mt-1 text-xs text-red-600">{job.errorMessage}</p>
                    )}
                  </div>
                  {job.status === "done" && job.outputMediaId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        window.open("/media", "_self");
                      }}
                    >
                      Lihat output
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {jobsError && (
        <p className="text-center text-xs text-red-600">Gagal memuat riwayat render</p>
      )}
    </div>
  );
}
