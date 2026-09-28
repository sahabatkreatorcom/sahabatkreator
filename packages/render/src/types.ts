// Render adapter — interface tipis antara worker dan implementasi render.
//
// Alasan ada interface: render layer adalah satu-satunya bagian yang bisa pindah
// infra (Modal serverless sekarang, VPS render nanti). Worker tidak boleh tahu
// detail implementasi. Lihat RFC §11 (Opsi A vs B).
//
// Sengaja TIDAK ada method untuk metadata spoofing / anti-detection —
// fitur itu dibuang (evasion, ToS violation). Lihat RFC §2.

/**
 * Request render — dipassing worker ke adapter.
 * Input media sudah ada di R2; adapter fetch via presigned URL.
 */
export type RenderRequest = {
  /** ID internal job (untuk logging, bukan untuk auth) */
  jobId: string;
  /**
   * Presigned URL download base video dari R2. Ini selalu clip PERTAMA;
   * saat montage, clip tambahan menyusul di clipUrls (urutan = urutan
   * montage setelah base).
   */
  baseVideoUrl: string;
  /**
   * Presigned URL download clip montage tambahan (opsional). Kosong = mode
   * single (baseVideoUrl saja). Saat diisi, pipeline ambil segmen acak dari
   * tiap clip lalu concat — RFC §6 langkah 3 (mode montage).
   */
  clipUrls: string[];
  /** Presigned URL download voiceover (opsional; null = pakai audio asli) */
  voiceoverUrl: string | null;
  /** Presigned URL download BGM (opsional) */
  bgmUrl: string | null;
  /** Konfigurasi render (sama persis RenderSettings di schema/video.ts) */
  settings: {
    orientation: "portrait" | "landscape" | "square";
    resolution: "720p" | "1080p";
    removeOriginalAudio: boolean;
    voiceVolume: number;
    bgmVolume: number;
    /** Mode montage: durasi segmen acak per clip (opsional) */
    montage?: {
      minSegmentSeconds: number;
      maxSegmentSeconds: number;
    };
    caption: {
      enabled: boolean;
      language: "id" | "en" | "auto";
      model: "tiny" | "base" | "small" | "medium";
      fontSize: number;
      fontColor: string;
      position: "bottom" | "top" | "center";
      wordHighlight: boolean;
    };
    headline?: {
      text: string;
      fontSize: number;
      fontColor: string;
      positionY: number;
    };
    /** Video processing: trim, mirror, speed, overlay, loop mode (opsional) */
    videoProcessing?: {
      trimStart?: number;
      trimEnd?: number;
      mirror?: boolean;
      speed?: number;
      loopMode?: "sequential" | "random" | "reverse";
      overlay?: {
        url: string;
        position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "random";
        scale: number;
        opacity: number;
      };
    };
  };
  /** Presigned URL upload output video ke R2 (adapter PUT hasilnya ke sini) */
  outputUploadUrl: string;
  /** Presigned URL upload file SRT ke R2 (opsional, kalau caption aktif) */
  srtUploadUrl: string | null;
  /** Presigned URL upload thumbnail JPEG ke R2 (opsional; frame pertama output) */
  thumbnailUploadUrl: string | null;
};

/**
 * Response render — adapter kembalikan setelah selesai.
 * Upload output sudah dilakukan adapter langsung ke R2 (lebih efisien:
 * server SahabatKreator tidak perlu download video raksasa).
 */
export type RenderResponse = {
  /** Durasi output dalam detik */
  durationSeconds: number;
  /** Lebar output (px) */
  width: number;
  /** Tinggi output (px) */
  height: number;
  /** Ukuran file output (bytes) */
  sizeBytes: number;
  /** Bahasa terdeteksi Whisper (kalau caption aktif) */
  detectedLanguage?: string;
};

/**
 * Adapter render — implementasi tunggal: Modal.
 *
 * Method tunggal. Progress dilaporkan via callback agar worker bisa update
 * kolom video_job.progress (frontend polling tampilkan ke user).
 */
export interface RenderAdapter {
  /** Nama adapter untuk logging */
  readonly name: string;

  /**
   * Jalankan render. Throw RenderError bila gagal (worker akan retry via BullMQ).
   * onProgress dipanggil adapter dengan nilai 0-100.
   */
  render(req: RenderRequest, onProgress?: (percent: number) => void): Promise<RenderResponse>;

  /**
   * Slideshow MP4 dari array JPEG — RFC §8 fase 3 (TikTok/YouTube carousel).
   * Input: slide JPEG yang sudah di-render carousel (ada di R2).
   * Output: MP4 tunggal + thumbnail, transisi fade antar slide.
   * Bgm opsional; tidak ada voiceover/whisper (jalur cepat).
   */
  slideshow(
    req: SlideshowRequest,
    onProgress?: (percent: number) => void,
  ): Promise<SlideshowResponse>;
}

/**
 * Request slideshow — dipassing worker ke adapter slideshow().
 *
 * Slide JPEG adalah output carousel render (sudah ada di R2). Adapter download,
 * susun xfade chain, upload MP4 + thumbnail balik via presigned URL.
 */
export type SlideshowRequest = {
  /** ID internal (untuk logging, bukan auth) */
  jobId: string;
  /** Presigned URL download tiap slide JPEG (urutan tampil) */
  slideUrls: string[];
  /** Durasi tampil tiap slide (detik, 0.5–15) */
  slideDuration: number;
  /** Presigned URL download BGM opsional (null = video tanpa audio) */
  bgmUrl: string | null;
  /** Presigned URL upload MP4 output ke R2 */
  outputUploadUrl: string;
  /** Presigned URL upload thumbnail JPEG (opsional; frame pertama output) */
  thumbnailUploadUrl: string | null;
};

/** Response slideshow — mirror RenderResponse yang relevan */
export type SlideshowResponse = {
  durationSeconds: number;
  width: number;
  height: number;
  sizeBytes: number;
  /** Jumlah slide yang disusun (untuk audit) */
  slideCount: number;
};

/** Error render — dipetakan worker ke kode + retry decision */
export class RenderError extends Error {
  constructor(
    message: string,
    /** Kode error internal (disimpan di video_job.error_code) */
    public code: string,
    /**
     * true = error sementara (timeout, network, 5xx) → BullMQ retry.
     * false = error permanen (input tidak valid, codec tidak didukung) → langsung failed.
     */
    public retryable: boolean,
  ) {
    super(message);
    this.name = "RenderError";
  }
}
