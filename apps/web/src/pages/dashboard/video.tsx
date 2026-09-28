// Halaman Render Video — batch templating + auto-caption via Modal
//
// Pilih base video + voiceover dari media library, atur caption, submit job.
// Worker proses async (Modal render) → polling status 2s → output masuk
// media library.
//
// Struktur: halaman ini hanya form + state; kontrak server (query/mutasi/poll)
// di use-video-render.ts, panel riwayat di video-history.tsx, panel processing
// di video-processing-panel.tsx, panel caption/headline di video-caption-panel.tsx.
//
// Fitur ini sengaja tidak mengandung modul anti-detection MassVEPro
// (metadata spoof, visual jitter, SEI removal) — ketiganya evasion dan
// bisa revoke API app SahabatKreator. Lihat docs/rfc-video-render.md §2.
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Film, Loader2, Music2, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { queryKeys } from "../../lib/query-keys";
import { useVideoRender } from "./use-video-render";
import { CaptionPanel, HeadlinePanel } from "./video-caption-panel";
import { VideoHistory } from "./video-history";
import { VideoProcessingPanel } from "./video-processing-panel";
import type {
  AudioTrackItem,
  CaptionSettings,
  MediaItem,
  VideoProcessingSettings,
} from "./video-types";

const DEFAULT_VIDEO_PROCESSING: VideoProcessingSettings = {
  trimStart: "",
  trimEnd: "",
  mirror: false,
  speed: 1.0,
  loopMode: "sequential",
  overlay: { file: null, mediaId: null, position: "top-right", scale: 0.15, opacity: 1.0 },
};

export function VideoRenderPage() {
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
  const [showAllVideos, setShowAllVideos] = useState(false);
  const [publishToGallery, setPublishToGallery] = useState(false);
  // Video processing: trim, mirror, speed
  const [videoProcessing, setVideoProcessing] =
    useState<VideoProcessingSettings>(DEFAULT_VIDEO_PROCESSING);
  // Batch mode — submit multiple jobs sekaligus dengan voiceover berbeda
  const [batchMode, setBatchMode] = useState(false);
  const [batchVoiceoverIds, setBatchVoiceoverIds] = useState<string[]>([]);
  const [batchOutputCount, setBatchOutputCount] = useState(2);
  const [batchUniqueVariation, setBatchUniqueVariation] = useState(false);

  // List media untuk picker (filter video / audio saja)
  const { data: mediaData, isLoading: mediaLoading } = useQuery({
    queryKey: queryKeys.media,
    queryFn: () => api.get<{ items: MediaItem[] }>("/media"),
  });

  // List BGM dari sound library
  const { data: soundData } = useQuery({
    queryKey: queryKeys.sound,
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
    if (!selectedBase?.url) {
      setVideoDuration(0);
      return;
    }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      setVideoDuration(v.duration || 0);
      v.remove();
    };
    v.onerror = () => {
      setVideoDuration(0);
      v.remove();
    };
    v.src = selectedBase.url;
  }, [selectedBase?.url]);

  const {
    jobsData,
    jobsLoading,
    jobsError,
    createJob,
    createBatchJobs,
    retryJob,
    deleteJob,
    toggleGallery,
  } = useVideoRender(
    {
      baseVideoId,
      clipIds,
      voiceoverId,
      bgmTrackId,
      publishToGallery,
      orientation,
      resolution,
      removeOriginalAudio,
      voiceVolume,
      bgmVolume,
      caption,
      captionEnabled,
      headlineText,
      headlineFontSize,
      headlineColor,
      videoProcessing,
      mediaItems: mediaData?.items ?? [],
      audios,
      batchMode,
      batchVoiceoverIds,
      batchOutputCount,
      batchUniqueVariation,
      videoDuration,
    },
    {
      setBaseVideoId,
      setClipIds,
      setVoiceoverId,
      setBgmTrackId,
      setHeadlineText,
      setPublishToGallery,
      setVideoProcessing,
      setBatchMode,
      setBatchVoiceoverIds,
      setBatchUniqueVariation,
    },
  );

  const jobs = jobsData?.jobs ?? [];
  const renderEnabled = jobsData?.renderEnabled ?? false;

  if (jobsLoading || mediaLoading) return <PageLoader />;

  if (!renderEnabled) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-xl">
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
        <h1 className="flex items-center gap-2 font-semibold text-xl">
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
                    </button>
                  ))}
                </div>
                {videos.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllVideos((v) => !v)}
                    className="text-[var(--text-secondary)] text-xs underline"
                  >
                    {showAllVideos
                      ? "Tampilkan lebih sedikit"
                      : `Tampilkan semua (${videos.length})`}
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
                          <span className="absolute top-1 left-1 rounded bg-[var(--accent-gold)] px-1 font-medium text-[10px] text-black">
                            segmen acak
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
              {clipIds.length > 0 && (
                <p className="text-[var(--text-muted)] text-xs">
                  {clipIds.length + 1} video dipakai (base + {clipIds.length} clip). Tiap render
                  mengambil segmen 2–5 detik acak dari setiap video — hasil berbeda setiap kali
                  dengan voiceover yang sama.
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
                {/* Preview audio langsung sebelum render. File adalah upload
                  user — tidak ada transkrip untuk caption track (aturan
                  a11y tidak bisa dipenuhi untuk asset arbitrer). */}
                {/* biome-ignore lint/a11y/useMediaCaption: voiceover upload user, tanpa transkrip */}
                <audio src={selectedVoice.url} controls preload="metadata" className="h-9 w-full" />
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
              <Label className="text-[var(--text-secondary)] text-xs">
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
            <BatchModeControls
              audios={audios}
              batchMode={batchMode}
              setBatchMode={setBatchMode}
              batchVoiceoverIds={batchVoiceoverIds}
              setBatchVoiceoverIds={setBatchVoiceoverIds}
              batchOutputCount={batchOutputCount}
              setBatchOutputCount={setBatchOutputCount}
              batchUniqueVariation={batchUniqueVariation}
              setBatchUniqueVariation={setBatchUniqueVariation}
            />
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
              <p className="text-[var(--text-muted)] text-xs">
                Belum ada track di sound library. Upload BGM di menu Sound untuk menambahkannya.
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
                <Label className="text-[var(--text-secondary)] text-xs">
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

          <VideoProcessingPanel
            videoProcessing={videoProcessing}
            setVideoProcessing={setVideoProcessing}
            mediaItems={mediaData?.items ?? []}
          />

          <CaptionPanel
            caption={caption}
            captionEnabled={captionEnabled}
            setCaption={setCaption}
            setCaptionEnabled={setCaptionEnabled}
            voiceoverId={voiceoverId}
            bgmTrackId={bgmTrackId}
            removeOriginalAudio={removeOriginalAudio}
          />

          <HeadlinePanel
            headlineText={headlineText}
            headlineFontSize={headlineFontSize}
            headlineColor={headlineColor}
            setHeadlineText={setHeadlineText}
            setHeadlineFontSize={setHeadlineFontSize}
            setHeadlineColor={setHeadlineColor}
          />

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
          <VideoHistory jobs={jobs} mutations={{ retryJob, deleteJob, toggleGallery }} />
        </div>
      </div>
      {jobsError && <p className="text-center text-red-600 text-xs">Gagal memuat riwayat render</p>}
    </div>
  );
}

