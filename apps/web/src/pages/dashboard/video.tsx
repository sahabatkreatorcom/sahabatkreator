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
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
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

type AudioTrackItem = {
  id: string;
  name: string;
  category: string | null;
  durationSeconds: number | null;
};

type CaptionSettings = {
  enabled: boolean;
  language: "id" | "en" | "auto";
  model: "tiny" | "base" | "small" | "medium";
  fontSize: number;
  fontColor: string;
  position: "bottom" | "top" | "center";
  wordHighlight: boolean;
};

type VideoProcessingSettings = {
  trimStart: string;
  trimEnd: string;
  mirror: boolean;
  speed: number;
  loopMode: "sequential" | "random" | "reverse";
  overlay: {
    file: File | null;
    mediaId: string | null;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "random";
    scale: number;
    opacity: number;
  };
};

type VideoJobRow = {
  id: string;
  status: "queued" | "rendering" | "uploading" | "done" | "failed" | "canceled";
  progress: number;
  settings: {
    orientation: string;
    resolution: string;
    montage?: { minSegmentSeconds: number; maxSegmentSeconds: number };
    caption: { enabled: boolean; language: string };
  };
  errorCode: string | null;
  errorMessage: string | null;
  publishedToGallery: boolean | null;
  baseVideoName: string | null;
  baseVideoUrl: string | null;
  baseVideoThumbnailUrl: string | null;
  outputMediaId: string | null;
  createdAt: string;
  updatedAt: string;
};

