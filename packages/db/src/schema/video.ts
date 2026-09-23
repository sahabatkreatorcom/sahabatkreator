// Schema domain VIDEO — job render video (batch templating + auto-caption)
//
// Port dari MassVEPro (E:\KontenVideo\tiktok_affiliate\MassVEPro) yang sudah
// dibersihkan: hanya modul produksi (video_processor, caption_generator,
// combination_generator). Anti-detection engine & metadata spoofer sengaja
// TIDAK dipindahkan — keduanya evasion (ToS violation Meta/TikTok/YT/LinkedIn,
// bisa revoke API app). Lihat docs/rfc-video-render.md §2.
//
// Pipeline render jalan di Modal (server 2c/4g tidak muat — postgres+app+worker
// sudah 3.5g/3.0cpu). Worker hanya orkestrasi: claim job → HTTP ke Modal →
// output balik ke R2. Lihat RFC §11.
import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { media } from "./content";
import { audioTrack } from "./sound";
import { organization } from "./organization";

/** Status job render (mengikuti alur worker) */
export type VideoJobStatus =
  | "queued" // job di antrian, belum di-claim worker
  | "rendering" // sedang diproses di Modal
  | "uploading" // output selesai, sedang di-upload ke R2
  | "done" // selesai, output tersedia di media library
  | "failed" // gagal permanen (retry habis / error validasi)
  | "canceled"; // dibatalkan user

/**
 * Konfigurasi render — subset GenerationSettings MassVEPro.
 * Field anti-detection (antiDetectionLevel, applyMetadataSpoof, metadataConfig,
 * randomSpeed) sengaja TIDAK ada di sini. Kalau sampai masuk, fitur itu secara
 * teknis masih hidup. Lihat RFC §3 untuk reframe variasi kreatif.
 */
export type RenderSettings = {
  /** Orientasi output: portrait 9:16 (TikTok/Reels), landscape 16:9, square 1:1 */
  orientation: "portrait" | "landscape" | "square";
  /** Resolusi output: 720p, 1080p */
  resolution: "720p" | "1080p";
  /** Hapus audio asli video, ganti dengan voiceover */
  removeOriginalAudio: boolean;
  /** Volume voiceover (0-1) */
  voiceVolume: number;
  /** Volume background music (0-1) */
  bgmVolume: number;
  /** Auto-caption via Whisper */
  caption: {
    enabled: boolean;
    /** Bahasa transkripsi: id, en, auto */
    language: "id" | "en" | "auto";
    /** Ukuran model Whisper: tiny, base, small, medium */
    model: "tiny" | "base" | "small" | "medium";
    /** Ukuran font subtitle (px) */
    fontSize: number;
    /** Warna font */
    fontColor: string;
    /** Posisi: bottom, top, center */
    position: "bottom" | "top" | "center";
    /** Highlight kata aktif (karaoke style) */
    wordHighlight: boolean;
  };
  /** Headline text overlay (opsional) */
  headline?: {
    text: string;
    fontSize: number;
    fontColor: string;
    /** Posisi Y normalisasi 0-1 */
    positionY: number;
  };
};

/** Default settings — caption id + base, portrait 1080p (standar TikTok/Reels) */
export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  orientation: "portrait",
  resolution: "1080p",
  removeOriginalAudio: true,
  voiceVolume: 1.0,
  bgmVolume: 0.3,
  caption: {
    enabled: true,
    language: "id",
    model: "base",
    fontSize: 24,
    fontColor: "white",
    position: "bottom",
    wordHighlight: true,
  },
};

/** Job render video — satu job = satu video output */
export const videoJob = pgTable(
  "video_job",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Input: base video (dari media library, video)
    baseVideoMediaId: text("base_video_media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    // Input: voiceover (dari media library, audio). Null = pakai audio asli video
    voiceoverMediaId: text("voiceover_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    // Input: background music (dari audio_track library). Null = tanpa BGM
    bgmAudioTrackId: text("bgm_audio_track_id").references(() => audioTrack.id, {
      onDelete: "set null",
    }),
    // Konfigurasi render lengkap
    settings: jsonb("settings").$type<RenderSettings>().notNull(),
    // Output: row media hasil render (terisi setelah upload R2 selesai)
    outputMediaId: text("output_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    // storage key SRT hasil transkripsi (di R2)
    srtStorageKey: text("srt_storage_key"),
    // Publikasikan output ke galeri publik (/renders, manifest R2)?
    // WAJIB opt-in: default false. Tanpa ini, semua hasil render klien
    // (karya private) otomatis terekspos di URL publik tanpa persetujuan.
    // Lihat task kebocoran manifest — publishRenderManifest dulu auto-aktif.
    publishedToGallery: boolean("published_to_gallery").notNull().default(false),
    status: text("status").$type<VideoJobStatus>().notNull().default("queued"),
    // Progress 0-100 (dilaporkan worker dari Modal)
    progress: integer("progress").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("video_job_organizationId_idx").on(table.organizationId),
    index("video_job_status_idx").on(table.status),
    index("video_job_baseVideoMediaId_idx").on(table.baseVideoMediaId),
    index("video_job_outputMediaId_idx").on(table.outputMediaId),
  ],
);

export const videoJobRelations = relations(videoJob, ({ one }) => ({
  organization: one(organization, {
    fields: [videoJob.organizationId],
    references: [organization.id],
  }),
  baseVideo: one(media, {
    fields: [videoJob.baseVideoMediaId],
    references: [media.id],
    relationName: "videoJob_baseVideo",
  }),
  voiceover: one(media, {
    fields: [videoJob.voiceoverMediaId],
    references: [media.id],
    relationName: "videoJob_voiceover",
  }),
  outputMedia: one(media, {
    fields: [videoJob.outputMediaId],
    references: [media.id],
    relationName: "videoJob_output",
  }),
  bgmTrack: one(audioTrack, {
    fields: [videoJob.bgmAudioTrackId],
    references: [audioTrack.id],
  }),
}));