function BatchModeControls({
  audios,
  batchMode,
  setBatchMode,
  batchVoiceoverIds,
  setBatchVoiceoverIds,
  batchOutputCount,
  setBatchOutputCount,
  batchUniqueVariation,
  setBatchUniqueVariation,
}: {
  audios: MediaItem[];
  batchMode: boolean;
  setBatchMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  batchVoiceoverIds: string[];
  setBatchVoiceoverIds: (v: string[]) => void;
  batchOutputCount: number;
  setBatchOutputCount: (v: number) => void;
  batchUniqueVariation: boolean;
  setBatchUniqueVariation: (v: boolean | ((prev: boolean) => boolean)) => void;
}) {
  return (
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
        <span className="flex-1 text-left">Batch mode — render beberapa voiceover sekaligus</span>
      </button>

      {batchMode && (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <div className="space-y-1.5">
            <Label className="text-[var(--text-secondary)] text-xs">
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
                        setBatchVoiceoverIds([...batchVoiceoverIds, a.id]);
                      } else {
                        setBatchVoiceoverIds(batchVoiceoverIds.filter((id) => id !== a.id));
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
            <Label className="whitespace-nowrap text-[var(--text-secondary)] text-xs">
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
            <span className="text-[var(--text-muted)] text-xs">
              (maks {batchVoiceoverIds.length || 1})
            </span>
          </div>
          {batchVoiceoverIds.length > 0 && (
            <p className="text-[var(--text-muted)] text-xs">
              Akan membuat {Math.min(batchOutputCount, batchVoiceoverIds.length)} job — tiap job
              pakai voiceover berbeda dengan base video & setting yang sama.
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
                <span className="font-medium">Variasi Unik</span> — acak trim, mirror & speed per
                job
              </span>
            </button>
          )}

          {batchUniqueVariation && batchVoiceoverIds.length > 1 && (
            <div className="rounded-[var(--radius-md)] border border-green-200 bg-green-50 p-2.5 text-green-700 text-xs">
              <p className="font-medium">Yang diacak per job:</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
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
  );
}