const FONT_COLORS = ["white", "yellow", "black", "red", "green", "blue"] as const;
const LANGS = [
  { value: "id", label: "Bahasa Indonesia" },
  { value: "en", label: "English" },
  { value: "auto", label: "Deteksi otomatis" },
] as const;
const WHISPER_MODELS = [
  { value: "tiny", label: "Tiny (paling cepat)" },
  { value: "base", label: "Base (seimbang)" },
  { value: "small", label: "Small (lebih akurat)" },
  { value: "medium", label: "Medium (paling akurat)" },
] as const;

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
  // Clip montage tambahan (multi-select). Kosong = mode single.
  const [clipIds, setClipIds] = useState<string[]>([]);
  const [voiceoverId, setVoiceoverId] = useState<string | null>(null);
  const [bgmTrackId, setBgmTrackId] = useState<string | null>(null);
  const [captionEnabled, setCaptionEnabled] = useState(true);
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | "square">("portrait");
  const [resolution, setResolution] = useState<"720p" | "1080p">("1080p");
  const [removeOriginalAudio, setRemoveOriginalAudio] = useState(true);
  const [voiceVolume, setVoiceVolume] = useState(1.0);
  const [bgmVolume, setBgmVolume] = useState(0.3);
  const [caption, setCaption] = useState<CaptionSettings>({
    enabled: true,
    language: "id",
    model: "base",
    fontSize: 24,
    fontColor: "white",
    position: "bottom",
    wordHighlight: true,
  });
  const [headlineText, setHeadlineText] = useState("");
  const [headlineFontSize, setHeadlineFontSize] = useState(48);
  const [headlineColor, setHeadlineColor] = useState("yellow");
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [showAllVideos, setShowAllVideos] = useState(false);
  const [publishToGallery, setPublishToGallery] = useState(false);
  // Video processing: trim, mirror, speed
  const [videoProcessing, setVideoProcessing] = useState<VideoProcessingSettings>({
    trimStart: "",
    trimEnd: "",
    mirror: false,
    speed: 1.0,
    loopMode: "sequential",
    overlay: { file: null, mediaId: null, position: "top-right", scale: 0.15, opacity: 1.0 },
  });
  // Batch mode — submit multiple jobs sekaligus dengan voiceover berbeda
  const [batchMode, setBatchMode] = useState(false);
  const [batchVoiceoverIds, setBatchVoiceoverIds] = useState<string[]>([]);
  const [batchOutputCount, setBatchOutputCount] = useState(2);
  const [batchUniqueVariation, setBatchUniqueVariation] = useState(false);
  // Riwayat filter & pagination
  const [historyFilter, setHistoryFilter] = useState<"all" | VideoJobRow["status"]>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 8;

  // List media untuk picker (filter video / audio saja)
  const { data: mediaData, isLoading: mediaLoading } = useQuery({
    queryKey: ["media"],
    queryFn: () => api.get<{ items: MediaItem[] }>("/media"),
  });

  // List BGM dari sound library
  const { data: soundData } = useQuery({
    queryKey: ["sound"],
    queryFn: () => api.get<{ items: AudioTrackItem[] }>("/sound"),
  });

  const videos = (mediaData?.items ?? []).filter((m) => m.type === "video");
  const audios = (mediaData?.items ?? []).filter((m) => m.type === "audio");
  const bgmTracks = soundData?.items ?? [];

  const selectedBase = videos.find((v) => v.id === baseVideoId) ?? null;
  const selectedVoice = audios.find((a) => a.id === voiceoverId) ?? null;

  // Probe video duration via hidden video element
  const [videoDuration, setVideoDuration] = useState<number>(0);
  useEffect(() => {
    if (!selectedBase?.url) { setVideoDuration(0); return; }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { setVideoDuration(v.duration || 0); v.remove(); };
    v.onerror = () => { setVideoDuration(0); v.remove(); };
    v.src = selectedBase.url;
  }, [selectedBase?.url]);

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
    mutationFn: async () => {
      // Build videoProcessing objek (skip yang kosong/default)
      const vp: Record<string, unknown> = {};
      if (videoProcessing.trimStart) vp.trimStart = parseFloat(videoProcessing.trimStart);
      if (videoProcessing.trimEnd) vp.trimEnd = parseFloat(videoProcessing.trimEnd);
      if (videoProcessing.mirror) vp.mirror = true;
      if (videoProcessing.speed !== 1.0) vp.speed = videoProcessing.speed;
      if (videoProcessing.loopMode !== "sequential") vp.loopMode = videoProcessing.loopMode;
      // Overlay: upload file baru ATAU pakai media yang sudah ada
      if (videoProcessing.overlay.file) {
        const fd = new FormData();
        fd.append("file", videoProcessing.overlay.file);
        const uploadRes = await api.upload<{ media: { url: string } }>("/media/upload", fd);
        vp.overlay = {
          url: uploadRes.media.url,
          position: videoProcessing.overlay.position,
          scale: videoProcessing.overlay.scale,
          opacity: videoProcessing.overlay.opacity,
        };
      } else if (videoProcessing.overlay.mediaId) {
        const m = (mediaData?.items ?? []).find((x) => x.id === videoProcessing.overlay.mediaId);
        if (m) {
          vp.overlay = {
            url: m.url,
            position: videoProcessing.overlay.position,
            scale: videoProcessing.overlay.scale,
            opacity: videoProcessing.overlay.opacity,
          };
        }
      }
      return api.post<{ job: VideoJobRow }>("/video", {
        baseVideoMediaId: baseVideoId,
        clipMediaIds: clipIds,
        voiceoverMediaId: voiceoverId,
        bgmAudioTrackId: bgmTrackId,
        publishToGallery,
        settings: {
          orientation,
          resolution,
          removeOriginalAudio,
          voiceVolume,
          bgmVolume,
          montage: clipIds.length ? { minSegmentSeconds: 2, maxSegmentSeconds: 5 } : undefined,
          caption: { ...caption, enabled: captionEnabled },
          headline: headlineText.trim()
            ? {
                text: headlineText.trim(),
                fontSize: headlineFontSize,
                fontColor: headlineColor,
                positionY: 0.1,
              }
            : undefined,
          ...(Object.keys(vp).length ? { videoProcessing: vp } : {}),
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Job render dibuat — sedang diproses");
      setPollingId(res.job.id);
      queryClient.invalidateQueries({ queryKey: ["video-jobs"] });
      setBaseVideoId(null);
      setClipIds([]);
      setVoiceoverId(null);
      setBgmTrackId(null);
      setHeadlineText("");
      setPublishToGallery(false);
      setVideoProcessing({ trimStart: "", trimEnd: "", mirror: false, speed: 1.0, loopMode: "sequential", overlay: { file: null, position: "top-right", scale: 0.15, opacity: 1.0 } });
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : "Gagal membuat job render";
      toast.error(msg);
    },
  });

  // Batch render — buat beberapa job sekaligus (satu per voiceover terpilih)
  const createBatchJobs = useMutation({
    mutationFn: async () => {
      if (!baseVideoId) throw new Error("Base video belum dipilih");
      // Base videoProcessing dari form user
      const baseVp: Record<string, unknown> = {};
      if (videoProcessing.trimStart) baseVp.trimStart = parseFloat(videoProcessing.trimStart);
      if (videoProcessing.trimEnd) baseVp.trimEnd = parseFloat(videoProcessing.trimEnd);
      if (videoProcessing.mirror) baseVp.mirror = true;
      if (videoProcessing.speed !== 1.0) baseVp.speed = videoProcessing.speed;
      if (videoProcessing.loopMode !== "sequential") baseVp.loopMode = videoProcessing.loopMode;
      // Overlay: upload file baru ATAU pakai media yang sudah ada
      if (videoProcessing.overlay.file) {
        const fd = new FormData();
        fd.append("file", videoProcessing.overlay.file);
        const uploadRes = await api.upload<{ media: { url: string } }>("/media/upload", fd);
        baseVp.overlay = {
          url: uploadRes.media.url,
          position: videoProcessing.overlay.position,
          scale: videoProcessing.overlay.scale,
          opacity: videoProcessing.overlay.opacity,
        };
      } else if (videoProcessing.overlay.mediaId) {
        const m = (mediaData?.items ?? []).find((x) => x.id === videoProcessing.overlay.mediaId);
        if (m) {
          baseVp.overlay = {
            url: m.url,
            position: videoProcessing.overlay.position,
            scale: videoProcessing.overlay.scale,
            opacity: videoProcessing.overlay.opacity,
          };
        }
      }

      const voiceIds = batchMode && batchVoiceoverIds.length > 0
        ? batchVoiceoverIds
        : voiceoverId ? [voiceoverId] : [null];
      const count = batchMode ? Math.min(batchOutputCount, voiceIds.length) : 1;
      const jobs: VideoJobRow[] = [];
      for (let i = 0; i < count; i++) {
        const voiceId = voiceIds[i % voiceIds.length];

        // Variasi unik per job: calculate_segment_start dari MassVEPro
        let vp = { ...baseVp };
        if (batchUniqueVariation && batchMode && videoDuration > 0) {
          // Estimasi durasi voiceover (probe dari audio element)
          const voiceDur = await new Promise<number>((resolve) => {
            const selectedVoiceItem = audios.find((a) => a.id === voiceId);
            if (!selectedVoiceItem?.url) { resolve(15); return; }
            const a = document.createElement("audio");
            a.preload = "metadata";
            a.onloadedmetadata = () => { resolve(a.duration || 15); a.remove(); };
            a.onerror = () => { resolve(15); a.remove(); };
            a.src = selectedVoiceItem.url;
          });

          // calculate_segment_start — port dari MassVEPro
          const maxStart = Math.max(0, videoDuration - voiceDur);
          const totalJobs = count;
          const loopModes = ["sequential", "random", "reverse"] as const;

          // Sequential: distribusi merata, Random: acak
          let trimStart: number;
          const mode = Math.random() > 0.5 ? "sequential" : "random";
          if (mode === "sequential" && totalJobs > 1) {
            const step = maxStart / (totalJobs - 1);
            trimStart = Math.min(maxStart, i * step);
          } else {
            trimStart = maxStart > 0 ? Math.random() * maxStart : 0;
          }
          trimStart = Math.round(trimStart * 10) / 10;
          const trimEnd = Math.round((trimStart + voiceDur + 0.5) * 10) / 10;

          vp = {
            ...vp,
            trimStart,
            trimEnd,
            mirror: Math.random() > 0.5,
            speed: Math.round((0.9 + Math.random() * 0.2) * 100) / 100, // 0.9x - 1.1x
            loopMode: loopModes[Math.floor(Math.random() * loopModes.length)],
          };
        }

        const res = await api.post<{ job: VideoJobRow }>("/video", {
          baseVideoMediaId: baseVideoId,
          clipMediaIds: clipIds,
          voiceoverMediaId: voiceId,
          bgmAudioTrackId: bgmTrackId,
          publishToGallery,
          settings: {
            orientation,
            resolution,
            removeOriginalAudio,
            voiceVolume,
            bgmVolume,
            montage: clipIds.length ? { minSegmentSeconds: 2, maxSegmentSeconds: 5 } : undefined,
            caption: { ...caption, enabled: captionEnabled },
            headline: headlineText.trim()
              ? {
                  text: headlineText.trim(),
                  fontSize: headlineFontSize,
                  fontColor: headlineColor,
                  positionY: 0.1,
                }
              : undefined,
            ...(Object.keys(vp).length ? { videoProcessing: vp } : {}),
          },
        });
        jobs.push(res.job);
      }
      return jobs;
    },
    onSuccess: (jobs) => {
      toast.success(`${jobs.length} job render dibuat — sedang diproses`);
      setPollingId(jobs[0]?.id ?? null);
      queryClient.invalidateQueries({ queryKey: ["video-jobs"] });
      setBaseVideoId(null);
      setClipIds([]);
      setVoiceoverId(null);
      setBgmTrackId(null);
      setHeadlineText("");
      setPublishToGallery(false);
      setVideoProcessing({ trimStart: "", trimEnd: "", mirror: false, speed: 1.0, loopMode: "sequential", overlay: { file: null, position: "top-right", scale: 0.15, opacity: 1.0 } });
      setBatchMode(false);
      setBatchVoiceoverIds([]);
      setBatchUniqueVariation(false);
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : "Gagal membuat job batch";
      toast.error(msg);
    },
  });

  const retryJob = useMutation({
    mutationFn: (id: string) => api.post<{ job: VideoJobRow }>(`/video/${id}/retry`),
    onSuccess: (res) => {
      toast.success("Job dibuat ulang — sedang diproses");
      setPollingId(res.job.id);
      queryClient.invalidateQueries({ queryKey: ["video-jobs"] });
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : "Gagal mengulang job";
      toast.error(msg);
    },
  });

  const deleteJob = useMutation({
    mutationFn: (id: string) => api.delete(`/video/${id}`),
    onSuccess: () => {
      toast.success("Job dihapus dari riwayat");
      queryClient.invalidateQueries({ queryKey: ["video-jobs"] });
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : "Gagal menghapus job";
      toast.error(msg);
    },
  });

  const toggleGallery = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      api.patch(`/video/${id}/gallery`, { published }),
    onSuccess: (_res, vars) => {
      toast.success(vars.published ? "Dipublikasi ke galeri publik" : "Dihapus dari galeri publik");
      queryClient.invalidateQueries({ queryKey: ["video-jobs"] });
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : "Gagal mengubah publikasi";
      toast.error(msg);
    },
  });

  // Filter & paginate jobs
  const filteredJobs = historyFilter === "all"
    ? jobs
    : jobs.filter((j) => j.status === historyFilter);
  const historyTotalPages = Math.max(1, Math.ceil(filteredJobs.length / HISTORY_PER_PAGE));
  const pagedJobs = filteredJobs.slice(
    (historyPage - 1) * HISTORY_PER_PAGE,
    historyPage * HISTORY_PER_PAGE,
  );

  // Reset page ke 1 saat filter berubah
  useEffect(() => { setHistoryPage(1); }, [historyFilter]);

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
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Clapperboard className="h-5 w-5" /> Render Video
        </h1>
        <p className="mt-1 text-[var(--text-secondary)] text-sm">
          Buat video vertikal dari footage + voiceover, dengan subtitle otomatis.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        {/* Kolom kiri — Form compose */}
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
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(showAllVideos ? videos : videos.slice(0, 8)).map((v) => (
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
                    {/* Hover preview — putar frame saat mouse di atas (muted).
                        Klik tetap memilih video. */}
                    {v.url && (
                      <video
                        src={v.url}
                        muted
                        playsInline
                        preload="none"
                        className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity group-hover:opacity-100"
                        onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                        onMouseLeave={(e) => {
                          e.currentTarget.pause();
                          e.currentTarget.currentTime = 0;
                        }}
                      />
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-[10px] text-white">
                      {v.name}
                    </span>
                    {v.url && (
                      <span className="absolute top-1 right-1 rounded bg-black/60 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-3 w-3 fill-white text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {videos.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllVideos((v) => !v)}
                  className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
                >
                  {showAllVideos
                    ? "Sembunyikan"
                    : `Tampilkan semua (${videos.length} video)`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Clip montage tambahan — toggle per kartu. Saat ada clip, pipeline
            ambil segmen acak dari tiap video (montage), bukan pakai base
            video utuh. Inilah nilai jual fitur: 1 base + N clip + voiceover
            menghasilkan komposisi yang berbeda tiap render. */}
        {selectedBase && videos.length > 1 && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Film className="h-4 w-4" /> Clip montage{" "}
              <span className="font-normal text-[var(--text-muted)]">
                (opsional — pilih beberapa untuk segmen acak)
              </span>
            </Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(showAllVideos ? videos : videos.slice(0, 8))
                .filter((v) => v.id !== baseVideoId)
                .map((v) => {
                  const active = clipIds.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() =>
                        setClipIds((ids) =>
                          active ? ids.filter((x) => x !== v.id) : [...ids, v.id],
                        )
                      }
                      className={cn(
                        "group relative aspect-video overflow-hidden rounded-[var(--radius-md)] border bg-[var(--bg-tertiary)] transition",
                        active
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
                      {active && (
                        <span className="absolute top-1 left-1 rounded bg-[var(--accent-gold)] px-1 text-[10px] font-medium text-black">
                          segmen acak
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
            {clipIds.length > 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                {clipIds.length + 1} video dipakai (base + {clipIds.length} clip).
                Tiap render mengambil segmen 2–5 detik acak dari setiap video —
                hasil berbeda setiap kali dengan voiceover yang sama.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Music2 className="h-4 w-4" /> Voiceover (opsional)
          </Label>
          {selectedVoice ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
                <Music2 className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="flex-1 truncate text-sm">{selectedVoice.name}</span>
                <Button size="sm" variant="ghost" onClick={() => setVoiceoverId(null)}>
                  Hapus
                </Button>
              </div>
              {/* Preview audio langsung sebelum render */}
              <audio
                src={selectedVoice.url}
                controls
                preload="metadata"
                className="h-9 w-full"
              />
            </div>
          ) : (
            <Select
              className="w-full"
              value=""
              onChange={(e) => e.target.value && setVoiceoverId(e.target.value)}
            >
              <option value="">Pilih file audio…</option>
              {audios.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        {selectedVoice && (
          <div className="space-y-1.5">
            <Label className="text-xs text-[var(--text-secondary)]">
              Volume voiceover — {Math.round(voiceVolume * 100)}%
            </Label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={voiceVolume}
              onChange={(e) => setVoiceVolume(Number(e.target.value))}
              className="w-full accent-[var(--accent-gold)]"
            />
          </div>
        )}

        {/* Batch mode — submit multiple jobs sekaligus */}
        {audios.length > 1 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setBatchMode((v) => !v);
                if (batchMode) setBatchVoiceoverIds([]);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition",
                batchMode
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
                  : "border-[var(--border)] text-[var(--text-secondary)]",
              )}
            >
              <span
                className={cn(
                  "h-4 w-7 rounded-full p-0.5 transition",
                  batchMode ? "bg-[var(--accent-gold)]" : "bg-[var(--bg-tertiary)]",
                )}
              >
                <span
                  className={cn(
                    "block h-3 w-3 rounded-full bg-white transition",
                    batchMode ? "translate-x-3" : "translate-x-0",
                  )}
                />
              </span>
              <span className="flex-1 text-left">
                Batch mode — render beberapa voiceover sekaligus
              </span>
            </button>

            {batchMode && (
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">
                    Pilih voiceover untuk batch (centang beberapa)
                  </Label>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {audios.map((a) => (
                      <label
                        key={a.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition hover:bg-[var(--bg-tertiary)]",
                          batchVoiceoverIds.includes(a.id) && "bg-[var(--accent-gold-light)]",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={batchVoiceoverIds.includes(a.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBatchVoiceoverIds((prev) => [...prev, a.id]);
                            } else {
                              setBatchVoiceoverIds((prev) => prev.filter((id) => id !== a.id));
                            }
                          }}
                          className="accent-[var(--accent-gold)]"
                        />
                        <span className="flex-1 truncate">{a.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    Jumlah output:
                  </Label>
                  <input
                    type="number"
                    min={1}
                    max={batchVoiceoverIds.length || 10}
                    value={batchOutputCount}
                    onChange={(e) => setBatchOutputCount(Number(e.target.value))}
                    className="w-20 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-[var(--text-muted)]">
                    (maks {batchVoiceoverIds.length || 1})
                  </span>
                </div>
                {batchVoiceoverIds.length > 0 && (
                  <p className="text-xs text-[var(--text-muted)]">
                    Akan membuat {Math.min(batchOutputCount, batchVoiceoverIds.length)} job —
                    tiap job pakai voiceover berbeda dengan base video & setting yang sama.
                  </p>
                )}

                {/* Variasi Unik */}
                {batchVoiceoverIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setBatchUniqueVariation((v) => !v)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-2 text-xs transition",
                      batchUniqueVariation
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-[var(--border)] text-[var(--text-secondary)]",
                    )}
                  >
                    <span
                      className={cn(
                        "h-3.5 w-6 shrink-0 rounded-full p-0.5 transition",
                        batchUniqueVariation ? "bg-green-500" : "bg-[var(--bg-tertiary)]",
                      )}
                    >
                      <span
                        className={cn(
                          "block h-2.5 w-2.5 rounded-full bg-white transition",
                          batchUniqueVariation ? "translate-x-2.5" : "translate-x-0",
                        )}
                      />
                    </span>
                    <span className="flex-1 text-left">
                      <span className="font-medium">Variasi Unik</span> — acak trim, mirror & speed per job
                    </span>
                  </button>
                )}

                {batchUniqueVariation && batchVoiceoverIds.length > 1 && (
                  <div className="rounded-[var(--radius-md)] border border-green-200 bg-green-50 p-2.5 text-xs text-green-700">
                    <p className="font-medium">Yang diacak per job:</p>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      <li>Trim start: 0 - 20 detik (acak)</li>
                      <li>Durasi segmen: 10 - 25 detik</li>
                      <li>Mirror: random 50/50</li>
                      <li>Speed: 0.85x - 1.15x</li>
                      <li>Loop mode: sequential / random / reverse (acak)</li>
                    </ul>
                    <p className="mt-1 text-[var(--text-muted)]">
                      Base video yang sama, tapi setiap output punya variasi berbeda.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Music2 className="h-4 w-4" /> Background music (opsional)
          </Label>
          {bgmTrackId ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
              <Music2 className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="flex-1 truncate text-sm">
                {bgmTracks.find((t) => t.id === bgmTrackId)?.name}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setBgmTrackId(null)}>
                Hapus
              </Button>
            </div>
          ) : bgmTracks.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Belum ada track di sound library. Upload BGM di menu Sound untuk
              menambahkannya.
            </p>
          ) : (
            <Select
              className="w-full"
              value=""
              onChange={(e) => e.target.value && setBgmTrackId(e.target.value)}
            >
              <option value="">Pilih track BGM…</option>
              {bgmTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.durationSeconds ? ` · ${Math.round(t.durationSeconds)}s` : ""}
                </option>
              ))}
            </Select>
          )}
          {bgmTrackId && (
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">
                Volume BGM — {Math.round(bgmVolume * 100)}%
              </Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={bgmVolume}
                onChange={(e) => setBgmVolume(Number(e.target.value))}
                className="w-full accent-[var(--accent-gold)]"
              />
            </div>
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
            <Label>Resolusi</Label>
            <div className="flex gap-2">
              {(["720p", "1080p"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResolution(r)}
                  className={cn(
                    "flex-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-xs transition",
                    resolution === r
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                      : "border-[var(--border)] text-[var(--text-secondary)]",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedVoice && (
          <div className="space-y-2">
            <Label>Audio asli video</Label>
            <button
              type="button"
              onClick={() => setRemoveOriginalAudio((v) => !v)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition",
                removeOriginalAudio
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
                  : "border-[var(--border)] text-[var(--text-secondary)]",
              )}
            >
              <span
                className={cn(
                  "h-4 w-7 rounded-full p-0.5 transition",
                  removeOriginalAudio ? "bg-[var(--accent-gold)]" : "bg-[var(--bg-tertiary)]",
                )}
              >
                <span
                  className={cn(
                    "block h-3 w-3 rounded-full bg-white transition",
                    removeOriginalAudio ? "translate-x-3" : "translate-x-0",
                  )}
                />
              </span>
              {removeOriginalAudio ? "Ganti dengan voiceover" : "Pertahankan audio asli"}
            </button>
          </div>
        )}

        {/* Video Processing: trim, mirror, speed */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <RotateCcw className="h-4 w-4" /> Video Processing
          </Label>
          <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3 sm:grid-cols-2">
            {/* Trim */}
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Trim (detik)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Mulai"
                  min="0"
                  step="0.5"
                  value={videoProcessing.trimStart}
                  onChange={(e) =>
                    setVideoProcessing((v) => ({ ...v, trimStart: e.target.value }))
                  }
                  className="w-full text-xs"
                />
                <Input
                  type="number"
                  placeholder="Akhir"
                  min="0"
                  step="0.5"
                  value={videoProcessing.trimEnd}
                  onChange={(e) =>
                    setVideoProcessing((v) => ({ ...v, trimEnd: e.target.value }))
                  }
                  className="w-full text-xs"
                />
              </div>
            </div>

            {/* Speed */}
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">
                Kecepatan — {videoProcessing.speed}x
              </Label>
              <input
                type="range"
                min={0.25}
                max={4.0}
                step={0.25}
                value={videoProcessing.speed}
                onChange={(e) =>
                  setVideoProcessing((v) => ({ ...v, speed: parseFloat(e.target.value) }))
                }
                className="w-full accent-[var(--accent-gold)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                <span>0.25x (lambat)</span>
                <span>4x (cepat)</span>
              </div>
            </div>

            {/* Mirror */}
            <div className="flex items-end sm:col-span-2">
              <button
                type="button"
                onClick={() =>
                  setVideoProcessing((v) => ({ ...v, mirror: !v.mirror }))
                }
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-xs transition",
                  videoProcessing.mirror
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
                    : "border-[var(--border)] text-[var(--text-secondary)]",
                )}
              >
                <span
                  className={cn(
                    "h-3.5 w-6 rounded-full p-0.5 transition",
                    videoProcessing.mirror
                      ? "bg-[var(--accent-gold)]"
                      : "bg-[var(--bg-tertiary)]",
                  )}
                >
                  <span
                    className={cn(
                      "block h-2.5 w-2.5 rounded-full bg-white transition",
                      videoProcessing.mirror ? "translate-x-2.5" : "translate-x-0",
                    )}
                  />
                </span>
                Mirror (reverse) — hindari deteksi duplikat
              </button>
            </div>

            {/* Loop Mode */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-[var(--text-secondary)]">
                Mode Loop — saat video lebih pendek dari voiceover
              </Label>
              <div className="flex gap-1.5">
                {([
                  { value: "sequential", label: "Sequential", desc: "Ulang dari awal ke akhir" },
                  { value: "random", label: "Acak", desc: "Segmen random tiap loop" },
                  { value: "reverse", label: "Reverse", desc: "Normal → balik → normal" },
                ] as const).map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setVideoProcessing((v) => ({ ...v, loopMode: m.value }))}
                    className={cn(
                      "flex-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-left text-xs transition",
                      videoProcessing.loopMode === m.value
                        ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                        : "border-[var(--border)] text-[var(--text-secondary)]",
                    )}
                    title={m.desc}
                  >
                    <span className="block">{m.label}</span>
                    <span className="mt-0.5 block text-[10px] font-normal text-[var(--text-muted)]">
                      {m.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Overlay */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Film className="h-4 w-4" /> Overlay (gambar/video)
          </Label>
          <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3 sm:grid-cols-2">
            {/* File picker */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs text-[var(--text-secondary)]">File overlay (opsional)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setVideoProcessing((v) => ({
                      ...v,
                      overlay: { ...v.overlay, file },
                    }));
                  }}
                  className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-[var(--accent-gold)] file:px-2 file:py-1 file:text-xs file:font-medium file:text-white"
                />
                {videoProcessing.overlay.file && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setVideoProcessing((v) => ({
                        ...v,
                        overlay: { ...v.overlay, file: null },
                      }))
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {videoProcessing.overlay.file && (
                <p className="text-[10px] text-[var(--text-muted)]">
                  {videoProcessing.overlay.file.name}
                </p>
              )}

              {/* Pilih dari media library */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-muted)]">atau pilih dari media:</span>
                <select
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs"
                  value={videoProcessing.overlay.mediaId ?? ""}
                  onChange={(e) => {
                    const mediaId = e.target.value || null;
                    setVideoProcessing((v) => ({
                      ...v,
                      overlay: {
                        ...v.overlay,
                        mediaId,
                        // Clear file kalau pilih media (dan sebaliknya)
                        file: mediaId ? null : v.overlay.file,
                      },
                    }));
                  }}
                >
                  <option value="">— Tidak dipilih —</option>
                  {(mediaData?.items ?? [])
                    .filter((m) => m.type === "image" || m.type === "video")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name ?? "tanpa nama"} ({m.type})
                      </option>
                    ))}
                </select>
              </div>
              {videoProcessing.overlay.mediaId && (() => {
                const m = (mediaData?.items ?? []).find((x) => x.id === videoProcessing.overlay.mediaId);
                return m ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={m.thumbnailUrl ?? m.url}
                      alt={m.name ?? "overlay"}
                      className="h-8 w-8 rounded border border-[var(--border)] object-cover"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] truncate">
                      {m.name ?? "tanpa nama"}
                    </span>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Position */}
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">Posisi</Label>
              <div className="flex flex-wrap gap-1">
                {(["top-left", "top-right", "bottom-left", "bottom-right", "center", "random"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setVideoProcessing((v) => ({
                        ...v,
                        overlay: { ...v.overlay, position: p },
                      }))
                    }
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] transition",
                      videoProcessing.overlay.position === p
                        ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                        : "border-[var(--border)] text-[var(--text-secondary)]",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Scale */}
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">
                Skala — {Math.round(videoProcessing.overlay.scale * 100)}%
              </Label>
              <input
                type="range"
                min={0.05}
                max={0.5}
                step={0.01}
                value={videoProcessing.overlay.scale}
                onChange={(e) =>
                  setVideoProcessing((v) => ({
                    ...v,
                    overlay: { ...v.overlay, scale: parseFloat(e.target.value) },
                  }))
                }
                className="w-full accent-[var(--accent-gold)]"
              />
            </div>

            {/* Opacity */}
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">
                Opasitas — {Math.round(videoProcessing.overlay.opacity * 100)}%
              </Label>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={videoProcessing.overlay.opacity}
                onChange={(e) =>
                  setVideoProcessing((v) => ({
                    ...v,
                    overlay: { ...v.overlay, opacity: parseFloat(e.target.value) },
                  }))
                }
                className="w-full accent-[var(--accent-gold)]"
              />
            </div>
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
            {captionEnabled ? "Subtitle aktif" : "Subtitle nonaktif"}
          </button>

          {captionEnabled && !voiceoverId && !bgmTrackId && removeOriginalAudio && (
            <p className="text-xs text-[var(--text-muted)]">
              Tidak ada audio untuk ditranskripsi: pilih voiceover atau BGM, atau
              pertahankan audio asli di atas. Tanpa itu, subtitle tidak akan
              muncul di hasil render.
            </p>
          )}

          {captionEnabled && (
            <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Bahasa</Label>
                <Select
                  className="w-full"
                  value={caption.language}
                  onChange={(e) =>
                    setCaption((c) => ({
                      ...c,
                      language: e.target.value as CaptionSettings["language"],
                    }))
                  }
                >
                  {LANGS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Model Whisper</Label>
                <Select
                  className="w-full"
                  value={caption.model}
                  onChange={(e) =>
                    setCaption((c) => ({
                      ...c,
                      model: e.target.value as CaptionSettings["model"],
                    }))
                  }
                >
                  {WHISPER_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">
                  Ukuran font — {caption.fontSize}px
                </Label>
                <input
                  type="range"
                  min={12}
                  max={72}
                  step={1}
                  value={caption.fontSize}
                  onChange={(e) =>
                    setCaption((c) => ({ ...c, fontSize: Number(e.target.value) }))
                  }
                  className="w-full accent-[var(--accent-gold)]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Posisi subtitle</Label>
                <div className="flex gap-1.5">
                  {(["bottom", "center", "top"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCaption((c) => ({ ...c, position: p }))}
                      className={cn(
                        "flex-1 rounded-[var(--radius-md)] border px-1.5 py-1 text-xs transition",
                        caption.position === p
                          ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                          : "border-[var(--border)] text-[var(--text-secondary)]",
                      )}
                    >
                      {p === "bottom" ? "Bawah" : p === "center" ? "Tengah" : "Atas"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Warna teks</Label>
                <div className="flex gap-1.5">
                  {FONT_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setCaption((c) => ({ ...c, fontColor: col }))}
                      className={cn(
                        "h-7 flex-1 rounded-[var(--radius-md)] border transition",
                        caption.fontColor === col
                          ? "ring-2 ring-[var(--accent-gold)] ring-offset-1"
                          : "",
                      )}
                      style={{
                        backgroundColor:
                          col === "white"
                            ? "#ffffff"
                            : col === "black"
                              ? "#000000"
                              : col,
                      }}
                      aria-label={col}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() =>
                    setCaption((c) => ({ ...c, wordHighlight: !c.wordHighlight }))
                  }
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-xs transition",
                    caption.wordHighlight
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
                      : "border-[var(--border)] text-[var(--text-secondary)]",
                  )}
                >
                  <span
                    className={cn(
                      "h-3.5 w-6 rounded-full p-0.5 transition",
                      caption.wordHighlight
                        ? "bg-[var(--accent-gold)]"
                        : "bg-[var(--bg-tertiary)]",
                    )}
                  >
                    <span
                      className={cn(
                        "block h-2.5 w-2.5 rounded-full bg-white transition",
                        caption.wordHighlight ? "translate-x-2.5" : "translate-x-0",
                      )}
                    />
                  </span>
                  Highlight kata aktif
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Type className="h-4 w-4" /> Headline (opsional)
          </Label>
          <Input
            placeholder="Teks besar di atas video (hook)…"
            value={headlineText}
            onChange={(e) => setHeadlineText(e.target.value.slice(0, 120))}
            maxLength={120}
          />
          {headlineText.trim() && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">
                  Ukuran font — {headlineFontSize}px
                </Label>
                <input
                  type="range"
                  min={16}
                  max={120}
                  step={1}
                  value={headlineFontSize}
                  onChange={(e) => setHeadlineFontSize(Number(e.target.value))}
                  className="w-full accent-[var(--accent-gold)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Warna headline</Label>
                <div className="flex gap-1.5">
                  {FONT_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setHeadlineColor(col)}
                      className={cn(
                        "h-7 flex-1 rounded-[var(--radius-md)] border transition",
                        headlineColor === col
                          ? "ring-2 ring-[var(--accent-gold)] ring-offset-1"
                          : "",
                      )}
                      style={{
                        backgroundColor:
                          col === "white" ? "#ffffff" : col === "black" ? "#000000" : col,
                      }}
                      aria-label={col}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <Button
          onClick={() => {
            if (batchMode && batchVoiceoverIds.length > 0) {
              createBatchJobs.mutate();
            } else {
              createJob.mutate();
            }
          }}
          disabled={
            !baseVideoId ||
            createJob.isPending ||
            createBatchJobs.isPending ||
            (batchMode && batchVoiceoverIds.length === 0)
          }
          className="w-full"
        >
          {createJob.isPending || createBatchJobs.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {batchMode && batchVoiceoverIds.length > 0
            ? `Batch render (${Math.min(batchOutputCount, batchVoiceoverIds.length)} video)`
            : clipIds.length > 0
              ? `Render montage (${clipIds.length + 1} video)`
              : "Render video"}
        </Button>

        {/* Publikasi ke galeri publik — opt-in, default OFF.
            renders.json publik tanpa auth; tanpa toggle ini semua karya klien
            otomatis terekspos (directory listing + download anonim). */}
        <button
          type="button"
          onClick={() => setPublishToGallery((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left text-xs transition",
            publishToGallery
              ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)]"
              : "border-[var(--border)] text-[var(--text-secondary)]",
          )}
        >
          <span
            className={cn(
              "h-3.5 w-6 shrink-0 rounded-full p-0.5 transition",
              publishToGallery ? "bg-[var(--accent-gold)]" : "bg-[var(--bg-tertiary)]",
            )}
          >
            <span
              className={cn(
                "block h-2.5 w-2.5 rounded-full bg-white transition",
                publishToGallery ? "translate-x-2.5" : "translate-x-0",
              )}
            />
          </span>
          <span>
            Publikasikan ke galeri publik (/renders)
            <span className="mt-0.5 block text-[var(--text-muted)]">
              Video akan dapat dilihat & diunduh siapa saja tanpa login.
            </span>
          </span>
        </button>
        </div>

        {/* Kolom kanan — Riwayat render */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)]">
                Riwayat render
              </h2>
              <span className="text-xs text-[var(--text-muted)]">
                {filteredJobs.length} job
              </span>
            </div>

            {/* Filter */}
            <div className="flex flex-wrap gap-1.5">
              {(["all", "done", "rendering", "failed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setHistoryFilter(f)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] transition",
                    historyFilter === f
                      ? "border-[var(--accent-gold)] bg-[var(--accent-gold-light)] font-medium"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-secondary)]",
                  )}
                >
                  {f === "all" ? "Semua" : f === "done" ? "Selesai" : f === "rendering" ? "Merender" : "Gagal"}
                </button>
              ))}
            </div>

            {pagedJobs.length === 0 ? (
              <EmptyState
                icon={<Clapperboard className="h-5 w-5" />}
                title="Belum ada job render"
                description="Pilih base video di kiri dan mulai render pertama Anda."
              />
            ) : (
              <div className="space-y-2">
                {pagedJobs.map((job) => {
                  const meta = STATUS_META[job.status];
                  const isBusy = job.status === "rendering" || job.status === "uploading";
                  return (
                    <div
                      key={job.id}
                      className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5"
                    >
                      {job.baseVideoThumbnailUrl ? (
                        <img
                          src={job.baseVideoThumbnailUrl}
                          alt={job.baseVideoName ?? "video"}
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--bg-tertiary)]">
                          <Film className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium">
                            {job.baseVideoName ?? "video"}
                          </span>
                          <Badge className={cn("shrink-0 text-[10px]", meta.className)}>
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                          <span>{formatRelativeTime(job.createdAt)}</span>
                          <span>·</span>
                          <span>{job.settings.orientation}</span>
                        </div>
                        {isBusy && (
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                            <div
                              className="h-full bg-[var(--accent-gold)] transition-all"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                        )}
                        {job.status === "failed" && job.errorMessage && (
                          <p className="mt-0.5 text-[10px] text-red-600 truncate" title={job.errorMessage}>
                            {job.errorMessage}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        {job.status === "done" && job.outputMediaId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => window.open("/media", "_self")}
                          >
                            Lihat
                          </Button>
                        )}
                        {(job.status === "failed" || job.status === "canceled") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5"
                            disabled={retryJob.isPending}
                            onClick={() => retryJob.mutate(job.id)}
                            title="Render ulang"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                        {job.status === "done" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px]"
                            disabled={toggleGallery.isPending}
                            onClick={() =>
                              toggleGallery.mutate({
                                id: job.id,
                                published: !job.publishedToGallery,
                              })
                            }
                            title={
                              job.publishedToGallery
                                ? "Hapus dari galeri publik"
                                : "Publikasikan"
                            }
                          >
                            {job.publishedToGallery ? "Privat" : "Publik"}
                          </Button>
                        )}
                        {(job.status === "failed" || job.status === "canceled") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-red-600 hover:text-red-700"
                            disabled={deleteJob.isPending}
                            onClick={() => deleteJob.mutate(job.id)}
                            title="Hapus dari riwayat"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Hal {historyPage} / {historyTotalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => p - 1)}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    disabled={historyPage >= historyTotalPages}
                    onClick={() => setHistoryPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {jobsError && (
        <p className="text-center text-xs text-red-600">Gagal memuat riwayat render</p>
      )}
    </div>
  );
}
