// Query & mutation render video — dari pecahan video.tsx.
//
// State form (picker, caption, processing) tetap di halaman; hook ini hanya
// bertanggung jawab atas kontrak server: list job, polling job aktif, dan
// mutasi (create / batch / retry / delete / gallery toggle). Dikeluarkan dari
// komponen agar logika request tidak tercampur dengan ~1000 baris JSX form.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { queryKeys } from "../../lib/query-keys";
import type {
  CaptionSettings,
  MediaItem,
  VideoJobRow,
  VideoProcessingSettings,
} from "./video-types";

type Orientation = "portrait" | "landscape" | "square";
type Resolution = "720p" | "1080p";

export type VideoRenderForm = {
  baseVideoId: string | null;
  clipIds: string[];
  voiceoverId: string | null;
  bgmTrackId: string | null;
  publishToGallery: boolean;
  orientation: Orientation;
  resolution: Resolution;
  removeOriginalAudio: boolean;
  voiceVolume: number;
  bgmVolume: number;
  caption: CaptionSettings;
  captionEnabled: boolean;
  headlineText: string;
  headlineFontSize: number;
  headlineColor: string;
  videoProcessing: VideoProcessingSettings;
  mediaItems: MediaItem[];
  audios: MediaItem[];
  batchMode: boolean;
  batchVoiceoverIds: string[];
  batchOutputCount: number;
  batchUniqueVariation: boolean;
  videoDuration: number;
};

export type VideoRenderFormSetters = {
  setBaseVideoId: (v: string | null) => void;
  setClipIds: (v: string[]) => void;
  setVoiceoverId: (v: string | null) => void;
  setBgmTrackId: (v: string | null) => void;
  setHeadlineText: (v: string) => void;
  setPublishToGallery: (v: boolean | ((prev: boolean) => boolean)) => void;
  setVideoProcessing: (
    v: VideoProcessingSettings | ((prev: VideoProcessingSettings) => VideoProcessingSettings),
  ) => void;
  setBatchMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  setBatchVoiceoverIds: (v: string[]) => void;
  setBatchUniqueVariation: (v: boolean | ((prev: boolean) => boolean)) => void;
};

const DEFAULT_VIDEO_PROCESSING: VideoProcessingSettings = {
  trimStart: "",
  trimEnd: "",
  mirror: false,
  speed: 1.0,
  loopMode: "sequential",
  overlay: { file: null, mediaId: null, position: "top-right", scale: 0.15, opacity: 1.0 },
};

/** Bangun objek videoProcessing dari form — skip field kosong/default biar
 *  payload ramping dan tidak menimpa default server. */
async function buildVideoProcessing(form: VideoRenderForm): Promise<Record<string, unknown>> {
  const vp: Record<string, unknown> = {};
  const { videoProcessing } = form;
  if (videoProcessing.trimStart) vp.trimStart = Number.parseFloat(videoProcessing.trimStart);
  if (videoProcessing.trimEnd) vp.trimEnd = Number.parseFloat(videoProcessing.trimEnd);
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
    const m = form.mediaItems.find((x) => x.id === videoProcessing.overlay.mediaId);
    if (m) {
      vp.overlay = {
        url: m.url,
        position: videoProcessing.overlay.position,
        scale: videoProcessing.overlay.scale,
        opacity: videoProcessing.overlay.opacity,
      };
    }
  }
  return vp;
}

/** Bangun settings request bersama dari form (dipakai job tunggal & batch). */
function buildRenderSettings(
  form: VideoRenderForm,
  vp: Record<string, unknown>,
): Record<string, unknown> {
  return {
    orientation: form.orientation,
    resolution: form.resolution,
    removeOriginalAudio: form.removeOriginalAudio,
    voiceVolume: form.voiceVolume,
    bgmVolume: form.bgmVolume,
    montage: form.clipIds.length ? { minSegmentSeconds: 2, maxSegmentSeconds: 5 } : undefined,
    caption: { ...form.caption, enabled: form.captionEnabled },
    headline: form.headlineText.trim()
      ? {
          text: form.headlineText.trim(),
          fontSize: form.headlineFontSize,
          fontColor: form.headlineColor,
          positionY: 0.1,
        }
      : undefined,
    ...(Object.keys(vp).length ? { videoProcessing: vp } : {}),
  };
}

