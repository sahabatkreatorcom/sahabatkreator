export type MediaItem = {
  id: string;
  name: string | null;
  url: string;
  type: "image" | "video" | "audio";
  thumbnailUrl?: string | null;
};

export type AudioTrackItem = {
  id: string;
  name: string;
  category: string | null;
  durationSeconds: number | null;
};

export type CaptionSettings = {
  enabled: boolean;
  language: "id" | "en" | "auto";
  model: "tiny" | "base" | "small" | "medium";
  fontSize: number;
  fontColor: string;
  position: "bottom" | "top" | "center";
  wordHighlight: boolean;
};

export type VideoProcessingSettings = {
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

export type VideoJobRow = {
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

export const FONT_COLORS = ["white", "yellow", "black", "red", "green", "blue"] as const;
export const LANGS = [
  { value: "id", label: "Bahasa Indonesia" },
  { value: "en", label: "English" },
  { value: "auto", label: "Deteksi otomatis" },
] as const;
export const WHISPER_MODELS = [
  { value: "tiny", label: "Tiny (paling cepat)" },
  { value: "base", label: "Base (seimbang)" },
  { value: "small", label: "Small (lebih akurat)" },
  { value: "medium", label: "Medium (paling akurat)" },
] as const;

export const STATUS_META: Record<VideoJobRow["status"], { label: string; className: string }> = {
  queued: { label: "Antri", className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" },
  rendering: { label: "Merender", className: "bg-blue-100 text-blue-700" },
  uploading: { label: "Mengunggah", className: "bg-blue-100 text-blue-700" },
  done: { label: "Selesai", className: "bg-green-100 text-green-700" },
  failed: { label: "Gagal", className: "bg-red-100 text-red-700" },
  canceled: {
    label: "Dibatalkan",
    className: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
  },
};