export function useVideoRender(form: VideoRenderForm, setters: VideoRenderFormSetters) {
  const queryClient = useQueryClient();
  const [pollingId, setPollingId] = useState<string | null>(null);

  // List job render
  const {
    data: jobsData,
    isLoading: jobsLoading,
    error: jobsError,
  } = useQuery({
    queryKey: queryKeys.videoJobs,
    queryFn: () => api.get<{ jobs: VideoJobRow[]; renderEnabled: boolean }>("/video"),
    refetchInterval: pollingId ? 2000 : false, // polling 2s saat ada job aktif
  });

  // Polling satu job aktif sampai selesai
  const { data: activeJob } = useQuery({
    queryKey: [...queryKeys.videoJob, pollingId],
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
      if (st === "failed")
        toast.error(`Render gagal: ${activeJob.job.errorMessage ?? "error tidak diketahui"}`);
      setPollingId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.videoJobs });
      queryClient.invalidateQueries({ queryKey: queryKeys.media });
    }
  }, [activeJob, queryClient]);

  function resetForm(): void {
    setters.setBaseVideoId(null);
    setters.setClipIds([]);
    setters.setVoiceoverId(null);
    setters.setBgmTrackId(null);
    setters.setHeadlineText("");
    setters.setPublishToGallery(false);
    setters.setVideoProcessing(DEFAULT_VIDEO_PROCESSING);
    setters.setBatchMode(false);
    setters.setBatchVoiceoverIds([]);
    setters.setBatchUniqueVariation(false);
  }

  const createJob = useMutation({
    mutationFn: async () => {
      const vp = await buildVideoProcessing(form);
      const res = await api.post<{ job: VideoJobRow }>("/video", {
        baseVideoMediaId: form.baseVideoId,
        clipMediaIds: form.clipIds,
        voiceoverMediaId: form.voiceoverId,
        bgmAudioTrackId: form.bgmTrackId,
        publishToGallery: form.publishToGallery,
        settings: buildRenderSettings(form, vp),
      });
      return res.job;
    },
    onSuccess: (job) => {
      toast.success("Job render dibuat — sedang diproses");
      setPollingId(job.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.videoJobs });
      resetForm();
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : "Gagal membuat job render";
      toast.error(msg);
    },
  });

  // Batch render — buat beberapa job sekaligus (satu per voiceover terpilih)
  const createBatchJobs = useMutation({
    mutationFn: async () => {
      if (!form.baseVideoId) throw new Error("Base video belum dipilih");
      const baseVp = await buildVideoProcessing(form);

      const voiceIds =
        form.batchMode && form.batchVoiceoverIds.length > 0
          ? form.batchVoiceoverIds
          : form.voiceoverId
            ? [form.voiceoverId]
            : [null];
      const count = form.batchMode ? Math.min(form.batchOutputCount, voiceIds.length) : 1;
      const jobs: VideoJobRow[] = [];
      for (let i = 0; i < count; i++) {
        const voiceId = voiceIds[i % voiceIds.length];

        // Variasi unik per job: calculate_segment_start dari MassVEPro
        let vp = { ...baseVp };
        if (form.batchUniqueVariation && form.batchMode && form.videoDuration > 0) {
          // Estimasi durasi voiceover (probe dari audio element)
          const voiceDur = await new Promise<number>((resolve) => {
            const selectedVoiceItem = form.audios.find((a) => a.id === voiceId);
            if (!selectedVoiceItem?.url) {
              resolve(15);
              return;
            }
            const a = document.createElement("audio");
            a.preload = "metadata";
            a.onloadedmetadata = () => {
              resolve(a.duration || 15);
              a.remove();
            };
            a.onerror = () => {
              resolve(15);
              a.remove();
            };
            a.src = selectedVoiceItem.url;
          });

          // calculate_segment_start — port dari MassVEPro
          const maxStart = Math.max(0, form.videoDuration - voiceDur);
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
          baseVideoMediaId: form.baseVideoId,
          clipMediaIds: form.clipIds,
          voiceoverMediaId: voiceId,
          bgmAudioTrackId: form.bgmTrackId,
          publishToGallery: form.publishToGallery,
          settings: buildRenderSettings(form, vp),
        });
        jobs.push(res.job);
      }
      return jobs;
    },
    onSuccess: (jobs) => {
      toast.success(`${jobs.length} job render dibuat — sedang diproses`);
      setPollingId(jobs[0]?.id ?? null);
      queryClient.invalidateQueries({ queryKey: queryKeys.videoJobs });
      resetForm();
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
      queryClient.invalidateQueries({ queryKey: queryKeys.videoJobs });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.videoJobs });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.videoJobs });
    },
    onError: (error) => {
      const msg = error instanceof ApiError ? error.message : "Gagal mengubah publikasi";
      toast.error(msg);
    },
  });

  return {
    jobsData,
    jobsLoading,
    jobsError,
    createJob,
    createBatchJobs,
    retryJob,
    deleteJob,
    toggleGallery,
  };
}
